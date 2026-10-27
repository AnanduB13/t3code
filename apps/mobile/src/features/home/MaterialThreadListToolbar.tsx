import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { BackHandler, Keyboard, type TextInput, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MenuAction } from "@react-native-menu/menu";

import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { CompactBrandTitle } from "../../components/CompactBrandTitle";
import { MaterialFloatingActionButton } from "../../components/MaterialFloatingActionButton";
import { AndroidAnchoredMenu } from "../../components/AndroidAnchoredMenu";
import { MaterialSearchField } from "../../components/MaterialSearchField";
import { T3Wordmark } from "../../components/T3Wordmark";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { WorkspaceConnectionTitle } from "./WorkspaceConnectionTitle";
import { useWorkspaceState } from "../../state/workspace";
import { useAndroidControlSizing } from "../../components/useAndroidControlSizing";
import { useMaterialToolbarLayout } from "../../components/useMaterialToolbarLayout";

/** One toolbar height for the compact list and expanded sidebar, including search. */
export function MaterialThreadListToolbar(props: {
  readonly searchQuery: string;
  readonly onSearchQueryChange: (query: string) => void;
  readonly projectPicker?: ReactNode;
  readonly filterActions: MenuAction[];
  readonly filterCustomized: boolean;
  readonly onFilterAction: NonNullable<ComponentProps<typeof AndroidAnchoredMenu>["onPressAction"]>;
  readonly onOpenSettings: () => void;
  readonly onOpenEnvironments: () => void;
  readonly sidebar?: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onRequestVisibility?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { fabSize, scale } = useAndroidControlSizing();
  const { height: toolbarHeight, ...headerPadding } = useMaterialToolbarLayout();
  const { state } = useWorkspaceState();
  const { onRequestVisibility, onSearchQueryChange } = props;
  const searchRef = useRef<TextInput>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || props.searchQuery.length > 0;
  const hasProjectPicker = props.projectPicker != null;
  const openSearch = useCallback(() => {
    onRequestVisibility?.();
    setSearchOpen(true);
    searchRef.current?.focus();
    return true;
  }, [onRequestVisibility]);
  useHardwareKeyboardCommand("focusSearch", openSearch);

  const closeSearch = useCallback(() => {
    onSearchQueryChange("");
    setSearchOpen(false);
    Keyboard.dismiss();
  }, [onSearchQueryChange]);

  useEffect(() => {
    if (!searching) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [closeSearch, searching]);

  const filterIcon = props.filterCustomized
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";
  const searchField = (
    <MaterialSearchField
      inputRef={searchRef}
      accessibilityLabel="Search threads"
      clearAccessibilityLabel="Clear search"
      placeholder="Search"
      value={props.searchQuery}
      onChangeText={onSearchQueryChange}
    />
  );

  return (
    <>
      <View
        onLayout={props.onLayout}
        className={
          props.sidebar ? "absolute inset-x-0 top-0 z-[4] bg-header px-2" : "bg-header px-2"
        }
        style={headerPadding}
      >
        <View className="flex-row items-center gap-1" style={{ minHeight: toolbarHeight }}>
          {searching ? (
            <>
              <AndroidHeaderIconButton
                accessibilityLabel="Close search"
                icon="arrow.left"
                onPress={closeSearch}
              />
              {searchField}
            </>
          ) : (
            <>
              {/* Match the visible inset of the trailing 48dp icon button. */}
              <View className="min-w-0 flex-1 flex-row items-center gap-2 pl-4">
                <WorkspaceConnectionTitle
                  grow={!hasProjectPicker}
                  maxWidth={hasProjectPicker ? 96 * scale : undefined}
                  onPress={props.onOpenEnvironments}
                  brand={
                    hasProjectPicker ? (
                      <T3Wordmark colorClassName="accent-icon" height={Math.round(15 * scale)} />
                    ) : (
                      <CompactBrandTitle allowFontScaling={false} />
                    )
                  }
                />
                {props.projectPicker}
              </View>
              <AndroidHeaderIconButton
                accessibilityLabel="Search threads"
                icon="magnifyingglass"
                onPress={openSearch}
              />
              <AndroidHeaderIconButton
                accessibilityLabel="Open settings"
                icon="gearshape"
                onPress={props.onOpenSettings}
              />
            </>
          )}
        </View>
      </View>
      {/* Keep the filter above the New thread FAB at every text size. */}
      {state.hasConnections ? (
        <View
          className="absolute right-5 z-[5]"
          style={{
            bottom:
              (props.sidebar ? Math.max(insets.bottom, 12) + 6 : Math.max(insets.bottom, 16) + 16) +
              fabSize +
              8,
          }}
        >
          <AndroidAnchoredMenu actions={props.filterActions} onPressAction={props.onFilterAction}>
            {(open) => (
              <MaterialFloatingActionButton
                label="Filter threads"
                icon={filterIcon}
                onPress={open}
              />
            )}
          </AndroidAnchoredMenu>
        </View>
      ) : null}
    </>
  );
}
