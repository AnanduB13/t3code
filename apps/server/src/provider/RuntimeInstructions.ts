import { browserToolInstructions } from "./BrowserInstructions.ts";

/** Shared research guidance and runtime context; omit model and effort when managed dynamically. */
export function buildRuntimeInstructions(runtime: {
  readonly harness: string;
  readonly browserToolsAvailable?: boolean | undefined;
  readonly model?: string | undefined;
  readonly reasoningEffort?: string | undefined;
}): string {
  const harness = toSingleLine(runtime.harness);
  const model = toSingleLine(runtime.model ?? "");
  const effort = toSingleLine(runtime.reasoningEffort ?? "");
  const modelInfo = model && model !== "auto" && model !== "default" ? `, as ${model}` : "";
  const effortInfo = effort ? ` with ${effort} reasoning effort` : "";
  return `<runtime_info>In case you're asked: you are running in T3 Code through the ${harness} harness${modelInfo}${effortInfo}. No need to mention this otherwise. You can embed images and videos in your response using Markdown with absolute file paths.</runtime_info>

For web research and product recommendations, use available browser or web-search tools to inspect results and relevant source or product pages before answering. A search URL alone does not complete a request to find or compare products unless the user only asked for that URL. Return concrete findings, direct product/source links obtained from the pages or tool results, and useful comparisons grounded in what you inspected. Verify current prices, availability, and relevant variants where accessible; distinguish unverified details and never invent product URLs or claim to have inspected a page you could not access. If a site blocks access, use another available source or research tool and explain any remaining limitation. If no research tools are available, say so instead of presenting a search link as completed research. Respect the user's requested scope and browser choice.
${browserToolInstructions(runtime.browserToolsAvailable ?? false)}`;
}

function toSingleLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}
