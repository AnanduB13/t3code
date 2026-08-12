import type { EnvironmentId, FilesystemBrowseEntry } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  Grid2X2Icon,
  HardDriveIcon,
  HomeIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { toastManager } from "~/components/ui/toast";
import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";
import { useEnvironments } from "~/state/environments";
import { useProjects } from "~/state/entities";
import { filesystemEnvironment } from "~/state/filesystem";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { useLocalStorage } from "~/hooks/useLocalStorage";

import FileBrowserPanel from "~/components/files/FileBrowserPanel";
import { FinderCodeEditor } from "./FinderCodeEditor";
import { FinderSpreadsheetEditor } from "./FinderSpreadsheetEditor";
import { clearFinderRevealRequest, readFinderRevealRequest } from "./finderNavigation";

type FinderView = "list" | "grid";

const FINDER_PERSISTENCE_KEY = "t3code:finder-state:v1";
const FinderLocationSchema = Schema.Struct({
  rootPath: Schema.NullOr(Schema.String),
  homePath: Schema.NullOr(Schema.String),
  currentDirectory: Schema.String,
  history: Schema.Array(Schema.String),
  showHidden: Schema.Boolean,
  view: Schema.Literals(["list", "grid"]),
});
const FinderPersistenceSchema = Schema.Struct({
  selectedEnvironmentId: Schema.NullOr(Schema.String),
  locations: Schema.Record(Schema.String, FinderLocationSchema),
});
type FinderPersistence = typeof FinderPersistenceSchema.Type;

const EMPTY_FINDER_PERSISTENCE: FinderPersistence = {
  selectedEnvironmentId: null,
  locations: {},
};

function separator(path: string): "/" | "\\" {
  return /^[A-Za-z]:[\\/]/.test(path) || path.includes("\\") ? "\\" : "/";
}

function directoryQuery(path: string): string {
  const sep = separator(path);
  return path.endsWith("/") || path.endsWith("\\") ? path : `${path}${sep}`;
}

function joinPath(parent: string, name: string): string {
  return `${parent.replace(/[\\/]$/, "")}${separator(parent)}${name}`;
}

function parentPath(path: string): string {
  const normalized = path.replace(/[\\/]$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (index <= 0) return normalized.slice(0, index + 1) || "/";
  return normalized.slice(0, index);
}

function filesystemRoot(path: string): string {
  const drive = /^[A-Za-z]:/.exec(path)?.[0];
  return drive ? `${drive}\\` : "/";
}

function relativePath(root: string, fullPath: string): string | null {
  const normalizedRoot = root.replace(/[\\/]$/, "");
  if (fullPath === normalizedRoot) return null;
  if (!fullPath.startsWith(`${normalizedRoot}/`) && !fullPath.startsWith(`${normalizedRoot}\\`)) {
    return null;
  }
  return fullPath.slice(normalizedRoot.length + 1).replaceAll("\\", "/");
}

function containingProjectRoot(
  projects: ReturnType<typeof useProjects>,
  environmentId: EnvironmentId | null,
  fullPath: string,
) {
  return projects
    .toSorted((left, right) => right.workspaceRoot.length - left.workspaceRoot.length)
    .find(
      (project) =>
        project.environmentId === environmentId &&
        relativePath(project.workspaceRoot, fullPath) !== null,
    )?.workspaceRoot;
}

function FinderEntryIcon({
  entry,
  className,
}: {
  entry: FilesystemBrowseEntry;
  className?: string;
}) {
  return (entry.kind ?? "directory") === "directory" ? (
    <FolderIcon className={className ?? "size-4 text-blue-400"} fill="currentColor" />
  ) : (
    <FileIcon className={className ?? "size-4 text-muted-foreground"} />
  );
}

export function FinderWorkspacePage() {
  const projects = useProjects();
  const revealRequest = useMemo(readFinderRevealRequest, []);
  const revealHandled = useRef(false);
  const { environments } = useEnvironments();
  const [persistedFinder, setPersistedFinder] = useLocalStorage(
    FINDER_PERSISTENCE_KEY,
    EMPTY_FINDER_PERSISTENCE,
    FinderPersistenceSchema,
  );
  const connectedEnvironments = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  const initialEnvironmentId = persistedFinder.selectedEnvironmentId as EnvironmentId | null;
  const initialLocation = initialEnvironmentId
    ? persistedFinder.locations[initialEnvironmentId]
    : undefined;
  const [environmentId, setEnvironmentId] = useState<EnvironmentId | null>(initialEnvironmentId);
  const [rootPath, setRootPath] = useState<string | null>(initialLocation?.rootPath ?? null);
  const [homePaths, setHomePaths] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(persistedFinder.locations).flatMap(([id, location]) =>
        location.homePath ? [[id, location.homePath]] : [],
      ),
    ),
  );
  const [currentDirectory, setCurrentDirectory] = useState(
    initialLocation?.currentDirectory ?? "~/",
  );
  const [history, setHistory] = useState<string[]>(() => [...(initialLocation?.history ?? [])]);
  const [selectedEntry, setSelectedEntry] = useState<FilesystemBrowseEntry | null>(null);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [editorRootPath, setEditorRootPath] = useState<string | null>(null);
  const [contents, setContents] = useState("");
  const [savedContents, setSavedContents] = useState("");
  const [showHidden, setShowHidden] = useState(initialLocation?.showHidden ?? false);
  const [view, setView] = useState<FinderView>(initialLocation?.view ?? "list");
  const [filter, setFilter] = useState("");
  const dirty = openFilePath !== null && contents !== savedContents;

  useEffect(() => {
    if (!revealRequest || revealHandled.current) return;
    revealHandled.current = true;
    const containingDirectory = parentPath(revealRequest.fullPath);
    const projectRoot = containingProjectRoot(
      projects,
      revealRequest.environmentId,
      revealRequest.fullPath,
    );
    setEnvironmentId(revealRequest.environmentId);
    setRootPath(projectRoot ?? containingDirectory);
    setEditorRootPath(projectRoot ?? containingDirectory);
    setCurrentDirectory(containingDirectory);
    setHistory([]);
    setSelectedEntry({
      name: revealRequest.fullPath.split(/[\\/]/).at(-1) ?? revealRequest.fullPath,
      fullPath: revealRequest.fullPath,
      kind: "file",
    });
    setOpenFilePath(revealRequest.fullPath);
    setContents("");
    setSavedContents("");
    clearFinderRevealRequest(revealRequest.requestId);
  }, [projects, revealRequest]);

  useEffect(() => {
    if (
      environmentId !== null &&
      connectedEnvironments.some((environment) => environment.environmentId === environmentId)
    )
      return;
    const fallback = connectedEnvironments[0];
    if (fallback) selectEnvironment(fallback.environmentId);
  }, [connectedEnvironments, environmentId]);

  useEffect(() => {
    if (environmentId === null) return;
    setPersistedFinder((state) => ({
      selectedEnvironmentId: environmentId,
      locations: {
        ...state.locations,
        [environmentId]: {
          rootPath,
          homePath: homePaths[environmentId] ?? null,
          currentDirectory,
          history: history.slice(-50),
          showHidden,
          view,
        },
      },
    }));
  }, [
    currentDirectory,
    environmentId,
    history,
    homePaths,
    rootPath,
    setPersistedFinder,
    showHidden,
    view,
  ]);

  const browse = useEnvironmentQuery(
    environmentId === null
      ? null
      : filesystemEnvironment.browse({
          environmentId,
          input: {
            partialPath: directoryQuery(currentDirectory),
            includeFiles: true,
            showHidden,
          },
        }),
  );

  useEffect(() => {
    if (!browse.data || environmentId === null || currentDirectory !== "~/") return;
    const home = browse.data.parentPath;
    setHomePaths((paths) => ({ ...paths, [environmentId]: home }));
    setRootPath(home);
    setCurrentDirectory(home);
  }, [browse.data, currentDirectory, environmentId]);

  const activeFileRoot = editorRootPath ?? rootPath;
  const openRelativePath =
    activeFileRoot && openFilePath ? relativePath(activeFileRoot, openFilePath) : null;
  const file = useProjectFileQuery(
    environmentId ?? ("" as EnvironmentId),
    activeFileRoot ?? "",
    openRelativePath,
    Boolean(environmentId && activeFileRoot && openRelativePath),
  );
  useEffect(() => {
    if (!file.data || file.data.relativePath !== openRelativePath || dirty) return;
    setContents(file.data.contents);
    setSavedContents(file.data.contents);
  }, [dirty, file.data, openRelativePath]);

  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const createEntry = useAtomCommand(projectEnvironment.createEntry);
  const moveEntry = useAtomCommand(projectEnvironment.moveEntry);
  const deleteEntry = useAtomCommand(projectEnvironment.deleteEntry);

  const entries = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (browse.data?.entries ?? []).filter(
      (entry) => query.length === 0 || entry.name.toLowerCase().includes(query),
    );
  }, [browse.data?.entries, filter]);

  const guardDirty = () => !dirty || window.confirm("Discard the unsaved changes in this file?");
  const clearFile = () => {
    setSelectedEntry(null);
    setOpenFilePath(null);
    setEditorRootPath(null);
    setContents("");
    setSavedContents("");
  };
  const navigateTo = (path: string, remember = true) => {
    if (!guardDirty()) return;
    if (remember && currentDirectory !== "~/") {
      setHistory((items) => [...items.slice(-49), currentDirectory]);
    }
    setCurrentDirectory(path);
    setFilter("");
    clearFile();
  };
  const openEntry = (entry: FilesystemBrowseEntry) => {
    if ((entry.kind ?? "directory") === "directory") {
      navigateTo(entry.fullPath);
      return;
    }
    if (!guardDirty()) return;
    const projectRoot = containingProjectRoot(projects, environmentId, entry.fullPath);
    setSelectedEntry(entry);
    setEditorRootPath(projectRoot ?? currentDirectory);
    setOpenFilePath(entry.fullPath);
    setContents("");
    setSavedContents("");
  };
  const selectEnvironment = (nextEnvironmentId: EnvironmentId) => {
    if (!guardDirty()) return;
    setEnvironmentId(nextEnvironmentId);
    const savedLocation = persistedFinder.locations[nextEnvironmentId];
    const home = savedLocation?.homePath ?? homePaths[nextEnvironmentId];
    setRootPath(savedLocation?.rootPath ?? home ?? null);
    setCurrentDirectory(savedLocation?.currentDirectory ?? home ?? "~/");
    setHistory([...(savedLocation?.history ?? [])]);
    setShowHidden(savedLocation?.showHidden ?? false);
    setView(savedLocation?.view ?? "list");
    clearFile();
  };
  const openHome = () => {
    if (environmentId === null) return;
    const home = homePaths[environmentId];
    setRootPath(home ?? null);
    navigateTo(home ?? "~/");
  };
  const openComputer = () => {
    if (environmentId === null) return;
    const home = homePaths[environmentId];
    if (!home) return;
    const root = filesystemRoot(home);
    setRootPath(root);
    navigateTo(root);
  };
  const openProject = (project: (typeof projects)[number]) => {
    if (project.environmentId !== environmentId) selectEnvironment(project.environmentId);
    setRootPath(project.workspaceRoot);
    navigateTo(project.workspaceRoot);
  };
  const goBack = () => {
    const destination = history.at(-1);
    if (!destination || !guardDirty()) return;
    setHistory((items) => items.slice(0, -1));
    setCurrentDirectory(destination);
    clearFile();
  };
  const goUp = () => {
    if (!rootPath || currentDirectory === rootPath) return;
    const destination = parentPath(currentDirectory);
    if (relativePath(rootPath, destination) === null && destination !== rootPath) return;
    navigateTo(destination);
  };

  const refresh = () => browse.refresh();
  const runMutation = async (action: () => Promise<{ readonly _tag: string }>) => {
    const result = await action();
    if (result._tag !== "Success") {
      toastManager.add({
        title: "File operation failed",
        description: "The backend rejected this operation.",
        type: "error",
      });
      return false;
    }
    refresh();
    return true;
  };
  const relativeInRoot = (absolutePath: string) =>
    rootPath === null ? null : relativePath(rootPath, absolutePath);
  const create = (kind: "file" | "directory") => {
    if (!environmentId || !rootPath) return;
    const name = window.prompt(`Name for the new ${kind}`)?.trim();
    if (!name || name.includes("/") || name.includes("\\")) return;
    const path = relativeInRoot(joinPath(currentDirectory, name));
    if (!path) return;
    void runMutation(() =>
      createEntry({
        environmentId,
        input: { cwd: rootPath, relativePath: path, kind },
      }),
    );
  };
  const rename = () => {
    if (!environmentId || !rootPath || !selectedEntry) return;
    const name = window.prompt("Rename to", selectedEntry.name)?.trim();
    if (!name || name.includes("/") || name.includes("\\")) return;
    const source = relativeInRoot(selectedEntry.fullPath);
    const destination = relativeInRoot(joinPath(currentDirectory, name));
    if (!source || !destination) return;
    void runMutation(() =>
      moveEntry({
        environmentId,
        input: {
          cwd: rootPath,
          relativePath: source,
          destinationPath: destination,
        },
      }),
    ).then((success) => {
      if (success) clearFile();
    });
  };
  const remove = () => {
    if (
      !environmentId ||
      !rootPath ||
      !selectedEntry ||
      !window.confirm(`Delete “${selectedEntry.name}”? This cannot be undone.`)
    ) {
      return;
    }
    const path = relativeInRoot(selectedEntry.fullPath);
    if (!path) return;
    void runMutation(() =>
      deleteEntry({
        environmentId,
        input: { cwd: rootPath, relativePath: path, recursive: true },
      }),
    ).then((success) => {
      if (success) clearFile();
    });
  };
  const save = async () => {
    if (!environmentId || !activeFileRoot || !openRelativePath || file.data?.truncated) return;
    const result = await writeFile({
      environmentId,
      input: { cwd: activeFileRoot, relativePath: openRelativePath, contents },
    });
    if (result._tag !== "Success") {
      toastManager.add({ title: "Could not save file", type: "error" });
      return;
    }
    setSavedContents(contents);
    refresh();
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

  const environmentProjects = projects.filter((project) => project.environmentId === environmentId);
  const editorProjectName =
    environmentProjects.find((project) => project.workspaceRoot === activeFileRoot)?.title ??
    activeFileRoot
      ?.replace(/[\\/]$/, "")
      .split(/[\\/]/)
      .at(-1) ??
    "Files";
  const canGoUp = Boolean(rootPath && currentDirectory !== rootPath);
  const spreadsheetDelimiter = openFilePath?.toLowerCase().endsWith(".csv")
    ? ","
    : openFilePath?.toLowerCase().endsWith(".tsv")
      ? "\t"
      : null;

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background" data-finder-workspace="">
      <header className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 border-b px-3">
        <strong className="mr-1 text-sm">Finder</strong>
        <select
          aria-label="Device"
          className="h-7 max-w-56 rounded-md border bg-background px-2 text-sm"
          value={environmentId ?? ""}
          onChange={(event) => selectEnvironment(event.target.value as EnvironmentId)}
        >
          {connectedEnvironments.map((environment) => (
            <option key={environment.environmentId} value={environment.environmentId}>
              {environment.label}
            </option>
          ))}
        </select>
        <Button size="icon-xs" variant="ghost" disabled={history.length === 0} onClick={goBack}>
          <ArrowLeftIcon />
        </Button>
        <Button size="icon-xs" variant="ghost" disabled={!canGoUp} onClick={goUp}>
          <ArrowUpIcon />
        </Button>
        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
          <HomeIcon className="size-3.5 shrink-0" />
          <span className="truncate">{browse.data?.parentPath ?? currentDirectory}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon-xs"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
          >
            <ListIcon />
          </Button>
          <Button
            size="icon-xs"
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => setView("grid")}
          >
            <Grid2X2Icon />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r bg-sidebar/35">
          {openFilePath && activeFileRoot && openRelativePath && environmentId ? (
            <FileBrowserPanel
              environmentId={environmentId}
              cwd={activeFileRoot}
              projectName={editorProjectName}
              selectedPath={openRelativePath}
              selectedPathRevealId={0}
              initialExpansion={0}
              onOpenFile={(path) => {
                if (!guardDirty()) return;
                const fullPath = joinPath(activeFileRoot, path);
                setSelectedEntry({
                  name: path.split("/").at(-1) ?? path,
                  fullPath,
                  kind: "file",
                });
                setOpenFilePath(fullPath);
                setContents("");
                setSavedContents("");
              }}
            />
          ) : (
            <div className="overflow-auto p-2">
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Favorites
              </p>
              <button
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                onClick={openHome}
              >
                <HomeIcon className="size-4 text-blue-400" />
                Home
              </button>
              <button
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent disabled:opacity-50"
                disabled={environmentId === null || !homePaths[environmentId]}
                onClick={openComputer}
              >
                <HardDriveIcon className="size-4 text-muted-foreground" />
                Computer
              </button>
              <p className="mt-3 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Projects
              </p>
              {environmentProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
                  onClick={() => openProject(project)}
                >
                  <FolderIcon className="size-4 text-blue-400" />
                  <span className="truncate">{project.title}</span>
                </button>
              ))}
              <label className="mt-4 flex cursor-pointer items-center gap-2 px-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(event) => setShowHidden(event.target.checked)}
                />
                Show hidden files
              </label>
            </div>
          )}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
            <Input
              className="h-7 max-w-64"
              placeholder="Search this folder"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
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
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={!selectedEntry}
              aria-label="Rename"
              onClick={rename}
            >
              <PencilIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={!selectedEntry}
              aria-label="Delete"
              onClick={remove}
            >
              <Trash2Icon />
            </Button>
            {openFilePath ? (
              <>
                <span className="ml-2 min-w-0 flex-1 truncate text-xs">
                  {selectedEntry?.name}
                  {dirty ? " •" : ""}
                </span>
                <Button
                  size="sm"
                  disabled={!dirty || file.data?.truncated}
                  onClick={() => void save()}
                >
                  <SaveIcon />
                  Save
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Close editor"
                  onClick={() => {
                    if (guardDirty()) clearFile();
                  }}
                >
                  <XIcon />
                </Button>
              </>
            ) : null}
          </div>
          {openFilePath && file.error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <FileIcon className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">This file cannot be opened as text</p>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">{file.error}</p>
            </div>
          ) : openFilePath ? (
            spreadsheetDelimiter ? (
              <FinderSpreadsheetEditor
                contents={contents}
                delimiter={spreadsheetDelimiter}
                readOnly={Boolean(file.data?.truncated)}
                onChange={setContents}
              />
            ) : (
              <FinderCodeEditor
                fileName={openRelativePath ?? selectedEntry?.name ?? "file"}
                contents={contents}
                readOnly={Boolean(file.data?.truncated)}
                onChange={setContents}
              />
            )
          ) : (
            <div
              className={
                view === "grid"
                  ? "grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 overflow-auto p-4"
                  : "overflow-auto p-2"
              }
            >
              {entries.map((entry) => (
                <button
                  key={entry.fullPath}
                  type="button"
                  className={
                    view === "grid"
                      ? "flex h-24 min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg p-2 text-xs hover:bg-accent focus:bg-accent"
                      : "grid h-8 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus:bg-accent"
                  }
                  onClick={() => setSelectedEntry(entry)}
                  onDoubleClick={() => openEntry(entry)}
                >
                  <FinderEntryIcon
                    entry={entry}
                    {...(view === "grid" ? { className: "size-9 text-blue-400" } : {})}
                  />
                  <span
                    className={
                      view === "grid" ? "block w-full min-w-0 truncate text-center" : "truncate"
                    }
                    title={entry.name}
                  >
                    {entry.name}
                  </span>
                  {view === "list" && (entry.kind ?? "directory") === "directory" ? (
                    <ChevronRightIcon className="size-3 text-muted-foreground" />
                  ) : null}
                </button>
              ))}
              {!browse.isPending && entries.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  This folder is empty.
                </div>
              ) : null}
            </div>
          )}
          <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-[11px] text-muted-foreground">
            <span>{openFilePath ? openFilePath : `${entries.length} items`}</span>
            <span>
              {openFilePath
                ? file.data?.truncated
                  ? "Preview only · file exceeds 1 MB"
                  : `${contents.split("\n").length} lines · ${new TextEncoder().encode(contents).length} bytes`
                : browse.isPending
                  ? "Loading…"
                  : environmentId
                    ? "Connected"
                    : "No connected environment"}
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}
