// Lightweight metadata leaf export for browser bundles: importing from
// `@aztec/standard-contracts/public-checks/constants` avoids dragging in the
// `PublicChecks.json` static import.
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_PUBLIC_CHECKS_ADDRESS: AztecAddress = StandardContractAddress.PublicChecks;
export const STANDARD_PUBLIC_CHECKS_CLASS_ID = StandardContractClassId.PublicChecks;
export const STANDARD_PUBLIC_CHECKS_SALT = StandardContractSalt.PublicChecks;
