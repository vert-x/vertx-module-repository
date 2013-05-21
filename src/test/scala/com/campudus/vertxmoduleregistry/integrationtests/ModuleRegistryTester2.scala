package com.campudus.vertxmoduleregistry.integrationtests

import org.junit.Test
import org.vertx.testtools.VertxAssert._
import org.vertx.java.core.json.JsonObject

class ModuleRegistryTester2 extends ModuleRegistryTesterBase {

  def createJson(): JsonObject = json.putString("approver-password", approverPw).putNumber("download-timeout", 10)

 @Test
 def testDownloadingTimeout() {
   registerModule(validModName) onComplete handleFailure { data =>
     Option(data.getString("status")) match {
       case Some("error") =>
         testComplete()
       case _ =>
         fail("should get an error reply, but got " + data.encode())
     }
   }
 }
}