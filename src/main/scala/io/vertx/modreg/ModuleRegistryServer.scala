package io.vertx.modreg

import java.io.File
import java.net.{ URI, URLDecoder }
import scala.concurrent.{ Future, Promise }
import scala.util.{ Failure, Success }
import org.vertx.java.core.{ AsyncResult, Vertx }
import org.vertx.java.core.buffer.Buffer
import org.vertx.java.core.eventbus.Message
import org.vertx.java.core.file.FileProps
import org.vertx.java.core.http.{ HttpServerRequest, RouteMatcher }
import org.vertx.java.core.json.{ JsonArray, JsonObject }
import io.vertx.modreg.helpers.{ PostRequestReader, VertxFutureHelpers, VertxScalaHelpers }
import io.vertx.modreg.database.Database.{ Module, approve, countModules, latestApprovedModules, listModules, registerModule, remove, searchModules, unapproved }
import io.vertx.modreg.security.Authentication.{ authorise, login, logout }
import java.nio.file.Files
import org.vertx.java.core.file.FileSystemException
import java.nio.file.NoSuchFileException

class ModuleRegistryServer extends Verticle with VertxScalaHelpers with VertxFutureHelpers {

  val FILE_SEP = File.separator

  private def getRequiredParam(param: String, error: String)(implicit paramMap: Map[String, String], errors: collection.mutable.ListBuffer[String]) = {
    def addError() = {
      errors += error
      ""
    }

    paramMap.get(param) match {
      case None => addError
      case Some(str) if (str.matches("\\s*")) => addError
      case Some(str) => URLDecoder.decode(str, "utf-8")
    }
  }

  private def getOptionalParam(param: String)(implicit paramMap: Map[String, String]) = {
    paramMap.get(param) match {
      case None => None
      case Some(str) => Option(URLDecoder.decode(str, "utf-8"))
    }
  }

  def isAuthorised(vertx: Vertx, sessionID: String): Future[Boolean] = {
    val p = Promise[Boolean]

    authorise(vertx, sessionID) onComplete {
      case Success(username) => p.success(true)
      case Failure(error) => p.success(false)
    }

    p.future
  }

  private def respondFailed(message: String)(implicit request: HttpServerRequest) = {
    request.response.end(s"""{"status":"error","message":"${message}"}""")
  }

  private def respondErrors(messages: List[String])(implicit request: HttpServerRequest) = {
    val errorsAsJsonArr = new JsonArray
    messages.foreach(m => errorsAsJsonArr.addString(m))
    request.response.end(json.putString("status", "error").putArray("messages", errorsAsJsonArr).encode)
  }

  private def respondDenied(implicit request: HttpServerRequest) =
    request.response.end(json.putString("status", "denied").encode())

  override def start() {
    logger.info("starting module registry")
    val rm = new RouteMatcher

    rm.get("/", { implicit req: HttpServerRequest =>
      deliver(webPath + FILE_SEP + "index.html")
    })

    rm.get("/latest-approved-modules", {
      implicit req: HttpServerRequest =>
        val limit = req.params().get("limit") match {
          case s: String => toInt(s).getOrElse(5)
          case _ => 5
        }

        latestApprovedModules(vertx, limit) onComplete {
          case Success(modules) => /*
             {modules: [{...},{...}]}
             */
            val modulesArray = new JsonArray()
            modules.map(_.toJson).foreach(m => modulesArray.addObject(m))
            req.response.end(json.putArray("modules", modulesArray).encode)
          case Failure(error) => respondFailed(error.getMessage())
        }
    })

    rm.get("/count", { implicit req: HttpServerRequest =>
      import scala.collection.JavaConversions._
      println("got a get request: " + req.absoluteURI())
      println("got a get request-params: " + req.params().names().toList)
      println("got a get request: " + req.params().get("unapproved"))
      val unapproved = Option(req.params().get("unapproved")) match {
        case Some("1") => true
        case _ => false
      }
      countModules(vertx, unapproved) onComplete {
        case Success(count) =>
          req.response.end(json.putString("status", "ok").putNumber("count", count).encode)
        case Failure(error) => respondFailed(error.getMessage())
      }
    })

    rm.get("/list", { implicit req: HttpServerRequest =>
      val by = Option(req.params().get("by"))
      val desc = Option(req.params().get("desc")) match {
        case Some("1") => true
        case _ => false
      }
      val limit = Option(req.params().get("limit")) flatMap toInt
      val skip = Option(req.params().get("skip")) flatMap toInt

      listModules(vertx, by, limit, skip, desc) onComplete {
        case Success(modules) =>
          println("got some modules: " + modules)
          val modulesArray = new JsonArray()
          modules.map(_.toJson).foreach(m => modulesArray.addObject(m))
          req.response.end(json.putArray("modules", modulesArray).encode)
        case Failure(error) => respondFailed(error.getMessage())
      }
    })

    rm.post("/unapproved", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val sessionID = getRequiredParam("sessionID", "Session ID required")
        val by = getOptionalParam("by")
        val desc = getOptionalParam("desc") match {
          case Some("1") => true
          case _ => false
        }
        val limit = getOptionalParam("limit") flatMap toInt
        val skip = getOptionalParam("skip") flatMap toInt

        val errors = errorBuffer.result
        if (errors.isEmpty) {

          def callUnapproved() = {
            unapproved(vertx, by, limit, skip, desc) onComplete {
              case Success(modules) =>
                val modulesArray = new JsonArray()
                modules.map(_.toJson).foreach(m => modulesArray.addObject(m))
                req.response.end(json.putArray("modules", modulesArray).encode)
              case Failure(error) => respondFailed(error.getMessage())
            }
          }

          isAuthorised(vertx, sessionID) map {
            case true => callUnapproved
            case false => respondDenied
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.post("/login", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val username = "approver"
        val password = getRequiredParam("password", "Missing password")

        val errors = errorBuffer.result
        if (errors.isEmpty) {
          login(vertx, username, password) onComplete {
            case Success(sessionID) =>
              req.response.end(json.putString("status", "ok").putString("sessionID", sessionID).encode)
            case Failure(_) => respondDenied
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.post("/approve", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val sessionID = getRequiredParam("sessionID", "Session ID required")
        val id = getRequiredParam("_id", "Module ID required")

        val errors = errorBuffer.result
        if (errors.isEmpty) {
          def callApprove() = {
            approve(vertx, id) onComplete {
              case Success(json) => req.response.end(json.encode())
              case Failure(error) => respondFailed(error.getMessage())
            }
          }

          isAuthorised(vertx, sessionID) map {
            case true => callApprove
            case false => respondDenied
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.post("/remove", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val sessionID = getRequiredParam("sessionID", "Session ID required")
        val name = getRequiredParam("name", "Module ID required")

        val errors = errorBuffer.result
        if (errors.isEmpty) {
          def callRemove() = {
            remove(vertx, name) onComplete {
              case Success(json) => req.response.end(json.encode())
              case Failure(error) => respondFailed(error.getMessage())
            }
          }

          isAuthorised(vertx, sessionID) map {
            case true => callRemove
            case false => respondDenied
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.post("/search", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val query = getRequiredParam("query", "Cannot search with empty keywords")
        val by = getOptionalParam("by")
        val desc = getOptionalParam("desc") match {
          case Some("1") => true
          case _ => false
        }
        val limit = getOptionalParam("limit") flatMap toInt
        val skip = getOptionalParam("skip") flatMap toInt

        val errors = errorBuffer.result
        if (errors.isEmpty) {
          searchModules(vertx, Some(query), by, limit, skip, desc) onComplete {
            case Success(modules) =>
              val modulesArray = new JsonArray()
              modules.map(_.toJson).foreach(m => modulesArray.addObject(m))
              req.response.end(json.putString("status", "ok").putArray("modules", modulesArray).encode)
            case Failure(error) => respondFailed(error.getMessage())
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.post("/register", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val modName = getRequiredParam("modName", "Module name missing").trim
        val modLocation = getOptionalParam("modLocation")
        val modURL = getOptionalParam("modURL")

        println("modName is " + modName)
        println("modLocation is " + modLocation)
        println("modURL is " + modURL)

        val errors = errorBuffer.result
        if (errors.isEmpty) {
          try {
            (for {
              module <- downloadExtractAndRead(modName, modLocation, modURL)
              json <- registerModule(vertx, module)
              sent <- sendMailToModerators(module)
            } yield {
              (module, json, sent)
            }) onComplete {
              case Success((module, json, sent)) =>
                req.response.end(s"""{"status":"ok","mailSent":${sent},"data":${module.toSensibleJson.encode()}}""")
              case Failure(error) =>
                logger.info("failed -> error response " + error.getMessage())
                respondFailed(error.getMessage())
            }
          } catch {
            case e: Exception =>
              respondFailed("Module name could not be parsed: " + e.getMessage())
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.post("/logout", { implicit req: HttpServerRequest =>
      req.bodyHandler({ buf: Buffer =>
        implicit val paramMap = PostRequestReader.dataToMap(buf.toString)
        implicit val errorBuffer = collection.mutable.ListBuffer[String]()

        val sessionID = getRequiredParam("sessionID", "Session ID required")

        val errors = errorBuffer.result
        if (errors.isEmpty) {
          logout(vertx, sessionID) onComplete {
            case Success(oldSessionID) =>
              req.response.end(json.putString("status", "ok").putString("sessionID", oldSessionID).encode)
            case Failure(error) => respondFailed(error.getMessage())
          }
        } else {
          respondErrors(errors)
        }
      })
    })

    rm.getWithRegEx("^(.*)$", { implicit req: HttpServerRequest =>
      val param0 = trimSlashes(req.params.get("param0"))
      val param = if (param0 == "") {
        "index.html"
      } else {
        param0
      }
      val errorDir = webPath + FILE_SEP + "errors"

      if (param.contains("..")) {
        deliver(403, errorDir + "403.html")
      } else {
        val path = webPath + param

        vertx.fileSystem().props(path, {
          fprops: AsyncResult[FileProps] =>
            if (fprops.succeeded()) {
              if (fprops.result.isDirectory) {
                val indexFile = path + FILE_SEP + "index.html"
                vertx.fileSystem().exists(indexFile, {
                  exists: AsyncResult[java.lang.Boolean] =>
                    if (exists.succeeded() && exists.result) {
                      logger.info("sending " + indexFile)
                      deliver(indexFile)
                    } else {
                      logger.error("could not find " + indexFile)
                      deliver(404, errorDir + FILE_SEP + "404.html")
                    }
                })
              } else {
                deliver(path)
              }
            } else {
              logger.error("could not find " + path)
              deliver(404, errorDir + FILE_SEP + "404.html")
            }
        })
      }
    })

    val config = Option(container.config()).getOrElse(json)
    val host = config.getString("host", "localhost")
    val port = config.getNumber("port", 8080)
    val ssl = config.getString("keystore-path") != null && config.getString("keystore-pass") != null

    logger.info("host: " + host)
    logger.info("port: " + port)
    logger.info("this path: " + new File(".").getAbsolutePath())
    logger.info("webpath: " + webPath)
    logger.info("ssl: " + ssl)

    if (ssl) {
      vertx.createHttpServer()
        .requestHandler(rm)
        .setSSL(true)
        .setKeyStorePath(config.getString("keystore-path"))
        .setKeyStorePassword(config.getString("keystore-pass"))
        .listen(port.intValue(), host)
    } else {
      vertx.createHttpServer()
        .requestHandler(rm)
        .listen(port.intValue(), host)
    }

    logger.info("started module registry server")
  }

  override def stop() {
    logger.info("stopped module registry server")
  }

  lazy val webPath = (new File(".")).getAbsolutePath() + FILE_SEP + "web"

  private def trimSlashes(path: String) = {
    path.replace("^/+", "").replace("/+$", "")
  }

  private def deliver(file: String)(implicit request: HttpServerRequest): Unit = deliver(200, file)(request)
  private def deliver(statusCode: Int, file: String)(implicit request: HttpServerRequest) {
    logger.info("Delivering: " + file + " with code " + statusCode)
    request.response.setStatusCode(statusCode).sendFile(file)
  }

  private def deliverValidUrl(file: String)(implicit request: HttpServerRequest) {
    if (file.contains("..")) {
      deliver(403, "errors" + FILE_SEP + "403.html")
    } else {
      deliver(file)
    }
  }

  private def splitModule(modName: String) = {
    val parts = modName.split('~')
    if (parts.length != 3) {
      throw new ModuleRegistryException("Must be in same format as 'io.vertx~mod-mongo-persistor~1.0'")
    }
    val group = parts(0)
    val artifactId = parts(1)
    val version = parts(2)

    (group, artifactId, version)
  }

  private def createMavenCentralUri(group: String, artifact: String, version: String) =
    createMavenUri("http://repo1.maven.org/maven2/", group, artifact, version)

  private def createMavenUri(prefix: String, group: String, artifact: String, version: String) = {
    val uri = new StringBuilder(prefix)
    group.split("\\.").foreach(uri.append(_).append('/'))
    uri.append(artifact).append('/').append(version).append('/')
    uri.append(artifact).append('-').append(version).append("-mod.zip")
    new URI(uri.toString())
  }

  private def createBintrayUri(group: String, artifact: String, version: String) = {
    val repo = "vertx-mods"

    val sb = new StringBuilder("http://dl.bintray.com/content")
    // We create a direct uri, so we don't have to follow redirects
    sb.append('/').append(group).append('/').append(repo).append('/').append(artifact).append('/')
      .append(artifact).append('-').append(version).append(".zip?direct")

    new URI(sb.toString())
  }

  private def downloadExtractAndRead(modName: String, modLocation: Option[String], modURL: Option[String]): Future[Module] = {
    val (group, artifact, version) = splitModule(modName)

    if (version.toLowerCase().endsWith("snapshot")) {
      throw new ModuleRegistryException("No SNAPSHOTS are allowed for registration")
    }

    val (uri, repoType, downloadUrl) = modLocation match {
      case Some("mavenCentral") => (createMavenCentralUri(group, artifact, version), "mavenCentral", None)
      case Some("mavenOther") => modURL match {
        case Some(prefix) => (createMavenUri(prefix, group, artifact, version), "mavenOther", Some(prefix))
        case None => throw new ModuleRegistryException("Prefix for other maven repository missing!")
      }
      case Some("bintray") => (createBintrayUri(group, artifact, version), "bintray", None)
      case None => (createMavenCentralUri(group, artifact, version), "mavenCentral", None)
      case _ => throw new ModuleRegistryException("No valid location given. Aborting.")
    }

    val tempUUID = java.util.UUID.randomUUID()
    val absPath = File.createTempFile("module-", tempUUID + ".tmp.zip").getAbsolutePath()
    val tempDir = Files.createTempDirectory("vertx-" + tempUUID.toString())
    val destDir = tempDir.toAbsolutePath().toString()

    logger.info("url is " + uri)

    val futureModule = for {
      file <- open(absPath)
      downloadedFile <- downloadInto(uri, file)
      _ <- extract(absPath, destDir)
      modFileName <- modFileNameFromExtractedModule(destDir)
      modJson <- open(modFileName)
      content <- readFileToString(modJson)
    } yield {
      logger.info("got mod.json:\n" + content.toString())

      val json = new JsonObject(content.toString()).putString("name", modName).putString("repoType", repoType)
      downloadUrl.map(json.putString("downloadUrl", _))

      logger.info("in json:\n" + json.encode())
      Module.fromModJson(json.putNumber("timeRegistered", System.currentTimeMillis())) match {
        case Some(module) => module
        case None => throw new ModuleRegistryException("The mod.json file of the module does not contain all the mandatory fields required for registration.")
      }
    }

    futureModule andThen {
      case _ =>
        cleanUpFile(absPath) onFailure logCleanupFail(absPath)
        cleanUpFile(destDir) onFailure logCleanupFail(destDir)
    }
  }

  private def logCleanupFail(file: String): PartialFunction[Throwable, Unit] = {
    case ex: FileSystemException =>
      ex.getCause() match {
        case ex: NoSuchFileException => // don't care
        case _ => logger.error("Could not clean up file: " + file, ex)
      }
    case ex: Throwable => logger.error("Could not clean up file: " + file, ex)
  }

  private def cleanUpFile(file: String) = {
    val p = Promise[Unit]
    vertx.fileSystem().delete(file, true, { res: AsyncResult[Void] =>
      if (res.succeeded()) {
        p.success()
      } else {
        p.failure(res.cause)
      }
    })
    p.future
  }

  private def sendMailToModerators(mod: Module): Future[Boolean] = {
    val mailerConf = container.config().getObject("mailer", json)
    val email = Option(mailerConf.getString("infoMail")) // from address
    val moderator = Option(mailerConf.getString("moderator"))

    if (email.isDefined && moderator.isDefined) {
      val arr = new JsonArray()
      arr.add(moderator.get)
      val data = json
        .putString("from", email.get)
        .putArray("to", arr)
        .putString("subject", "New module waiting for approval: " + mod.name)
        .putString("body", mod.toWaitForApprovalEmailString())

      val promise = Promise[Boolean]
      vertx.eventBus.send(ModuleRegistryStarter.mailerAddress, data, { msg: Message[JsonObject] =>
        logger.info("mailed something and received: " + msg.body.encode())
        if ("ok" == msg.body.getString("status")) {
          promise.success(true)
        } else {
          promise.success(false)
        }
      })
      promise.future
    } else {
      Future.successful(false)
    }
  }
}
