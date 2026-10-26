import type { ColorValue } from "react-native";
// oxlint-disable-next-line t3code/no-mobile-uniwind-theme-escape-hatches -- Native APIs that require ColorValue read theme tokens through this helper.
import { useCSSVariable } from "uniwind";

/** Returns a typed React Native color from the active Uniwind theme. */
export function useThemeColor(variable: `--color-${string}`): ColorValue {
  return useCSSVariable(variable) as string as ColorValue;
}
