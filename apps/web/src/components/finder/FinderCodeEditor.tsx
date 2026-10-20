import { Editor, type EditorChangeEvent, type EditorFactory } from "@pierre/diffs/edit";
import { EditProvider, File, Virtualizer } from "@pierre/diffs/react";

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

const createFinderEditor: EditorFactory<undefined, undefined> = (
  editorType,
  options,
  editStateKey,
) => new Editor(editorType, options, editStateKey);

/** Editable code view for Finder; `onChange` receives the full contents after each edit. */
export function FinderCodeEditor(props: {
  readonly cacheKey: string;
  readonly contents: string;
  readonly fileName: string;
  readonly readOnly: boolean;
  readonly onChange: (contents: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const handleEditChange = ({ file }: EditorChangeEvent<"file", undefined, undefined>) => {
    props.onChange(file.contents);
  };

  return (
    <EditProvider createEditor={createFinderEditor}>
      <Virtualizer
        className="min-h-0 flex-1 overflow-auto"
        config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}
      >
        <File
          file={{ name: props.fileName, contents: props.contents, cacheKey: props.cacheKey }}
          edit={!props.readOnly}
          onEditChange={handleEditChange}
          options={{
            disableFileHeader: true,
            overflow: "scroll",
            theme: resolveDiffThemeName(resolvedTheme),
            themeType: resolvedTheme,
            unsafeCSS: FINDER_EDITOR_UNSAFE_CSS,
          }}
          className="min-h-full"
        />
      </Virtualizer>
    </EditProvider>
  );
}
