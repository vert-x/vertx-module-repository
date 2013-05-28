package com.campudus.vertxmoduleregistry.integrationtests

import org.junit.Test
import org.vertx.testtools.VertxAssert._
import org.vertx.java.core.json.JsonObject

class ModuleRegistryTester1 extends ModuleRegistryTesterBase {

  def createJson(): JsonObject = json.putString("approver-password", approverPw)

  @Test
  def testRegisterSnapshotMod() {
    registerModule(snapshotModName) onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("error") => testComplete()
        case _ => fail("wrong status: " + data.encode())
      }
    }
  }

  @Test
  def testRegisterInvalidMod() {
    registerModule(invalidModName) onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("error") => testComplete()
        case _ => fail("wrong status: " + data.encode())
      }
    }
  }

  @Test
  def testRegisterMod() {
    registerModule(validModName) onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("ok") =>
          assertNull("Should not get a downloadUrl!", data.getObject("data").getString("downloadUrl"))
          assertEquals("Should have repoType mavenCentral", "mavenCentral", data.getObject("data").getString("repoType"))
          testComplete()
        case _ => fail("wrong status / error reply: " + data.encode())
      }
    }
  }

  @Test
  def testBintrayRegister() {
    registerModule(validBintrayModName, Some("bintray")) onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("ok") =>
          assertNull("Should not get a downloadUrl!", data.getObject("data").getString("downloadUrl"))
          assertEquals("Should have repoType bintray", "bintray", data.getObject("data").getString("repoType"))
          testComplete()
        case _ => fail("wrong status / error reply: " + data.encode())
      }
    }
  }

  @Test
  def testOtherMavenRegister() {
    registerModule(validModName, Some("mavenOther"), Some("http://repo1.maven.org/maven2/")) onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("ok") =>
          assertEquals("Should have repo in downloadUrl", "http://repo1.maven.org/maven2/", data.getObject("data").getString("downloadUrl"))
          assertEquals("Should have repoType mavenOther", "mavenOther", data.getObject("data").getString("repoType"))
          testComplete()
        case _ => fail("wrong status / error reply: " + data.encode())
      }
    }
  }

  @Test
  def testRegisterModTwice() {
    registerModule(validModName) flatMap (_ => registerModule(validModName)) onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("error") => testComplete()
        case _ => fail("should get an error reply, but got " + data.encode())
      }
    }
  }

  @Test
  def testCleanupAfterRegister() {
    registerModule(validModName) flatMap (_ => checkIfZipExists zip checkIfTmpDirExists) onComplete handleFailure {
      case (true, true) => fail("Zip file and temp dir should not be there anymore")
      case (true, false) => fail("Zip file dir should not be there anymore")
      case (false, true) => fail("Temp dir should not be there anymore")
      case (false, false) => testComplete()
    }
  }

  @Test
  def testDeleteModule() {
    registerModule(validModName) flatMap { obj =>
      val modName = obj.getObject("data").getString("name")
      println("registered " + modName + ", now delete it" + obj.encode)
      deleteModule(modName)
    } onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("ok") => countModules() onComplete handleFailure { obj =>
          Option(obj.getInteger("count")) match {
            case Some(count) =>
              assertEquals("should have 0 modules registered after delete", 0, count)
              testComplete()
            case None => fail("should get count 0, but got none")
          }
        }
        case _ => fail("wrong status on delete! " + data.encode)
      }
    }
  }

  @Test
  def testDeleteWithoutPassword() {
    registerModule(validModName) flatMap { obj =>
      val modId = obj.getObject("data").getString("id")
      val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
      noExceptionInClient(client)

      postJson(client, "/remove", "name" -> modId)
    } onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("error") => testComplete()
        case _ => fail("Should not be able to delete a module id twice")
      }
    }
  }

  @Test
  def testDeleteModuleTwice() {
    registerModule(validModName) flatMap { obj =>
      val modId = obj.getObject("data").getString("id")
      deleteModule(modId) flatMap (_ => deleteModule(modId))
    } onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("error") => testComplete()
        case _ => fail("Should not be able to delete a module id twice")
      }
    }
  }

  @Test
  def testDeleteMissingModule() {
    deleteModule("some-missing-id") onComplete handleFailure { data =>
      Option(data.getString("status")) match {
        case Some("error") => testComplete()
        case x => fail("Should not be able to delete a module that doesn't exist " + x)
      }
    }
  }

  @Test
  def testListAllModules() {
    registerModule(validModName) flatMap (_ => registerModule(validModName)) flatMap { _ =>
      val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
      noExceptionInClient(client)

      getJson(client, "/list")
    } onComplete handleFailure { obj =>
      Option(obj.getArray("modules")) match {
        case Some(results) => testComplete()
        case None => fail("should get results but got none")
      }
    }
  }

  @Test
  def testListUnapprovedModules() {
    for {
      _ <- registerModule(validModName)
      _ <- approveModules
      _ <- registerModule(validModName2)
    } yield {
      val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
      noExceptionInClient(client)

      getJson(client, "/list")
    } onComplete handleFailure { obj =>
      Option(obj.getArray("modules")) match {
        case Some(results) =>
          assertEquals(1, results.size())
          testComplete()
        case None => fail("should get results but got none")
      }
    }
  }

  @Test
  def testCount() {
    countModules() onComplete handleFailure { obj =>
      Option(obj.getInteger("count")) match {
        case Some(count) =>
          assertEquals("should have 0 modules registered", 0, count)
          (for {
            m <- registerModule(validModName)
            _ <- approveModules
            obj <- countModules()
          } yield obj) onComplete handleFailure { obj =>
            Option(obj.getInteger("count")) match {
              case Some(count) =>
                assertEquals("should have 1 module registered", 1, count)
                testComplete()
              case None => fail("should get count 1, but got none")
            }
          }
        case None => fail("should get a count 0, but got none")
      }
    }
  }

  @Test
  def countUnapproved() {
    for {
      _ <- registerModule(validModName)
      _ <- registerModule(validModName2)
    } yield countModules(Some(false)) onComplete handleFailure { obj =>
      Option(obj.getInteger("count")) match {
        case Some(count) =>
          assertEquals("should have 0 (approved) modules registered", 0, count)
          testComplete()
        case None => fail("should get count 0, but got none")
      }
    }
  }

  @Test
  def countWhenUnapproved() {
    for {
      _ <- registerModule(validModName)
      _ <- registerModule(validModName2)
    } yield countModules(Some(true)) onComplete handleFailure { obj =>
      Option(obj.getInteger("count")) match {
        case Some(count) =>
          assertEquals("should have 2 modules registered", 2, count)
          testComplete()
        case None => fail("should get count 2, but got none")
      }
    }
  }

  @Test
  def testCountAfterRegistering() {
    (for {
      _ <- registerModule(validModName)
      _ <- approveModules
      _ <- registerModule(validModName2)
      _ <- approveModules
      obj <- countModules()
    } yield obj) onComplete handleFailure { obj =>
      Option(obj.getInteger("count")) match {
        case Some(count) =>
          assertEquals("should have 2 modules registered", 2, count)
          testComplete()
        case None => fail("should get count 2, but got none")
      }
    }
  }

  @Test
  def testCountAfterDeleting() {
    (for {
      _ <- registerModule(validModName)
      _ <- registerModule(validModName2)
      _ <- approveModules()
      _ <- deleteModule(validModName)
      obj <- countModules()
    } yield obj) onComplete handleFailure { obj =>
      Option(obj.getInteger("count")) match {
        case Some(count) =>
          assertEquals("should have 1 module registered", 1, count)
          testComplete()
        case None => fail("should get count 1, but got none")
      }
    }
  }

  @Test
  def testLogin() {
    val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
    noExceptionInClient(client)

    postJson(client, "/login", "password" -> approverPw) map { obj =>
      assertNotNull("Should receive a working session id", obj.getString("sessionID"))
      testComplete()
    }
  }

  @Test
  def testLogout() {
    val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
    noExceptionInClient(client)

    postJson(client, "/login", "password" -> approverPw) flatMap { obj =>
      val sessionId = obj.getString("sessionID")
      assertNotNull("Should receive a working session id", sessionId)
      postJson(client, "/logout", "sessionID" -> sessionId)
    } onComplete handleFailure { res =>
      Option(res.getString("status")) match {
        case Some("ok") => testComplete()
        case _ => fail("got an error logging out!" + res.encode)
      }
    }
  }

  @Test
  def testLogoutWithWrongSessionId() {
    val client = vertx.createHttpClient().setHost("localhost").setPort(8080)
    noExceptionInClient(client)

    postJson(client, "/logout", "sessionID" -> "wrong-session-id") map { res =>
      Option(res.getString("status")) match {
        case Some("ok") => fail("Should not be able to logout with wrong session-id! " + res.encode)
        case Some("error") => testComplete()
        case _ => fail("Should get a status reply but got " + res.encode)
      }
    }
  }
}