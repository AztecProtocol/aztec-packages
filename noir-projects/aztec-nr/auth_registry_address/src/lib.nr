// GENERATED FILE - DO NOT EDIT
//
// Written by `noir-projects/scripts/derive_auth_registry.ts` after phase 1
// of `noir-projects/noir-contracts/bootstrap.sh` has compiled
// `auth_registry_contract`. The address and class id are derived from the
// resulting artifact (salt = Fr(1), deployer = AztecAddress::zero(),
// public_keys = default).
//
// Auth registry MUST NOT depend on this crate. The structural and
// bytecode-level cycle guard in `noir-projects/scripts/auth_registry_cycle_guard.sh`
// pins this invariant.
//
// To regenerate by hand: `noir-projects/bootstrap.sh regen-auth-registry-address`.

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(0);
pub global AUTH_REGISTRY_CLASS_ID: Field = 0;
