/// Oracles for transient arrays: in-memory arrays scoped to a single top-level private or utility function call and
/// isolated per contract.
///
/// These mirror the ephemeral array oracles but route to a store whose lifetime is the whole top-level PXE call,
/// shared across all call frames of the same contract (private and utility alike). The contract address used for
/// keying is injected by the oracle handler, not passed here.

/// Appends a serialized element to the transient array and returns the new length.
#[oracle(aztec_utl_pushTransient)]
pub(crate) unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32 {}

/// Removes and returns the last serialized element from the transient array. Panics if the array is empty.
#[oracle(aztec_utl_popTransient)]
pub(crate) unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N] {}

/// Returns the serialized element at the given index. Panics if `index` is out of bounds.
#[oracle(aztec_utl_getTransient)]
pub(crate) unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N] {}

/// Overwrites the serialized element at the given index. Panics if `index` is out of bounds.
#[oracle(aztec_utl_setTransient)]
pub(crate) unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]) {}

/// Returns the number of elements in the transient array.
#[oracle(aztec_utl_getTransientLen)]
pub(crate) unconstrained fn len_oracle(slot: Field) -> u32 {}

/// Removes the element at the given index, shifting subsequent elements backward. Panics if `index` is out of bounds.
#[oracle(aztec_utl_removeTransient)]
pub(crate) unconstrained fn remove_oracle(slot: Field, index: u32) {}

/// Removes all elements from the transient array.
#[oracle(aztec_utl_clearTransient)]
pub(crate) unconstrained fn clear_oracle(slot: Field) {}
