import type { AuthorizeUtilityCall } from './authorize_utility_call.js';
import type { GetDeliveryPrivacyPreference } from './get_delivery_privacy_preference.js';

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
 * Similarly, {@link getDeliveryPrivacyPreference} is called when message delivery must establish a new tagging
 * secret rather than reuse an existing handshake, and the contract has not pinned a tag-secret derivation, letting
 * the wallet choose between maximum privacy and delivery that requires no sender-recipient coordination. An existing
 * handshake is reused without invoking the hook. When the hook is absent, PXE assumes maximum privacy.
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
 *     // Accept the privacy leak of on-the-fly handshakes so messages reach recipients that haven't registered
 *     // the sender.
 *     getDeliveryPrivacyPreference: async () => DeliveryPrivacyPreference.BEST_EFFORT,
 *   },
 * });
 * ```
 */
export interface ExecutionHooks {
  /** Called when a contract attempts a cross-contract utility call. Calls are denied when absent. */
  authorizeUtilityCall?: AuthorizeUtilityCall;
  /**
   * Called when message delivery must establish a new tagging secret rather than reuse an existing handshake, and
   * the contract has not pinned a tag-secret derivation. Maximum privacy is assumed when absent.
   */
  getDeliveryPrivacyPreference?: GetDeliveryPrivacyPreference;
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
