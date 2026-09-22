import type {
  EnvironmentId,
  PullRequestRef,
  PullRequestReviewCommentDraft,
} from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useEnvironmentQuery } from "../../state/query";
import { pullRequestEnvironment } from "../../state/pull-requests";
import { parseReviewPatch } from "./pullRequestModel";
import { PrButton, PrNotice } from "./PullRequestControls";

export function PullRequestFiles({
  environmentId,
  reference,
  canComment,
  onComment,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly canComment: boolean;
  readonly onComment: (comment: PullRequestReviewCommentDraft) => void;
}) {
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const [selectedFile, setSelectedFile] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const query = useEnvironmentQuery(
    pullRequestEnvironment.diff({
      environmentId,
      input: { ...reference, ...(cursor ? { cursor } : {}) },
    }),
  );
  const parsed = useMemo(() => {
    try {
      return { files: parseReviewPatch(query.data?.patch ?? ""), error: null };
    } catch {
      return {
        files: [],
        error: "This patch could not be displayed. Open the pull request on its host to view it.",
      };
    }
  }, [query.data?.patch]);
  const file = parsed.files[selectedFile];
  return (
    <View className="flex-1 gap-2">
      {query.error || parsed.error ? <PrNotice>{query.error ?? parsed.error!}</PrNotice> : null}
      {query.error ? <PrButton label="Retry files" onPress={query.refresh} /> : null}
      {query.isPending ? <ActivityIndicator /> : null}
      {query.data?.truncated ? (
        <PrNotice>Some binary or large changes are omitted by the host.</PrNotice>
      ) : null}
      <View>
        <ScrollView horizontal contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {parsed.files.map((entry, index) => (
            <PrButton
              key={entry.id}
              label={entry.path}
              selected={index === selectedFile}
              onPress={() => setSelectedFile(index)}
            />
          ))}
        </ScrollView>
      </View>
      {canComment ? (
        <Text className="px-4 text-xs text-foreground-muted">
          Tap a code line to add a review comment.
        </Text>
      ) : null}
      <FlatList
        key={`${cursor ?? "first"}-${selectedFile}`}
        data={file?.lines ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !query.isPending ? <PrNotice>No text changes to display in this file.</PrNotice> : null
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={!canComment || item.position === null}
            accessibilityRole={canComment && item.position ? "button" : undefined}
            accessibilityLabel={canComment && item.position ? `Comment on ${item.text}` : undefined}
            onPress={() => {
              if (file && item.position)
                onComment({
                  path: file.path,
                  ...(file.oldPath ? { oldPath: file.oldPath } : {}),
                  position: item.position,
                  body: "",
                });
            }}
            className={`min-h-8 flex-row px-3 py-1 ${item.position?.kind === "added" ? "bg-green-500/10" : item.position?.kind === "deleted" ? "bg-red-500/10" : ""}`}
          >
            <Text className="w-12 text-xs text-foreground-muted">
              {item.position
                ? item.position.kind === "deleted"
                  ? item.position.oldLine
                  : item.position.newLine
                : ""}
            </Text>
            <Text className="flex-1 font-mono text-xs" selectable={!canComment}>
              {item.text}
            </Text>
          </Pressable>
        )}
      />
      <View className="flex-row flex-wrap gap-2 px-4 pb-2">
        {cursors.length > 0 ? (
          <PrButton
            label="Previous files"
            onPress={() => {
              setCursors((current) => current.slice(0, -1));
              setSelectedFile(0);
            }}
          />
        ) : null}
        {query.data?.nextCursor ? (
          <PrButton
            label="More files"
            disabled={query.isPending}
            onPress={() => {
              const next = query.data?.nextCursor;
              if (next) {
                setCursors((current) => [...current, next]);
                setSelectedFile(0);
              }
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
