import { tmpdir } from "node:os";
import { join } from "node:path";
import { UdsIpcServer } from "./uds_server.js";
import { type HostCallTarget, unwrapTarget } from "./wasm/host_call.js";

/**
 * A server process's host-call targets, by the name it calls them by: any host-call target, or the
 * .sock/.shm path a service is already served at, which the process connects to itself.
 */
export type ProcessHostCallTargets = Record<string, HostCallTarget | string>;

/** A process backend's host-call targets, as the arguments that name them to the server and what serves them. */
export interface ProcessHostCalls {
  /** `--host-call name=path` for each target. */
  args: string[];
  /** Stops the relays this process serves for targets that have no path of their own. */
  close(): Promise<void>;
}

/** A target the server can reach itself: a service already served at a path, such as another spawned process. */
function servedPath(target: unknown): string | undefined {
  const getIpcPath = (target as { getIpcPath?: unknown }).getIpcPath;
  return typeof getIpcPath === "function"
    ? (getIpcPath.call(target) as string)
    : undefined;
}

/**
 * Names each host-call target to a server process, which connects to it itself (see the generated
 * `--host-call name=path`). A path, or a target served at one (another spawned process), is reached
 * directly, with no hop through this process; any other target (a function, an in-process backend)
 * is served to the server on a unix socket this process listens on, answered by the target.
 */
export async function bindProcessHostCalls(
  targets: ProcessHostCallTargets | undefined,
  instanceId: string,
  unref = false,
): Promise<ProcessHostCalls> {
  const args: string[] = [];
  const relays: UdsIpcServer[] = [];
  const close = async () => {
    await Promise.all(relays.splice(0).map((relay) => relay.close()));
  };
  try {
    for (const [name, target] of Object.entries(targets ?? {})) {
      if (typeof target === "string") {
        args.push("--host-call", `${name}=${target}`);
        continue;
      }
      const unwrapped = unwrapTarget(target);
      let path = servedPath(unwrapped);
      if (path === undefined) {
        path = join(tmpdir(), `${instanceId}-${name}.sock`);
        const answer =
          typeof unwrapped === "function"
            ? unwrapped
            : (request: Uint8Array) => unwrapped.call(request);
        const relay = await UdsIpcServer.listen(path, (_clientId, request) =>
          answer(request),
        );
        relays.push(relay);
        if (unref) {
          relay.unref();
        }
      }
      args.push("--host-call", `${name}=${path}`);
    }
  } catch (err) {
    await close();
    throw err;
  }
  return { args, close };
}
