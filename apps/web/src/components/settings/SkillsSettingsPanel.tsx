import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  PROVIDER_DISPLAY_NAMES,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import { normalizeSkillName } from "@t3tools/shared/skillName";
import { FileTextIcon, PlusIcon, RefreshCwIcon, SaveIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import {
  useEnvironments,
  usePrimaryEnvironmentId,
  type EnvironmentPresentation,
} from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatProviderSkillDisplayName } from "../../providerSkillPresentation";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  buildProviderEnvironmentOptions,
  resolveSelectedProviderEnvironmentId,
} from "./ProviderSettingsPanel.logic";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function providerLabel(provider: ServerProvider): string {
  return (
    provider.displayName ?? PROVIDER_DISPLAY_NAMES[provider.driver] ?? String(provider.instanceId)
  );
}

function supportsGlobalSkills(provider: ServerProvider): boolean {
  return (
    provider.driver === "codex" || provider.driver === "claudeAgent" || provider.driver === "claude"
  );
}

function EnvironmentPicker(props: {
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
  readonly selectedEnvironmentId: EnvironmentId | null;
  readonly onSelect: (environmentId: EnvironmentId) => void;
}) {
  if (props.environments.length <= 1) return null;
  return (
    <SettingsSection title="Devices">
      <div className="grid gap-1 sm:grid-cols-2">
        {props.environments.map((environment) => {
          const selected = environment.environmentId === props.selectedEnvironmentId;
          return (
            <button
              key={environment.environmentId}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-xl px-4 py-3 text-left transition-colors",
                selected
                  ? "bg-primary/8 ring-1 ring-primary/25 dark:bg-primary/12"
                  : "hover:bg-muted/40",
              )}
              onClick={() => props.onSelect(environment.environmentId)}
            >
              <span className="block truncate text-sm font-medium">{environment.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {environment.displayUrl ?? "Local device"}
              </span>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function CreateGlobalSkillDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly provider: ServerProvider;
  readonly existingSkills: ReadonlyArray<ServerProviderSkill>;
  readonly onCreated: (skill: ServerProviderSkill) => void;
}) {
  const createGlobalSkill = useAtomCommand(projectEnvironment.createGlobalSkill, {
    reportFailure: false,
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const normalizedName = normalizeSkillName(name);
  const duplicate = props.existingSkills.some((skill) => skill.name === normalizedName);
  const canCreate =
    normalizedName.length > 0 &&
    description.trim().length > 0 &&
    instructions.trim().length > 0 &&
    !duplicate &&
    !isCreating;

  const submit = async () => {
    if (!canCreate) return;
    setIsCreating(true);
    const result = await createGlobalSkill({
      environmentId: props.environmentId,
      input: {
        instanceId: props.provider.instanceId,
        name: normalizedName,
        description: description.trim(),
        instructions: instructions.trim(),
      },
    });
    setIsCreating(false);
    if (result._tag === "Success") {
      props.onCreated(result.value.skill);
      setName("");
      setDescription("");
      setInstructions("");
      props.onOpenChange(false);
      toastManager.add({
        type: "success",
        title: `Created $${result.value.skill.name}`,
        description: `Added to ${providerLabel(props.provider)} global skills.`,
      });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not create skill",
        description: error instanceof Error ? error.message : "The environment rejected the skill.",
      });
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-[min(38rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>New global skill</DialogTitle>
          <DialogDescription>
            Add a user-owned skill to {providerLabel(props.provider)} on this device.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div>
            <label htmlFor="global-skill-name" className="mb-1 block font-medium text-xs">
              Name
            </label>
            <Input
              id="global-skill-name"
              nativeInput
              autoFocus
              value={name}
              placeholder="review-pull-request"
              onChange={(event) => setName(event.currentTarget.value)}
            />
            {name && name !== normalizedName ? (
              <p className="mt-1 text-muted-foreground text-xs">
                Saved as <code>{normalizedName || "invalid-name"}</code>
              </p>
            ) : null}
            {duplicate ? (
              <p className="mt-1 text-destructive text-xs">A skill with this name exists.</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="global-skill-description" className="mb-1 block font-medium text-xs">
              Description
            </label>
            <Input
              id="global-skill-description"
              nativeInput
              value={description}
              placeholder="What it does and when to use it"
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </div>
          <div>
            <label htmlFor="global-skill-instructions" className="mb-1 block font-medium text-xs">
              Instructions
            </label>
            <Textarea
              id="global-skill-instructions"
              value={instructions}
              placeholder="Describe the workflow the agent should follow…"
              className="min-h-48 font-mono text-xs"
              onChange={(event) => setInstructions(event.currentTarget.value)}
            />
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canCreate} onClick={() => void submit()}>
            {isCreating ? "Creating…" : "Create skill"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function EnvironmentSkills(props: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
}) {
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(props.environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const readSkill = useAtomCommand(projectEnvironment.readSkill, { reportFailure: false });
  const updateSkill = useAtomCommand(projectEnvironment.updateSkill, { reportFailure: false });
  const supportedProviders = useMemo(() => providers.filter(supportsGlobalSkills), [providers]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [createdSkills, setCreatedSkills] = useState<
    Readonly<Record<ProviderInstanceId, ReadonlyArray<ServerProviderSkill>>>
  >({});
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [editable, setEditable] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const selectedProvider =
    supportedProviders.find((provider) => provider.instanceId === selectedInstanceId) ??
    supportedProviders[0] ??
    null;
  const skills = useMemo(() => {
    if (!selectedProvider) return [];
    const byPath = new Map(selectedProvider.skills.map((skill) => [skill.path, skill]));
    for (const skill of createdSkills[selectedProvider.instanceId] ?? []) {
      byPath.set(skill.path, skill);
    }
    return [...byPath.values()].sort(
      (left, right) =>
        (left.scope ?? "").localeCompare(right.scope ?? "") || left.name.localeCompare(right.name),
    );
  }, [createdSkills, selectedProvider]);
  const selectedSkill = skills.find((skill) => skill.path === selectedPath) ?? skills[0] ?? null;

  useEffect(() => {
    if (selectedProvider && selectedProvider.instanceId !== selectedInstanceId) {
      setSelectedInstanceId(selectedProvider.instanceId);
    }
  }, [selectedInstanceId, selectedProvider]);

  useEffect(() => {
    setSelectedPath((current) =>
      current && skills.some((skill) => skill.path === current)
        ? current
        : (skills[0]?.path ?? null),
    );
  }, [skills]);

  useEffect(() => {
    if (!selectedProvider || !selectedSkill) {
      setContent("");
      setSavedContent("");
      setEditable(false);
      return;
    }
    let active = true;
    setIsReading(true);
    void readSkill({
      environmentId: props.environmentId,
      input: { instanceId: selectedProvider.instanceId, path: selectedSkill.path },
    }).then((result) => {
      if (!active) return;
      setIsReading(false);
      if (result._tag === "Success") {
        setContent(result.value.content);
        setSavedContent(result.value.content);
        setEditable(result.value.editable);
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Could not open skill",
          description: error instanceof Error ? error.message : "The skill could not be read.",
        });
      }
    });
    return () => {
      active = false;
    };
  }, [props.environmentId, readSkill, selectedProvider, selectedSkill]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const result = await refreshProviders({ environmentId: props.environmentId, input: {} });
    setIsRefreshing(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not refresh skills",
        description: error instanceof Error ? error.message : "The provider refresh failed.",
      });
    }
  }, [props.environmentId, refreshProviders]);

  const save = async () => {
    if (!selectedProvider || !selectedSkill || !editable || content === savedContent) return;
    setIsSaving(true);
    const result = await updateSkill({
      environmentId: props.environmentId,
      input: {
        instanceId: selectedProvider.instanceId,
        path: selectedSkill.path,
        content,
      },
    });
    setIsSaving(false);
    if (result._tag === "Success") {
      setSavedContent(content);
      toastManager.add({ type: "success", title: `Saved $${selectedSkill.name}` });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not save skill",
        description: error instanceof Error ? error.message : "The environment rejected the edit.",
      });
    }
  };

  if (supportedProviders.length === 0) {
    return (
      <SettingsSection title="Skills">
        <SettingsRow
          title="No supported providers"
          description={`Connect Codex or Claude on ${props.environmentLabel} to manage skills.`}
        />
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection
        id="skills"
        title="Skills"
        headerAction={
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              disabled={isRefreshing}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className="size-3.5" />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {selectedProvider ? (
              <Button size="xs" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon className="size-3.5" />
                New global skill
              </Button>
            ) : null}
          </div>
        }
      >
        <p className="px-3 text-[13px] leading-relaxed text-muted-foreground sm:px-4">
          Browse skills available on {props.environmentLabel}. User-owned global skills can be
          edited here; managed and project skills are shown read-only.
        </p>
        <div className="flex flex-wrap gap-1 px-3 py-2 sm:px-4">
          {supportedProviders.map((provider) => (
            <Button
              key={provider.instanceId}
              size="sm"
              variant={provider.instanceId === selectedProvider?.instanceId ? "secondary" : "ghost"}
              onClick={() => {
                setSelectedInstanceId(provider.instanceId);
                setSelectedPath(null);
              }}
            >
              {providerLabel(provider)}
              <span className="text-muted-foreground">{provider.skills.length}</span>
            </Button>
          ))}
        </div>
        <div className="grid min-h-[34rem] overflow-hidden rounded-xl border border-border/70 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="border-b border-border/70 lg:border-r lg:border-b-0">
            {skills.length > 0 ? (
              <div className="max-h-[34rem] overflow-y-auto p-1.5">
                {skills.map((skill) => {
                  const selected = skill.path === selectedSkill?.path;
                  return (
                    <button
                      key={skill.path}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left",
                        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
                      )}
                      onClick={() => setSelectedPath(skill.path)}
                    >
                      <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {formatProviderSkillDisplayName(skill)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {skill.description ?? "No description"}
                        </span>
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                        {skill.scope ?? "managed"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="p-6 text-center text-muted-foreground text-sm">No skills found.</p>
            )}
          </div>
          <div className="min-w-0 p-4">
            {selectedSkill ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm">${selectedSkill.name}</h3>
                    <p
                      className="truncate text-muted-foreground text-xs"
                      title={selectedSkill.path}
                    >
                      {selectedSkill.path}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!editable || isReading || isSaving || content === savedContent}
                    onClick={() => void save()}
                  >
                    <SaveIcon className="size-3.5" />
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
                {isReading ? (
                  <div className="flex min-h-96 items-center justify-center text-muted-foreground text-sm">
                    Loading SKILL.md…
                  </div>
                ) : (
                  <>
                    <Textarea
                      aria-label={`${selectedSkill.name} SKILL.md`}
                      value={content}
                      readOnly={!editable}
                      spellCheck={false}
                      className="min-h-[28rem] font-mono text-xs leading-relaxed"
                      onChange={(event) => setContent(event.currentTarget.value)}
                    />
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <FileTextIcon className="size-3.5" />
                      {editable
                        ? "Keep the frontmatter name unchanged. Description and instructions are editable."
                        : "This skill is managed outside global user settings and is read-only here."}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-96 items-center justify-center text-muted-foreground text-sm">
                Select a skill to view its SKILL.md file.
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      {selectedProvider ? (
        <CreateGlobalSkillDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          environmentId={props.environmentId}
          provider={selectedProvider}
          existingSkills={skills}
          onCreated={(skill) => {
            setCreatedSkills((current) => ({
              ...current,
              [selectedProvider.instanceId]: [
                ...(current[selectedProvider.instanceId] ?? []),
                skill,
              ],
            }));
            setSelectedPath(skill.path);
          }}
        />
      ) : null}
    </>
  );
}

export function SkillsSettingsPanel() {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const options = useMemo(
    () => buildProviderEnvironmentOptions(environments, primaryEnvironmentId),
    [environments, primaryEnvironmentId],
  );
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(
    primaryEnvironmentId,
  );
  const effectiveEnvironmentId = resolveSelectedProviderEnvironmentId(
    options,
    selectedEnvironmentId,
    primaryEnvironmentId,
  );
  const selectedEnvironment =
    options.find((environment) => environment.environmentId === effectiveEnvironmentId) ?? null;

  return (
    <SettingsPageContainer className="max-w-6xl">
      <EnvironmentPicker
        environments={options}
        selectedEnvironmentId={effectiveEnvironmentId}
        onSelect={setSelectedEnvironmentId}
      />
      {selectedEnvironment ? (
        <EnvironmentSkills
          key={selectedEnvironment.environmentId}
          environmentId={selectedEnvironment.environmentId}
          environmentLabel={selectedEnvironment.label}
        />
      ) : (
        <SettingsSection title="Skills">
          <SettingsRow
            title="No connected devices"
            description="Connect an environment before managing skills."
          />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
