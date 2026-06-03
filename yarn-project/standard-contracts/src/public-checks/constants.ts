// Lightweight metadata leaf export for browser bundles: importing from
// `@aztec/standard-contracts/public-checks/constants` avoids dragging in the
// `PublicChecks.json` static import.
import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_PUBLIC_CHECKS_ADDRESS = StandardContractAddress.PublicChecks;
export const STANDARD_PUBLIC_CHECKS_CLASS_ID = StandardContractClassId.PublicChecks;
export const STANDARD_PUBLIC_CHECKS_SALT = StandardContractSalt.PublicChecks;
