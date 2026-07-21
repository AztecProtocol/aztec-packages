// Lightweight metadata leaf export for browser bundles: importing from
// `@aztec/standard-contracts/handshake-registry/constants` avoids dragging in the
// `HandshakeRegistry.json` static import.
<<<<<<< HEAD
=======
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import type { Fr } from '@aztec/foundation/curves/bn254';
>>>>>>> origin/v5-next
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_HANDSHAKE_REGISTRY_ADDRESS: AztecAddress = StandardContractAddress.HandshakeRegistry;
export const STANDARD_HANDSHAKE_REGISTRY_CLASS_ID = StandardContractClassId.HandshakeRegistry;
export const STANDARD_HANDSHAKE_REGISTRY_SALT = StandardContractSalt.HandshakeRegistry;

/**
 * Request kind under which the HandshakeRegistry asks for a recipient's interactive-handshake signature through the
 * `resolveCustomRequest` hook. Mirrors `INTERACTIVE_HANDSHAKE_REQUEST_KIND` in the registry contract.
 */
// TODO: remove this mirrored constant and read the value from the HandshakeRegistry artifact once the contract
// global can be `#[abi]`-exported. Fixed upstream but not yet released:
// https://github.com/noir-lang/noir/pull/12714 and https://github.com/noir-lang/noir/issues/12620.
export const INTERACTIVE_HANDSHAKE_REQUEST_KIND: Fr = sha256ToField([
  Buffer.from('HANDSHAKE_REGISTRY::INTERACTIVE_HANDSHAKE_REQUEST'),
]);
