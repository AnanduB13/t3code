# Mobile notifications

## T3 Connect push notifications

Sign in to T3 Connect, link your environments, and enable **Device Notifications** in **Settings → Notifications** to receive alerts when an agent finishes, fails, needs approval, or asks for input. Tap a notification to open its thread. Your environment must have agent activity publishing enabled.

Enable **Ongoing Agent Activity** on Android or **Live Activity Updates** on iOS to follow work without opening the app. Finished results remain visible for up to 15 minutes. You can dismiss an Android activity card without disabling alerts; turn off ongoing activity in Settings to stop future cards.

Ordinary alerts stay quiet while the mobile app is in the foreground. Ongoing activity continues to update. Viewing a thread on another device does not silence your phone's alerts.

Android cloud notifications require Android 7.0 or newer and Google Play services. Android 16 and newer can promote ongoing activity to a Live Update, subject to system settings and device support. Other devices show a regular ongoing notification. Android 7's battery-saving modes can delay removal of expired cards.

Notification permission and Android notification channels are controlled in system Settings. Background delivery requires T3 Connect; a direct or Tailscale connection alone does not enable push notifications. The mobile app does not need to maintain a connection to your environment. Force-stopping the Android app in system Settings prevents push delivery until you open it again.

## Direct chat notifications on After Dark Android

Enable **Direct chat notifications** in **Settings → Notifications** to follow environments while
the phone stays connected, including direct and Tailscale connections. The ongoing card shows
active work, and alerts report completion, failure, approvals, and questions. Tapping opens the
thread. This does not require a Firebase setup or a T3 Connect account.

Direct notifications depend on the app's live environment connection. They cannot deliver a new
server event after Android stops that connection or terminates the app. Cloud push can deliver
while the app is closed when T3 Connect and the Android build are configured for it.

Each environment has one notification owner. On a build with cloud push configured, linked
environments use the cloud controls; direct notifications cover the other connected environments.
After Dark builds without matching Firebase configuration keep using direct notifications for
connected environments, including connections through T3 Connect. Turning direct notifications
off stops their ongoing card without changing cloud notification settings.
