import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/AppText";

export function PrButton({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-xl border px-3 py-2 active:opacity-60 ${selected ? "border-primary bg-primary" : "border-border bg-card"} ${disabled ? "opacity-40" : ""}`}
    >
      <Text
        className={
          selected
            ? "text-sm font-t3-bold text-primary-foreground"
            : "text-sm font-t3-medium text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PrNotice({ children }: { readonly children: string }) {
  return (
    <View className="rounded-xl bg-subtle p-3">
      <Text selectable className="text-sm text-foreground-muted">
        {children}
      </Text>
    </View>
  );
}
