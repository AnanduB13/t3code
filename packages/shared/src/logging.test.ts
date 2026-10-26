// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import * as HostProcess from "./HostProcess.ts";

import {
  RotatingFileSink,
  RotatingFileSinkConfigurationError,
  RotatingFileSinkError,
  makeAsyncRotatingFileSink,
} from "./logging.ts";

const windowsHost = HostProcess.Platform.defaultValue() === "win32";
const tempDirectories: string[] = [];

const makeTempDirectory = (): string => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-logging-"));
  tempDirectories.push(directory);
  return directory;
};

const captureError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (cause) {
    return cause;
  }
  throw new Error("Expected operation to throw");
};

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

effectIt.layer(NodeServices.layer)("asynchronous rotating file sink", (it) => {
  it.effect("serializes concurrent appends across rotation and resumes an existing file", () =>
    Effect.gen(function* () {
      const directory = makeTempDirectory();
      const filePath = NodePath.join(directory, "async.log");
      NodeFS.writeFileSync(`${filePath}.50`, "obsolete");
      const lines = Array.from(
        { length: 100 },
        (_, index) => `${index.toString().padStart(3, "0")}\n`,
      );
      const sink = yield* makeAsyncRotatingFileSink({ filePath, maxBytes: 32, maxFiles: 20 });
      yield* Effect.forEach(lines, (line) => sink.write(line), {
        concurrency: "unbounded",
        discard: true,
      });
      const resumed = yield* makeAsyncRotatingFileSink({ filePath, maxBytes: 32, maxFiles: 20 });
      yield* resumed.write("100\n");
      expect(NodeFS.existsSync(`${filePath}.50`)).toBe(false);
      const backups = NodeFS.readdirSync(directory)
        .filter((name) => name.startsWith("async.log."))
        .sort((a, b) => Number(b.slice(10)) - Number(a.slice(10)));
      const contents = [...backups, "async.log"].map((name) =>
        NodeFS.readFileSync(NodePath.join(directory, name), "utf8"),
      );
      expect(contents.every((chunk) => Buffer.byteLength(chunk) <= 32)).toBe(true);
      expect(contents.join("")).toBe(lines.join("") + "100\n");
    }),
  );

  it.effect("reports a failed append and recovers its size before the next rotation", () =>
    Effect.gen(function* () {
      const directory = makeTempDirectory();
      const filePath = NodePath.join(directory, "recovery.log");
      NodeFS.writeFileSync(filePath, "old\n");
      const fs = yield* FileSystem.FileSystem;
      let attempts = 0;
      const sink = yield* makeAsyncRotatingFileSink({ filePath, maxBytes: 8, maxFiles: 2 }).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          writeFile: (path, bytes, options) =>
            ++attempts === 1
              ? fs.writeFile(directory, bytes, options)
              : fs.writeFile(path, bytes, options),
        }),
      );
      const failed = yield* sink.write("new\n").pipe(Effect.result);
      expect(failed._tag).toBe("Failure");
      if (failed._tag === "Failure") expect(failed.failure.operation).toBe("write");
      yield* sink.write("new\n");
      yield* sink.write("end\n");
      expect(NodeFS.readFileSync(`${filePath}.1`, "utf8")).toBe("old\nnew\n");
      expect(NodeFS.readFileSync(filePath, "utf8")).toBe("end\n");
    }),
  );

  it.effect("keeps every backup across rotations and restarts when keepForever is enabled", () =>
    Effect.gen(function* () {
      const directory = makeTempDirectory();
      const filePath = NodePath.join(directory, "forever.log");
      NodeFS.writeFileSync(`${filePath}.50`, "older\n");
      const options = { filePath, maxBytes: 4, maxFiles: 1, keepForever: true };
      const sink = yield* makeAsyncRotatingFileSink(options);
      for (const line of ["aaa\n", "bbb\n", "ccc\n"]) yield* sink.write(line);
      const resumed = yield* makeAsyncRotatingFileSink(options);
      yield* resumed.write("ddd\n");
      expect(NodeFS.readFileSync(`${filePath}.50`, "utf8")).toBe("older\n");
      const backups = NodeFS.readdirSync(directory)
        .filter((name) => name.startsWith("forever.log.") && name !== "forever.log.50")
        .map((name) => NodeFS.readFileSync(NodePath.join(directory, name), "utf8"))
        .sort();
      expect(backups).toEqual(["aaa\n", "bbb\n", "ccc\n"]);
      expect(NodeFS.readFileSync(filePath, "utf8")).toBe("ddd\n");
    }),
  );
});

describe("RotatingFileSink", () => {
  it("keeps every backup across rotations and restarts when keepForever is enabled", () => {
    const directory = makeTempDirectory();
    const filePath = NodePath.join(directory, "log.ndjson");
    NodeFS.writeFileSync(`${filePath}.1`, "recent legacy backup");
    NodeFS.writeFileSync(`${filePath}.99`, "older legacy backup");
    const options = { filePath, maxBytes: 1, maxFiles: 1, keepForever: true };
    const sink = new RotatingFileSink(options);
    sink.write("a");
    sink.write("b");
    sink.write("c");

    const restarted = new RotatingFileSink(options);
    restarted.write("d");

    expect(NodeFS.readFileSync(`${filePath}.1`, "utf8")).toBe("recent legacy backup");
    expect(NodeFS.readFileSync(`${filePath}.99`, "utf8")).toBe("older legacy backup");
    expect(NodeFS.readFileSync(`${filePath}.100`, "utf8")).toBe("a");
    expect(NodeFS.readFileSync(`${filePath}.101`, "utf8")).toBe("b");
    expect(NodeFS.readFileSync(`${filePath}.102`, "utf8")).toBe("c");
    expect(NodeFS.readFileSync(filePath, "utf8")).toBe("d");
  });

  it.each([
    { option: "maxBytes" as const, maxBytes: 0, maxFiles: 1 },
    { option: "maxFiles" as const, maxBytes: 1, maxFiles: 0 },
  ])("reports invalid $option configuration structurally", (input) => {
    const thrown = captureError(
      () =>
        new RotatingFileSink({
          filePath: "/unused/log.ndjson",
          maxBytes: input.maxBytes,
          maxFiles: input.maxFiles,
        }),
    );

    expect(thrown).toBeInstanceOf(RotatingFileSinkConfigurationError);
    expect(thrown).toMatchObject({
      option: input.option,
      received: 0,
      minimum: 1,
    });
    expect((thrown as Error).message).toBe(`${input.option} must be >= 1 (received 0)`);
  });

  it("preserves directory initialization failures", () => {
    const directory = makeTempDirectory();
    const parentFile = NodePath.join(directory, "not-a-directory");
    const filePath = NodePath.join(parentFile, "log.ndjson");
    NodeFS.writeFileSync(parentFile, "occupied");

    const thrown = captureError(() => new RotatingFileSink({ filePath, maxBytes: 1, maxFiles: 1 }));

    expect(thrown).toBeInstanceOf(RotatingFileSinkError);
    expect(thrown).toMatchObject({ operation: "initialize", filePath });
    expect((thrown as RotatingFileSinkError).cause).toBeInstanceOf(Error);
  });

  // An over-long name is the one stat failure that is neither ENOENT nor a
  // permission problem on posix. Windows reports it as ENOENT, so the sink
  // correctly treats it as an absent file and there is nothing to assert.
  it.skipIf(windowsHost)("only treats a missing log file as an empty current size", () => {
    const directory = makeTempDirectory();
    const filePath = NodePath.join(directory, "a".repeat(300));

    const thrown = captureError(() => new RotatingFileSink({ filePath, maxBytes: 1, maxFiles: 1 }));

    expect(thrown).toBeInstanceOf(RotatingFileSinkError);
    expect(thrown).toMatchObject({ operation: "read", filePath });
    expect((thrown as RotatingFileSinkError).cause).toMatchObject({ code: "ENAMETOOLONG" });
  });

  it("starts an absent log file at zero bytes", () => {
    const directory = makeTempDirectory();
    const filePath = NodePath.join(directory, "log.ndjson");
    const sink = new RotatingFileSink({ filePath, maxBytes: 100, maxFiles: 1 });

    sink.write("entry");

    expect(NodeFS.readFileSync(filePath, "utf8")).toBe("entry");
  });

  it("preserves write failures", () => {
    const directory = makeTempDirectory();
    const filePath = NodePath.join(directory, "log.ndjson");
    NodeFS.mkdirSync(filePath);
    const sink = new RotatingFileSink({
      filePath,
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxFiles: 1,
      throwOnError: true,
    });

    const thrown = captureError(() => sink.write("entry"));

    expect(thrown).toBeInstanceOf(RotatingFileSinkError);
    expect(thrown).toMatchObject({ operation: "write", filePath });
    expect((thrown as RotatingFileSinkError).cause).toMatchObject({ code: "EISDIR" });
  });

  it("preserves rotation failures without an artificial write wrapper", () => {
    const directory = makeTempDirectory();
    const filePath = NodePath.join(directory, "log.ndjson");
    NodeFS.writeFileSync(filePath, "a");
    NodeFS.mkdirSync(`${filePath}.1`);
    const sink = new RotatingFileSink({
      filePath,
      maxBytes: 1,
      maxFiles: 1,
      throwOnError: true,
    });

    const thrown = captureError(() => sink.write("b"));

    expect(thrown).toBeInstanceOf(RotatingFileSinkError);
    expect(thrown).toMatchObject({ operation: "rotate", filePath });
    expect((thrown as RotatingFileSinkError).cause).toBeInstanceOf(Error);
  });

  it("never reports a rotation failure after successfully appending a chunk", () => {
    const directory = makeTempDirectory();
    const filePath = NodePath.join(directory, "log.ndjson");
    NodeFS.mkdirSync(`${filePath}.1`);
    const sink = new RotatingFileSink({
      filePath,
      maxBytes: 1,
      maxFiles: 1,
      throwOnError: true,
    });

    sink.write("oversized");

    expect(NodeFS.readFileSync(filePath, "utf8")).toBe("oversized");
    const thrown = captureError(() => sink.write("next"));
    expect(thrown).toMatchObject({ operation: "rotate", filePath });
    expect(NodeFS.readFileSync(filePath, "utf8")).toBe("oversized");
  });
});
