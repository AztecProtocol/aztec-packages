// Address of the canonical auth_registry deployment.
//
// auth_registry today is a protocol contract published at the magic slot-1 address. This crate is
// the dependency-cut point that lets a future PR demote auth_registry to a non-protocol contract
// whose address derives from its compiled artifact: every consumer (aztec-nr authwit helpers, the
// avm test contract, etc.) imports `AUTH_REGISTRY_ADDRESS` from here, and auth_registry itself
// MUST NOT depend on this crate. The structural and bytecode-level cycle guard in
// `noir-projects/scripts/auth_registry_cycle_guard.sh` pins that invariant.
//
// While auth_registry remains a protocol contract, `AUTH_REGISTRY_ADDRESS` is the canonical magic
// address (slot 1) and is kept in sync with `CANONICAL_AUTH_REGISTRY_ADDRESS` in
// `noir-protocol-circuits/crates/types/src/constants.nr`. The follow-up demotion PR overwrites
// this file via `yarn-project/protocol-contracts/src/scripts/derive_auth_registry.ts`.

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(1);
pub global AUTH_REGISTRY_CLASS_ID: Field = 0;
