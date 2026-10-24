export const TASK_PANEL_HEADER_HEIGHT = 40;
export const TASK_PANEL_ROW_HEIGHT = 64;
export const TASK_PANEL_ROW_GAP = 6;
export const TASK_PANEL_MAX_ROWS = 5;

export interface TaskPanelMetrics {
  headerHeight: number;
  notchWidth: number;
  compactWidth: number;
  width: number;
  height: number;
}

export const taskPanelHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>T3 Code task activity</title><style>
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; overflow: hidden; }
body { color: #f5f5f7; font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; user-select: none; }
button { color: inherit; font: inherit; cursor: pointer; border: 0; }
#panel { position: relative; left: 50%; transform: translateX(-50%); width: var(--panel-width, 400px); display: flex; flex-direction: column; height: var(--panel-height, ${TASK_PANEL_HEADER_HEIGHT}px); background: #000; border-radius: 0 0 22px 22px; overflow: hidden; clip-path: inset(0 calc((var(--panel-width, 400px) - var(--compact-width, 240px)) / 2) calc(var(--panel-height, ${TASK_PANEL_HEADER_HEIGHT}px) - var(--header-height, ${TASK_PANEL_HEADER_HEIGHT}px)) round 0 0 18px 18px); }
#panel[data-motion-ready] { transition: clip-path 180ms cubic-bezier(0.22, 1, 0.36, 1); }
#panel[data-expanded] { clip-path: inset(0 0 0 0 round 0 0 22px 22px); transition-duration: 260ms; }
#summary { align-self: center; width: var(--compact-width, 240px); height: var(--header-height, ${TASK_PANEL_HEADER_HEIGHT}px); flex-shrink: 0; display: grid; grid-template-columns: minmax(0, 1fr) var(--notch-width, 0px) minmax(0, 1fr); align-items: center; padding: 0 12px; background: transparent; text-align: left; }
#panel[data-expanded] #summary { width: 100%; padding: 0 20px; }
#identity, #metadata { position: relative; height: 100%; min-width: 0; overflow: hidden; }
.summary-identity, .summary-metadata { position: absolute; inset: 0; display: flex; align-items: center; gap: 6px; min-width: 0; }
.summary-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 11px; font-weight: 560; white-space: nowrap; }
.summary-metadata { justify-content: flex-end; gap: 6px; padding-left: 6px; }
.app-icon { width: 20px; height: 20px; flex-shrink: 0; display: grid; place-items: center; color: #b4b4bd; font-size: 9px; }
.app-icon img { width: 100%; height: 100%; object-fit: contain; }
.app-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; font-weight: 560; }
.task-count { color: #96969f; font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.model { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #96969f; font-size: 10.5px; white-space: nowrap; }
.elapsed { flex-shrink: 0; color: #51a2ff; font-size: 11.5px; font-weight: 550; font-variant-numeric: tabular-nums; white-space: nowrap; }
.model-icon { width: 14px; height: 14px; flex-shrink: 0; display: grid; place-items: center; color: #b4b4bd; font-size: 14px; line-height: 1; }
.model-icon img { width: 100%; height: 100%; object-fit: contain; }
.timing { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
#tasks { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: ${TASK_PANEL_ROW_GAP}px; padding: 8px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #343436 transparent; opacity: 0; transform: translateY(-6px); pointer-events: none; transition: opacity 120ms ease-out, transform 180ms cubic-bezier(0.22, 1, 0.36, 1); }
#panel[data-expanded] #tasks { opacity: 1; transform: translateY(0); pointer-events: auto; transition-duration: 180ms, 260ms; }
.task { width: 100%; height: ${TASK_PANEL_ROW_HEIGHT}px; flex-shrink: 0; display: flex; gap: 12px; align-items: center; padding: 0 14px; background: #111113; text-align: left; border-radius: 14px; transition: background-color 120ms ease-out, transform 140ms cubic-bezier(0.2, 0, 0, 1); }
.project-icon { position: relative; width: 16px; height: 16px; flex-shrink: 0; display: grid; place-items: center; overflow: hidden; border-radius: 4px; background: #20232a; color: #bad6f5; font-size: 8px; font-weight: 650; }
.project-icon img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.task .project-icon { width: 32px; height: 32px; border-radius: 8px; font-size: 12px; }
.task[data-status="approval"] .detail, .task[data-status="input"] .detail { color: #c6a471; }
.task-metadata { flex-shrink: 0; max-width: 140px; text-align: right; }
.task-metadata .model { margin-top: 4px; }
.copy { min-width: 0; flex: 1; }
.title { display: block; font-size: 12.5px; font-weight: 560; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.detail { display: block; color: #96969f; font-size: 11px; margin-top: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
button:focus-visible { outline: 2px solid #83b3ee; outline-offset: -3px; }
#tasks[data-request] { gap: 0; }
.request-card { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; border-radius: 14px; background: #111113; }
.request-context { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-shrink: 0; }
.request-context .project-icon { width: 32px; height: 32px; border-radius: 8px; font-size: 12px; }
.request-model { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 130px; min-width: 0; }
.request-model-identity { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.request-body { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; scrollbar-color: #343436 transparent; }
.request-fields { min-width: 0; margin: 0; padding: 0; border: 0; }
.request-question-header { display: flex; justify-content: space-between; gap: 12px; color: #96969f; font-size: 11px; margin-bottom: 7px; }
.request-question-header > :first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.request-question-header > :last-child { flex-shrink: 0; }
.request-question { margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; font-weight: 550; white-space: pre-wrap; overflow-wrap: anywhere; }
.request-hint { margin: 0 0 10px; color: #96969f; font-size: 11px; }
.request-options { display: flex; flex-direction: column; gap: 2px; }
.request-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; text-align: left; background: transparent; border-radius: 6px; transition: background-color 150ms ease-out; }
.request-option[aria-checked="true"] { background: #28282d; }
.request-shortcut { display: grid; place-items: center; width: 20px; height: 20px; flex-shrink: 0; color: #96969f; font: inherit; font-size: 10px; }
.request-option-label { font-size: 12px; overflow-wrap: anywhere; }
.request-option-description { display: block; color: #96969f; font-size: 11px; margin-top: 3px; white-space: pre-wrap; overflow-wrap: anywhere; }
.request-check { color: #f4f4f5; display: none; width: 20px; text-align: center; flex-shrink: 0; }
.request-option[aria-checked="true"] .request-check { display: block; }
.request-option[aria-checked="true"] .request-shortcut { display: none; }
.request-custom { width: 100%; min-height: 62px; margin-top: 12px; padding: 10px; resize: vertical; border: 1px solid #303034; border-radius: 7px; background: #18181b; color: inherit; font: inherit; user-select: text; }
.request-custom:focus-visible { outline: 2px solid #83b3ee; outline-offset: -2px; }
.request-custom::placeholder { color: #73737d; }
.request-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-top: 12px; flex-shrink: 0; }
.request-button { padding: 7px 11px; border: 1px solid #343438; border-radius: 7px; background: transparent; font-size: 11.5px; }
.request-primary { margin-left: auto; background: #f4f4f5; color: #18181b; border-color: transparent; }
.request-button:active { transform: scale(0.96); }
.request-card button:disabled, .request-card fieldset:disabled { opacity: 0.5; cursor: default; }
.request-status { margin: 8px 0 0; color: #96969f; font-size: 11px; overflow-wrap: anywhere; }
.request-status:empty { display: none; }
.request-status[data-error] { color: #f4a5a5; }
.request-approval-detail { margin: 0; color: #f4f4f5; font-size: 11.5px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.request-warning { font-size: 11px; color: #e3b875; white-space: pre-wrap; overflow-wrap: anywhere; }
.request-footer { display: flex; justify-content: space-between; gap: 12px; padding: 8px 4px 0; flex-shrink: 0; color: #96969f; font-size: 11px; }
.request-navigation { display: flex; align-items: center; gap: 8px; }
.request-link { padding: 4px; background: transparent; color: #96969f; font-size: 11px; }
@media (hover: hover) { .request-option:hover { background: #1c1c20; } .request-link:hover { color: #f4f4f5; } .request-button:not(.request-primary):hover { background: #242428; } }
@media (hover: hover) { .task:hover { background: #1c1c20; } }
.task:active { background: #242428; transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) { #panel[data-motion-ready], #tasks { transition: none; } .task { transition: background-color 120ms ease-out; } .task:active, .request-button:active { transform: none; } }
</style></head><body><main id="panel" aria-label="Background tasks">
<button id="summary" aria-expanded="false" aria-controls="tasks" aria-label="Show running tasks"><span id="identity"></span><span aria-hidden="true"></span><span id="metadata"></span></button>
<div id="tasks" aria-label="Active threads"></div>
</main></body></html>`;
