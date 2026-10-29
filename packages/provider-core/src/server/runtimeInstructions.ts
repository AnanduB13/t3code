import { browserToolInstructions } from "./BrowserInstructions.ts";

const WORKSPACE_INSTRUCTIONS = `<workspace_instructions>
Use the current checkout by default. Minor edits, task size, and unrelated dirty files alone do not justify a new worktree. Create one only when the user asks or overlapping work requires isolation; explain the concrete reason first. Reuse a suitable existing checkout before creating another.
When T3 worktree tools are available, use t3_worktree_status then t3_worktree_handoff for this thread, or delegate_task with isolation:"worktree" for a child. Let T3 choose the path under its configured worktree location; do not bypass it with git worktree add or create sibling folders under code. If the tools are unavailable, stay in the existing checkout and report the limitation unless the user explicitly requests manual worktree creation. Do not move or delete existing worktrees without the user's request.
</workspace_instructions>`;

const PULL_REQUEST_LINKING_INSTRUCTIONS = `<pull_request_linking>
Link each PR you create, take over, or push to: one link_pull_request per PR, full URL, every stack layer, as your next call. Host tools do not link for you. If linking fails, say so. Skip PRs you only read or review, and PRs named only as background. Call watch_pull_request when asked to monitor or babysit, or when work you were asked to do, such as a merge, still waits on checks or reviews, even after an earlier unwatch. Finish any needed branch update and push first, then watch and end your turn. Otherwise act now or hand back. Delegated children never watch, even if the brief says babysit. After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>. Links and watches persist across pushes. Never wait with sleep, loops, gh --watch, Monitor, or ScheduleWakeup. Before handback, call unwatch_pull_request on any PR you watch.
</pull_request_linking>`;

/** Omit model and effort when the harness manages them dynamically. */
export function buildRuntimeInstructions(runtime: {
  readonly harness: string;
  readonly browserToolsAvailable?: boolean | undefined;
  readonly model?: string | undefined;
  readonly modelName?: string | undefined;
  readonly reasoningEffort?: string | undefined;
}): string {
  const harness = toSingleLine(runtime.harness);
  const model = toSingleLine(runtime.model ?? "");
  const modelName = toSingleLine(runtime.modelName ?? "");
  const effort = toSingleLine(runtime.reasoningEffort ?? "");
  const modelLabel =
    modelName && modelName !== model ? `${modelName} (model slug: ${model})` : model;
  const modelInfo = model && model !== "auto" && model !== "default" ? `, as ${modelLabel}` : "";
  const effortInfo = effort ? ` with ${effort} reasoning effort` : "";
  return `<runtime_info>In case you're asked: you are running in T3 Code through the ${harness} harness${modelInfo}${effortInfo}. No need to mention this otherwise. You can embed images, video, and audio in your response using Markdown image syntax with absolute file paths. Link any other file you produce using its absolute path so the user can open it in T3 Code's files viewer.</runtime_info>\n\n${WORKSPACE_INSTRUCTIONS}\n\n${PULL_REQUEST_LINKING_INSTRUCTIONS}\n\nFor web research and product recommendations, use available browser or web-search tools to inspect results and relevant source or product pages before answering. A search URL alone does not complete a request to find or compare products unless the user only asked for that URL. Return concrete findings, direct product/source links obtained from the pages or tool results, and useful comparisons grounded in what you inspected. Verify current prices, availability, and relevant variants where accessible; distinguish unverified details and never invent product URLs or claim to have inspected a page you could not access. If a site blocks access, use another available source or research tool and explain any remaining limitation. If no research tools are available, say so instead of presenting a search link as completed research. Respect the user's requested scope and browser choice.
${browserToolInstructions(runtime.browserToolsAvailable ?? false)}`;
}

function toSingleLine(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}
