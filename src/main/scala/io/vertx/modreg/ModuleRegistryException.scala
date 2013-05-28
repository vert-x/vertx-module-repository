package io.vertx.modreg

class ModuleRegistryException(message: String = "Unknown error", cause: Throwable = null) extends RuntimeException(message, cause)