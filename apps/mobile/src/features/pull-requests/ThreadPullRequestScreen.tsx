import type { StaticScreenProps } from "@react-navigation/native";
import { ActivityIndicator, View } from "react-native";
import { useEnvironmentServerConfig } from "../../state/entities";
import { EnvironmentId } from "@t3tools/contracts";
import { useThreadSelection } from "../../state/use-thread-selection";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { PullRequestScreen } from "./PullRequestScreen";
import { PrButton, PrNotice } from "./PullRequestControls";

export function ThreadPullRequestScreen({
  route,
}: StaticScreenProps<{ readonly environmentId: string; readonly threadId: string }>) {
  const config = useEnvironmentServerConfig(EnvironmentId.make(route.params.environmentId));
  const { selectedThread, selectedThreadProject } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const status = useEnvironmentQuery(
    selectedThread && selectedThreadCwd && !selectedThread.linkedPullRequest
      ? vcsEnvironment.status({
          environmentId: selectedThread.environmentId,
          input: { cwd: selectedThreadCwd },
        })
      : null,
  );
  const linked = selectedThread?.linkedPullRequest;
  const detected = selectedThread?.branch === status.data?.refName ? status.data?.pr : null;
  const repository = linked?.repository ?? selectedThreadProject?.repositoryIdentity?.displayName;
  const number = linked?.number ?? detected?.number;
  const projectId = linked?.projectId ?? selectedThreadProject?.id;
  if (
    config?.environment.capabilities.pullRequests &&
    selectedThread &&
    repository &&
    number &&
    projectId
  ) {
    return (
      <PullRequestScreen
        route={{
          ...route,
          params: {
            environmentId: selectedThread.environmentId,
            projectId,
            repository,
            number: String(number),
          },
        }}
      />
    );
  }
  const url = linked?.url ?? detected?.url;
  return (
    <View className="flex-1 gap-3 bg-screen p-4">
      {status.isPending ? (
        <ActivityIndicator />
      ) : (
        <PrNotice>
          {(config && !config.environment.capabilities.pullRequests
            ? "Update this environment’s server to review pull requests in the app."
            : status.error) ??
            "No pull request is available for this thread. Browse the PR tab to review another pull request."}
        </PrNotice>
      )}
      <PrButton label="Refresh" onPress={status.refresh} />
      {url ? (
        <PrButton
          label="Open on host"
          onPress={() => void tryOpenExternalUrl(url, "pull-request")}
        />
      ) : null}
    </View>
  );
}
