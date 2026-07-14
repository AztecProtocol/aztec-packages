import type { Fr } from '@aztec/foundation/curves/bn254';

/**
 * The contract-side preimage of an Aztec address, i.e. the commitment to a specific contract instance.
 *
 * A partial address commits to a contract's code and initialization
 * (`hash(contract_class_id, salted_initialization_hash)`) but not to its keys. Combined with an account's `PublicKeys`,
 * it fully determines the address: `address = (hash(public_keys_hash, partial_address) * G + Ivpk_m).x`. Two accounts
 * therefore share an address only if they share both their public keys and their partial address.
 *
 * See `computePartialAddress` for the derivation.
 */
export type PartialAddress = Fr;
