// GENERATED FILE - DO NOT EDIT
//
// Written by `yarn-project/canonical-contracts/src/scripts/derive_public_checks.ts` once
// `public_checks_contract` has been compiled. Regenerate with
// `yarn workspace @aztec/canonical-contracts run regen:public-checks-address`.
//
// public_checks_contract MAY depend on this crate transitively through `aztec-nr/aztec`,
// but the contract's external functions MUST NOT reference its own address. The
// structural and bytecode-level cycle guard in
// `noir-projects/scripts/public_checks_cycle_guard.sh` pins this invariant.
//
// artifactHash    = 0x2b11692497c9a3f1f44f4694d1ffb1e521d8cd6ba0e2ef3878026fe9c12fd854
// srcContentHash  = 0x638366fe20febfd0f3940a0afd47c19738d102f2b116fa5cc8854f16b22841dd

use protocol_types::{address::AztecAddress, traits::FromField};

pub global PUBLIC_CHECKS_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x0ed9aa9b8262bd0afb923764799e058ad10cf0de3e01dcf955055b11fdb20d70,
);
