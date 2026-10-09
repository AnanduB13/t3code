import { useNavigation, usePreventRemove, type StaticScreenProps } from "@react-navigation/native";
import {
  EnvironmentId,
  ProjectId,
  type PullRequestDetail,
  type PullRequestRef,
  type PullRequestReviewCommentDraft,
  type PullRequestReviewVerdict,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text, AppTextInput } from "../../components/AppText";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { appAtomRegistry } from "../../state/atom-registry";
import { pullRequestEnvironment } from "../../state/pull-requests";
import { PrButton, PrNotice } from "./PullRequestControls";
import { availableReviewVerdicts, canSubmitReview, canEditPullRequest } from "./pullRequestModel";
import { PullRequestFiles } from "./PullRequestFiles";
import { PullRequestDiscussion } from "./PullRequestDiscussion";

type Props = StaticScreenProps<{
  readonly environmentId: string;
  readonly projectId: string;
  readonly repository: string;
  readonly number: string;
}>;

export function PullRequestScreen({ route }: Props) {
  const number = Number(route.params.number);
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    !route.params.repository?.trim() ||
    !route.params.projectId ||
    !route.params.environmentId
  ) {
    return (
      <View className="flex-1 bg-screen p-4">
        <PrNotice>This pull request link is invalid.</PrNotice>
      </View>
    );
  }
  const reference = {
    projectId: ProjectId.make(route.params.projectId),
    repository: route.params.repository,
    number,
  };
  return (
    <PullRequestContent
      key={JSON.stringify(route.params)}
      environmentId={EnvironmentId.make(route.params.environmentId)}
      reference={reference}
    />
  );
}

function PullRequestContent({
  environmentId,
  reference,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const query = useEnvironmentQuery(
    pullRequestEnvironment.detail({ environmentId, input: reference }),
  );
  const invalidate = useAtomCommand(pullRequestEnvironment.invalidate);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview);
  const [tab, setTab] = useState<"Overview" | "Files" | "Discussion" | "Review">("Overview");
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set(["Overview"]));
  const [descriptionDraft, setDescriptionDraft] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [discussionDrafts, setDiscussionDrafts] = useState<Readonly<Record<string, string>>>({});
  const changeDiscussionDraft = (key: string, body: string) =>
    setDiscussionDrafts((current) => ({ ...current, [key]: body }));
  const [summary, setSummary] = useState("");
  const [comments, setComments] = useState<
    readonly (PullRequestReviewCommentDraft & { readonly id: number })[]
  >([]);
  const nextCommentId = useRef(0);
  const [editing, setEditing] = useState<{
    index: number | null;
    comment: PullRequestReviewCommentDraft;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const detail = query.data;
  usePreventRemove(
    Boolean(
      summary ||
      comments.length ||
      editing ||
      descriptionDraft ||
      Object.values(discussionDrafts).some(Boolean),
    ),
    ({ data }) => {
      if (busyRef.current) return;
      Alert.alert("Discard unsent changes?", "Your unsent comments and edits will be lost.", [
        { text: "Keep reviewing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
      ]);
    },
  );
  const refresh = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await invalidate({ environmentId, input: { reference } });
      if (result._tag === "Success") {
        query.refresh();
        appAtomRegistry.refresh(
          pullRequestEnvironment.activity({ environmentId, input: reference }),
        );
        setRevision((value) => value + 1);
      } else Alert.alert("Unable to refresh", "Check the connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const submitted = () => {
    query.refresh();
    appAtomRegistry.refresh(pullRequestEnvironment.activity({ environmentId, input: reference }));
    setRevision((value) => value + 1);
  };
  const sendReview = async (verdict: PullRequestReviewVerdict) => {
    if (
      busyRef.current ||
      !detail ||
      !availableReviewVerdicts(detail).includes(verdict) ||
      !canSubmitReview(verdict, summary, comments.length)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await submitReview({
        environmentId,
        input: { ...reference, verdict, body: summary, comments },
      });
      if (result._tag === "Failure") {
        Alert.alert(
          "Review not submitted",
          "Your draft has been kept. Check your connection and try again.",
        );
        return;
      }
      setSummary("");
      setComments([]);
      submitted();
      Alert.alert(
        verdict === "approve"
          ? "Pull request approved"
          : verdict === "request-changes"
            ? "Changes requested"
            : "Review submitted",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const verdicts = detail ? availableReviewVerdicts(detail) : [];
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-screen"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <View className="gap-2 px-4 py-3">
        <Text numberOfLines={2} className="text-lg font-t3-bold">
          {detail?.title ?? `Pull request #${reference.number}`}
        </Text>
        <Text className="text-xs text-foreground-muted">
          {reference.repository} · #{reference.number}
          {detail ? ` · ${detail.state}` : ""}
        </Text>
        <View className="flex-row gap-2">
          <PrButton
            label={busy ? "Working…" : "Refresh"}
            disabled={busy}
            onPress={() => void refresh()}
          />
          {detail ? (
            <PrButton
              label="Open on host"
              onPress={() => void tryOpenExternalUrl(detail.url, "pull-request")}
            />
          ) : null}
        </View>
        {query.error ? <PrNotice>{query.error}</PrNotice> : null}
        {query.isPending && !detail ? <ActivityIndicator /> : null}
        <View className="flex-row flex-wrap gap-2">
          {(["Overview", "Files", "Discussion", "Review"] as const).map((value) => (
            <PrButton
              key={value}
              label={value === "Review" && comments.length ? `Review (${comments.length})` : value}
              selected={tab === value}
              onPress={() => {
                setTab(value);
                setVisited((current) => new Set([...current, value]));
              }}
            />
          ))}
        </View>
      </View>
      {detail ? (
        <View className="flex-1" style={{ paddingBottom: insets.bottom + 80 }}>
          <View className="flex-1" style={{ display: tab === "Overview" ? "flex" : "none" }}>
            <PullRequestOverview
              environmentId={environmentId}
              reference={reference}
              detail={detail}
              onUpdated={submitted}
              draft={descriptionDraft}
              setDraft={setDescriptionDraft}
            />
          </View>
          {visited.has("Files") ? (
            <View className="flex-1" style={{ display: tab === "Files" ? "flex" : "none" }}>
              {detail.capabilities.diff ? (
                <PullRequestFiles
                  key={revision}
                  environmentId={environmentId}
                  reference={reference}
                  canComment={
                    !busy &&
                    editing === null &&
                    detail.capabilities.review.inlineComment &&
                    detail.viewerPermissions.comment &&
                    verdicts.length > 0
                  }
                  onComment={(comment) => {
                    setEditing({ index: null, comment });
                    setTab("Review");
                  }}
                />
              ) : (
                <PrNotice>
                  This host does not provide diffs here. Use Open on host to view the changes.
                </PrNotice>
              )}
            </View>
          ) : null}
          {visited.has("Discussion") ? (
            <View className="flex-1" style={{ display: tab === "Discussion" ? "flex" : "none" }}>
              <PullRequestDiscussion
                environmentId={environmentId}
                reference={reference}
                detail={detail}
                drafts={discussionDrafts}
                onChangeDraft={changeDiscussionDraft}
              />
            </View>
          ) : null}
          {tab === "Review" ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 12, padding: 16 }}
            >
              {editing ? (
                <View className="gap-2 rounded-2xl border border-border p-3">
                  <Text className="text-sm font-t3-bold">{editing.comment.path}</Text>
                  <AppTextInput
                    accessibilityLabel="Line comment"
                    multiline
                    maxLength={65536}
                    editable={!busy}
                    placeholder="Describe your feedback…"
                    value={editing.comment.body}
                    onChangeText={(body) =>
                      setEditing({ ...editing, comment: { ...editing.comment, body } })
                    }
                  />
                  <View className="flex-row gap-2">
                    <PrButton
                      label="Save comment"
                      disabled={busy || !editing.comment.body.trim()}
                      onPress={() => {
                        const newComment = { ...editing.comment, id: nextCommentId.current++ };
                        setComments((current) =>
                          editing.index === null
                            ? [...current, newComment]
                            : current.map((comment, index) =>
                                index === editing.index
                                  ? { ...editing.comment, id: comment.id }
                                  : comment,
                              ),
                        );
                        setEditing(null);
                      }}
                    />
                    <PrButton label="Cancel" disabled={busy} onPress={() => setEditing(null)} />
                  </View>
                </View>
              ) : null}
              {comments.map((comment, index) => (
                <View key={comment.id} className="gap-2 rounded-2xl border border-border p-3">
                  <Text className="text-sm font-t3-bold">
                    {comment.path} · line{" "}
                    {comment.position.kind === "deleted"
                      ? comment.position.oldLine
                      : comment.position.newLine}
                  </Text>
                  <Text selectable>{comment.body}</Text>
                  <View className="flex-row gap-2">
                    <PrButton
                      label="Edit"
                      disabled={busy || editing !== null}
                      onPress={() => setEditing({ index, comment })}
                    />
                    <PrButton
                      label="Remove"
                      disabled={busy || editing !== null}
                      onPress={() =>
                        setComments((current) => current.filter((_, i) => i !== index))
                      }
                    />
                  </View>
                </View>
              ))}
              {verdicts.length ? (
                <>
                  <AppTextInput
                    accessibilityLabel="Review summary"
                    multiline
                    maxLength={65536}
                    editable={!busy}
                    placeholder="Summarize your review…"
                    value={summary}
                    onChangeText={setSummary}
                  />
                  <View className="flex-row flex-wrap gap-2">
                    {verdicts.map((verdict) => (
                      <PrButton
                        key={verdict}
                        label={
                          verdict === "approve"
                            ? "Approve"
                            : verdict === "request-changes"
                              ? "Request changes"
                              : "Submit review"
                        }
                        disabled={
                          busy ||
                          editing !== null ||
                          !canSubmitReview(verdict, summary, comments.length)
                        }
                        onPress={() => void sendReview(verdict)}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <PrNotice>
                  You cannot submit a review for this pull request with the current account and
                  host.
                </PrNotice>
              )}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function PullRequestOverview({
  environmentId,
  reference,
  detail,
  onUpdated,
  draft,
  setDraft,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetail;
  readonly onUpdated: () => void;
  readonly draft: { title: string; body: string } | null;
  readonly setDraft: (draft: { title: string; body: string } | null) => void;
}) {
  const update = useAtomCommand(pullRequestEnvironment.update);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);
  const save = async () => {
    if (!draft || !draft.title.trim() || saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    try {
      const result = await update({ environmentId, input: { ...reference, ...draft } });
      if (result._tag === "Success") {
        setDraft(null);
        onUpdated();
      } else Alert.alert("Unable to save", "Your changes have been kept. Try again.");
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 12, padding: 16 }}
    >
      <Text className="text-sm text-foreground-muted">
        {detail.author?.login ?? "Unknown author"} · {detail.headBranch} → {detail.baseBranch}
      </Text>
      <Text className="text-sm">
        {detail.changedFiles} files · +{detail.additions} −{detail.deletions}
      </Text>
      {draft ? (
        <>
          <AppTextInput
            accessibilityLabel="Pull request title"
            maxLength={1024}
            value={draft.title}
            editable={!saving}
            onChangeText={(title) => setDraft({ ...draft, title })}
          />
          <AppTextInput
            accessibilityLabel="Pull request description"
            multiline
            maxLength={65536}
            value={draft.body}
            editable={!saving}
            onChangeText={(body) => setDraft({ ...draft, body })}
          />
          <View className="flex-row gap-2">
            <PrButton
              label="Save changes"
              disabled={saving || !draft.title.trim()}
              onPress={() => void save()}
            />
            <PrButton label="Cancel" disabled={saving} onPress={() => setDraft(null)} />
          </View>
        </>
      ) : (
        <>
          <Text selectable>{detail.body || "No description provided."}</Text>
          {canEditPullRequest(detail) ? (
            <PrButton
              label="Edit title and description"
              onPress={() => setDraft({ title: detail.title, body: detail.body })}
            />
          ) : null}
        </>
      )}
      <Text className="text-base font-t3-bold">Checks</Text>
      {detail.checks.length === 0 ? (
        <Text className="text-sm text-foreground-muted">No checks reported.</Text>
      ) : (
        detail.checks.map((check) => (
          <Text key={`${check.name}-${check.url}`} className="text-sm">
            {check.name} · {check.status}
          </Text>
        ))
      )}
      <Text className="text-sm text-foreground-muted">Merge status: {detail.mergeability}</Text>
    </ScrollView>
  );
}
