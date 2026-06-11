import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AppTaggingSecretKind } from '@aztec/stdlib/logs';

/**
 * A wallet-owned policy that selects the tag-secret derivation used by message delivery when the executing contract
 * does not pin one. Max privacy never leaks information and instead relies on sender-recipient coordination for
 * delivery. Best effort accepts a privacy leak so that delivery requires no sender-recipient coordination at all.
 *
 * The send flow consults this value whenever a message needs a tagging secret.
 */
export enum DeliveryPrivacyPreference {
  /**
   * Never publish anything that could link sender and recipient in order to obtain a tagging secret; delivery relies
   * on sender-recipient coordination instead. Unconstrained delivery uses the locally-derived address-pair (ECDH)
   * secret, but the recipient only finds the message if they registered the sender; constrained delivery requires an
   * interactive handshake with the recipient, and fails when none exists.
   */
  MAX_PRIVACY = 1,
  /**
   * Derive tags from a non-interactive handshake, reusing an existing one or establishing it on the fly, letting the
   * recipient discover the message without any prior sender-recipient coordination. Establishing it publishes an
   * on-chain handshake that reveals information about the recipient.
   */
  BEST_EFFORT = 2,
}

/** Checks whether `value` is a known {@link DeliveryPrivacyPreference} discriminant. */
function isDeliveryPrivacyPreference(value: number): value is DeliveryPrivacyPreference {
  return value in DeliveryPrivacyPreference;
}

/** Validates that `value` is a known {@link DeliveryPrivacyPreference} discriminant and narrows it to the enum. */
export function deliveryPrivacyPreferenceFromNumber(value: number): DeliveryPrivacyPreference {
  if (!isDeliveryPrivacyPreference(value)) {
    throw new Error(`Unrecognized delivery privacy preference: ${value}`);
  }
  return value;
}

/** Information about the message delivery requesting the preference. */
export type DeliveryPrivacyPreferenceRequest = {
  /** The contract whose execution is sending the message. */
  contractAddress: AztecAddress;
  /** The sender of the message, i.e. the local side of the tagging secret that would be established. */
  sender: AztecAddress;
  /** The recipient of the message, i.e. the party an on-chain handshake would reveal information about. */
  recipient: AztecAddress;
  /** Whether the message is delivered with constrained or unconstrained tagging. */
  deliveryMode: AppTaggingSecretKind;
};

/**
 * Hook called when message delivery needs a tagging secret and the executing contract has not pinned a tag-secret
 * derivation, letting the wallet choose between maximum privacy and delivery that requires no sender-recipient
 * coordination (see {@link DeliveryPrivacyPreference} for the trade-offs involved).
 *
 * The request identifies the message (executing contract, sender, recipient and delivery mode), so wallets can apply
 * per-application or per-recipient policies, or surface the decision to the user, instead of returning a fixed value.
 *
 * When the hook is not configured, PXE defaults to {@link DeliveryPrivacyPreference.MAX_PRIVACY} so that privacy is
 * never weakened without the wallet opting in.
 */
export type GetDeliveryPrivacyPreference = (
  request: DeliveryPrivacyPreferenceRequest,
) => Promise<DeliveryPrivacyPreference>;
