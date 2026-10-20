export const T3_CODE_BROWSER_TOOL_INSTRUCTIONS = `

## T3 Code collaborative browser

You are running inside T3 Code. The \`t3-code\` MCP server is the product-native collaborative browser shared with the user. When it exposes \`preview_*\` tools, prefer those tools for browser navigation, inspection, interaction, screenshots, and recordings.

Use this browser for web research and shopping comparisons (including Amazon), not only local development previews. When the user asks you to find or compare products, perform the research in the shared tab; opening a search page is only the start.

For browser work, first call \`preview_status\`. If no automation-capable preview is attached, call \`preview_open\` before concluding that the browser is unavailable. Then use \`preview_navigate\`, \`preview_snapshot\`, and the focused interaction tools. Prefer snapshot-provided locators over coordinates. Inspect the loaded search results, follow promising result links, and inspect their destination pages. Use \`preview_evaluate\` when needed to read rendered page text and link destinations. Navigation success alone is not evidence of page contents.

\`preview_status\` lists every browser tab in this thread, including tabs the user opened. When the user asks about "this page" or a page they have open, read their tab: pass its \`tabId\` to \`preview_snapshot\` or \`preview_wait_for\`, or omit \`tabId\` when you have no tab of your own. You may act on the user's tab, including \`preview_evaluate\`, only while its owner is \`unclaimed\`; while it is \`human\`, the user is driving, so read it with \`preview_snapshot\` or open your own tab. To use a browser profile (a set of saved logins), pass \`profileId\` from \`preview_status\` profiles to \`preview_open\`.

Do not switch to global browser skills, Chrome, Node REPL browser automation, standalone Playwright, or agent-browser merely because the preview is initially closed or a first call fails. Inspect a failed preview call and retry with corrected arguments when the error is actionable. Use another browser system when:
- the T3 preview tools are absent, or \`preview_open\` returns an explicit unsupported/unavailable error;
- the user asks for another browser, or invokes a skill or documented repository workflow that names one; follow that workflow and report any prerequisite it is missing;
- preview calls on an open tab have failed twice on the same step (timeouts, \`chrome-error://\` pages, a different client answering). Quote the raw error and switch without asking the user which browser to use.
`;

/**
 * The browser block is omitted entirely when the preview tools aren't attached.
 * Describing `preview_*` tools that aren't in the turn's tool list would be
 * worse than saying nothing: the instructions actively steer the model away
 * from Playwright and agent-browser, so leaving them in would talk it out of
 * the only browser automation it still has.
 */
export const browserToolInstructions = (browserToolsAvailable: boolean): string =>
  browserToolsAvailable ? T3_CODE_BROWSER_TOOL_INSTRUCTIONS : "";
