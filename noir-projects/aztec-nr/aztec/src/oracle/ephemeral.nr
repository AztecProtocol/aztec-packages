/// Oracles for ephemeral arrays: in-memory arrays scoped to a single contract call frame.
///
/// Unlike capsule oracles, ephemeral oracles operate on arrays (not individual slots) and each oracle call performs a
/// complete logical operation. This reduces the number of oracle round-trips compared to building array semantics on
/// top of slot-level oracles.

/// Appends a serialized element to the ephemeral array and returns the new length.
#[oracle(aztec_utl_ephemeral_push)]
pub(crate) unconstrained fn push_oracle<let N: u32>(base_slot: Field, values: [Field; N]) -> u32 {}

/// Removes and returns the last serialized element from the ephemeral array.
#[oracle(aztec_utl_ephemeral_pop)]
pub(crate) unconstrained fn pop_oracle<let N: u32>(base_slot: Field) -> [Field; N] {}

/// Returns the serialized element at the given index.
#[oracle(aztec_utl_ephemeral_get)]
pub(crate) unconstrained fn get_oracle<let N: u32>(base_slot: Field, index: u32) -> [Field; N] {}

/// Overwrites the serialized element at the given index.
#[oracle(aztec_utl_ephemeral_set)]
pub(crate) unconstrained fn set_oracle<let N: u32>(base_slot: Field, index: u32, values: [Field; N]) {}

/// Returns the number of elements in the ephemeral array.
#[oracle(aztec_utl_ephemeral_len)]
pub(crate) unconstrained fn len_oracle(base_slot: Field) -> u32 {}

/// Removes the element at the given index, shifting subsequent elements backward.
#[oracle(aztec_utl_ephemeral_remove)]
pub(crate) unconstrained fn remove_oracle(base_slot: Field, index: u32) {}

/// Copies `count` elements from the source array to the destination array (overwrites destination).
#[oracle(aztec_utl_ephemeral_copy)]
pub(crate) unconstrained fn copy_oracle(src_slot: Field, dst_slot: Field, count: u32) {}
