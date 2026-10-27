import { GENERAL_CHATS_PROJECT_ID } from "@t3tools/client-runtime/general-chats";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildHomeProjectScopes, sortHomeProjectScopes } from "./homeThreadList";

function makeProject(
  input: Partial<EnvironmentProject> & Pick<EnvironmentProject, "environmentId" | "id" | "title">,
): EnvironmentProject {
  return {
    workspaceRoot: `/workspaces/${input.id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...input,
  };
}

function makeThread(
  input: Partial<EnvironmentThreadShell> &
    Pick<EnvironmentThreadShell, "environmentId" | "id" | "projectId" | "title">,
): EnvironmentThreadShell {
  return {
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    latestTurn: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archivedAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...input,
    settledOverride: input.settledOverride ?? null,
    settledAt: input.settledAt ?? null,
  };
}

describe("home project scopes", () => {
  it("keeps general chats out of the project picker in either grouping mode", () => {
    const environmentId = EnvironmentId.make("environment-1");
    const project = makeProject({ environmentId, id: ProjectId.make("project-1"), title: "Code" });
    const chats = makeProject({ environmentId, id: GENERAL_CHATS_PROJECT_ID, title: "Chats" });
    for (const projectGroupingMode of ["repository", "separate"] as const) {
      const scopes = buildHomeProjectScopes({
        projects: [project, chats],
        environmentId: null,
        projectGroupingMode,
      });
      expect(scopes.map((scope) => scope.representative.id)).toEqual([project.id]);
    }
  });

  it("builds one v2 scope for the same repository across environments", () => {
    const localEnvironmentId = EnvironmentId.make("environment-local");
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const repositoryIdentity = {
      canonicalKey: "github.com/pingdotgg/t3code",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "git@github.com:pingdotgg/t3code.git",
      },
    };
    const projects = [
      makeProject({
        environmentId: localEnvironmentId,
        id: ProjectId.make("project-local"),
        title: "t3code",
        repositoryIdentity,
      }),
      makeProject({
        environmentId: remoteEnvironmentId,
        id: ProjectId.make("project-remote"),
        title: "t3code",
        repositoryIdentity,
      }),
    ];

    const scopes = buildHomeProjectScopes({
      projects,
      environmentId: null,
      projectGroupingMode: "repository",
    });

    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.title).toBe("t3code");
    expect(scopes[0]?.projects).toEqual(projects);
    expect(scopes[0]?.projectRefs).toEqual(
      projects.map((project) => ({
        environmentId: project.environmentId,
        projectId: project.id,
      })),
    );
  });

  it("keeps repository identity from an older duplicate when the freshness winner lacks it", () => {
    const localEnvironmentId = EnvironmentId.make("environment-local");
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const repositoryIdentity = {
      canonicalKey: "github.com/pingdotgg/t3code",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "git@github.com:pingdotgg/t3code.git",
      },
    };
    const projects = [
      makeProject({
        environmentId: localEnvironmentId,
        id: ProjectId.make("project-local"),
        title: "t3code",
        repositoryIdentity,
      }),
      makeProject({
        environmentId: remoteEnvironmentId,
        id: ProjectId.make("project-remote-with-identity"),
        title: "t3code",
        workspaceRoot: "/remote/t3code",
        repositoryIdentity,
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
      makeProject({
        environmentId: remoteEnvironmentId,
        id: ProjectId.make("project-remote-fresh"),
        title: "t3code",
        workspaceRoot: "/remote/t3code/",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
    ];

    const scopes = buildHomeProjectScopes({
      projects,
      environmentId: null,
      projectGroupingMode: "repository",
    });

    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.representative.id).toBe(ProjectId.make("project-local"));
    expect(scopes[0]?.projects.map((project) => project.id)).toContain(
      ProjectId.make("project-remote-fresh"),
    );
    expect(scopes[0]?.projectRefs).toHaveLength(3);
  });

  it("sorts v2 project scopes by their grouped thread activity", () => {
    const environmentId = EnvironmentId.make("environment-1");
    const olderProject = makeProject({
      environmentId,
      id: ProjectId.make("project-older"),
      title: "Older project",
    });
    const newerProject = makeProject({
      environmentId,
      id: ProjectId.make("project-newer"),
      title: "Newer project",
    });
    const scopes = buildHomeProjectScopes({
      projects: [newerProject, olderProject],
      environmentId: null,
      projectGroupingMode: "separate",
    });

    expect(
      sortHomeProjectScopes({
        scopes,
        threads: [
          makeThread({
            environmentId,
            id: ThreadId.make("thread-older-project"),
            projectId: olderProject.id,
            title: "Most recently active",
            latestUserMessageAt: "2026-06-03T00:00:00.000Z",
            updatedAt: "2026-06-03T00:00:00.000Z",
          }),
          makeThread({
            environmentId,
            id: ThreadId.make("thread-newer-project"),
            projectId: newerProject.id,
            title: "Less recently active",
            latestUserMessageAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        pendingTasks: [],
        projectSortOrder: "updated_at",
      }).map((scope) => scope.representative.id),
    ).toEqual([olderProject.id, newerProject.id]);
  });

  it("reorders repository groups when a member on another environment becomes active", () => {
    const localEnvironmentId = EnvironmentId.make("environment-local");
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const repositoryIdentity = {
      canonicalKey: "github.com/example/app",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "git@github.com:example/app.git",
      },
    };
    const localProject = makeProject({
      environmentId: localEnvironmentId,
      id: ProjectId.make("project-app"),
      title: "App",
      repositoryIdentity,
    });
    const remoteProject = makeProject({
      environmentId: remoteEnvironmentId,
      id: localProject.id,
      title: "App",
      repositoryIdentity,
    });
    const otherProject = makeProject({
      environmentId: localEnvironmentId,
      id: ProjectId.make("project-other"),
      title: "Other",
    });
    const scopes = buildHomeProjectScopes({
      projects: [otherProject, localProject, remoteProject],
      environmentId: null,
      projectGroupingMode: "repository",
    });
    const otherThread = makeThread({
      environmentId: localEnvironmentId,
      id: ThreadId.make("thread-other"),
      projectId: otherProject.id,
      title: "Other",
      latestUserMessageAt: "2026-06-02T00:00:00.000Z",
    });
    const remoteThread = makeThread({
      environmentId: remoteEnvironmentId,
      id: ThreadId.make("thread-remote"),
      projectId: remoteProject.id,
      title: "App",
    });
    const sortWithRemoteActivity = (latestUserMessageAt: string | null) =>
      sortHomeProjectScopes({
        scopes,
        threads: [otherThread, { ...remoteThread, latestUserMessageAt }],
        pendingTasks: [],
        projectSortOrder: "updated_at",
      });

    const before = sortWithRemoteActivity(null);
    const after = sortWithRemoteActivity("2026-06-03T00:00:00.000Z");
    expect(before.map((scope) => scope.title)).toEqual(["Other", "App"]);
    expect(after.map((scope) => scope.title)).toEqual(["App", "Other"]);
    expect(after[0]?.key).toBe(before[1]?.key);
  });

  it("ignores archived threads and metadata updates when ordering by recent activity", () => {
    const environmentId = EnvironmentId.make("environment-1");
    const activeProject = makeProject({
      environmentId,
      id: ProjectId.make("active"),
      title: "Active",
    });
    const staleProject = makeProject({
      environmentId,
      id: ProjectId.make("stale"),
      title: "Stale",
    });
    const scopes = buildHomeProjectScopes({
      projects: [staleProject, activeProject],
      environmentId: null,
      projectGroupingMode: "separate",
    });
    const threads = [
      makeThread({
        environmentId,
        id: ThreadId.make("active"),
        projectId: activeProject.id,
        title: "Active",
        latestUserMessageAt: "2026-06-02T00:00:00.000Z",
      }),
      makeThread({
        environmentId,
        id: ThreadId.make("metadata-only"),
        projectId: staleProject.id,
        title: "Metadata update",
        updatedAt: "2026-06-04T00:00:00.000Z",
      }),
      makeThread({
        environmentId,
        id: ThreadId.make("archived"),
        projectId: staleProject.id,
        title: "Archived",
        latestUserMessageAt: "2026-06-05T00:00:00.000Z",
        archivedAt: "2026-06-06T00:00:00.000Z",
      }),
    ];

    expect(
      sortHomeProjectScopes({
        scopes,
        threads,
        pendingTasks: [],
        projectSortOrder: "updated_at",
      }).map((scope) => scope.representative.id),
    ).toEqual([activeProject.id, staleProject.id]);
  });

  it("sorts invalid project creation timestamps after valid ones", () => {
    const environmentId = EnvironmentId.make("environment-1");
    const invalidProject = makeProject({
      environmentId,
      id: ProjectId.make("project-invalid"),
      title: "A invalid timestamp",
      createdAt: "invalid",
    });
    const validProject = makeProject({
      environmentId,
      id: ProjectId.make("project-valid"),
      title: "Z valid timestamp",
      createdAt: "2026-06-02T00:00:00.000Z",
    });
    const scopes = buildHomeProjectScopes({
      projects: [invalidProject, validProject],
      environmentId: null,
      projectGroupingMode: "separate",
    });

    expect(
      sortHomeProjectScopes({
        scopes,
        threads: [],
        pendingTasks: [],
        projectSortOrder: "created_at",
      }).map((scope) => scope.representative.id),
    ).toEqual([validProject.id, invalidProject.id]);
  });

  it("uses the freshest member when a grouped scope has no activity", () => {
    const localEnvironmentId = EnvironmentId.make("environment-local");
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const repositoryIdentity = {
      canonicalKey: "github.com/pingdotgg/t3code",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "git@github.com:pingdotgg/t3code.git",
      },
    };
    const olderMember = makeProject({
      environmentId: localEnvironmentId,
      id: ProjectId.make("project-older-member"),
      title: "t3code",
      updatedAt: "2026-06-01T00:00:00.000Z",
      repositoryIdentity,
    });
    const newerMember = makeProject({
      environmentId: remoteEnvironmentId,
      id: ProjectId.make("project-newer-member"),
      title: "t3code",
      updatedAt: "2026-06-03T00:00:00.000Z",
      repositoryIdentity,
    });
    const otherProject = makeProject({
      environmentId: localEnvironmentId,
      id: ProjectId.make("project-other"),
      title: "other",
      updatedAt: "2026-06-02T00:00:00.000Z",
    });
    const scopes = buildHomeProjectScopes({
      projects: [olderMember, newerMember, otherProject],
      environmentId: null,
      projectGroupingMode: "repository",
    });

    expect(
      sortHomeProjectScopes({
        scopes,
        threads: [],
        pendingTasks: [],
        projectSortOrder: "updated_at",
      })[0]?.key,
    ).toBe(scopes.find((scope) => scope.projects.length === 2)?.key);
  });

  it("does not merge unrelated repositories that share a title", () => {
    const environmentId = EnvironmentId.make("environment-1");
    const projects = ["one", "two"].map((name) =>
      makeProject({
        environmentId,
        id: ProjectId.make(`project-${name}`),
        title: "app",
        repositoryIdentity: {
          canonicalKey: `github.com/example/${name}`,
          locator: {
            source: "git-remote" as const,
            remoteName: "origin",
            remoteUrl: `git@github.com:example/${name}.git`,
          },
        },
      }),
    );

    expect(
      buildHomeProjectScopes({
        projects,
        environmentId: null,
        projectGroupingMode: "repository",
      }),
    ).toHaveLength(2);
  });
});
