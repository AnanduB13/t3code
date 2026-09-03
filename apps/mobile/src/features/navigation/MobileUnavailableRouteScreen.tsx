import { Platform, View } from "react-native";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView, type AppSymbolName } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { NativeStackScreenOptions } from "../../native/StackHeader";

function MobileUnavailableRouteScreen(props: {
  readonly icon: AppSymbolName;
  readonly title: string;
}) {
  return (
    <View className="flex-1 bg-screen">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title={props.title} />
        </>
      ) : null}
      <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
        <View className="size-16 items-center justify-center rounded-2xl bg-subtle">
          <SymbolView
            name={props.icon}
            size={30}
            tintColorClassName="accent-icon-subtle"
            type="monochrome"
          />
        </View>
        <Text className="text-center text-xl font-t3-bold text-foreground">{props.title}</Text>
        <Text className="max-w-80 text-center text-sm leading-5 text-foreground-muted">
          This section is not available on mobile yet. You can use it from the T3 Code web or
          desktop app.
        </Text>
      </View>
    </View>
  );
}

export function MobileAgentsRouteScreen() {
  return <MobileUnavailableRouteScreen icon="square.grid.2x2" title="Agents" />;
}

export function MobileScheduledRouteScreen() {
  return <MobileUnavailableRouteScreen icon="clock" title="Scheduled" />;
}

export function MobilePullRequestsRouteScreen() {
  return <MobileUnavailableRouteScreen icon="arrow.triangle.pull" title="Pull Requests" />;
}
