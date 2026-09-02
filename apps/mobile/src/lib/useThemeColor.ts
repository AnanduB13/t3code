import type { ColorValue } from "react-native";
import { useCSSVariable } from "uniwind";

/** Returns a typed React Native color from the active Uniwind theme. */
export function useThemeColor(variable: `--color-${string}`): ColorValue {
  return useCSSVariable(variable) as string as ColorValue;
}
