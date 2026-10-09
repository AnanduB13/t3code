import { describe, expect, it } from "vite-plus/test";
import {
  advanceWorkingStatusLabelState,
  workingStatusLabel,
  type WorkingStatusLabelState,
} from "./workingStatusLabel";

const initialState: WorkingStatusLabelState = {
  threadKey: "thread-1",
  turnId: null,
  working: false,
  labelIndex: null,
};

describe("working status label lifecycle", () => {
  it("keeps one label for the entire generation", () => {
    const started = advanceWorkingStatusLabelState(initialState, {
      threadKey: "thread-1",
      turnId: "turn-1",
      working: true,
    });
    const rerendered = advanceWorkingStatusLabelState(started, {
      threadKey: "thread-1",
      turnId: "turn-1",
      working: true,
    });

    expect(rerendered).toEqual(started);
    expect(workingStatusLabel(rerendered)).toBe(workingStatusLabel(started));
  });

  it("adopts a delayed server turn id without changing the optimistic label", () => {
    const optimistic = advanceWorkingStatusLabelState(initialState, {
      threadKey: "thread-1",
      turnId: null,
      working: true,
    });
    const adopted = advanceWorkingStatusLabelState(optimistic, {
      threadKey: "thread-1",
      turnId: "turn-1",
      working: true,
    });

    expect(adopted.turnId).toBe("turn-1");
    expect(workingStatusLabel(adopted)).toBe(workingStatusLabel(optimistic));
  });

  it("chooses a different label for the next generation", () => {
    const first = advanceWorkingStatusLabelState(initialState, {
      threadKey: "thread-1",
      turnId: "turn-1",
      working: true,
    });
    const stopped = advanceWorkingStatusLabelState(first, {
      threadKey: "thread-1",
      turnId: "turn-1",
      working: false,
    });
    const second = advanceWorkingStatusLabelState(stopped, {
      threadKey: "thread-1",
      turnId: "turn-2",
      working: true,
    });

    expect(workingStatusLabel(second)).not.toBe(workingStatusLabel(first));
  });

  it("also advances when queued turns switch without an idle render", () => {
    const first = advanceWorkingStatusLabelState(initialState, {
      threadKey: "thread-1",
      turnId: "turn-1",
      working: true,
    });
    const second = advanceWorkingStatusLabelState(first, {
      threadKey: "thread-1",
      turnId: "turn-2",
      working: true,
    });

    expect(workingStatusLabel(second)).not.toBe(workingStatusLabel(first));
  });
});
