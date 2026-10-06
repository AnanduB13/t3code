package expo.modules.t3nativecontrols

import android.app.Notification
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 36])
class T3ChatNotificationsTest {
  private fun chat(key: String, turn: String = "turn-a") = mapOf<String, Any?>(
    "key" to key, "runId" to turn, "title" to "Fix login", "body" to "Run tests",
    "deepLink" to "t3code-after-dark://threads/env/chat", "ongoing" to true,
    "totalSteps" to 3, "completedSteps" to 1
  )

  @Test fun runningCardWorksOnEverySupportedApi() {
    val controller = Robolectric.buildService(T3ChatNotificationsService::class.java).create()
    val card = controller.get().notification(JSONArray(listOf(chat("a"))))
    assertEquals("Fix login", card.extras.getString(Notification.EXTRA_TITLE))
    assertEquals(3, card.extras.getInt(Notification.EXTRA_PROGRESS_MAX))
    assertEquals(1, card.extras.getInt(Notification.EXTRA_PROGRESS))
    assertTrue(card.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertNotNull(card.contentIntent)
    assertEquals("Stop monitoring", card.actions.single().title)
  }

  @Test fun stoppingMonitoringSurvivesReorderingAndOtherChatsFinishing() {
    val sessions = ChatMonitorSessions()
    val a = chat("a")
    val b = chat("b")
    sessions.dismiss(JSONArray(listOf(ChatMonitorSessions.key(a), ChatMonitorSessions.key(b))).toString())
    assertTrue(sessions.select(listOf(b, a)).isEmpty())
    assertTrue(sessions.select(listOf(a)).isEmpty())
    val next = chat("a", "turn-b")
    assertEquals(listOf(next), sessions.select(listOf(next)))
  }

  @Test fun newChatsDoNotRestartDismissedTurnsAndDisablingResetsMonitoring() {
    val sessions = ChatMonitorSessions()
    val a = chat("a")
    val b = chat("b")
    sessions.dismiss(JSONArray(listOf(ChatMonitorSessions.key(a))).toString())
    assertEquals(listOf(b), sessions.select(listOf(a, b)))
    sessions.clear()
    assertEquals(listOf(a, b), sessions.select(listOf(a, b)))
  }
}
