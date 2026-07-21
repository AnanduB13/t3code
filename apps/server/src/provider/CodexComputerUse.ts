export const CODEX_COMPUTER_USE_PLUGIN_REFERENCE =
  "[@T3 Computer Use](plugin://t3-computer-use@personal)";

const COMPUTER_USE_NAME_PATTERN = String.raw`computer[\s-]+use`;
const COMPUTER_USE_ACTION_PATTERN = String.raw`open|launch|control|operate|click|type|navigate|interact|send|change|test|inspect|drive`;
const COMPUTER_USE_REQUEST_REGEX = new RegExp(
  String.raw`(?:\b(?:use|using|with|via|through|ask|have|let)\b[\s\S]{0,48}\b${COMPUTER_USE_NAME_PATTERN}\b|\b${COMPUTER_USE_NAME_PATTERN}\b[\s\S]{0,96}\b(?:${COMPUTER_USE_ACTION_PATTERN})\b)`,
  "i",
);
const NATIVE_GUI_REQUEST_REGEX =
  /\b(?:open|launch|control|operate|drive|interact with|test|inspect|navigate|click in|type in|send (?:a )?message (?:in|with))\b[\s\S]{0,72}\b(?:desktop app|native app|macOS app|Windows app|Settings app|System Settings|ChatGPT app|Codex app|application window)\b/i;
const SETTINGS_REQUEST_REGEX =
  /\b(?:open|launch|use)\s+(?:the\s+)?(?:System\s+)?Settings\b[\s\S]{0,96}\b(?:enable|disable|change|select|turn|set|click)\b/i;
const COMPUTER_MENTION_REGEX = /(^|\s)@Computer(?=\s|$)/i;
const COMPUTER_COMMAND_REGEX = /^\s*\/computer(?:\s+([\s\S]*?))?\s*$/i;

export function prepareCodexInputForComputerUse(input: string): string {
  if (input.includes(CODEX_COMPUTER_USE_PLUGIN_REFERENCE)) {
    return input;
  }

  const commandMatch = COMPUTER_COMMAND_REGEX.exec(input);
  if (commandMatch) {
    const task = (commandMatch[1] ?? "").trim();
    return task
      ? `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} ${task}`
      : `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} Ask what desktop task to perform.`;
  }

  if (
    !COMPUTER_MENTION_REGEX.test(input) &&
    !COMPUTER_USE_REQUEST_REGEX.test(input) &&
    !NATIVE_GUI_REQUEST_REGEX.test(input) &&
    !SETTINGS_REQUEST_REGEX.test(input)
  ) {
    return input;
  }

  return `${CODEX_COMPUTER_USE_PLUGIN_REFERENCE} ${input}`;
}
