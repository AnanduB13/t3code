# Mobile notifications

## T3 Connect push notifications

Sign in to T3 Connect, link your environments, and enable **Device Notifications** in **Settings → Notifications** to receive alerts when an agent finishes, fails, needs approval, or asks for input. Tap a notification to open its thread. Your environment must have agent activity publishing enabled.

Enable **Ongoing Agent Activity** on Android or **Live Activity Updates** on iOS to follow work without opening the app. Finished results remain visible for up to 15 minutes. You can dismiss an Android activity card without disabling alerts; turn off ongoing activity in Settings to stop future cards.

Alerts appear even while the mobile app is open. Individual tool calls and progress updates do not trigger completion alerts; a completion alert means the full run has finished. Ongoing activity updates quietly. Viewing a thread on another device does not silence your phone's alerts.

Android cloud notifications require Android 7.0 or newer and Google Play services. Android 16 and newer can promote ongoing activity to a Live Update, subject to system settings and device support. Other devices show a regular ongoing notification. Android 7's battery-saving modes can delay removal of expired cards.

Notification permission and Android notification channels are controlled in system Settings. Background delivery requires T3 Connect; a direct or Tailscale connection alone does not enable push notifications. The mobile app does not need to maintain a connection to your environment. Force-stopping the Android app in system Settings prevents push delivery until you open it again.

## Direct chat notifications on Android and iPhone

Enable **Direct chat notifications** in **Settings → Notifications** to follow environments while
the phone stays connected, including direct and Tailscale connections. Alerts report full-run
completion, failure, approvals, and questions. Android builds with progress support also show a
quiet ongoing card while work runs. Tapping an alert opens the
thread. This does not require a Firebase setup or a T3 Connect account.

Direct notifications depend on the app's live environment connection. They cannot deliver a new
server event after the phone stops that connection or terminates the app. On iPhone, iOS can
suspend the connection when you leave the app. Enable T3 Connect push notifications for delivery
while the app is suspended or closed.

Each environment has one notification owner. On a build with cloud push configured, linked
environments use cloud delivery once device registration succeeds; direct notifications cover
other connected environments and remain available if cloud registration fails.
After Dark builds without matching Firebase configuration keep using direct notifications for
connected environments, including connections through T3 Connect. Turning direct notifications
off stops their ongoing card without changing cloud notification settings.
