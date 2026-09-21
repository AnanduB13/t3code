import { EnvironmentId, UsageDay, USAGE_CONTRACT_VERSION } from "@t3tools/contracts";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  useUsage: vi.fn(),
  metric: "cost" as "cost" | "tokens" | "limits",
  breakdown: "time" as "model" | "time",
  windowSelection: 30 as number | "all",
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [
      initial === readUsagePagePreferences
        ? { metric: testState.metric, windowDays: testState.windowSelection }
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial === "cost"
            ? testState.metric
            : initial === "model"
              ? testState.breakdown
              : initial,
      vi.fn(),
    ]),
  };
});
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../state/usage", () => ({ useUsage: testState.useUsage }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "div" }));
vi.mock("../WorkspaceBreadcrumb", () => ({
  WorkspaceBreadcrumb: "div",
  WorkspaceBreadcrumbItem: "div",
  WorkspaceBreadcrumbSeparator: "span",
}));
vi.mock("../ui/select", () => ({
  Select: "div",
  SelectItem: "option",
  SelectPopup: "div",
  SelectTrigger: "div",
  SelectValue: "span",
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => new Map() }));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: null },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("./UsageProviderChart", () => ({ UsageProviderChart: "div" }));
vi.mock("./UsagePriceOverrides", () => ({ UsagePriceOverrides: () => null }));
vi.mock("./usageProviders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./usageProviders")>();
  return {
    ...actual,
    PROVIDER_PRESENTATION: {
      codex: { color: "white", label: "Codex", mark: "span" },
      claude: { color: "orange", label: "Claude Code", mark: "span" },
    },
  };
});

import { UsagePage } from "./UsagePage";
import { readUsagePagePreferences } from "./usagePagePreferences";

const daily = [
  {
    day: "2026-08-10",
    costUsd: 13,
    totalTokens: 13_000,
    byProvider: new Map([
      ["codex", { costUsd: 7, totalTokens: 7_000 }],
      ["claude", { costUsd: 6, totalTokens: 6_000 }],
    ]),
  },
  {
    day: "2026-08-11",
    costUsd: 11,
    totalTokens: 11_000,
    byProvider: new Map([
      ["codex", { costUsd: 6, totalTokens: 6_000 }],
      ["claude", { costUsd: 5, totalTokens: 5_000 }],
    ]),
  },
] as const;

const models = [
  {
    model: "expensive-model",
    provider: "claude" as const,
    costUsd: 10,
    totalTokens: 100,
    records: 1,
    unpricedRecords: 0,
    costShare: 10 / 16,
  },
  {
    model: "token-heavy-model",
    provider: "codex" as const,
    costUsd: 5,
    totalTokens: 1_000,
    records: 1,
    unpricedRecords: 0,
    costShare: 5 / 16,
  },
  {
    model: "token-heavy-cheaper-model",
    provider: "codex" as const,
    costUsd: 1,
    totalTokens: 1_000,
    records: 1,
    unpricedRecords: 0,
    costShare: 1 / 16,
  },
  {
    model: "unpriced-model",
    provider: "codex" as const,
    costUsd: 0,
    totalTokens: 500,
    records: 2,
    unpricedRecords: 2,
    costShare: 0,
  },
];

const environments = [
  {
    environmentId: EnvironmentId.make("test-environment"),
    label: "Test environment",
    isPending: false,
    error: null,
    summary: {
      contractVersion: USAGE_CONTRACT_VERSION,
      readAt: "2026-08-11T12:37:00.000Z",
      sinceDay: UsageDay.make("2026-08-10"),
      untilDay: UsageDay.make("2026-08-11"),
      timeZone: "UTC",
      buckets: [],
      sources: [],
      pricing: { status: "fresh", source: "test", fetchedAt: null, knownModels: 1 },
      scanDurationMs: 1,
    },
  },
];

beforeEach(() => {
  testState.metric = "cost";
  testState.breakdown = "model";
  testState.windowSelection = 30;
  testState.useUsage.mockReset();
  testState.useUsage.mockReturnValue({
    merged: {
      ...mergeUsage([], USAGE_CONTRACT_VERSION),
      totalTokens: 24_000,
      cachedInputTokens: 18_000,
      uncachedInputTokens: 4_000,
      outputTokens: 2_000,
      sessions: 2,
      costUsd: 24,
      daily,
      models,
      providers: [
        {
          provider: "codex",
          costUsd: 13,
          totalTokens: 13_000,
          sessions: 1,
          costShare: 13 / 24,
          tokenShare: 13 / 24,
        },
        {
          provider: "claude",
          costUsd: 11,
          totalTokens: 11_000,
          sessions: 1,
          costShare: 11 / 24,
          tokenShare: 11 / 24,
        },
      ],
    },
    environments,
    selectedEnvironments: environments,
    isPending: false,
    isPartial: false,
    refresh: vi.fn(),
  });
});

describe("UsagePage restored dashboard", () => {
  it("shows the device, origin, provider, totals, and breakdown sections", () => {
    const markup = renderToStaticMarkup(<UsagePage />);

    expect(markup).toContain("Device usage");
    expect(markup).toContain("All device usage");
    expect(markup).toContain("T3 Code usage");
    expect(markup).toContain("Terminal usage");
    expect(markup).toContain("Token cost");
    expect(markup).toContain("Cache savings");
    expect(markup).toContain("Breakdown");
  });

  it("offers the original date ranges including all time", () => {
    const markup = renderToStaticMarkup(<UsagePage />);

    expect(markup).toContain("7 days");
    expect(markup).toContain("30 days");
    expect(markup).toContain("90 days");
    expect(markup).toContain("All time");
    expect(markup).toContain("Past 24h");
  });

  it("requests the complete history when all time is selected", () => {
    testState.windowSelection = "all";

    renderToStaticMarkup(<UsagePage />);

    expect(testState.useUsage).toHaveBeenCalledWith(
      expect.objectContaining({ sinceDay: "1970-01-01", resolution: "day" }),
      null,
    );
  });

  it("shows the newest days first in the day breakdown", () => {
    testState.breakdown = "time";

    const markup = renderToStaticMarkup(<UsagePage />);
    const body = markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? "";

    expect(body.indexOf("$11.00")).toBeLessThan(body.indexOf("$13.00"));
  });

  it("keeps the model breakdown ordered by merged usage", () => {
    const markup = renderToStaticMarkup(<UsagePage />);
    const body = markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? "";

    expect(body).toMatch(/expensive-model.*token-heavy-model/);
  });
});

describe("UsagePage model breakdown", () => {
  it("sorts models by cost when the cost metric is selected", () => {
    testState.breakdown = "model";

    const markup = renderToStaticMarkup(<UsagePage />);
    const body = markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? "";

    expect(body).toMatch(/expensive-model.*token-heavy-model.*token-heavy-cheaper-model/);
  });

  it("flags a model with no known rates instead of showing it as free", () => {
    testState.breakdown = "model";

    const markup = renderToStaticMarkup(<UsagePage />);
    const body = markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? "";
    const unpricedRow = body.split("<tr").find((row) => row.includes("unpriced-model")) ?? "";

    expect(unpricedRow).toContain("Unpriced");
    expect(unpricedRow).not.toContain("$0.00");
  });

  it("sorts models by token usage when the token metric is selected", () => {
    testState.metric = "tokens";
    testState.breakdown = "model";

    const markup = renderToStaticMarkup(<UsagePage />);
    const body = markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? "";

    expect(body).toMatch(/token-heavy-model.*token-heavy-cheaper-model.*expensive-model/);
    expect(models.map((model) => model.model)).toEqual([
      "expensive-model",
      "token-heavy-model",
      "token-heavy-cheaper-model",
      "unpriced-model",
    ]);
  });
});
