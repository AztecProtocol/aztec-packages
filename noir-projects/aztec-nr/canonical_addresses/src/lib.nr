// GENERATED FILE - DO NOT EDIT
//
// Written by `yarn-project/protocol-contracts/src/scripts/derive_auth_registry.ts` once
// `auth_registry_contract` has been compiled. Regenerate with
// `yarn workspace @aztec/protocol-contracts run regen:auth-registry-address`.
//
// Auth registry MUST NOT depend on this crate. The structural and bytecode-level cycle guard in
// `noir-projects/scripts/auth_registry_cycle_guard.sh` pins this invariant.
//
// stampKey = 0x2f40338537369f28dd399693f5cd35b177935af02ece1f3c9024639ac840d1f0

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x27225abf9a79bc1c9279c82591f5e19d0b861cffcff33ac21d9f89ce14004ff1,
);
