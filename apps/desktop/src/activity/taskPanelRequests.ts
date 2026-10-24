// @effect-diagnostics globalTimers:off -- Mirrors the composer's short single-choice advance in a sandboxed preload.
import type {
  DesktopTask,
  DesktopTaskRequestTarget,
  DesktopTaskResponse,
  DesktopTaskResponseResult,
} from "@t3tools/contracts";
import {
  DEFAULT_APPROVAL_OPTIONS,
  taskRequestKey,
  taskRequests,
} from "@t3tools/shared/desktopTaskRequests";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "@t3tools/shared/pendingUserInput";
import { formatTaskElapsed } from "./taskPanelState.ts";

interface RequestDraft {
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  responding: boolean;
  error: string | null;
  sent: boolean;
  failureId?: string;
}

/** Renders the composer's questions inside the isolated panel, sharing its answer semantics. */
export function createTaskPanelRequests(options: {
  container: HTMLElement;
  projectIcon: (task: DesktopTask) => HTMLElement;
  modelIcon: (task: DesktopTask) => HTMLElement;
  onShowRequest: (target: DesktopTaskRequestTarget) => void;
  onRespond: (response: DesktopTaskResponse) => void;
  onLater: () => void;
  onOpen: (task: DesktopTask) => void;
}) {
  const { container } = options;
  const drafts = new Map<string, RequestDraft>();
  let entries: ReturnType<typeof taskRequests> = [];
  let active: ReturnType<typeof taskRequests>[number] | undefined;
  let previousContent = "";
  let previousQueue = "";
  let previousContext = "";
  let autoAdvance: ReturnType<typeof setTimeout> | undefined;
  let optionButtons: HTMLButtonElement[] = [];
  let clockNow = 0;

  const cancelAdvance = () => {
    if (autoAdvance !== undefined) clearTimeout(autoAdvance);
    autoAdvance = undefined;
  };
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text: string, className: string, onClick: () => void) => {
    const node = element("button", className, text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };
  const getDraft = (target: DesktopTaskRequestTarget) => {
    const key = taskRequestKey(target);
    let draft = drafts.get(key);
    if (!draft) {
      draft = { answers: {}, questionIndex: 0, responding: false, error: null, sent: false };
      drafts.set(key, draft);
    }
    return draft;
  };

  function submit(response: DesktopTaskResponse) {
    const draft = getDraft(response);
    if (draft.responding || active?.request.responseUnavailableReason !== undefined) return;
    cancelAdvance();
    draft.responding = true;
    draft.error = null;
    draft.sent = false;
    draw();
    options.onRespond(response);
  }

  function renderFooter() {
    const { task, target } = active!;
    const footer = element("div", "request-footer");
    const index = entries.findIndex(
      (entry) => taskRequestKey(entry.target) === taskRequestKey(target),
    );
    const navigation = element("span", "request-navigation");
    if (entries.length > 1) {
      const previous = button("‹", "request-link", () => {
        cancelAdvance();
        options.onShowRequest(entries[(index - 1 + entries.length) % entries.length]!.target);
      });
      previous.setAttribute("aria-label", "Previous request");
      const next = button("›", "request-link", () => {
        cancelAdvance();
        options.onShowRequest(entries[(index + 1) % entries.length]!.target);
      });
      next.setAttribute("aria-label", "Next request");
      navigation.append(
        previous,
        element("span", "", `${index + 1} of ${entries.length} requests`),
        next,
      );
    } else navigation.append(element("span", "", "Waiting for you"));
    const links = element("span", "request-navigation");
    links.append(
      button("Open chat ↗", "request-link", () => {
        cancelAdvance();
        options.onOpen(task);
      }),
      button("Later", "request-link", () => {
        cancelAdvance();
        options.onLater();
      }),
    );
    footer.append(navigation, links);
    return footer;
  }

  function renderContext(task: DesktopTask) {
    const context = element("div", "request-context");
    const copy = element("div", "copy");
    const title = element("span", "title", task.title);
    title.title = task.title;
    const project = element("span", "detail", task.project);
    project.title = task.project;
    copy.append(title, project);
    const model = element("div", "request-model");
    const modelName = element("span", "model", task.model ?? "Model unavailable");
    modelName.title = task.model ?? "Model unavailable";
    const modelIdentity = element("span", "request-model-identity");
    modelIdentity.append(options.modelIcon(task), modelName);
    model.append(
      modelIdentity,
      element(
        "span",
        "elapsed request-elapsed",
        clockNow ? formatTaskElapsed(task, clockNow) : "—",
      ),
    );
    context.append(options.projectIcon(task), copy, model);
    return context;
  }

  function draw() {
    cancelAdvance();
    optionButtons = [];
    if (!active) return;
    const { task, request, target } = active;
    const draft = getDraft(target);
    const card = element("section", "request-card");
    card.setAttribute("aria-label", "Agent needs your input");
    card.append(renderContext(task));
    const body = element("div", "request-body");
    const fieldset = element("fieldset", "request-fields");
    const unavailable = request.responseUnavailableReason !== undefined;
    fieldset.disabled = draft.responding || unavailable;
    const actions = element("div", "request-actions");
    const status = element(
      "p",
      "request-status",
      request.responseUnavailableReason ??
        draft.error ??
        (draft.responding ? "Sending…" : draft.sent ? "Sent. Waiting for the agent…" : ""),
    );
    status.setAttribute("role", draft.error ? "alert" : "status");
    status.toggleAttribute("data-error", draft.error !== null);

    if (request.kind === "input") {
      const progress = derivePendingUserInputProgress(
        request.questions,
        draft.answers,
        draft.questionIndex,
      );
      const question = progress.activeQuestion;
      if (!question) return;
      draft.questionIndex = progress.questionIndex;
      const heading = element("div", "request-question-header");
      heading.append(
        element("span", "", question.header),
        element("span", "", `${progress.questionIndex + 1} of ${request.questions.length}`),
      );
      const questionText = element("h2", "request-question", question.question);
      questionText.id = "request-question";
      fieldset.setAttribute("aria-labelledby", questionText.id);
      fieldset.append(heading, questionText);
      if (question.multiSelect)
        fieldset.append(element("p", "request-hint", "Select one or more options."));
      const advance = () => {
        cancelAdvance();
        const current = derivePendingUserInputProgress(
          request.questions,
          draft.answers,
          draft.questionIndex,
        );
        if (!current.canAdvance || draft.responding || unavailable) return;
        if (current.isLastQuestion) {
          const answers = buildPendingUserInputAnswers(request.questions, draft.answers);
          if (answers) submit({ ...target, kind: "input", answers });
        } else {
          draft.questionIndex++;
          draw();
          container.querySelector<HTMLElement>(".request-option, .request-custom")?.focus();
        }
      };
      const next = button(
        progress.isLastQuestion ? "Send answer" : "Next →",
        "request-button request-primary",
        advance,
      );
      const updateSelection = () => {
        const current = derivePendingUserInputProgress(
          request.questions,
          draft.answers,
          draft.questionIndex,
        );
        optionButtons.forEach((node, index) => {
          const option = question.options[index]!;
          node.setAttribute(
            "aria-checked",
            String(
              !current.usingCustomAnswer &&
                current.selectedOptionValues.includes(option.value ?? option.label),
            ),
          );
        });
        next.disabled = draft.responding || unavailable || !current.canAdvance;
      };
      const choices = element("div", "request-options");
      choices.setAttribute("role", "group");
      choices.setAttribute(
        "aria-label",
        question.multiSelect ? "Select one or more answers" : "Choose an answer",
      );
      const custom = element("textarea", "request-custom");
      custom.rows = 2;
      custom.placeholder = question.options.length
        ? "Or type your own answer…"
        : "Type your answer…";
      custom.setAttribute("aria-label", "Your answer");
      custom.value = progress.customAnswer;
      question.options.forEach((option, index) => {
        const choice = button("", "request-option", () => {
          cancelAdvance();
          draft.answers[question.id] = togglePendingUserInputOptionSelection(
            question,
            draft.answers[question.id],
            option.value ?? option.label,
          );
          custom.value = "";
          updateSelection();
          if (!question.multiSelect) autoAdvance = setTimeout(advance, 200);
        });
        choice.setAttribute("role", "checkbox");
        const optionCopy = element("span", "copy");
        optionCopy.append(element("span", "request-option-label", option.label));
        if (option.description)
          optionCopy.append(element("span", "request-option-description", option.description));
        const check = element("span", "request-check", "✓");
        check.setAttribute("aria-hidden", "true");
        choice.append(
          optionCopy,
          element("kbd", "request-shortcut", index < 9 ? String(index + 1) : ""),
          check,
        );
        optionButtons.push(choice);
        choices.append(choice);
      });
      fieldset.append(choices);
      if (question.allowCustomAnswer !== false) {
        custom.addEventListener("input", () => {
          cancelAdvance();
          draft.answers[question.id] = setPendingUserInputCustomAnswer(
            draft.answers[question.id],
            custom.value,
            question,
          );
          updateSelection();
        });
        custom.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) {
            event.preventDefault();
            advance();
          }
        });
        fieldset.append(custom);
      }
      if (progress.questionIndex > 0) {
        actions.append(
          button("Back", "request-button", () => {
            draft.questionIndex--;
            draw();
          }),
        );
      }
      if (request.dismissible)
        actions.append(
          button("Dismiss question", "request-button", () =>
            submit({ ...target, kind: "dismiss" }),
          ),
        );
      actions.append(next);
      updateSelection();
    } else {
      const labels = {
        command: "Command approval",
        "file-read": "File read approval",
        "file-change": "File change approval",
        "mcp-elicitation": "App access approval",
        "computer-use": "Computer use approval",
        permission: "App permission approval",
      };
      fieldset.append(element("h2", "request-question", labels[request.requestKind]));
      if (request.appName) fieldset.append(element("p", "request-hint", request.appName));
      const detail = element(
        request.requestKind === "mcp-elicitation" ? "p" : "pre",
        "request-approval-detail",
        request.detail ?? labels[request.requestKind],
      );
      detail.tabIndex = 0;
      fieldset.append(detail);
      const approvalOptions = request.options ?? DEFAULT_APPROVAL_OPTIONS;
      for (const option of approvalOptions) {
        if (option.warning)
          fieldset.append(element("p", "request-warning", `${option.label}: ${option.warning}`));
        const action = button(
          option.label,
          `request-button${option.decision === "accept" ? " request-primary" : ""}`,
          () => submit({ ...target, kind: "approval", decision: option.decision }),
        );
        if (option.warning) action.setAttribute("aria-description", option.warning);
        actions.append(action);
      }
    }
    for (const control of actions.querySelectorAll("button"))
      if (draft.responding || unavailable) control.disabled = true;
    body.append(fieldset);
    card.append(body, status, actions);
    container.replaceChildren(card, renderFooter());
  }

  return {
    updateClock(now: number) {
      clockNow = now;
      const clock = container.querySelector(".request-elapsed");
      if (clock && active) clock.textContent = formatTaskElapsed(active.task, now);
    },
    render(tasks: readonly DesktopTask[], target: DesktopTaskRequestTarget | null) {
      entries = taskRequests(tasks);
      const keys = new Set(entries.map((entry) => taskRequestKey(entry.target)));
      for (const key of drafts.keys()) if (!keys.has(key)) drafts.delete(key);
      active = target
        ? entries.find((entry) => taskRequestKey(entry.target) === taskRequestKey(target))
        : undefined;
      container.toggleAttribute("data-request", !!active);
      if (!active) {
        cancelAdvance();
        previousContent = "";
        return false;
      }
      // Clock and shell updates must leave text, selection, scroll, and focus intact.
      const { task, request } = active;
      const draft = getDraft(active.target);
      if (request.kind === "input") {
        for (const question of request.questions) {
          if (
            question.initialAnswer !== undefined &&
            question.allowCustomAnswer !== false &&
            draft.answers[question.id] === undefined
          )
            draft.answers[question.id] = { customAnswer: question.initialAnswer };
        }
      }
      if (request.responseFailure && draft.failureId !== request.responseFailure.activityId) {
        draft.failureId = request.responseFailure.activityId;
        draft.error = request.responseFailure.message;
        draft.responding = false;
        draft.sent = false;
      }
      const content = JSON.stringify([active.target, request]);
      const context = JSON.stringify([
        task.title,
        task.project,
        task.projectIcon,
        task.model,
        task.modelIcon,
      ]);
      const queue = JSON.stringify([...keys]);
      if (content !== previousContent) {
        previousContent = content;
        draw();
      } else {
        if (queue !== previousQueue)
          container.querySelector(".request-footer")?.replaceWith(renderFooter());
        if (context !== previousContext)
          container.querySelector(".request-context")?.replaceWith(renderContext(task));
      }
      previousQueue = queue;
      previousContext = context;
      return true;
    },
    result(result: DesktopTaskResponseResult) {
      const draft = drafts.get(taskRequestKey(result));
      if (!draft || (result.error === null && !draft.responding && draft.error)) return;
      draft.responding = false;
      draft.error = result.error;
      draft.sent = result.error === null;
      if (active && taskRequestKey(active.target) === taskRequestKey(result)) draw();
    },
    keydown(event: KeyboardEvent) {
      if (!active || event.isComposing) return;
      if (event.key === "Escape") {
        cancelAdvance();
        options.onLater();
        return;
      }
      if (event.key === "Tab") {
        const controls = [
          ...container.querySelectorAll<HTMLElement>(
            "button:not(:disabled), textarea:not(:disabled), [tabindex='0']",
          ),
        ];
        const first = controls[0];
        const last = controls.at(-1);
        if (
          first &&
          last &&
          event.shiftKey &&
          (document.activeElement === first || !container.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          first &&
          last &&
          !event.shiftKey &&
          (document.activeElement === last || !container.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          (event.target.matches("input, textarea") || event.target.isContentEditable))
      )
        return;
      const index = Number(event.key) - 1;
      const choice = /^[1-9]$/.test(event.key) ? optionButtons[index] : undefined;
      if (choice && !choice.disabled && !getDraft(active.target).responding) {
        event.preventDefault();
        choice.click();
      }
    },
    dispose: cancelAdvance,
  };
}
