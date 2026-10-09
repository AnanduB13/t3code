import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const FinderWorkspacePage = lazy(async () => {
  const module = await import("../components/finder/FinderWorkspacePage");
  return { default: module.FinderWorkspacePage };
});

export const Route = createFileRoute("/finder")({
  component: () => (
    <Suspense
      fallback={
        <main className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
          Opening Finder…
        </main>
      }
    >
      <FinderWorkspacePage />
    </Suspense>
  ),
});
