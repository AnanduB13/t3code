package expo.modules.t3nativecontrols

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import expo.modules.kotlin.Promise

class T3ChatNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3ChatNotifications")
    AsyncFunction("update") { chats: List<Map<String, Any?>>, allowStart: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction
      if (allowStart) T3ChatNotificationsService.backgroundRestricted = false
      val selected = T3ChatNotificationsService.sessions.select(chats)
      val session = JSONArray(selected.map { ChatMonitorSessions.key(it) }).toString()
      if (chats.isEmpty()) {
        context.stopService(Intent(context, T3ChatNotificationsService::class.java))
      } else if (selected.isEmpty()) {
        context.stopService(Intent(context, T3ChatNotificationsService::class.java))
      } else if (!T3ChatNotificationsService.backgroundRestricted && (allowStart || T3ChatNotificationsService.running)) {
        val intent = Intent(context, T3ChatNotificationsService::class.java)
          .putExtra("chats", JSONArray(selected).toString())
          .putExtra("session", session)
        if (T3ChatNotificationsService.running || Build.VERSION.SDK_INT < 26) context.startService(intent)
        else context.startForegroundService(intent)
      }
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("waitUntilStopped") { promise: Promise ->
      if (T3ChatNotificationsService.running) T3ChatNotificationsService.stopWaiters.add(promise)
      else promise.resolve(null)
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("stop") {
      T3ChatNotificationsService.sessions.clear()
      appContext.reactContext?.let { it.stopService(Intent(it, T3ChatNotificationsService::class.java)) }
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
  }
}
