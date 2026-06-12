// Address-only leaf export for browser bundles: importing from
// `@aztec/standard-contracts/auth-registry/constants` avoids dragging in the
// `AuthRegistry.json` static import.
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_AUTH_REGISTRY_ADDRESS: AztecAddress = StandardContractAddress.AuthRegistry;
export const STANDARD_AUTH_REGISTRY_CLASS_ID = StandardContractClassId.AuthRegistry;
export const STANDARD_AUTH_REGISTRY_SALT = StandardContractSalt.AuthRegistry;
