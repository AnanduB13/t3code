import { RegistryContext } from "@effect/atom-react";
import {
  AVAILABLE_CONNECTION_STATE,
  EnvironmentSupervisor,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import { Persistence } from "@t3tools/client-runtime/platform";
import type { RpcSession, WsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  createEnvironmentThreadDetailAtoms,
  EMPTY_ENVIRONMENT_THREAD_STATE,
  makeEnvironmentThreadState,
  ThreadSnapshotLoader,
} from "@t3tools/client-runtime/state/threads";
import {
  EnvironmentId,
  EventId,
  MessageId,
  ORCHESTRATION_V2_WS_METHODS,
  type ThreadId,
  type OrchestrationV2ThreadStreamItem,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import { makeThreadFixture, makeThreadProjectionFixture } from "../../test-fixtures";
import { useChatWorkspaceLayoutStore } from "../../chatWorkspaceLayout";
import { DraftId } from "../../composerDraftStore";
import { useThreadProjection } from "../../state/entities";
import { ChatWorkspace } from "./ChatWorkspace";

const sources = vi.hoisted(() => ({
  details: null as ReturnType<typeof createEnvironmentThreadDetailAtoms> | null,
  shell: null as Atom.Writable<EnvironmentThreadShell | null> | null,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../hooks/useMediaQuery", () => ({ useIsMobile: () => false }));
vi.mock("../../state/threads", () => ({
  environmentThreadDetails: {
    threadAtom: (...args: Parameters<NonNullable<typeof sources.details>["threadAtom"]>) =>
      sources.details!.threadAtom(...args),
  },
  environmentThreadShells: { threadShellAtom: () => sources.shell! },
}));
vi.mock("../DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "main" }));
vi.mock("../ChatView", () => ({
  default: function Messages(props: {
    environmentId: EnvironmentId;
    threadId: ThreadId;
    routeKind: "draft" | "server";
  }) {
    const thread = useThreadProjection(
      props.routeKind === "draft"
        ? null
        : { environmentId: props.environmentId, threadId: props.threadId },
    );
    return <p>{thread?.projection.messages.map((message) => message.text).join("\n")}</p>;
  },
}));

let renderer: ReactTestRenderer | undefined;
let registry: AtomRegistry.AtomRegistry | undefined;
afterEach(async () => {
  await act(() => renderer?.unmount());
  registry?.dispose();
  vi.unstubAllGlobals();
});

it.effect("receives new-thread responses without reloading after visiting the unsent draft", () =>
  Effect.gen(function* () {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const projection = makeThreadProjectionFixture();
    const environmentId = EnvironmentId.make("environment");
    const ref = { environmentId, threadId: projection.thread.id };
    const target = new PrimaryConnectionTarget({
      environmentId,
      label: "Test",
      httpBaseUrl: "https://environment.example.test",
      wsBaseUrl: "wss://environment.example.test",
    });
    const events = yield* Queue.unbounded<OrchestrationV2ThreadStreamItem>();
    const subscriptions = yield* Queue.unbounded<void>();
    const client = {
      [ORCHESTRATION_V2_WS_METHODS.subscribeThread]: () =>
        Stream.unwrap(
          Queue.offer(subscriptions, undefined).pipe(Effect.as(Stream.fromQueue(events))),
        ),
    } as unknown as WsRpcProtocolClient;
    const session: RpcSession = {
      client,
      initialConfig: Effect.succeed({ threadResumeCompletionMarker: true } as never),
      subscribeServerConfig: (input) => client.subscribeServerConfig(input),
      ready: Effect.void,
      probe: Effect.void,
      closed: Effect.never,
    };
    const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
      target,
      state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
      session: yield* SubscriptionRef.make(Option.some(session)),
      prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(
        Option.some({
          environmentId,
          label: target.label,
          httpBaseUrl: target.httpBaseUrl,
          socketUrl: target.wsBaseUrl,
          httpAuthorization: null,
          target,
        }),
      ),
      connect: Effect.void,
      disconnect: Effect.void,
      retryNow: Effect.void,
    });
    let created = false;
    let snapshotLoads = 0;
    const runtime = Atom.runtime(
      Layer.mergeAll(
        Layer.succeed(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        Layer.succeed(Persistence.EnvironmentCacheStore, {
          loadShell: () => Effect.succeedNone,
          saveShell: () => Effect.void,
          loadThread: () => Effect.succeedNone,
          saveThread: () => Effect.void,
          removeThread: () => Effect.void,
          loadServerConfig: () => Effect.succeedNone,
          saveServerConfig: () => Effect.void,
          loadVcsRefs: () => Effect.succeedNone,
          saveVcsRefs: () => Effect.void,
          removeVcsRefs: () => Effect.void,
          clearVcsRefs: () => Effect.void,
          clear: () => Effect.void,
        }),
        Layer.succeed(ThreadSnapshotLoader, {
          load: () =>
            Effect.sync(() => {
              snapshotLoads++;
              return created
                ? {
                    _tag: "present" as const,
                    snapshot: { snapshotSequence: 0, projection },
                  }
                : { _tag: "missing" as const };
            }),
        }),
      ),
    );
    const state = runtime.atom(
      Stream.unwrap(
        makeEnvironmentThreadState(ref.threadId).pipe(Effect.map(SubscriptionRef.changes)),
      ),
      { initialValue: EMPTY_ENVIRONMENT_THREAD_STATE },
    );
    sources.details = createEnvironmentThreadDetailAtoms(() => state);
    sources.shell = Atom.make<EnvironmentThreadShell | null>(null);
    registry = AtomRegistry.make();
    useChatWorkspaceLayoutStore.setState({
      paneThreadKeys: [],
      activePaneIndex: 0,
      columns: 1,
      columnWeights: [1],
      rowWeights: [1],
    });
    const workspace = (routeKind: "draft" | "server") => (
      <RegistryContext.Provider value={registry!}>
        <ChatWorkspace
          routeThreadRef={ref}
          routePane={{ routeKind, draftId: DraftId.make("draft"), chatViewKey: "draft" }}
        />
      </RegistryContext.Provider>
    );
    yield* Effect.promise(async () =>
      act(() => {
        renderer = create(workspace("draft"));
      }),
    );
    expect(snapshotLoads).toBe(0);

    yield* Effect.promise(async () =>
      act(() => {
        created = true;
        registry!.set(sources.shell!, makeThreadFixture({ environmentId, id: ref.threadId }));
        renderer!.update(workspace("server"));
      }),
    );
    yield* Queue.take(subscriptions);
    const response = "This response appears without a reload";
    const observed = new Promise<void>((resolve) => {
      const stop = registry!.subscribe(sources.details!.threadAtom(ref), (thread) => {
        if (thread?.projection.messages.some((message) => message.text === response)) {
          stop();
          resolve();
        }
      });
    });
    yield* Queue.offerAll(events, [
      { kind: "synchronized" },
      {
        kind: "event",
        sequence: 1,
        event: {
          id: EventId.make("response"),
          type: "message.updated",
          threadId: ref.threadId,
          occurredAt: projection.thread.createdAt,
          payload: {
            id: MessageId.make("response"),
            threadId: ref.threadId,
            runId: null,
            nodeId: null,
            role: "assistant",
            text: response,
            streaming: false,
            attachments: [],
            createdBy: "agent",
            creationSource: "provider",
            createdAt: projection.thread.createdAt,
            updatedAt: projection.thread.createdAt,
          },
        },
      },
    ]);
    yield* Effect.promise(async () => act(() => observed));
    expect(renderer!.root.findByType("p").children).toEqual([response]);
    expect(snapshotLoads).toBe(1);
  }),
);
