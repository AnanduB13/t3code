import { useNavigation } from "@react-navigation/native";
import type {
  EnvironmentId,
  PullRequestListCursors,
  PullRequestListState,
} from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text, AppTextInput } from "../../components/AppText";
import { useEnvironments } from "../../state/environments";
import { useRemoteEnvironmentRuntime } from "../../state/use-remote-environment-registry";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { pullRequestEnvironment } from "../../state/pull-requests";
import { PrButton, PrNotice } from "./PullRequestControls";

export function PullRequestsScreen() {
  const { environments } = useEnvironments();
  const [selection, setSelection] = useState<EnvironmentId | null>(null);
  const environmentId =
    environments.find((entry) => entry.environmentId === selection)?.environmentId ??
    environments[0]?.environmentId;
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-screen"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 80 }}
    >
      <Text className="px-4 py-3 text-2xl font-t3-bold">Pull requests</Text>
      <View>
        <ScrollView
          horizontal
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}
        >
          {environments.map((environment) => (
            <PrButton
              key={environment.environmentId}
              label={environment.label}
              selected={environmentId === environment.environmentId}
              onPress={() => setSelection(environment.environmentId)}
            />
          ))}
        </ScrollView>
      </View>
      {environmentId ? (
        <EnvironmentPullRequests key={environmentId} environmentId={environmentId} />
      ) : (
        <View className="p-4">
          <PrNotice>Connect an environment to browse its pull requests.</PrNotice>
        </View>
      )}
    </View>
  );
}

function EnvironmentPullRequests({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const runtime = useRemoteEnvironmentRuntime(environmentId);
  const [state, setState] = useState<PullRequestListState>("open");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const supported = runtime?.serverConfig?.environment.capabilities.pullRequests === true;
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row flex-wrap gap-2 px-4">
        {(["open", "closed", "merged", "all"] as const).map((value) => (
          <PrButton
            key={value}
            label={value[0].toUpperCase() + value.slice(1)}
            selected={state === value}
            onPress={() => setState(value)}
          />
        ))}
      </View>
      <View className="flex-row items-center gap-2 px-4">
        <AppTextInput
          className="flex-1"
          accessibilityLabel="Search pull requests"
          placeholder="Search pull requests"
          value={query}
          maxLength={200}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => setSearch(query.trim())}
        />
        <PrButton label="Search" onPress={() => setSearch(query.trim())} />
      </View>
      {supported ? (
        <PullRequestList
          key={JSON.stringify([state, search])}
          environmentId={environmentId}
          state={state}
          search={search}
        />
      ) : (
        <View className="px-4">
          <PrNotice>
            {runtime?.serverConfig
              ? "Update this environment’s T3 Code server to browse pull requests."
              : "Waiting for the environment to connect…"}
          </PrNotice>
        </View>
      )}
    </View>
  );
}

function PullRequestList({
  environmentId,
  state,
  search,
}: {
  readonly environmentId: EnvironmentId;
  readonly state: PullRequestListState;
  readonly search: string;
}) {
  const navigation = useNavigation();
  const [pages, setPages] = useState<readonly PullRequestListCursors[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const invalidate = useAtomCommand(pullRequestEnvironment.invalidate);
  const result = useEnvironmentQuery(
    pullRequestEnvironment.list({
      environmentId,
      input: {
        state,
        limit: 50,
        ...(search ? { query: search } : {}),
        ...(pages.length ? { cursors: pages[pages.length - 1] } : {}),
      },
    }),
  );
  const entries = useMemo(() => {
    const data = result.data;
    if (!data) return [];
    const needle = search.toLowerCase();
    return data.entries.filter((entry) => {
      if (
        !needle ||
        data.providers.find((provider) => provider.host === entry.host)?.searchesOnHost
      )
        return true;
      return `${entry.title} ${entry.repository} ${entry.number} ${entry.author?.login ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [result.data, search]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const outcome = await invalidate({ environmentId, input: {} });
      if (outcome._tag === "Success") result.refresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => JSON.stringify([item.host, item.repository, item.number])}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 24 }}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      ListHeaderComponent={
        <View className="gap-2">
          {result.error ? <PrNotice>{result.error}</PrNotice> : null}
          {result.isPending ? <ActivityIndicator /> : null}
          {result.data?.errors.map((error) => (
            <PrNotice key={error.projectId}>{`${error.projectTitle}: ${error.message}`}</PrNotice>
          ))}
        </View>
      }
      ListEmptyComponent={
        !result.isPending && !result.error ? <PrNotice>No pull requests found.</PrNotice> : null
      }
      renderItem={({ item }) => (
        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-xs text-foreground-muted">
            {item.repository} · #{item.number} · {item.isDraft ? "Draft" : item.state}
          </Text>
          <Text className="text-base font-t3-bold">{item.title}</Text>
          <Text className="text-xs text-foreground-muted">
            {item.author?.login ?? "Unknown author"} · {item.headBranch} → {item.baseBranch}
          </Text>
          <PrButton
            label="Review pull request"
            onPress={() =>
              navigation.navigate("PullRequest", {
                environmentId,
                projectId: item.projectId,
                repository: item.repository,
                number: String(item.number),
              })
            }
          />
        </View>
      )}
      ListFooterComponent={
        <View className="gap-3">
          {result.data?.truncated ? (
            <PrNotice>
              More pull requests are available. Use the next page or narrow your search.
            </PrNotice>
          ) : null}
          <View className="flex-row gap-2">
            {pages.length > 0 ? (
              <PrButton
                label="Previous page"
                onPress={() => setPages((current) => current.slice(0, -1))}
              />
            ) : null}
            {result.data && Object.keys(result.data.nextCursors).length > 0 ? (
              <PrButton
                label="Next page"
                disabled={result.isPending}
                onPress={() => {
                  const nextCursors = result.data?.nextCursors;
                  if (nextCursors) setPages((current) => [...current, nextCursors]);
                }}
              />
            ) : null}
          </View>
        </View>
      }
    />
  );
}
