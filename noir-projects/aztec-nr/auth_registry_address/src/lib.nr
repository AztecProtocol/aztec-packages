// GENERATED FILE - DO NOT EDIT
//
// Written by `yarn-project/protocol-contracts/src/scripts/derive_auth_registry.ts` after phase 1
// of `noir-projects/noir-contracts/bootstrap.sh` has compiled `auth_registry_contract`.
//
// Auth registry MUST NOT depend on this crate. The structural and bytecode-level cycle guard in
// `noir-projects/scripts/auth_registry_cycle_guard.sh` pins this invariant.
//
// stampKey = 0x2f40338537369f28dd399693f5cd35b177935af02ece1f3c9024639ac840d1f0

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(0x27225abf9a79bc1c9279c82591f5e19d0b861cffcff33ac21d9f89ce14004ff1);
pub global AUTH_REGISTRY_CLASS_ID: Field = 0x12e672a384cda5e1a03f18c901f40e01ec859355b56ca9f21a4cd0b2e99d3689;
