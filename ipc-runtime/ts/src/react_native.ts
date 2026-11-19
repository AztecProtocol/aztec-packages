/**
 * The React Native entry: what a service's client package needs there, with nothing that imports
 * node built-ins. Services run as native libraries linked into the app, reached over JSI; a
 * backend a native package registers takes precedence.
 */
export * from "./jsi.js";
export * from "./backend_registry.js";
export {
  SERVICE_BACKEND,
  type HostCallHandler,
  type HostCallTarget,
  type HostCallTargets,
} from "./wasm/host_call.js";
