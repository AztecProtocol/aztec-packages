// Address-only leaf export for browser bundles: importing from
// `@aztec/standard-contracts/auth-registry/address` avoids dragging in the
// `AuthRegistry.json` static import.
import { StandardContractAddress, StandardContractClassId } from '../standard_contract_data.js';

export const AUTH_REGISTRY_ADDRESS = StandardContractAddress.AuthRegistry;
export const AUTH_REGISTRY_CLASS_ID = StandardContractClassId.AuthRegistry;
