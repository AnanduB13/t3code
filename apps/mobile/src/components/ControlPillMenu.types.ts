import type { MenuView } from "@react-native-menu/menu";
import type { ComponentProps, ReactNode } from "react";
import type { AccessibilityProps } from "react-native";

export type ControlPillMenuProps = Omit<
  ComponentProps<typeof MenuView>,
  "children" | "themeVariant"
> &
  Pick<AccessibilityProps, "accessible" | "accessibilityLabel" | "accessibilityRole"> & {
    readonly renderLeadingAction?: (
      action: ComponentProps<typeof MenuView>["actions"][number],
    ) => ReactNode;
    readonly children: ReactNode;
    readonly className?: string;
  };
