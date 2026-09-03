import { USAGE_CONTRACT_VERSION } from "@t3tools/contracts";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  useUsage: vi.fn(),
  metric: "cost" as "cost" | "tokens",
  breakdown: "model" as "model" | "day",
  windowSelection: 30 as number | "all",
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [
      initial === 30
        ? testState.windowSelection
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
}));
vi.mock("./UsageProviderChart", () => ({ UsageProviderChart: "div" }));

import { UsagePage } from "./UsagePage";

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
    costShare: 10 / 16,
  },
  {
    model: "token-heavy-model",
    provider: "codex" as const,
    costUsd: 5,
    totalTokens: 1_000,
    records: 1,
    costShare: 5 / 16,
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
    environments: [],
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
    expect(markup).not.toContain("Past 24h");
  });

  it("requests the complete history when all time is selected", () => {
    testState.windowSelection = "all";

    renderToStaticMarkup(<UsagePage />);

    expect(testState.useUsage).toHaveBeenCalledWith(
      expect.objectContaining({ sinceDay: "1970-01-01", resolution: "day" }),
    );
  });

  it("shows the newest days first in the day breakdown", () => {
    testState.breakdown = "day";

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
