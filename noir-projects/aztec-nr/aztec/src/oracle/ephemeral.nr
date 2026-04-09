/// Oracles for ephemeral arrays: in-memory arrays scoped to a single contract call frame.
///
/// Unlike capsule oracles, ephemeral oracles operate on arrays (not individual slots) and each oracle call performs a
/// complete logical operation. This reduces the number of oracle round-trips compared to building array semantics on
/// top of slot-level oracles.

/// Appends a serialized element to the ephemeral array and returns the new length.
#[oracle(aztec_utl_pushEphemeral)]
pub(crate) unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32 {}

/// Removes and returns the last serialized element from the ephemeral array.
#[oracle(aztec_utl_popEphemeral)]
pub(crate) unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N] {}

/// Returns the serialized element at the given index.
#[oracle(aztec_utl_getEphemeral)]
pub(crate) unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N] {}

/// Overwrites the serialized element at the given index.
#[oracle(aztec_utl_setEphemeral)]
pub(crate) unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]) {}

/// Returns the number of elements in the ephemeral array.
#[oracle(aztec_utl_getEphemeralLen)]
pub(crate) unconstrained fn len_oracle(slot: Field) -> u32 {}

/// Removes the element at the given index, shifting subsequent elements backward.
#[oracle(aztec_utl_removeEphemeral)]
pub(crate) unconstrained fn remove_oracle(slot: Field, index: u32) {}

/// Removes all elements from the ephemeral array.
#[oracle(aztec_utl_clearEphemeral)]
pub(crate) unconstrained fn clear_oracle(slot: Field) {}
