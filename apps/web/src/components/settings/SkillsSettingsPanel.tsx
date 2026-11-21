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
import { BoxIcon, FileTextIcon, PlusIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
import { msg, T, useGT, Var } from "gt-react";
import { useEffect, useState } from "react";

import { m } from "../../i18n/messages";
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
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

function skillDocumentKey(instanceId: ProviderInstanceId, path: string): string {
  return JSON.stringify([instanceId, path]);
}

function EnvironmentPicker(props: {
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
  readonly selectedEnvironmentId: EnvironmentId | null;
  readonly onSelect: (environmentId: EnvironmentId) => void;
}) {
  const gt = useGT();
  if (props.environments.length <= 1) return null;
  return (
    <SettingsSection title={gt("Devices")}>
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
                {environment.displayUrl ?? gt("Local device")}
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
  const gt = useGT();
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
        title: gt("Created ${name}", { name: result.value.skill.name }),
        description: gt("Added to {provider} global skills.", {
          provider: providerLabel(props.provider),
        }),
      });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not create skill"),
        description:
          error instanceof Error ? error.message : gt("The environment rejected the skill."),
      });
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-[min(38rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>
            <T>New global skill</T>
          </DialogTitle>
          <DialogDescription>
            <T>
              Add a user-owned skill to <Var>{providerLabel(props.provider)}</Var> on this device.
            </T>
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div>
            <label htmlFor="global-skill-name" className="mb-1 block font-medium text-xs">
              <T>Name</T>
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
                <T>
                  Saved as{" "}
                  <code>
                    <Var>{normalizedName || "invalid-name"}</Var>
                  </code>
                </T>
              </p>
            ) : null}
            {duplicate ? (
              <p className="mt-1 text-destructive text-xs">
                <T>A skill with this name exists.</T>
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="global-skill-description" className="mb-1 block font-medium text-xs">
              <T>Description</T>
            </label>
            <Input
              id="global-skill-description"
              nativeInput
              value={description}
              placeholder={gt("What it does and when to use it")}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </div>
          <div>
            <label htmlFor="global-skill-instructions" className="mb-1 block font-medium text-xs">
              <T>Instructions</T>
            </label>
            <div className="font-mono">
              <Textarea
                id="global-skill-instructions"
                value={instructions}
                placeholder={gt("Describe the workflow the agent should follow…")}
                className="min-h-48"
                onChange={(event) => setInstructions(event.currentTarget.value)}
              />
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            <T>Cancel</T>
          </Button>
          <Button type="button" disabled={!canCreate} onClick={() => void submit()}>
            {isCreating ? gt("Creating…") : gt("Create skill")}
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
  const gt = useGT();
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(props.environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const readSkill = useAtomCommand(projectEnvironment.readSkill, { reportFailure: false });
  const updateSkill = useAtomCommand(projectEnvironment.updateSkill, { reportFailure: false });
  const supportedProviders = providers.filter(supportsGlobalSkills);
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [createdSkills, setCreatedSkills] = useState<
    Readonly<Record<ProviderInstanceId, ReadonlyArray<ServerProviderSkill>>>
  >({});
  const [skillDocument, setSkillDocument] = useState<{
    readonly key: string;
    readonly content: string;
    readonly savedContent: string;
    readonly editable: boolean;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const selectedProvider =
    supportedProviders.find((provider) => provider.instanceId === selectedInstanceId) ??
    supportedProviders[0] ??
    null;
  const skills = (() => {
    if (!selectedProvider) return [];
    const byPath = new Map(selectedProvider.skills.map((skill) => [skill.path, skill]));
    for (const skill of createdSkills[selectedProvider.instanceId] ?? []) {
      byPath.set(skill.path, skill);
    }
    return [...byPath.values()].sort(
      (left, right) =>
        (left.scope ?? "").localeCompare(right.scope ?? "") || left.name.localeCompare(right.name),
    );
  })();
  const selectedSkill = skills.find((skill) => skill.path === selectedPath) ?? skills[0] ?? null;
  const selectedSkillKey =
    selectedProvider && selectedSkill
      ? skillDocumentKey(selectedProvider.instanceId, selectedSkill.path)
      : null;
  const loadedDocument = skillDocument?.key === selectedSkillKey ? skillDocument : null;
  const isReading = selectedSkillKey !== null && loadedDocument === null;
  const content = loadedDocument?.content ?? "";
  const savedContent = loadedDocument?.savedContent ?? "";
  const editable = loadedDocument?.editable ?? false;
  const setContent = (nextContent: string) =>
    setSkillDocument((current) =>
      current?.key === selectedSkillKey ? { ...current, content: nextContent } : current,
    );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the selected SKILL.md over RPC and drops responses for a skill that is no longer selected
  useEffect(() => {
    if (!selectedProvider || !selectedSkill) return;
    const key = skillDocumentKey(selectedProvider.instanceId, selectedSkill.path);
    let active = true;
    void readSkill({
      environmentId: props.environmentId,
      input: { instanceId: selectedProvider.instanceId, path: selectedSkill.path },
    }).then((result) => {
      if (!active) return;
      if (result._tag === "Success") {
        setSkillDocument({
          key,
          content: result.value.content,
          savedContent: result.value.content,
          editable: result.value.editable,
        });
        return;
      }
      setSkillDocument({ key, content: "", savedContent: "", editable: false });
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: m(msg("Could not open skill")),
          description:
            error instanceof Error ? error.message : m(msg("The skill could not be read.")),
        });
      }
    });
    return () => {
      active = false;
    };
  }, [props.environmentId, readSkill, selectedProvider, selectedSkill]);

  const refresh = async () => {
    setIsRefreshing(true);
    const result = await refreshProviders({ environmentId: props.environmentId, input: {} });
    setIsRefreshing(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not refresh skills"),
        description: error instanceof Error ? error.message : gt("The provider refresh failed."),
      });
    }
  };

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
      setSkillDocument((current) =>
        current?.key === selectedSkillKey ? { ...current, savedContent: content } : current,
      );
      toastManager.add({
        type: "success",
        title: gt("Saved ${name}", { name: selectedSkill.name }),
      });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not save skill"),
        description:
          error instanceof Error ? error.message : gt("The environment rejected the edit."),
      });
    }
  };

  if (supportedProviders.length === 0) {
    return (
      <SettingsSection title={gt("Skills")}>
        <SettingsRow
          title={gt("No supported providers")}
          description={gt("Connect Codex or Claude on {environment} to manage skills.", {
            environment: props.environmentLabel,
          })}
        />
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection
        id="skills"
        title={gt("Skills")}
        headerAction={
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              disabled={isRefreshing}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className="size-3.5" />
              {isRefreshing ? gt("Refreshing…") : gt("Refresh")}
            </Button>
            {selectedProvider ? (
              <Button size="xs" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon className="size-3.5" />
                <T>New global skill</T>
              </Button>
            ) : null}
          </div>
        }
      >
        <p className="px-3 text-xs leading-relaxed text-muted-foreground sm:px-4">
          <T>
            Browse skills available on <Var>{props.environmentLabel}</Var>. User-owned global skills
            can be edited here; managed and project skills are shown read-only.
          </T>
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
                      <BoxIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {formatProviderSkillDisplayName(skill)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {skill.description ?? gt("No description")}
                        </span>
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-4xs uppercase text-muted-foreground">
                        {skill.scope ?? "managed"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="p-6 text-center text-muted-foreground text-sm">
                <T>No skills found.</T>
              </p>
            )}
          </div>
          <div className="min-w-0 p-4">
            {selectedSkill ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm">${selectedSkill.name}</h3>
                    <Tooltip>
                      <TooltipTrigger
                        render={<p className="truncate text-muted-foreground text-xs" />}
                      >
                        {selectedSkill.path}
                      </TooltipTrigger>
                      <TooltipPopup side="bottom">{selectedSkill.path}</TooltipPopup>
                    </Tooltip>
                  </div>
                  <Button
                    size="sm"
                    disabled={!editable || isReading || isSaving || content === savedContent}
                    onClick={() => void save()}
                  >
                    <SaveIcon className="size-3.5" />
                    {isSaving ? gt("Saving…") : gt("Save")}
                  </Button>
                </div>
                {isReading ? (
                  <div className="flex min-h-96 items-center justify-center text-muted-foreground text-sm">
                    <T>Loading SKILL.md…</T>
                  </div>
                ) : (
                  <>
                    <div className="font-mono">
                      <Textarea
                        aria-label={gt("{name} SKILL.md", { name: selectedSkill.name })}
                        value={content}
                        readOnly={!editable}
                        spellCheck={false}
                        className="min-h-[28rem]"
                        onChange={(event) => setContent(event.currentTarget.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <FileTextIcon className="size-3.5" />
                      {editable
                        ? gt(
                            "Keep the frontmatter name unchanged. Description and instructions are editable.",
                          )
                        : gt(
                            "This skill is managed outside global user settings and is read-only here.",
                          )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-96 items-center justify-center text-muted-foreground text-sm">
                <T>Select a skill to view its SKILL.md file.</T>
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
  const gt = useGT();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const options = buildProviderEnvironmentOptions(environments, primaryEnvironmentId);
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
        <SettingsSection title={gt("Skills")}>
          <SettingsRow
            title={gt("No connected devices")}
            description={gt("Connect an environment before managing skills.")}
          />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
