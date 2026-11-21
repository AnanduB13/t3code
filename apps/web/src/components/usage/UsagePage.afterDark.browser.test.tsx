import { USAGE_CONTRACT_VERSION } from "@t3tools/contracts";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import type { UsagePagePreferences } from "./usagePagePreferences";

const testState = vi.hoisted(() => ({
  useUsage: vi.fn(),
  preferences: { metric: "cost", windowDays: 30 } as UsagePagePreferences,
}));

vi.mock(import("../../state/usage"), async (original) => ({
  ...(await original()),
  useUsage: testState.useUsage,
}));
vi.mock(import("./usagePagePreferences"), async (original) => ({
  ...(await original()),
  readUsagePagePreferences: () => testState.preferences,
  saveUsagePagePreferences: () => {},
}));
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));
vi.mock(import("./UsagePriceOverrides"), () => ({ UsagePriceOverrides: (() => null) as never }));
vi.mock(import("./UsageProviderChart"), async (original) => ({
  ...(await original()),
  UsageProviderChart: (() => null) as never,
}));
// UsageLimits and UsageLimitsPooled import each other, so a partial mock would deadlock.
vi.mock(import("./UsageLimits"), () => ({
  UsageLimitsSection: (() => <div>Account usage limits</div>) as never,
}));

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
];

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

const environment = {
  environmentId: "test",
  label: "Test",
  isPending: false,
  error: null,
  summary: null,
  canReadDiagnostics: true,
};

function setup(preferences: UsagePagePreferences = { metric: "cost", windowDays: 30 }) {
  testState.preferences = preferences;
  testState.useUsage.mockReset();
  testState.useUsage.mockImplementation((window: unknown) => {
    const merged = {
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
    };
    return {
      merged,
      // An answered summary is what the page shows for the selected range.
      shown: { window, merged },
      environments: [environment],
      selectedEnvironments: [environment],
      isPartial: false,
      refresh: vi.fn(),
    };
  });
}

// Wide enough for the header's segmented period and metric controls.
async function renderUsagePage() {
  await using stack = new AsyncDisposableStack();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(1400, 900);
  stack.defer(() => page.viewport(viewport.width, viewport.height));
  stack.use(await render(<UsagePage />));
  return stack.move();
}

describe("UsagePage restored dashboard", () => {
  it("shows the device, origin, provider, totals, and breakdown sections", async () => {
    setup();
    await using _screen = await renderUsagePage();

    for (const text of [
      "Device usage",
      "All device usage",
      "T3 Code usage",
      "Terminal usage",
      "Totals",
      "Cache savings",
      "Breakdown",
    ]) {
      await expect.element(page.getByText(text, { exact: true }).first()).toBeVisible();
    }
  });

  it("offers the original date ranges including all time", async () => {
    setup();
    await using _screen = await renderUsagePage();
    const periods = page.getByRole("group", { name: "Usage period" });

    for (const label of ["Past 24h", "7 days", "30 days", "90 days", "All time"]) {
      await expect.element(periods.getByRole("button", { name: label })).toBeVisible();
    }
  });

  it("restores account limits as a third usage view", async () => {
    setup({ metric: "limits", windowDays: 30 });
    await using _screen = await renderUsagePage();

    await expect.element(page.getByText("Account usage limits")).toBeVisible();
    await expect
      .element(
        page.getByRole("group", { name: "Usage metric" }).getByRole("button", { name: "Limits" }),
      )
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(page.getByText("Token cost")).not.toBeInTheDocument();
  });

  it("requests the complete history when all time is selected", async () => {
    setup({ metric: "cost", windowDays: "all" });
    await using _screen = await renderUsagePage();

    await expect.element(page.getByText("All device usage")).toBeVisible();
    expect(testState.useUsage).toHaveBeenCalledWith(
      expect.objectContaining({ sinceDay: "1970-01-01", resolution: "day" }),
      null,
      expect.any(Set),
    );
  });

  it("shows the newest days first in the day breakdown", async () => {
    setup();
    await using _screen = await renderUsagePage();

    await userEvent.click(
      page.getByRole("group", { name: "Usage breakdown" }).getByRole("button", { name: "Day" }),
    );
    const region = page.getByRole("region", { name: "Usage breakdown by time" });
    await expect.element(region.getByText("Aug 10")).toBeVisible();
    const rows = region
      .getByRole("row")
      .elements()
      .map((row) => row.textContent ?? "");

    expect(rows.slice(1)).toEqual([
      expect.stringContaining("Aug 11"),
      expect.stringContaining("Aug 10"),
    ]);
  });

  it("keeps the model breakdown ordered by merged usage", async () => {
    setup();
    await using _screen = await renderUsagePage();

    await expect.element(page.getByText("token-heavy-model")).toBeVisible();
    const rows = page
      .getByRole("row")
      .elements()
      .map((row) => row.textContent ?? "");

    expect(rows.slice(1)).toEqual([
      expect.stringContaining("expensive-model"),
      expect.stringContaining("token-heavy-model"),
    ]);
  });
});
