import { useNavigation } from "@react-navigation/native";
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
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useEnvironmentServerConfig } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";

function supportsGlobalSkills(provider: ServerProvider): boolean {
  return (
    provider.driver === "codex" || provider.driver === "claudeAgent" || provider.driver === "claude"
  );
}

function providerLabel(provider: ServerProvider): string {
  return (
    provider.displayName ?? PROVIDER_DISPLAY_NAMES[provider.driver] ?? String(provider.instanceId)
  );
}

function Pill(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      className={
        props.selected
          ? "rounded-full bg-primary px-3 py-2"
          : "rounded-full border border-border px-3 py-2"
      }
    >
      <Text
        className={props.selected ? "font-t3-medium text-primary-foreground" : "text-foreground"}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function SettingsSkillsRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { environments } = useEnvironments();
  const [environmentId, setEnvironmentId] = useState<EnvironmentId | null>(null);
  const config = useEnvironmentServerConfig(environmentId);
  const providers = useMemo(
    () => (config?.providers ?? []).filter(supportsGlobalSkills),
    [config?.providers],
  );
  const [instanceId, setInstanceId] = useState<ProviderInstanceId | null>(null);
  const selectedProvider =
    providers.find((provider) => provider.instanceId === instanceId) ?? providers[0] ?? null;
  const [createdSkills, setCreatedSkills] = useState<
    Readonly<Record<ProviderInstanceId, ReadonlyArray<ServerProviderSkill>>>
  >({});
  const skills = useMemo(() => {
    if (!selectedProvider) return [];
    const byPath = new Map(selectedProvider.skills.map((skill) => [skill.path, skill]));
    for (const skill of createdSkills[selectedProvider.instanceId] ?? []) {
      byPath.set(skill.path, skill);
    }
    return [...byPath.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [createdSkills, selectedProvider]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedSkill = skills.find((skill) => skill.path === selectedPath) ?? skills[0] ?? null;
  const readSkill = useAtomCommand(projectEnvironment.readSkill, { reportFailure: false });
  const updateSkill = useAtomCommand(projectEnvironment.updateSkill, { reportFailure: false });
  const createGlobalSkill = useAtomCommand(projectEnvironment.createGlobalSkill, {
    reportFailure: false,
  });
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [editable, setEditable] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const normalizedName = normalizeSkillName(name);
  const duplicate = skills.some((skill) => skill.name === normalizedName);

  useEffect(() => {
    if (environmentId === null && environments[0]) setEnvironmentId(environments[0].environmentId);
  }, [environmentId, environments]);
  useEffect(() => {
    if (selectedProvider && selectedProvider.instanceId !== instanceId) {
      setInstanceId(selectedProvider.instanceId);
    }
  }, [instanceId, selectedProvider]);
  useEffect(() => {
    setSelectedPath((current) =>
      current && skills.some((skill) => skill.path === current)
        ? current
        : (skills[0]?.path ?? null),
    );
  }, [skills]);

  useEffect(() => {
    if (!environmentId || !selectedProvider || !selectedSkill) {
      setContent("");
      setSavedContent("");
      setEditable(false);
      return;
    }
    let active = true;
    setIsReading(true);
    void readSkill({
      environmentId,
      input: { instanceId: selectedProvider.instanceId, path: selectedSkill.path },
    }).then((result) => {
      if (!active) return;
      setIsReading(false);
      if (result._tag === "Success") {
        setContent(result.value.content);
        setSavedContent(result.value.content);
        setEditable(result.value.editable);
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        Alert.alert(
          "Could not open skill",
          error instanceof Error ? error.message : "The skill could not be read.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [environmentId, readSkill, selectedProvider, selectedSkill]);

  const save = async () => {
    if (!environmentId || !selectedProvider || !selectedSkill || !editable) return;
    setIsSaving(true);
    const result = await updateSkill({
      environmentId,
      input: { instanceId: selectedProvider.instanceId, path: selectedSkill.path, content },
    });
    setIsSaving(false);
    if (result._tag === "Success") {
      setSavedContent(content);
      Alert.alert("Skill saved", `$${selectedSkill.name} was updated.`);
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      Alert.alert(
        "Could not save skill",
        error instanceof Error ? error.message : "The environment rejected the edit.",
      );
    }
  };

  const create = async () => {
    if (
      !environmentId ||
      !selectedProvider ||
      !normalizedName ||
      !description.trim() ||
      !instructions.trim() ||
      duplicate
    ) {
      return;
    }
    setIsCreating(true);
    const result = await createGlobalSkill({
      environmentId,
      input: {
        instanceId: selectedProvider.instanceId,
        name: normalizedName,
        description: description.trim(),
        instructions: instructions.trim(),
      },
    });
    setIsCreating(false);
    if (result._tag === "Success") {
      setCreatedSkills((current) => ({
        ...current,
        [selectedProvider.instanceId]: [
          ...(current[selectedProvider.instanceId] ?? []),
          result.value.skill,
        ],
      }));
      setSelectedPath(result.value.skill.path);
      setName("");
      setDescription("");
      setInstructions("");
      setShowCreate(false);
      Alert.alert("Skill created", `$${result.value.skill.name} is ready to use.`);
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      Alert.alert(
        "Could not create skill",
        error instanceof Error ? error.message : "The environment rejected the skill.",
      );
    }
  };

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title="Skills" onBack={() => navigation.goBack()} />
        </>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {environments.length > 1 ? (
          <SettingsSection title="Device">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 p-3"
            >
              {environments.map((environment) => (
                <Pill
                  key={environment.environmentId}
                  label={environment.label}
                  selected={environment.environmentId === environmentId}
                  onPress={() => {
                    setEnvironmentId(environment.environmentId);
                    setInstanceId(null);
                    setSelectedPath(null);
                  }}
                />
              ))}
            </ScrollView>
          </SettingsSection>
        ) : null}

        <SettingsSection title="Providers">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 p-3"
          >
            {providers.map((provider) => (
              <Pill
                key={provider.instanceId}
                label={`${providerLabel(provider)} · ${provider.skills.length}`}
                selected={provider.instanceId === selectedProvider?.instanceId}
                onPress={() => {
                  setInstanceId(provider.instanceId);
                  setSelectedPath(null);
                }}
              />
            ))}
            {providers.length === 0 ? (
              <Text className="p-2 text-foreground-muted">Connect Codex or Claude first.</Text>
            ) : null}
          </ScrollView>
        </SettingsSection>

        {selectedProvider ? (
          <SettingsSection title="Skills">
            <View className="p-2">
              {skills.map((skill, index) => (
                <Pressable
                  key={skill.path}
                  accessibilityRole="button"
                  onPress={() => setSelectedPath(skill.path)}
                  className={`gap-1 rounded-xl p-3 ${
                    skill.path === selectedSkill?.path ? "bg-primary/10" : ""
                  } ${index > 0 ? "border-t border-border-subtle" : ""}`}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="min-w-0 flex-1 font-t3-medium text-foreground">
                      ${skill.displayName ?? skill.name}
                    </Text>
                    <Text className="text-xs uppercase text-foreground-muted">
                      {skill.scope ?? "managed"}
                    </Text>
                  </View>
                  <Text className="text-sm text-foreground-muted">
                    {skill.description ?? "No description"}
                  </Text>
                </Pressable>
              ))}
              {skills.length === 0 ? (
                <Text className="p-4 text-center text-foreground-muted">No skills found.</Text>
              ) : null}
            </View>
          </SettingsSection>
        ) : null}

        {selectedSkill ? (
          <SettingsSection title={`$${selectedSkill.name}`}>
            <View className="gap-3 p-4">
              <Text className="text-xs text-foreground-muted" numberOfLines={2}>
                {selectedSkill.path}
              </Text>
              <TextInput
                value={content}
                editable={editable && !isReading}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                onChangeText={setContent}
                className="min-h-80 rounded-xl border border-border p-3 font-mono text-sm text-foreground"
              />
              <Text className="text-xs text-foreground-muted">
                {editable
                  ? "Keep the frontmatter name unchanged."
                  : "Managed and project skills are read-only in global Settings."}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={!editable || isSaving || isReading || content === savedContent}
                onPress={() => void save()}
                className="items-center rounded-xl bg-primary p-3 disabled:opacity-40"
              >
                <Text className="font-t3-medium text-primary-foreground">
                  {isSaving ? "Saving…" : "Save skill"}
                </Text>
              </Pressable>
            </View>
          </SettingsSection>
        ) : null}

        {selectedProvider ? (
          <SettingsSection title="Add global skill">
            <View className="gap-3 p-4">
              {showCreate ? (
                <>
                  <TextInput
                    value={name}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="review-pull-request"
                    placeholderTextColor="#71717a"
                    onChangeText={setName}
                    className="rounded-xl border border-border px-3 py-2.5 text-foreground"
                  />
                  {name && name !== normalizedName ? (
                    <Text className="text-xs text-foreground-muted">
                      Saved as {normalizedName || "invalid-name"}
                    </Text>
                  ) : null}
                  {duplicate ? (
                    <Text className="text-xs text-red-500">This skill already exists.</Text>
                  ) : null}
                  <TextInput
                    value={description}
                    placeholder="What it does and when to use it"
                    placeholderTextColor="#71717a"
                    onChangeText={setDescription}
                    className="rounded-xl border border-border px-3 py-2.5 text-foreground"
                  />
                  <TextInput
                    value={instructions}
                    multiline
                    textAlignVertical="top"
                    placeholder="Instructions for the agent…"
                    placeholderTextColor="#71717a"
                    onChangeText={setInstructions}
                    className="min-h-32 rounded-xl border border-border p-3 text-foreground"
                  />
                  <View className="flex-row justify-end gap-2">
                    <Pressable
                      onPress={() => setShowCreate(false)}
                      className="rounded-xl px-4 py-3"
                    >
                      <Text className="font-t3-medium text-foreground">Cancel</Text>
                    </Pressable>
                    <Pressable
                      disabled={
                        isCreating ||
                        !normalizedName ||
                        !description.trim() ||
                        !instructions.trim() ||
                        duplicate
                      }
                      onPress={() => void create()}
                      className="rounded-xl bg-primary px-4 py-3 disabled:opacity-40"
                    >
                      <Text className="font-t3-medium text-primary-foreground">
                        {isCreating ? "Creating…" : "Create"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowCreate(true)}
                  className="items-center rounded-xl border border-border p-3"
                >
                  <Text className="font-t3-medium text-foreground">New global skill</Text>
                </Pressable>
              )}
            </View>
          </SettingsSection>
        ) : null}
      </ScrollView>
    </View>
  );
}
