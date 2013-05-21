package com.campudus.vertxmoduleregistry.integrationtests

import org.vertx.java.core.Handler
import org.vertx.testtools.VertxAssert._
import org.vertx.java.core.AsyncResult
import org.vertx.java.core.http.HttpClient
import org.vertx.java.core.http.HttpClientResponse
import org.vertx.java.core.buffer.Buffer
import scala.concurrent.Future
import org.vertx.java.core.json.JsonObject
import scala.concurrent.Promise
import com.campudus.vertx.TestVerticle
import scala.util.Success
import scala.util.Failure
import org.vertx.java.core.eventbus.Message
import scala.util.Try
import java.io.File

abstract class ModuleRegistryTesterBase extends TestVerticle {

  val TEMP_DIR = System.getProperty("java.io.tmpdir")
  val FILE_SEP = File.separator
  val validModName: String = "io.vertx~mod-mongo-persistor~2.0.0-beta2"
  val invalidModName: String = "mod-mongo-persistor~2.0.0-beta2"
  val snapshotModName: String = "io.vertx~mod-mongo-persistor~2.0.0-beta3-SNAPSHOT"

  val incorrectDownloadUrl: String = "http://asdfreqw/"
  val approverPw: String = "password"

  override def start(startedResult: org.vertx.java.core.Future[Void]) {
    container.deployModule(System.getProperty("vertx.modulename"),
      createJson(),
      new Handler[AsyncResult[String]]() {
        override def handle(deploymentID: AsyncResult[String]) {
          initialize()

          assertNotNull("deploymentID should not be null", deploymentID.succeeded())

          resetMongoDb().onComplete {
            case Success(result) => {
              startTests()
              startedResult.setResult(null)
            }
            case Failure(t) => startedResult.setFailure(t)
          }
        }
      })
  }

  def createJson() : JsonObject

  protected def handleFailure[T](doSth: T => Unit): Function1[Try[T], Any] = {
    case Success(x) => doSth(x)
    case Failure(x) =>
      x.printStackTrace
      fail("Should not get an exception but got " + x)
  }

  protected def readDir(dir: String): Future[Array[String]] = {
    val p = Promise[Array[String]]
    vertx.fileSystem().readDir(dir, { res: AsyncResult[Array[String]] =>
      if (res.succeeded()) {
        p.success(res.result())
      } else {
        p.failure(new RuntimeException("could not read directory '" + dir + "'!"))
      }
    })
    p.future
  }

  protected def checkIfZipExists(): Future[Boolean] = {
    readDir(TEMP_DIR) map { array =>
      array.exists(element => (element.startsWith("module-") && element.endsWith(".zip")))
    }
  }

  protected def checkIfTmpDirExists(): Future[Boolean] = {
    readDir(TEMP_DIR) map { array =>
      array.exists(element => (element.startsWith(TEMP_DIR + FILE_SEP + "vertx-")))
    }
  }

  protected def deleteModule(modName: String) = {
    val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
    noExceptionInClient(client)

    postJson(client, "/login", "password" -> approverPw) flatMap { obj =>
      val sessionId = obj.getString("sessionID")
      println("got login " + obj.encode)
      postJson(client, "/remove", "sessionID" -> sessionId, "name" -> modName)
    }
  }

 protected def registerModule(modName: String): Future[JsonObject] = {
    val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
    noExceptionInClient(client)

    postJson(client, "/register", "modName" -> modName)
  }

  protected def noExceptionInClient(client: HttpClient) = client.exceptionHandler({ ex: Throwable =>
    fail("Should not get an exception in this test, but got " + ex)
  })

  protected def postJson(client: HttpClient, url: String, params: (String, String)*): Future[JsonObject] = {
    val p = Promise[JsonObject]
    val request = client.post(url, { resp: HttpClientResponse =>
      resp.bodyHandler({ buf: Buffer =>
        try {
          p.success(new JsonObject(buf.toString()))
        } catch {
          case e: Throwable => {
            e.printStackTrace()
            p.failure(e)
          }
        }
      })
    })
    request.end(params.map { case (key, value) => key + "=" + value }.mkString("&"))
    p.future
  }

  protected def getJson(client: HttpClient, url: String, params: (String, String)*): Future[JsonObject] = {
    val p = Promise[JsonObject]
    val request = client.get(url + params.map { case (key, value) => key + "=" + value }.mkString("?", "&", ""), { resp: HttpClientResponse =>
      resp.bodyHandler({ buf: Buffer =>
        try {
          p.success(new JsonObject(buf.toString()))
        } catch {
          case e: Throwable => p.failure(e)
        }
      })
    })
    request.end()
    p.future
  }

  protected def resetMongoDb(): Future[Integer] = {
    val p = Promise[Integer]
    vertx.eventBus().send("registry.database", json
      .putString("action", "delete")
      .putString("collection", "modules")
      .putObject("matcher", json), { replyReset: Message[JsonObject] =>
      if ("ok" == replyReset.body.getString("status")) {
        p.success(replyReset.body.getInteger("number", 0))
      } else {
        p.failure(new RuntimeException("could not reset mongodb"))
      }
    })
    p.future
  }
}