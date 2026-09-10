import type { IpcClientAsync, IpcClientSync } from "./types.js";

export type { IpcClientAsync, IpcClientSync };

/**
 * Backends a native package registers for a service, so an app that installs it needs no wiring.
 * This is how a host with no backend of its own is served — React Native, where Hermes has no
 * WebAssembly and no workers, and the service is reached through a linked library instead.
 */
export interface RegisteredBackends {
  async?: () => Promise<IpcClientAsync> | IpcClientAsync;
  sync?: () => Promise<IpcClientSync> | IpcClientSync;
}

// A well-known global rather than an import in either direction, so a native backend package and
// the generated client package need not depend on each other, and two copies of this module in
// one app still agree.
const REGISTRY_KEY = Symbol.for("@aztec-foundation/ipc-runtime/backends");

function registry(): Map<string, RegisteredBackends> {
  const global = globalThis as unknown as Record<
    symbol,
    Map<string, RegisteredBackends> | undefined
  >;
  return (global[REGISTRY_KEY] ??= new Map());
}

/** Make `factories` the backends for `service`; a native backend package calls this when imported. */
export function registerBackend(
  service: string,
  factories: RegisteredBackends,
): void {
  registry().set(service, factories);
}

/**
 * The registered backend for a service, or a message naming what to install. `hint` is the
 * package a caller should be told about.
 */
export function registeredBackend<K extends keyof RegisteredBackends>(
  service: string,
  kind: K,
  hint: string,
): NonNullable<RegisteredBackends[K]> {
  const factory = registry().get(service)?.[kind];
  if (!factory) {
    throw new Error(
      `${hint}: no ${kind === "sync" ? "synchronous " : ""}backend registered for ${service}. ` +
        "Install a native backend package for it (registering itself when imported), or pass one " +
        "as options.backend.",
    );
  }
  return factory as NonNullable<RegisteredBackends[K]>;
}
