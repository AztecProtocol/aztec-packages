// GENERATED FILE - DO NOT EDIT
//
// Written by `yarn-project/canonical-contracts/src/scripts/derive_auth_registry.ts` once
// `auth_registry_contract` has been compiled. Regenerate with
// `yarn workspace @aztec/canonical-contracts run regen:auth-registry-address`.
//
// Auth registry MUST NOT depend on this crate. The structural and bytecode-level cycle guard in
// `noir-projects/scripts/auth_registry_cycle_guard.sh` pins this invariant.
//
// artifactHash    = 0x2f40338537369f28dd399693f5cd35b177935af02ece1f3c9024639ac840d1f0
// srcContentHash  = 0x4ea3348417959a4d18386572ff254539805f0ea5d786f96e7b66f06c947403ec

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x1f7f0c3d878160356b2025b056a7a390ab34bd17f2ba4320ffb4a71698d5bf3a,
);
