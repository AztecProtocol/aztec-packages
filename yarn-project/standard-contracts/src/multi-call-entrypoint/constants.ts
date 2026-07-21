// Lightweight metadata leaf export for browser bundles: importing from
// `@aztec/standard-contracts/multi-call-entrypoint/constants` avoids dragging in the
// `MultiCallEntrypoint.json` static import.
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StandardContractAddress, StandardContractClassId, StandardContractSalt } from '../standard_contract_data.js';

export const STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS: AztecAddress = StandardContractAddress.MultiCallEntrypoint;
export const STANDARD_MULTI_CALL_ENTRYPOINT_CLASS_ID = StandardContractClassId.MultiCallEntrypoint;
export const STANDARD_MULTI_CALL_ENTRYPOINT_SALT = StandardContractSalt.MultiCallEntrypoint;
