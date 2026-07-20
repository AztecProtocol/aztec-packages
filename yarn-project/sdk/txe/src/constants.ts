import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const DEFAULT_ADDRESS = AztecAddress.fromNumberUnsafe(42);

// This is MAX_MESSAGE_CONTENT_LEN - PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN
export const MAX_PRIVATE_EVENT_LEN = 10;
export const MAX_PRIVATE_EVENTS_PER_TXE_QUERY = 5;

// Arbitrarily set at 64 because we need a bound. Nothing inherent about it.
export const MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY = 64;
// Must match MAX_OFFCHAIN_EFFECT_LEN in noir-projects/aztec-nr/aztec/src/test/helpers/txe_oracles.nr.
export const MAX_OFFCHAIN_EFFECT_LEN = 2 + PRIVATE_LOG_CIPHERTEXT_LEN;
