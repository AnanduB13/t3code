// Must stay first: the render counter wraps the DevTools hook before any React commit.
import "./src/features/development/render-counter-entry";
import { registerRootComponent } from "expo";
import "react-native-gesture-handler";
import { AppRegistry, LogBox } from "react-native";
import { featureFlags } from "react-native-screens";

import App from "./src/App";
import { androidNotifications } from "./src/features/agent-awareness/androidChatNotifications";

AppRegistry.registerHeadlessTask("T3ChatMonitor", () => async () => {
  await androidNotifications?.waitUntilStopped();
});

// Enables iOS FormSheet sizing for nested native stacks in non-fitToContents sheets.
featureFlags.experiment.synchronousScreenUpdatesEnabled = true;

if (process.env.EXPO_PUBLIC_SHOWCASE === "1") {
  LogBox.ignoreAllLogs();
}

registerRootComponent(App);
