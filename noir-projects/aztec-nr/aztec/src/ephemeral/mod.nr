use crate::oracle::ephemeral_oracles;
use crate::protocol::traits::{Deserialize, Serialize};
use crate::protocol::utils::{reader::Reader, writer::Writer};
use crate::unconstrained_array::{ArrayOracles, UnconstrainedArray};

/// A dynamically sized array that exists only during a single contract call frame.
///
/// Ephemeral arrays are backed by in-memory storage on the PXE side rather than a persistent database. Each contract
/// call frame gets its own isolated slot space of ephemeral arrays. Child simulations cannot see the parent's
/// ephemeral arrays, and vice versa.
///
/// Each logical array operation (push, pop, get, etc.) is a single oracle call, making ephemeral arrays significantly
/// cheaper than capsule arrays.
///
/// ## Use Cases
///
/// Ephemeral arrays are designed for passing data between PXE (TypeScript) and contracts (Noir) during simulation,
/// for example, note validation requests or event validation responses. This data type is appropriate for data that
/// is not supposed to be persisted.
///
/// For data that needs to persist across simulations, contract calls, etc, use
/// [`CapsuleArray`](crate::capsules::CapsuleArray) instead.
///
/// For data that must be shared across all frames of the same contract (private and utility) within one top-level PXE
/// call (transaction simulation or utility call) but not persisted, use
/// [`TransientArray`](crate::transient::TransientArray).
pub type EphemeralArray<T> = UnconstrainedArray<T, EphemeralOracles>;

pub struct EphemeralOracles {}

impl ArrayOracles for EphemeralOracles {
    unconstrained fn len_oracle(slot: Field) -> u32 {
        ephemeral_oracles::len_oracle(slot)
    }

    unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32 {
        ephemeral_oracles::push_oracle(slot, values)
    }

    unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N] {
        ephemeral_oracles::pop_oracle(slot)
    }

    unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N] {
        ephemeral_oracles::get_oracle(slot, index)
    }

    unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]) {
        ephemeral_oracles::set_oracle(slot, index, values)
    }

    unconstrained fn remove_oracle(slot: Field, index: u32) {
        ephemeral_oracles::remove_oracle(slot, index)
    }

    unconstrained fn clear_oracle(slot: Field) {
        ephemeral_oracles::clear_oracle(slot)
    }
}

/// Serializes an `EphemeralArray` as its slot, allowing oracle function signatures to use ephemeral array types
/// instead of opaque `Field` slots.
impl<T> Serialize for UnconstrainedArray<T, EphemeralOracles> {
    let N: u32 = 1;

    fn serialize(self) -> [Field; Self::N] {
        [self.slot]
    }

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.slot);
    }
}

/// Deserializes a single Field into an `EphemeralArray` handle, treating the field value as the slot identifier.
impl<T> Deserialize for UnconstrainedArray<T, EphemeralOracles> {
    let N: u32 = 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { slot: fields[0] }
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { slot: reader.read() }
    }
}

#[crate::unconstrained_array::test_suite::unconstrained_array_tests(quote { crate::ephemeral::EphemeralOracles })]
mod test {}
