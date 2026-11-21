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
import { BoxIcon, PlusIcon } from "lucide-react";
import { T, useGT, Var } from "gt-react";
import { useState } from "react";

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
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { m } from "../../i18n/messages";

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
  const gt = useGT();
  const createSkill = useAtomCommand(projectEnvironment.createSkill, { reportFailure: false });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdSkills, setCreatedSkills] = useState<ServerProviderSkill[]>([]);
  const normalizedName = normalizeSkillName(name);
  const providerSupportsCreation = props.provider === "codex" || props.provider === "claude";
  const skillsByName = new Map(props.skills.map((skill) => [skill.name, skill]));
  for (const skill of createdSkills) skillsByName.set(skill.name, skill);
  const visibleSkills = [...skillsByName.values()].toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
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
        title: gt("Created ${skill}", { skill: result.value.skill.name }),
        description: gt("The project skill is ready to use."),
      });
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not create skill"),
        description: thrownErrorMessage(error, m) ?? gt("The backend rejected this skill."),
      });
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="w-[min(42rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>
            <T>Skills</T>
          </DialogTitle>
          <DialogDescription>
            <T>Skills available to the selected provider in this project.</T>
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-3">
            {visibleSkills.length > 0 ? (
              <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
                {visibleSkills.map((skill) => (
                  <div key={`${skill.path}:${skill.name}`} className="flex items-start gap-3 p-3">
                    <BoxIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {formatProviderSkillDisplayName(skill)}
                        </span>
                        {skill.scope ? (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-3xs uppercase tracking-wide text-muted-foreground">
                            {skill.scope}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        {skill.shortDescription ??
                          skill.description ??
                          gt("No description provided.")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!skill.enabled}
                      onClick={() => props.onUseSkill(skill)}
                    >
                      <T>Use</T>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
                <T>No skills are installed for this provider and project yet.</T>
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
                    <T>Skill name</T>
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
                  <label htmlFor="new-skill-description" className="mb-1 block font-medium text-xs">
                    <T>Description</T>
                  </label>
                  <Input
                    id="new-skill-description"
                    nativeInput
                    value={description}
                    placeholder={gt("What the skill does and when the agent should use it")}
                    onChange={(event) => setDescription(event.currentTarget.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-skill-instructions"
                    className="mb-1 block font-medium text-xs"
                  >
                    <T>Instructions</T>
                  </label>
                  <Textarea
                    id="new-skill-instructions"
                    value={instructions}
                    placeholder={gt("Describe the workflow the agent should follow…")}
                    onChange={(event) => setInstructions(event.currentTarget.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={resetCreateForm}>
                    <T>Cancel</T>
                  </Button>
                  <Button type="submit" disabled={!canCreate}>
                    {isCreating ? gt("Creating…") : gt("Create skill")}
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
                <T>Add new skill</T>
              </Button>
            )}
            {!providerSupportsCreation ? (
              <p className="text-center text-muted-foreground text-xs">
                <T>Creating skills is currently supported for Codex and Claude providers.</T>
              </p>
            ) : !props.cwd ? (
              <p className="text-center text-muted-foreground text-xs">
                <T>Select a project before creating a project skill.</T>
              </p>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            <T>Done</T>
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
