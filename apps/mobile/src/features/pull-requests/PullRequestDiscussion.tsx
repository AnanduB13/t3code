import type {
  EnvironmentId,
  PullRequestDetail,
  PullRequestRef,
  PullRequestReviewThread,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { AppText as Text, AppTextInput } from "../../components/AppText";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { pullRequestEnvironment } from "../../state/pull-requests";
import { PrButton, PrNotice } from "./PullRequestControls";

export function PullRequestDiscussion({
  environmentId,
  reference,
  detail,
  drafts,
  onChangeDraft,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetail;
  readonly drafts: Readonly<Record<string, string>>;
  readonly onChangeDraft: (key: string, body: string) => void;
}) {
  const activity = useEnvironmentQuery(
    pullRequestEnvironment.activity({ environmentId, input: reference }),
  );
  const postComment = useAtomCommand(pullRequestEnvironment.comment);
  const body = drafts.comment ?? "";
  const setBody = (value: string) => onChangeDraft("comment", value);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const send = async () => {
    if (!body.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await postComment({ environmentId, input: { ...reference, body } });
      if (result._tag === "Success") {
        setBody("");
        activity.refresh();
      } else Alert.alert("Comment not posted", "Your draft has been kept. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 12, padding: 16 }}
    >
      {activity.isPending ? <ActivityIndicator /> : null}
      {activity.error ? (
        <>
          <PrNotice>{activity.error}</PrNotice>
          <PrButton label="Retry discussion" onPress={activity.refresh} />
        </>
      ) : null}
      {activity.data?.comments.map((comment) => (
        <View
          key={`${comment.kind}-${comment.id}`}
          className="gap-2 rounded-2xl border border-border bg-card p-3"
        >
          <Text className="text-sm font-t3-bold">
            {comment.author?.login ?? "Unknown author"}
            {comment.reviewState ? ` · ${comment.reviewState}` : ""}
          </Text>
          {comment.path ? (
            <Text className="text-xs text-foreground-muted">{comment.path}</Text>
          ) : null}
          <Text selectable>{comment.body}</Text>
        </View>
      ))}
      {activity.data?.commentsTruncated ? (
        <PrNotice>
          Some older comments are omitted. Open on host to read the full conversation.
        </PrNotice>
      ) : null}
      {activity.data?.reviewThreads.map((thread) => (
        <ReviewThread
          key={thread.id}
          environmentId={environmentId}
          reference={reference}
          detail={detail}
          thread={thread}
          onUpdated={activity.refresh}
          body={drafts[thread.id] ?? ""}
          setBody={(body) => onChangeDraft(thread.id, body)}
        />
      ))}
      {activity.data &&
      activity.data.comments.length === 0 &&
      activity.data.reviewThreads.length === 0 ? (
        <PrNotice>No discussion yet.</PrNotice>
      ) : null}
      {detail.capabilities.comment && detail.viewerPermissions.comment ? (
        <View className="gap-2">
          <AppTextInput
            accessibilityLabel="Discussion comment"
            placeholder="Add a comment…"
            multiline
            maxLength={65536}
            value={body}
            editable={!busy}
            onChangeText={setBody}
          />
          <PrButton
            label="Post comment"
            disabled={busy || !body.trim()}
            onPress={() => void send()}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function ReviewThread({
  environmentId,
  reference,
  detail,
  thread,
  onUpdated,
  body,
  setBody,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetail;
  readonly thread: PullRequestReviewThread;
  readonly onUpdated: () => void;
  readonly body: string;
  readonly setBody: (body: string) => void;
}) {
  const reply = useAtomCommand(pullRequestEnvironment.replyToThread);
  const resolve = useAtomCommand(pullRequestEnvironment.setThreadResolution);
  const loadComments = useAtomCommand(pullRequestEnvironment.threadComments);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [extra, setExtra] = useState<PullRequestReviewThread["comments"]>([]);
  const [cursor, setCursor] = useState(thread.nextCommentsCursor);
  const run = async (action: "reply" | "resolve" | "more") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (action === "more") {
        if (!cursor) return;
        const result = await loadComments({
          environmentId,
          input: { ...reference, threadId: thread.id, cursor },
        });
        if (result._tag === "Success") {
          setExtra((current) => [...current, ...result.value.comments]);
          setCursor(result.value.nextCursor ?? undefined);
        } else Alert.alert("Unable to load replies", "Try again.");
        return;
      }
      const result =
        action === "reply"
          ? await reply({ environmentId, input: { ...reference, threadId: thread.id, body } })
          : await resolve({
              environmentId,
              input: { ...reference, threadId: thread.id, resolved: !thread.isResolved },
            });
      if (result._tag === "Success") {
        if (action === "reply") setBody("");
        onUpdated();
      } else Alert.alert("Unable to update discussion", "Your draft has been kept. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const comments = [
    ...thread.comments,
    ...extra.filter((comment) => !thread.comments.some((entry) => entry.id === comment.id)),
  ];
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-3">
      <Text className="text-sm font-t3-bold">
        {thread.path}
        {thread.line ? `:${thread.line}` : ""} · {thread.isResolved ? "Resolved" : "Unresolved"}
        {thread.isOutdated ? " · Outdated" : ""}
      </Text>
      {comments.map((comment) => (
        <View key={comment.id} className="gap-1">
          <Text className="text-xs font-t3-bold">{comment.author?.login ?? "Unknown author"}</Text>
          <Text selectable>{comment.body}</Text>
        </View>
      ))}
      {cursor ? (
        <PrButton label="Load more replies" disabled={busy} onPress={() => void run("more")} />
      ) : null}
      {detail.capabilities.review.reply && detail.viewerPermissions.comment ? (
        <>
          <AppTextInput
            accessibilityLabel={`Reply to ${thread.path}`}
            placeholder="Reply…"
            multiline
            maxLength={65536}
            value={body}
            editable={!busy}
            onChangeText={setBody}
          />
          <PrButton
            label="Reply"
            disabled={busy || !body.trim()}
            onPress={() => void run("reply")}
          />
        </>
      ) : null}
      {detail.capabilities.review.resolve && detail.viewerPermissions.resolve ? (
        <PrButton
          label={thread.isResolved ? "Unresolve" : "Resolve"}
          disabled={busy}
          onPress={() => void run("resolve")}
        />
      ) : null}
    </View>
  );
}
