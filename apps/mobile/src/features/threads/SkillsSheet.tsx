import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProviderInstanceId,
  ServerProvider,
  ServerProviderSkill,
} from "@t3tools/contracts";
import { normalizeSkillName } from "@t3tools/shared/skillName";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";

export function SkillsSheet(props: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly environmentId: EnvironmentId;
  readonly cwd: string | null;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | null;
  readonly onUseSkill: (skill: ServerProviderSkill) => void;
}) {
  const createSkill = useAtomCommand(projectEnvironment.createSkill, { reportFailure: false });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdSkills, setCreatedSkills] = useState<ServerProviderSkill[]>([]);
  const skills = useMemo(() => {
    const skillsByName = new Map(
      (props.provider?.skills ?? []).map((skill) => [skill.name, skill]),
    );
    for (const skill of createdSkills) skillsByName.set(skill.name, skill);
    return [...skillsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [createdSkills, props.provider?.skills]);
  const normalizedName = normalizeSkillName(name);
  const supportsCreation =
    props.provider?.driver === "codex" || props.provider?.driver === "claude";
  const duplicate = skills.some((skill) => skill.name === normalizedName);
  const canCreate =
    Boolean(props.cwd) &&
    supportsCreation &&
    normalizedName.length > 0 &&
    description.trim().length > 0 &&
    instructions.trim().length > 0 &&
    !duplicate &&
    !isCreating;

  const reset = () => {
    setName("");
    setDescription("");
    setInstructions("");
    setShowCreate(false);
  };

  const submit = async () => {
    if (!canCreate || !props.cwd || !props.provider) return;
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
      reset();
      Alert.alert("Skill created", `$${result.value.skill.name} is ready to use.`);
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      Alert.alert(
        "Could not create skill",
        error instanceof Error ? error.message : "The environment rejected this skill.",
      );
    }
  };

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="flex-1" accessibilityLabel="Close skills" onPress={props.onClose} />
        <View className="max-h-[85%] rounded-t-3xl bg-background px-5 pt-5 pb-8">
          <View className="mb-4 flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-xl font-t3-bold text-foreground">Skills</Text>
              <Text className="mt-1 text-sm text-foreground-muted">
                Available to the selected provider in this project.
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={props.onClose} className="px-2 py-1">
              <Text className="font-t3-medium text-primary">Done</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {skills.length > 0 ? (
              <View className="overflow-hidden rounded-2xl border border-border">
                {skills.map((skill, index) => (
                  <View
                    key={`${skill.path}:${skill.name}`}
                    className={`flex-row items-center gap-3 p-3 ${index > 0 ? "border-t border-border" : ""}`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="font-t3-medium text-foreground">
                        {skill.displayName ?? skill.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-foreground-muted">
                        {skill.shortDescription ?? skill.description ?? "No description provided."}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!skill.enabled}
                      onPress={() => props.onUseSkill(skill)}
                      className="rounded-full bg-primary px-3 py-1.5 disabled:opacity-40"
                    >
                      <Text className="font-t3-medium text-primary-foreground text-xs">Use</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="rounded-2xl border border-border p-5 text-center text-foreground-muted">
                No skills are installed yet.
              </Text>
            )}

            {showCreate ? (
              <View className="mt-4 gap-3 rounded-2xl border border-border p-4">
                <View>
                  <Text className="mb-1 text-xs font-t3-medium text-foreground">Skill name</Text>
                  <TextInput
                    value={name}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="review-pull-request"
                    placeholderTextColor="#71717a"
                    onChangeText={setName}
                    className="rounded-xl border border-border px-3 py-2.5 text-foreground"
                  />
                  {name && normalizedName !== name ? (
                    <Text className="mt-1 text-xs text-foreground-muted">
                      Saved as {normalizedName || "invalid-name"}
                    </Text>
                  ) : null}
                  {duplicate ? (
                    <Text className="mt-1 text-xs text-red-500">This skill already exists.</Text>
                  ) : null}
                </View>
                <View>
                  <Text className="mb-1 text-xs font-t3-medium text-foreground">Description</Text>
                  <TextInput
                    value={description}
                    placeholder="What it does and when to use it"
                    placeholderTextColor="#71717a"
                    onChangeText={setDescription}
                    className="rounded-xl border border-border px-3 py-2.5 text-foreground"
                  />
                </View>
                <View>
                  <Text className="mb-1 text-xs font-t3-medium text-foreground">Instructions</Text>
                  <TextInput
                    value={instructions}
                    multiline
                    textAlignVertical="top"
                    placeholder="Describe the workflow the agent should follow…"
                    placeholderTextColor="#71717a"
                    onChangeText={setInstructions}
                    className="min-h-28 rounded-xl border border-border px-3 py-2.5 text-foreground"
                  />
                </View>
                <View className="flex-row justify-end gap-2">
                  <Pressable onPress={reset} className="rounded-full px-4 py-2">
                    <Text className="font-t3-medium text-foreground">Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={!canCreate}
                    onPress={() => void submit()}
                    className="rounded-full bg-primary px-4 py-2 disabled:opacity-40"
                  >
                    <Text className="font-t3-medium text-primary-foreground">
                      {isCreating ? "Creating…" : "Create skill"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={!supportsCreation || !props.cwd}
                onPress={() => setShowCreate(true)}
                className="mt-4 rounded-full border border-border px-4 py-3 disabled:opacity-40"
              >
                <Text className="text-center font-t3-medium text-foreground">Add new skill</Text>
              </Pressable>
            )}
            {!supportsCreation ? (
              <Text className="mt-2 text-center text-xs text-foreground-muted">
                Creation is currently supported for Codex and Claude.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
