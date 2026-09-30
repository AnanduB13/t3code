package expo.modules.t3nativecontrols

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import expo.modules.kotlin.Promise

class T3ChatNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3ChatNotifications")
    AsyncFunction("update") { chats: List<Map<String, Any?>>, allowStart: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val session = JSONArray(chats.map { listOf(it["key"], it["turnId"]) }).toString()
      if (chats.isEmpty()) {
        T3ChatNotificationsService.dismissedSession = null
        context.stopService(Intent(context, T3ChatNotificationsService::class.java))
      } else if (session != T3ChatNotificationsService.dismissedSession && (allowStart || T3ChatNotificationsService.running)) {
        val intent = Intent(context, T3ChatNotificationsService::class.java)
          .putExtra("chats", JSONArray(chats).toString())
          .putExtra("session", session)
        if (T3ChatNotificationsService.running) context.startService(intent)
        else context.startForegroundService(intent)
      }
    }
    AsyncFunction("waitUntilStopped") { promise: Promise ->
      if (T3ChatNotificationsService.running) T3ChatNotificationsService.stopWaiters.add(promise)
      else promise.resolve(null)
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("stop") {
      T3ChatNotificationsService.dismissedSession = null
      appContext.reactContext?.let { it.stopService(Intent(it, T3ChatNotificationsService::class.java)) }
    }
  }
}
