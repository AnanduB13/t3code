package expo.modules.t3nativecontrols

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import expo.modules.kotlin.Promise
import java.util.concurrent.CopyOnWriteArrayList

/** Keeps the existing client connection alive only while observed chats are running. */
class T3ChatNotificationsService : HeadlessJsTaskService() {
  companion object {
    @Volatile var running = false
      private set
    internal val sessions = ChatMonitorSessions()
    internal var backgroundRestricted = false
    val stopWaiters = CopyOnWriteArrayList<Promise>()
    private const val CHANNEL = "t3-running-chats"
    private const val ID = 73001
  }
  private var session: String? = null
  private var lastChats: String? = null
  private val handler = Handler(Looper.getMainLooper())
  private val expire = Runnable { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }


  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL, "Running chats", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Quiet progress updates while T3 Code monitors running chats"
        setShowBadge(false)
      }
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "stop-monitoring") {
      sessions.dismiss(session)
      expire.run()
      return START_NOT_STICKY
    }
    session = intent?.getStringExtra("session")
    val payload = intent?.getStringExtra("chats") ?: "[]"
    handler.removeCallbacks(expire)
    handler.postDelayed(expire, 90_000)
    if (running && lastChats == payload) return START_NOT_STICKY
    lastChats = payload
    val chats = JSONArray(payload)
    if (chats.length() == 0) { stopSelf(); return START_NOT_STICKY }
    val notification = notification(chats)
    try {
      if (Build.VERSION.SDK_INT >= 29) startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      else startForeground(ID, notification)
    } catch (error: IllegalStateException) {
      // Android can revoke background-start eligibility between the JS check and this call.
      Log.w("T3ChatNotifications", "Android stopped background monitoring", error)
      backgroundRestricted = true
      expire.run()
      return START_NOT_STICKY
    } catch (error: SecurityException) {
      Log.w("T3ChatNotifications", "Monitoring permission is unavailable", error)
      backgroundRestricted = true
      expire.run()
      return START_NOT_STICKY
    }
    if (!running) {
      running = true
      startTask(HeadlessJsTaskConfig("T3ChatMonitor", Arguments.createMap(), 0, true))
    }
    // A stalled JS runtime must not leave a permanent, falsely live notification.
    handler.removeCallbacks(expire)
    handler.postDelayed(expire, 90_000)
    return START_NOT_STICKY
  }

  internal fun notification(chats: JSONArray): Notification {
    val first = chats.getJSONObject(0)
    val uri = Uri.parse(first.getString("deepLink"))
    val tap = Intent(Intent.ACTION_VIEW, uri).setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pending = PendingIntent.getActivity(this, ID, tap, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: android.R.drawable.stat_notify_sync
    val title = if (chats.length() == 1) first.getString("title") else "${chats.length()} active chats"
    val body = (0 until chats.length()).joinToString("\n") { index ->
      val chat = chats.getJSONObject(index)
      if (chats.length() == 1) chat.getString("body") else "${chat.getString("title")}: ${chat.getString("body")}"
    }
    val stop = PendingIntent.getService(this, ID,
      Intent(this, T3ChatNotificationsService::class.java).setAction("stop-monitoring"),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL)
      else Notification.Builder(this).setPriority(Notification.PRIORITY_LOW))
      .setSmallIcon(icon).setContentTitle(title).setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE).setShowWhen(false)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setDeleteIntent(stop)
      .addAction(Notification.Action.Builder(null, "Stop monitoring", stop).build())
    val total = if (chats.length() == 1) first.optInt("totalSteps") else 0
    if (first.optBoolean("ongoing")) builder.setProgress(total, first.optInt("completedSteps").coerceIn(0, total.coerceAtLeast(0)), total == 0)
    if (Build.VERSION.SDK_INT >= 36 && first.optBoolean("ongoing")) {
      // Public extra is supported by Android 16 QPR1; older releases ignore it.
      builder.extras.putBoolean("android.requestPromotedOngoing", true)
      builder.setShortCriticalText(if (total > 0) "${first.optInt("completedSteps")}/$total" else "Working")
    }
    return builder.build()
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    backgroundRestricted = true
    expire.run()
  }
  override fun onTaskRemoved(rootIntent: Intent?) { expire.run() }
  override fun onDestroy() {
    running = false
    stopWaiters.forEach { it.resolve(null) }
    stopWaiters.clear()
    handler.removeCallbacks(expire)
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
