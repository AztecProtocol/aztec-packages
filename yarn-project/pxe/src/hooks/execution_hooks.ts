import type { AuthorizeUtilityCall } from './authorize_utility_call.js';
import type { ResolveTaggingSecretStrategy } from './resolve_tagging_secret_strategy.js';

/**
 * Hooks that PXE invokes during client-side simulation to gate or steer operations that the protocol
 * does not restrict on its own. They give the wallet a chance to apply custom policies (e.g.
 * prompting the user, consulting a dynamic allowlist, or inspecting call arguments) before the
 * execution proceeds. All hooks are optional, and when a hook is absent PXE applies a safe default.
 *
 * For example, {@link authorizeUtilityCall} is called whenever a utility function makes a cross-contract call. A call
 * made by a malicious contract could leak private information, so the hook lets the wallet decide, per-call, whether
 * to allow it. A static allowlist would not work here because neither the app nor the wallet can predict ahead of
 * time which contracts will be invoked during execution. Calls to standard contracts (such as the HandshakeRegistry)
 * bypass this hook and are always authorized. When the hook is absent, cross-contract utility calls are denied.
 *
 * Note: hooks are unrelated to authentication witnesses (authwits). Authwits are an on-chain
 * mechanism where a contract verifies that a caller was authorized by a specific account; hooks
 * are a client-side PXE concern that gates execution before it proceeds.
 *
 * @example
 * ```ts
 * const pxe = await PXE.create({
 *   // ...
 *   hooks: {
 *     authorizeUtilityCall: async (req) => {
 *       // Allow calls to a known helper contract, deny everything else.
 *       return req.target.equals(trustedHelper)
 *         ? { authorized: true }
 *         : { authorized: false, reason: 'Unknown target' };
 *     },
 *     // When there's no established way to reach the recipient, fall back to a non-interactive handshake.
 *     resolveTaggingSecretStrategy: async () => ({ type: 'non-interactive-handshake' }),
 *   },
 * });
 * ```
 */
export interface ExecutionHooks {
  /** Called when a contract attempts a cross-contract utility call. Calls are denied when absent. */
  authorizeUtilityCall?: AuthorizeUtilityCall;
  /**
   * Resolves a message's tagging secret when none is already established for the sender/recipient pair, letting the
   * wallet apply per-recipient policy. PXE applies a default when absent.
   * See {@link ResolveTaggingSecretStrategy} for the request shape and defaults.
   */
  resolveTaggingSecretStrategy?: ResolveTaggingSecretStrategy;
}

/**
 * Builds an {@link ExecutionHooks} from individually-constructed hook callbacks. Returns `undefined`
 * when every field is absent, so callers can unconditionally pass the result as `hooks`.
 */
export function composeHooks(hooks: ExecutionHooks): ExecutionHooks | undefined {
  if (Object.values(hooks).every(v => v === undefined)) {
    return undefined;
  }
  return hooks;
}
