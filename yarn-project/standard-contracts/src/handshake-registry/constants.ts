// Lightweight metadata leaf export for browser bundles: importing from
// `@aztec/standard-contracts/handshake-registry/constants` avoids dragging in the
// `HandshakeRegistry.json` static import.
import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_HANDSHAKE_REGISTRY_ADDRESS = StandardContractAddress.HandshakeRegistry;
export const STANDARD_HANDSHAKE_REGISTRY_CLASS_ID = StandardContractClassId.HandshakeRegistry;
export const STANDARD_HANDSHAKE_REGISTRY_SALT = StandardContractSalt.HandshakeRegistry;
