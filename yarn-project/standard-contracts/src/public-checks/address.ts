// Address-only leaf export for browser bundles: importing from
// `@aztec/standard-contracts/public-checks/address` avoids dragging in the
// `PublicChecks.json` static import.
import { StandardContractAddress, StandardContractClassId } from '../standard_contract_data.js';

export const STANDARD_PUBLIC_CHECKS_ADDRESS = StandardContractAddress.PublicChecks;
export const STANDARD_PUBLIC_CHECKS_CLASS_ID = StandardContractClassId.PublicChecks;
