// Lightweight metadata leaf export for browser bundles: importing from
// `@aztec/standard-contracts/handshake-registry/constants` avoids dragging in the
// `HandshakeRegistry.json` static import.
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_HANDSHAKE_REGISTRY_ADDRESS: AztecAddress = StandardContractAddress.HandshakeRegistry;
export const STANDARD_HANDSHAKE_REGISTRY_CLASS_ID = StandardContractClassId.HandshakeRegistry;
export const STANDARD_HANDSHAKE_REGISTRY_SALT = StandardContractSalt.HandshakeRegistry;
