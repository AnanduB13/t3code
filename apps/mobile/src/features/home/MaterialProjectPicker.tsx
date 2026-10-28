import type { MenuAction } from "@react-native-menu/menu";
import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { AndroidAnchoredMenu } from "../../components/ui/AndroidAnchoredMenu";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText } from "../../components/ui/AppText";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { useAndroidControlSizing } from "../../components/ui/useAndroidControlSizing";
import type { HomeListFilterMenuProject } from "./home-list-filter-menu";

/** Direct project selection for both Android thread-list headers. */
export function MaterialProjectPicker(props: {
  readonly projects: ReadonlyArray<HomeListFilterMenuProject>;
  readonly selectedProjectKey: string | null;
  readonly onProjectChange: (projectKey: string | null) => void;
}) {
  const { scale, smallIconSize } = useAndroidControlSizing();
  const selectedProject = props.projects.find(
    (project) => project.key === props.selectedProjectKey,
  );
  const label = selectedProject?.label ?? "All projects";
  const actions = useMemo<MenuAction[]>(
    () => [
      {
        id: "project:all",
        title: "All projects",
        state: props.selectedProjectKey === null ? "on" : undefined,
      },
      ...props.projects.map((project) => ({
        id: `project:${project.key}`,
        title: project.label,
        state: props.selectedProjectKey === project.key ? ("on" as const) : undefined,
      })),
    ],
    [props.projects, props.selectedProjectKey],
  );

  return (
    <AndroidAnchoredMenu
      className="min-w-0 flex-1"
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "project:all") {
          props.onProjectChange(null);
          return;
        }
        const project = props.projects.find(
          (candidate) => nativeEvent.event === `project:${candidate.key}`,
        );
        if (project) props.onProjectChange(project.key);
      }}
      renderLeadingAction={(action) => {
        const project = props.projects.find(
          (candidate) => action.id === `project:${candidate.key}`,
        );
        return project?.environmentId ? (
          <ProjectFavicon
            environmentId={project.environmentId}
            faviconPath={project.faviconPath}
            projectTitle={project.label}
            size={20}
            workspaceRoot={project.workspaceRoot}
          />
        ) : null;
      }}
    >
      {(open) => (
        <Pressable
          accessibilityLabel={`Filter by project: ${label}`}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedProject !== undefined }}
          onPress={open}
          className="min-h-12 justify-center active:opacity-70"
        >
          <View
            className={`flex-row items-center rounded-full ${selectedProject ? "bg-secondary" : "bg-subtle"}`}
            style={{ minHeight: 40 * scale, gap: 7 * scale, paddingHorizontal: 12 * scale }}
          >
            <AppText
              className="min-w-0 flex-1 font-t3-medium text-header-foreground"
              numberOfLines={1}
              style={{ fontSize: 14 * scale }}
            >
              {label}
            </AppText>
            <SymbolView
              name="chevron.down"
              size={smallIconSize}
              tintColorClassName="accent-header-foreground"
            />
          </View>
        </Pressable>
      )}
    </AndroidAnchoredMenu>
  );
}
