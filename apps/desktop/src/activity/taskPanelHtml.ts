export const TASK_PANEL_HEADER_HEIGHT = 40;
export const TASK_PANEL_ROW_HEIGHT = 64;
export const TASK_PANEL_MAX_ROWS = 5;

export const taskPanelHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>T3 Code task activity</title><style>
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; overflow: hidden; }
body { color: #f5f5f7; font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; user-select: none; }
button { color: inherit; font: inherit; cursor: pointer; border: 0; }
#panel { background: #080809; border-radius: 0 0 18px 18px; overflow: hidden; }
#summary { width: 100%; height: ${TASK_PANEL_HEADER_HEIGHT}px; display: flex; align-items: center; gap: 9px; padding: 0 18px; background: transparent; text-align: left; }
.dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #83b3ee; }
.dot[data-status="approval"], .dot[data-status="input"] { background: #efbd70; }
.dot[data-status="monitoring"] { background: #aaa6bd; }
#brand { font-weight: 600; white-space: nowrap; }
#counts { margin-left: auto; color: #a2a2aa; font-size: 11px; white-space: nowrap; }
#tasks { padding: 0 10px 8px; max-height: ${TASK_PANEL_MAX_ROWS * TASK_PANEL_ROW_HEIGHT + 8}px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #343436 transparent; }
#panel:not([data-expanded]) #tasks { display: none; }
.task { width: 100%; height: ${TASK_PANEL_ROW_HEIGHT}px; display: flex; gap: 12px; align-items: center; padding: 10px; background: transparent; border-top: 1px solid #242426; text-align: left; border-radius: 9px; }
.copy { min-width: 0; flex: 1; }
.title { display: block; font-weight: 550; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.detail { display: block; color: #a2a2aa; font-size: 11px; margin-top: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.arrow { color: #92929a; }
button:focus-visible { outline: 2px solid #83b3ee; outline-offset: -3px; }
@media (hover: hover) { button:hover { background: #1a1a1d; } }
button:active { background: #242426; }
</style></head><body><main id="panel" aria-label="Background tasks">
<button id="summary" aria-expanded="false" aria-controls="tasks" aria-label="Show running tasks"><span class="dot" id="status"></span><span id="brand">T3 Code</span><span id="counts"></span></button>
<div id="tasks" aria-label="Active threads"></div>
</main></body></html>`;
