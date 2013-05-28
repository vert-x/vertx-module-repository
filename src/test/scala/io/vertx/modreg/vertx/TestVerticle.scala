package io.vertx.modreg.vertx

import io.vertx.modreg.VertxExecutionContext
import io.vertx.modreg.helpers.VertxScalaHelpers

abstract class TestVerticle extends org.vertx.testtools.TestVerticle with VertxScalaHelpers with VertxExecutionContext
