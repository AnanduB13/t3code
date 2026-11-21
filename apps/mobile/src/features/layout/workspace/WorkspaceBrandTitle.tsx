import { CompactBrandTitle } from "../../../components/CompactBrandTitle";
import { T3Wordmark } from "../../../components/T3Wordmark";
import { useAndroidControlSizing } from "../../../components/ui/useAndroidControlSizing";
import { WorkspaceConnectionTitle } from "../../home/WorkspaceConnectionTitle";

/**
 * The title of a workspace list tab: the brand and the connection status. `compact` shrinks the
 * brand to the wordmark so a project chip fits beside it.
 */
export function WorkspaceBrandTitle(props: {
  readonly accessibilityLabel: string;
  readonly onOpenEnvironments: () => void;
  readonly compact?: boolean;
}) {
  const { scale } = useAndroidControlSizing();
  return (
    <WorkspaceConnectionTitle
      grow={!props.compact}
      maxWidth={props.compact ? 96 * scale : undefined}
      onPress={props.onOpenEnvironments}
      brand={
        props.compact ? (
          <T3Wordmark colorClassName="accent-icon" height={Math.round(15 * scale)} />
        ) : (
          <CompactBrandTitle
            allowFontScaling={false}
            accessibilityLabel={props.accessibilityLabel}
            fit
          />
        )
      }
    />
  );
}
