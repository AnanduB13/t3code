import { Editor } from "@pierre/diffs/editor";
import { EditProvider, File, Virtualizer } from "@pierre/diffs/react";
import { useEffect, useMemo } from "react";

import { useTheme } from "~/hooks/useTheme";
import { DIFF_SURFACE_THEME_UNSAFE_CSS, resolveDiffThemeName } from "~/lib/diffRendering";

const FINDER_EDITOR_UNSAFE_CSS = `
  ${DIFF_SURFACE_THEME_UNSAFE_CSS}

  diffs-container {
    --diffs-bg: var(--code-background, var(--background)) !important;
    --diffs-light-bg: var(--code-background, var(--background)) !important;
    --diffs-dark-bg: var(--code-background, var(--background)) !important;
    background-color: var(--code-background, var(--background)) !important;
    color: var(--code-foreground, var(--foreground)) !important;
  }
`;

export function FinderCodeEditor(props: {
  readonly contents: string;
  readonly fileName: string;
  readonly readOnly: boolean;
  readonly onChange: (contents: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const editor = useMemo(
    () =>
      new Editor({
        persistState: true,
        persistStateStorage: "inMemory",
        onChange: (file) => props.onChange(file.contents),
      }),
    [props.onChange],
  );

  useEffect(
    () => () => {
      editor.cleanUp();
    },
    [editor],
  );

  return (
    <EditProvider editor={editor}>
      <Virtualizer
        className="min-h-0 flex-1 overflow-auto"
        config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}
      >
        <File
          file={{ name: props.fileName, contents: props.contents }}
          options={{
            disableFileHeader: true,
            overflow: "scroll",
            theme: resolveDiffThemeName(resolvedTheme),
            themeType: resolvedTheme,
            unsafeCSS: FINDER_EDITOR_UNSAFE_CSS,
          }}
          className="min-h-full"
          contentEditable={!props.readOnly}
        />
      </Virtualizer>
    </EditProvider>
  );
}
