use crate::oracle::transient_oracles;
use crate::oracle_array::{ArrayOracle, UnconstrainedArray};
use crate::protocol::traits::{Deserialize, Serialize};

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
pub type TransientArray<T> = UnconstrainedArray<T, TransientOracle>;

/// Routes [`UnconstrainedArray`] operations to the transient array oracles, sharing arrays across all call frames of
/// the
/// same contract within one top-level PXE call.
pub struct TransientOracle {}

impl ArrayOracle for TransientOracle {
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

/// Stores a single value at `slot`, overwriting any value previously stored there.
pub unconstrained fn store<T>(slot: Field, value: T)
where
    T: Serialize,
{
    crate::oracle_array::store::<T, TransientOracle>(slot, value)
}

/// Returns the value previously stored at `slot` with [`store`], or `Option::none()` if the slot holds no value.
pub unconstrained fn load<T>(slot: Field) -> Option<T>
where
    T: Deserialize,
{
    crate::oracle_array::load::<T, TransientOracle>(slot)
}

/// Deletes the value stored at `slot`. Does nothing if the slot is already empty.
pub unconstrained fn delete(slot: Field) {
    crate::oracle_array::delete::<TransientOracle>(slot)
}

#[crate::oracle_array::test_helpers::oracle_array_tests(quote { crate::transient::TransientOracle })]
mod test {
    use crate::oracle_array::test_helpers::SLOT;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{load, store};

    #[test]
    unconstrained fn store_and_load() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            store(SLOT, 42);
            assert_eq(load(SLOT), Option::some(42));
        });
    }
}
