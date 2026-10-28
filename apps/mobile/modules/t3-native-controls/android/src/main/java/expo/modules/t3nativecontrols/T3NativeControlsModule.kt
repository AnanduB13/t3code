package expo.modules.t3nativecontrols

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import android.text.format.DateFormat
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URI

class T3NativeControlsModule : Module() {
  private var filePreviewPromise: Promise? = null
  private var dictationPromise: Promise? = null
  private var dictationSessionId: String? = null
  private var dictationActivity: Activity? = null
  private var dictationCancelled = false

  @Suppress("TooGenericExceptionCaught") // Clear the pending promise before rethrowing.
  override fun definition() = ModuleDefinition {
    Name("T3NativeControls")

    Function("is24HourFormat") {
      val context = appContext.reactContext ?: error("The app is not active.")
      DateFormat.is24HourFormat(context)
    }

    AsyncFunction("startDictation") { locale: String, sessionId: String, promise: Promise ->
      check(dictationPromise == null) { "Another voice input session is still finishing." }
      val activity = appContext.currentActivity ?: error("The app is not active.")
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your message")
      }
      dictationPromise = promise
      dictationSessionId = sessionId
      dictationActivity = activity
      dictationCancelled = false
      try {
        activity.startActivityForResult(intent, DICTATION_REQUEST_CODE)
      } catch (error: Exception) {
        clearDictation()
        if (error is ActivityNotFoundException) {
          promise.reject(
            "ERR_DICTATION_UNAVAILABLE",
            "Install or enable a speech recognition app to use voice input.",
            error
          )
        } else {
          promise.reject(
            "ERR_DICTATION_START",
            "Could not open speech input. Please try again.",
            error
          )
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelDictation") { sessionId: String ->
      if (dictationSessionId == sessionId) {
        dictationCancelled = true
        dictationActivity?.finishActivity(DICTATION_REQUEST_CODE)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openFile") { uri: String, mimeType: String, promise: Promise ->
      check(filePreviewPromise == null) { "A document viewer is already open." }
      val activity = appContext.currentActivity ?: error("The app is not active.")
      val file = File(URI(uri)).canonicalFile
      require(file.isFile) { "The file is no longer available." }
      val contentUri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.FileSystemFileProvider",
        file
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      filePreviewPromise = promise
      try {
        activity.startActivityForResult(intent, 7343)
      } catch (error: Exception) {
        filePreviewPromise = null
        throw error
      }
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode == 7343) {
        filePreviewPromise?.resolve(null)
        filePreviewPromise = null
      }
      if (requestCode == DICTATION_REQUEST_CODE) {
        val promise = dictationPromise
        val cancelled = dictationCancelled || resultCode == Activity.RESULT_CANCELED
        clearDictation()
        when {
          cancelled -> promise?.resolve(null)
          resultCode == Activity.RESULT_OK -> promise?.resolve(
            data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
          )
          else -> promise?.reject(
            "ERR_DICTATION_FAILED",
            "Speech input failed. Please try again.",
            null
          )
        }
      }
    }

    OnDestroy {
      val activity = dictationActivity
      if (activity != null) {
        activity.runOnUiThread { activity.finishActivity(DICTATION_REQUEST_CODE) }
      }
      dictationPromise?.resolve(null)
      clearDictation()
    }

    Function("getShowcasePairingUrl") {
      appContext.currentActivity?.intent?.getStringExtra("showcasePairingUrl")
    }

    Function("getShowcaseScene") {
      val storedScene = appContext.reactContext
        ?.filesDir
        ?.resolve("t3-showcase-scene")
        ?.takeIf { it.isFile }
        ?.readText()
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
      storedScene ?: appContext.currentActivity?.intent?.getStringExtra("showcaseScene")
    }

    // The palette is fixed for the whole capture, so it only ever arrives as a
    // launch extra — unlike the scene, which the runner rewrites in place.
    Function("getShowcaseTheme") {
      appContext.currentActivity?.intent?.getStringExtra("showcaseTheme")
    }

    Function("prepareShowcaseCapture") {
      // Android app data is cleared by the host runner before launch.
    }

    Function("markShowcaseReady") { scene: String ->
      appContext.reactContext
        ?.filesDir
        ?.resolve("t3-showcase-ready")
        ?.writeText(scene)
    }
  }

  private fun clearDictation() {
    dictationPromise = null
    dictationSessionId = null
    dictationActivity = null
    dictationCancelled = false
  }

  private companion object {
    const val DICTATION_REQUEST_CODE = 7344
  }
}
