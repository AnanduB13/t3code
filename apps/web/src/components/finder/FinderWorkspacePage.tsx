import { useEffect, useState } from "react";
import { FolderPlusIcon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import FileBrowserPanel from "~/components/files/FileBrowserPanel";
import {
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

export function FinderWorkspacePage() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const environmentLabels = new Map(
    environments.map((environment) => [environment.environmentId, environment.label] as const),
  );
  const [projectKey, setProjectKey] = useState("");
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contents, setContents] = useState("");
  const [savedContents, setSavedContents] = useState("");
  const project =
    projects.find((item) => `${item.environmentId}:${item.id}` === projectKey) ?? projects[0];
  const entries = useProjectEntriesQuery(
    project?.environmentId ?? ("" as never),
    project?.workspaceRoot ?? "",
  );
  const file = useProjectFileQuery(
    project?.environmentId ?? ("" as never),
    project?.workspaceRoot ?? "",
    selectedPath,
    Boolean(project && selectedPath),
  );
  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const createEntry = useAtomCommand(projectEnvironment.createEntry);
  const moveEntry = useAtomCommand(projectEnvironment.moveEntry);
  const deleteEntry = useAtomCommand(projectEnvironment.deleteEntry);
  const dirty = selectedPath !== null && contents !== savedContents;

  useEffect(() => {
    if (!projectKey && project) setProjectKey(`${project.environmentId}:${project.id}`);
  }, [project, projectKey]);
  useEffect(() => {
    if (!file.data || file.data.relativePath !== selectedPath || dirty) return;
    setContents(file.data.contents);
    setSavedContents(file.data.contents);
  }, [dirty, file.data, selectedPath]);

  const guardDirty = () => !dirty || window.confirm("Discard the unsaved changes in this file?");
  const openFile = (path: string) => {
    if (!guardDirty()) return false;
    setSelectedEntryPath(path);
    setSelectedPath(path);
    setContents("");
    setSavedContents("");
    return true;
  };
  const runMutation = async (action: () => Promise<{ readonly _tag: string }>) => {
    try {
      const result = await action();
      if (result._tag !== "Success") throw new Error("The backend rejected this file operation.");
      entries.refresh();
    } catch (error) {
      toastManager.add({
        title: "File operation failed",
        description: String(error),
        type: "error",
      });
    }
  };
  const save = async () => {
    if (!project || !selectedPath || file.data?.truncated) return;
    const result = await writeFile({
      environmentId: project.environmentId,
      input: { cwd: project.workspaceRoot, relativePath: selectedPath, contents },
    });
    if (result._tag !== "Success") {
      toastManager.add({
        title: "Could not save file",
        description: "The backend rejected the save.",
        type: "error",
      });
      return;
    }
    setSavedContents(contents);
    entries.refresh();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const create = (kind: "file" | "directory") => {
    if (!project) return;
    const relativePath = window.prompt(`New ${kind} path, relative to ${project.title}`)?.trim();
    if (!relativePath) return;
    void runMutation(() =>
      createEntry({
        environmentId: project.environmentId,
        input: { cwd: project.workspaceRoot, relativePath, kind },
      }),
    );
  };
  const rename = () => {
    if (!project || !selectedEntryPath) return;
    const destinationPath = window.prompt("Move or rename to", selectedEntryPath)?.trim();
    if (!destinationPath || destinationPath === selectedEntryPath) return;
    const previousPath = selectedEntryPath;
    void runMutation(async () => {
      const result = await moveEntry({
        environmentId: project.environmentId,
        input: { cwd: project.workspaceRoot, relativePath: previousPath, destinationPath },
      });
      if (result._tag !== "Success") return result;
      setSelectedEntryPath(destinationPath);
      if (selectedPath === previousPath) setSelectedPath(destinationPath);
      return result;
    });
  };
  const remove = () => {
    if (
      !project ||
      !selectedEntryPath ||
      !window.confirm(`Delete ${selectedEntryPath}? This cannot be undone.`)
    )
      return;
    const pathToDelete = selectedEntryPath;
    void runMutation(async () => {
      const result = await deleteEntry({
        environmentId: project.environmentId,
        input: { cwd: project.workspaceRoot, relativePath: pathToDelete, recursive: true },
      });
      if (result._tag !== "Success") return result;
      setSelectedEntryPath(null);
      if (selectedPath === pathToDelete || selectedPath?.startsWith(`${pathToDelete}/`)) {
        setSelectedPath(null);
        setContents("");
        setSavedContents("");
      }
      return result;
    });
  };

  if (!project)
    return (
      <main className="flex h-full items-center justify-center text-muted-foreground">
        Add a project to an environment to use Finder.
      </main>
    );
  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background" data-finder-workspace="">
      <header className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b px-4">
        <strong className="text-sm">Finder</strong>
        <select
          className="h-7 max-w-64 rounded-md border bg-background px-2 text-sm"
          value={`${project.environmentId}:${project.id}`}
          onChange={(event) => {
            if (!guardDirty()) return;
            setProjectKey(event.target.value);
            setSelectedEntryPath(null);
            setSelectedPath(null);
          }}
        >
          {projects.map((item) => (
            <option
              key={`${item.environmentId}:${item.id}`}
              value={`${item.environmentId}:${item.id}`}
            >
              {environmentLabels.get(item.environmentId) ?? "Environment"} / {item.title}
            </option>
          ))}
        </select>
        <span className="truncate text-xs text-muted-foreground">{project.workspaceRoot}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar/40">
          <div className="flex h-10 items-center justify-end gap-1 border-b px-2">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="New file"
              onClick={() => create("file")}
            >
              <PlusIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="New folder"
              onClick={() => create("directory")}
            >
              <FolderPlusIcon />
            </Button>
          </div>
          <FileBrowserPanel
            environmentId={project.environmentId}
            cwd={project.workspaceRoot}
            projectName={project.title}
            selectedPath={selectedPath}
            selectedPathRevealId={0}
            onOpenFile={openFile}
            onSelectEntry={(path, kind) => {
              if (kind === "directory") setSelectedEntryPath(path);
            }}
          />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 items-center gap-1 border-b px-3">
            <span className="min-w-0 flex-1 truncate text-xs">
              {selectedPath ? `${selectedPath}${dirty ? " •" : ""}` : "Select a file"}
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={!selectedEntryPath}
              aria-label="Rename or move"
              onClick={rename}
            >
              <PencilIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={!selectedEntryPath}
              aria-label="Delete"
              onClick={remove}
            >
              <Trash2Icon />
            </Button>
            <Button size="sm" disabled={!dirty || file.data?.truncated} onClick={() => void save()}>
              <SaveIcon />
              Save
            </Button>
          </div>
          {selectedPath ? (
            <textarea
              aria-label={`Edit ${selectedPath}`}
              className="min-h-0 flex-1 resize-none bg-background p-5 font-mono text-[13px] leading-5 outline-none"
              readOnly={file.data?.truncated}
              spellCheck={false}
              value={contents}
              onChange={(event) => setContents(event.target.value)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Choose a file from the project explorer.
            </div>
          )}
          <footer className="flex h-7 items-center justify-between border-t px-3 text-[11px] text-muted-foreground">
            <span>{selectedPath ?? project.title}</span>
            <span>
              {file.data?.truncated
                ? "Preview only · file exceeds 1 MB"
                : `${contents.split("\n").length} lines · ${new TextEncoder().encode(contents).length} bytes`}
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}
