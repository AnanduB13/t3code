package expo.modules.t3nativecontrols

import org.json.JSONArray

/** Tracks Stop monitoring per turn, so other chats finishing cannot restart it. Main thread only. */
internal class ChatMonitorSessions {
  private val dismissed = mutableSetOf<String>()

  fun select(chats: List<Map<String, Any?>>): List<Map<String, Any?>> {
    dismissed.retainAll(chats.map { key(it) }.toSet())
    return chats.filter { key(it) !in dismissed }
  }

  fun dismiss(session: String?) {
    val keys = JSONArray(session ?: "[]")
    for (index in 0 until keys.length()) dismissed.add(keys.getString(index))
  }

  fun clear() = dismissed.clear()

  companion object {
    fun key(chat: Map<String, Any?>): String = JSONArray(listOf(chat["key"], chat["turnId"])).toString()
  }
}
