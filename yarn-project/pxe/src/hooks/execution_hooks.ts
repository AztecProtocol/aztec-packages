import type { AuthorizeUtilityCall } from './authorize_utility_call.js';

/**
 * Hooks that PXE invokes during client-side simulation to gate operations that the protocol
 * does not restrict on its own. They give the wallet a chance to apply custom policies (e.g.
 * prompting the user, consulting a dynamic allowlist, or inspecting call arguments) before the
 * execution proceeds.
 *
 * For example, {@link authorizeUtilityCall} is called whenever a utility function makes a cross-contract call. A call
 * made by a malicious contract could leak private information, so the hook lets the wallet decide, per-call, whether
 * to allow it. A static allowlist would not work here because neither the app nor the wallet can predict ahead of
 * time which contracts will be invoked during execution. Calls to standard contracts (such as the HandshakeRegistry)
 * bypass this hook and are always authorized.
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
 *   },
 * });
 * ```
 */
export interface ExecutionHooks {
  /** Called when a contract attempts a cross-contract utility call. */
  authorizeUtilityCall: AuthorizeUtilityCall;
}

/**
 * Builds an {@link ExecutionHooks} from individually-constructed hook callbacks. Returns `undefined`
 * when every field is absent, so callers can unconditionally pass the result as `hooks`.
 */
export function composeHooks(partial: Partial<ExecutionHooks>): ExecutionHooks | undefined {
  if (Object.values(partial).every(v => v === undefined)) {
    return undefined;
  }
  return partial as ExecutionHooks;
}
