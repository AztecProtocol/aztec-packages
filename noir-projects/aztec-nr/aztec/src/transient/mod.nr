use crate::oracle::transient_oracles;
use crate::protocol::traits::{Deserialize, Serialize};
use crate::unconstrained_array::{ArrayOracles, UnconstrainedArray};

/// A dynamically sized array that lives for the duration of a single top-level PXE call.
///
/// Like [`EphemeralArray`](crate::ephemeral::EphemeralArray), transient arrays are backed by in-memory storage on the
/// PXE side rather than a persistent database, and each logical operation is a single oracle call. The difference is
/// lifetime and visibility: a `TransientArray` is shared across **all call frames of the same contract (private and
/// utility alike)** within one top-level PXE call (transaction simulation or utility call), whereas an
/// `EphemeralArray` is confined to a single call frame.
///
/// In order of increasing lifetime: an [`EphemeralArray`](crate::ephemeral::EphemeralArray) lives for one call frame, a
/// `TransientArray` for one top-level PXE call, and a [`CapsuleArray`](crate::capsules::CapsuleArray) is persistent.
///
/// ## Privacy / Isolation
///
/// Arrays are keyed by `(executing contract address, slot)`. The contract address is supplied by PXE from the
/// executing context, so a contract can only ever access its own transient arrays; other contracts called within the
/// same top-level PXE call cannot see them, and this isolation holds across the private/utility boundary.
///
/// **Note on re-entrancy:** because visibility is flat within a contract, if the same contract is entered more than
/// once in a top-level PXE call (e.g. it calls back into itself, or a private frame calls one of its own functions),
/// those frames share the same arrays at the same slots. This differs from `EphemeralArray`, where even two frames of
/// the same contract are isolated.
///
/// ## Use Cases
///
/// Use this to pass not-to-be-persisted data between a contract's own frames (private or utility) within one top-level
/// PXE call. For data confined to a single call frame, prefer [`EphemeralArray`](crate::ephemeral::EphemeralArray).
/// For data that must persist indefinitely, use [`CapsuleArray`](crate::capsules::CapsuleArray).
pub type TransientArray<T> = UnconstrainedArray<T, TransientOracles>;

/// A single value that lives for the duration of a single top-level PXE call.
///
/// Shared across all call frames of the same contract (private and utility alike) within one top-level PXE call.
/// A contract can only ever access its own transient values; other contracts called within the same top-level PXE call
/// cannot see them.
///
/// Values share the slot space with [`TransientArray`]s: a value and an array at the same slot alias each other, so
/// use distinct slots.
pub struct TransientValue<T> {
    slot: Field,
}

impl<T> TransientValue<T> {
    /// Returns a handle to the value at the given slot, which may already hold data stored by an earlier frame.
    pub unconstrained fn at(slot: Field) -> Self {
        Self { slot }
    }

    /// Stores a value at the given slot.
    pub unconstrained fn store(self, value: T)
    where
        T: Serialize,
    {
        transient_oracles::clear_oracle(self.slot);
        let _ = transient_oracles::push_oracle(self.slot, value.serialize());
    }

    /// Returns the value previously stored at the slot with [`TransientValue::store`], or `Option::none()` if the
    /// slot holds no value.
    pub unconstrained fn read(self) -> Option<T>
    where
        T: Deserialize,
    {
        if transient_oracles::len_oracle(self.slot) == 0 {
            Option::none()
        } else {
            let serialized = transient_oracles::get_oracle(self.slot, 0);
            Option::some(Deserialize::deserialize(serialized))
        }
    }

    /// Deletes the stored value. Does nothing if the slot holds no value.
    pub unconstrained fn delete(self) {
        transient_oracles::clear_oracle(self.slot)
    }
}

pub struct TransientOracles {}

impl ArrayOracles for TransientOracles {
    unconstrained fn len_oracle(slot: Field) -> u32 {
        transient_oracles::len_oracle(slot)
    }

    unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32 {
        transient_oracles::push_oracle(slot, values)
    }

    unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N] {
        transient_oracles::pop_oracle(slot)
    }

    unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N] {
        transient_oracles::get_oracle(slot, index)
    }

    unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]) {
        transient_oracles::set_oracle(slot, index, values)
    }

    unconstrained fn remove_oracle(slot: Field, index: u32) {
        transient_oracles::remove_oracle(slot, index)
    }

    unconstrained fn clear_oracle(slot: Field) {
        transient_oracles::clear_oracle(slot)
    }
}

#[crate::unconstrained_array::test_suite::unconstrained_array_tests(quote { crate::transient::TransientOracles })]
mod test {}

mod value_test {
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::test::mocks::MockStruct;
    use super::{TransientArray, TransientValue};

    global SLOT: Field = 9870;

    #[test]
    unconstrained fn read_empty_returns_none() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<Field> = TransientValue::at(SLOT);
            assert_eq(value.read(), Option::none());
        });
    }

    #[test]
    unconstrained fn store_and_read_roundtrips() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<Field> = TransientValue::at(SLOT);
            value.store(42);
            assert_eq(value.read(), Option::some(42));
        });
    }

    #[test]
    unconstrained fn store_overwrites() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<Field> = TransientValue::at(SLOT);
            value.store(1);
            value.store(2);
            assert_eq(value.read(), Option::some(2));
        });
    }

    #[test]
    unconstrained fn delete_removes_value() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<Field> = TransientValue::at(SLOT);
            value.store(42);
            value.delete();
            assert_eq(value.read(), Option::none());
        });
    }

    #[test]
    unconstrained fn delete_empty_is_noop() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<Field> = TransientValue::at(SLOT);
            value.delete();
            assert_eq(value.read(), Option::none());
        });
    }

    #[test]
    unconstrained fn works_with_multi_field_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<MockStruct> = TransientValue::at(SLOT);
            let stored = MockStruct::new(5, 6);
            value.store(stored);
            assert_eq(value.read(), Option::some(stored));
        });
    }

    #[test]
    unconstrained fn stored_value_is_visible_as_a_length_one_array() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: TransientValue<Field> = TransientValue::at(SLOT);
            value.store(42);

            let array: TransientArray<Field> = TransientArray::at(SLOT);
            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 42);
        });
    }
}
