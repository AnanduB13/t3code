import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProviderSkill,
} from "@t3tools/contracts";
import { normalizeSkillName } from "@t3tools/shared/skillName";
import { PlusIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { formatProviderSkillDisplayName } from "../../providerSkillPresentation";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
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

export function SkillsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: EnvironmentId;
  cwd: string | null;
  instanceId: ProviderInstanceId;
  provider: ProviderDriverKind;
  skills: ReadonlyArray<ServerProviderSkill>;
  onUseSkill: (skill: ServerProviderSkill) => void;
}) {
  const createSkill = useAtomCommand(projectEnvironment.createSkill, { reportFailure: false });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdSkills, setCreatedSkills] = useState<ServerProviderSkill[]>([]);
  const normalizedName = normalizeSkillName(name);
  const providerSupportsCreation = props.provider === "codex" || props.provider === "claude";
  const visibleSkills = useMemo(() => {
    const skillsByName = new Map(props.skills.map((skill) => [skill.name, skill]));
    for (const skill of createdSkills) skillsByName.set(skill.name, skill);
    return [...skillsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [createdSkills, props.skills]);
  const duplicate = visibleSkills.some((skill) => skill.name === normalizedName);
  const canCreate =
    Boolean(props.cwd) &&
    providerSupportsCreation &&
    normalizedName.length > 0 &&
    description.trim().length > 0 &&
    instructions.trim().length > 0 &&
    !duplicate &&
    !isCreating;

  const resetCreateForm = () => {
    setName("");
    setDescription("");
    setInstructions("");
    setShowCreate(false);
  };

  const submit = async () => {
    if (!canCreate || !props.cwd) return;
    setIsCreating(true);
    const result = await createSkill({
      environmentId: props.environmentId,
      input: {
        cwd: props.cwd,
        instanceId: props.instanceId,
        name: normalizedName,
        description: description.trim(),
        instructions: instructions.trim(),
      },
    });
    setIsCreating(false);
    if (result._tag === "Success") {
      setCreatedSkills((current) => [...current, result.value.skill]);
      resetCreateForm();
      toastManager.add({
        type: "success",
        title: `Created $${result.value.skill.name}`,
        description: "The project skill is ready to use.",
      });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not create skill",
        description: error instanceof Error ? error.message : "The backend rejected this skill.",
      });
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-[min(42rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Skills</DialogTitle>
          <DialogDescription>
            Skills available to the selected provider in this project.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3">
          {visibleSkills.length > 0 ? (
            <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
              {visibleSkills.map((skill) => (
                <div key={`${skill.path}:${skill.name}`} className="flex items-start gap-3 p-3">
                  <SparklesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {formatProviderSkillDisplayName(skill)}
                      </span>
                      {skill.scope ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {skill.scope}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {skill.shortDescription ?? skill.description ?? "No description provided."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!skill.enabled}
                    onClick={() => props.onUseSkill(skill)}
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
              No skills are installed for this provider and project yet.
            </div>
          )}

          {showCreate ? (
            <form
              className="space-y-3 rounded-xl border border-border/70 bg-muted/24 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void submit();
              }}
            >
              <div>
                <label htmlFor="new-skill-name" className="mb-1 block font-medium text-xs">
                  Skill name
                </label>
                <Input
                  id="new-skill-name"
                  nativeInput
                  autoFocus
                  value={name}
                  placeholder="review-pull-request"
                  onChange={(event) => setName(event.currentTarget.value)}
                />
                {name && normalizedName !== name ? (
                  <p className="mt-1 text-muted-foreground text-xs">
                    Saved as <code>{normalizedName || "invalid-name"}</code>
                  </p>
                ) : null}
                {duplicate ? (
                  <p className="mt-1 text-destructive text-xs">A skill with this name exists.</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="new-skill-description" className="mb-1 block font-medium text-xs">
                  Description
                </label>
                <Input
                  id="new-skill-description"
                  nativeInput
                  value={description}
                  placeholder="What the skill does and when the agent should use it"
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </div>
              <div>
                <label htmlFor="new-skill-instructions" className="mb-1 block font-medium text-xs">
                  Instructions
                </label>
                <Textarea
                  id="new-skill-instructions"
                  value={instructions}
                  placeholder="Describe the workflow the agent should follow…"
                  onChange={(event) => setInstructions(event.currentTarget.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetCreateForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canCreate}>
                  {isCreating ? "Creating…" : "Create skill"}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              disabled={!providerSupportsCreation || !props.cwd}
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon />
              Add new skill
            </Button>
          )}
          {!providerSupportsCreation ? (
            <p className="text-center text-muted-foreground text-xs">
              Creating skills is currently supported for Codex and Claude providers.
            </p>
          ) : !props.cwd ? (
            <p className="text-center text-muted-foreground text-xs">
              Select a project before creating a project skill.
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
