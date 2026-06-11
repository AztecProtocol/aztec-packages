use crate::oracle::ephemeral_oracles;
use crate::oracle_array::{ArrayOracle, UnconstrainedArray};
use crate::protocol::traits::{Deserialize, Serialize};

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
pub type EphemeralArray<T> = UnconstrainedArray<T, EphemeralOracle>;

/// Routes [`UnconstrainedArray`] operations to the ephemeral array oracles, scoping arrays to a single contract call
/// frame.
pub struct EphemeralOracle {}

impl ArrayOracle for EphemeralOracle {
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

/// Stores a single value at `slot`, overwriting any value previously stored there.
pub unconstrained fn store<T>(slot: Field, value: T)
where
    T: Serialize,
{
    crate::oracle_array::store::<T, EphemeralOracle>(slot, value)
}

/// Returns the value previously stored at `slot` with [`store`], or `Option::none()` if the slot holds no value.
pub unconstrained fn load<T>(slot: Field) -> Option<T>
where
    T: Deserialize,
{
    crate::oracle_array::load::<T, EphemeralOracle>(slot)
}

/// Deletes the value stored at `slot`. Does nothing if the slot is already empty.
pub unconstrained fn delete(slot: Field) {
    crate::oracle_array::delete::<EphemeralOracle>(slot)
}

#[crate::oracle_array::test_helpers::oracle_array_tests(quote { crate::ephemeral::EphemeralOracle })]
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
