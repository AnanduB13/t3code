# Android chat notifications

Enable **Settings → Configuration → Chat notifications**, then allow Android's notification permission. This works with directly paired environments and T3 Connect; a cloud account is not required.

While a connected chat runs, a quiet ongoing notification shows its title and current plan step when available. Without a plan, it shows that the agent is working instead of estimating a percentage. Multiple running chats share one notification. Completion, failure, approval requests, and questions produce separate alerts. Tap an alert to open that chat; tap the ongoing notification to open its first listed chat.

Monitoring continues when you switch apps after starting it with T3 Code open. It stays active while an agent waits for approval or input, and stops when the observed work finishes. Use **Stop monitoring** on the ongoing notification to end monitoring for those turns without stopping the agents. Turning off Chat notifications stops background monitoring. You can control sounds and visibility separately for **Chat alerts** and **Running chats** in Android's notification settings.

On supported Android 16 releases, running progress requests a Live Update in the status bar and on the lock screen. Realme's Live Alerts/camera-cutout presentation depends on your model, Realme UI version, and system settings. A normal ongoing notification remains available when the phone does not support that presentation.

These notifications use your connection to the environment, rather than a cloud push service. Keep T3 Code connected and allow background activity in your phone's battery settings if needed. Force-stopping the app, removing it from Recents, Android's background-service time limit, or the phone stopping the app ends monitoring. Reopen T3 Code to resume. Work started elsewhere after monitoring has stopped cannot wake the app. Old completed chats do not generate alerts when you first connect.
