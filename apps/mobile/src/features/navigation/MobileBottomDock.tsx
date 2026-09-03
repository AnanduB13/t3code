import { useNavigation } from "@react-navigation/native";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView, type AppSymbolName } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { GlassSurface } from "../../components/GlassSurface";
import { cn } from "../../lib/cn";
import {
  mobileDockDestinationForPathname,
  type MobileDockDestination,
} from "./mobile-dock-navigation";

const ITEMS: ReadonlyArray<{
  readonly destination: MobileDockDestination;
  readonly icon: AppSymbolName;
  readonly label: string;
}> = [
  { destination: "chat", icon: "text.bubble", label: "Chat" },
  { destination: "pull-requests", icon: "arrow.triangle.pull", label: "PR" },
  { destination: "usage", icon: "chart.bar.xaxis", label: "Usage" },
  { destination: "settings", icon: "gearshape", label: "Settings" },
];

const PRESS_SPRING = {
  damping: 18,
  mass: 0.55,
  stiffness: 260,
  reduceMotion: ReduceMotion.System,
} as const;

function MobileDockItem(props: {
  readonly active: boolean;
  readonly icon: AppSymbolName;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View className="min-w-0 flex-1" style={animatedStyle}>
      <Pressable
        accessibilityLabel={props.label}
        accessibilityRole="tab"
        accessibilityState={{ selected: props.active }}
        className="items-center justify-center gap-0.5 rounded-[20px] py-1"
        onPress={() => {
          void Haptics.selectionAsync();
          props.onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.9, PRESS_SPRING);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, PRESS_SPRING);
        }}
      >
        <View className="relative h-9 min-w-14 items-center justify-center overflow-hidden rounded-full px-4">
          {props.active ? (
            <Animated.View
              className="absolute inset-0 rounded-full bg-primary"
              entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
            />
          ) : null}
          <SymbolView
            name={props.icon}
            size={20}
            tintColorClassName={props.active ? "accent-primary-foreground" : "accent-icon-subtle"}
            type="monochrome"
          />
        </View>
        <Text
          numberOfLines={1}
          className={cn(
            "text-[10px] font-t3-bold",
            props.active ? "text-foreground" : "text-foreground-muted",
          )}
        >
          {props.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function MobileBottomDock(props: { readonly pathname: string }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const activeDestination = mobileDockDestinationForPathname(props.pathname);

  if (activeDestination === null) {
    return null;
  }

  const navigate = (destination: MobileDockDestination) => {
    switch (destination) {
      case "chat":
        navigation.navigate("Home");
        return;
      case "pull-requests":
        navigation.navigate("PullRequests");
        return;
      case "usage":
        navigation.navigate("SettingsSheet", {
          screen: "SettingsContent",
          params: { screen: "SettingsUsage" },
        });
        return;
      case "settings":
        navigation.navigate("SettingsSheet", {
          screen: "SettingsContent",
          params: { screen: "Settings" },
        });
    }
  };

  return (
    <View className="bg-screen px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      <View
        pointerEvents="none"
        className="absolute inset-x-0 -top-5 h-7 bg-linear-to-b from-screen/0 to-screen"
      />
      <Animated.View entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)}>
        <GlassSurface
          accessibilityRole="tablist"
          fallbackClassName="border border-border bg-card-translucent"
          className="flex-row px-1.5 py-1"
          style={{ borderRadius: 28 }}
        >
          {ITEMS.map((item) => (
            <MobileDockItem
              key={item.destination}
              active={activeDestination === item.destination}
              icon={item.icon}
              label={item.label}
              onPress={() => navigate(item.destination)}
            />
          ))}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}
