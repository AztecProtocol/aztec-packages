pub(crate) mod test_helpers;
pub(crate) mod test_suite;

use crate::oracle::random::random;
use crate::protocol::traits::{Deserialize, Serialize};

/// Oracle backend for an [`UnconstrainedArray`]: the set of PXE-side operations that implement its storage.
///
/// Each implementor routes these operations to a distinct family of oracles, and the oracle family determines the
/// array's lifetime and visibility (e.g. [`EphemeralArray`](crate::ephemeral::EphemeralArray) arrays live for one
/// contract call frame, while [`TransientArray`](crate::transient::TransientArray) arrays are shared across all frames
/// of the same contract within one top-level PXE call).
pub(crate) trait ArrayOracles {
    /// Returns the number of elements in the array at `slot`.
    unconstrained fn len_oracle(slot: Field) -> u32;

    /// Appends a serialized element to the array at `slot` and returns the new length.
    unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32;

    /// Removes and returns the last serialized element of the array at `slot`. Implementors must panic if the
    /// array is empty.
    unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N];

    /// Returns the serialized element at the given index of the array at `slot`. Implementors must panic if `index`
    /// is out of bounds.
    unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N];

    /// Overwrites the serialized element at the given index of the array at `slot`. Implementors must panic if
    /// `index` is out of bounds.
    unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]);

    /// Removes the element at the given index of the array at `slot`, shifting subsequent elements backward.
    /// Implementors must panic if `index` is out of bounds.
    unconstrained fn remove_oracle(slot: Field, index: u32);

    /// Removes all elements from the array at `slot`.
    unconstrained fn clear_oracle(slot: Field);
}

/// A dynamically sized array backed by PXE-side in-memory storage via an [`ArrayOracles`] backend.
///
/// Arrays are identified by a slot, and each logical operation (push, pop, get, etc.) is a single oracle call. The
/// `Oracle` backend determines the array's lifetime and visibility; contracts should not use this type directly but
/// rather one of its aliases: [`EphemeralArray`](crate::ephemeral::EphemeralArray) (scoped to a single contract call
/// frame) or [`TransientArray`](crate::transient::TransientArray) (shared across all frames of the same contract
/// within one top-level PXE call).
pub struct UnconstrainedArray<T, Oracle> {
    pub(crate) slot: Field,
}

impl<T, Oracle> UnconstrainedArray<T, Oracle>
where
    Oracle: ArrayOracles,
{
    /// Returns a handle to the array at the given slot, which may already contain data (e.g. populated by an oracle
    /// or by an earlier frame, depending on the backend's visibility).
    pub unconstrained fn at(slot: Field) -> Self {
        Self { slot }
    }

    /// Returns an empty array at the given slot, clearing any pre-existing data.
    ///
    /// For backends whose arrays are visible beyond a single call frame (e.g. transient arrays), this wipes data
    /// other frames of the same contract may have written at the slot.
    pub unconstrained fn empty_at(slot: Field) -> Self {
        Self::at(slot).clear()
    }

    /// Returns an empty array at a fresh, randomly allocated slot.
    ///
    /// Use this when the caller does not need a specific slot: the random slot is isolated from every other array of
    /// the same backend with overwhelming probability. Prefer [`UnconstrainedArray::empty_at`] when the slot must be a
    /// known value (e.g. one shared with an oracle or another call frame).
    pub unconstrained fn empty() -> Self {
        Self::at(random())
    }

    /// Returns the number of elements stored in the array.
    pub unconstrained fn len(self) -> u32 {
        Oracle::len_oracle(self.slot)
    }

    /// Stores a value at the end of the array.
    pub unconstrained fn push(self, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        let _ = Oracle::push_oracle(self.slot, serialized);
    }

    /// Removes and returns the last element. Implementors are required to panic if the array is empty.
    pub unconstrained fn pop(self) -> T
    where
        T: Deserialize,
    {
        let serialized = Oracle::pop_oracle(self.slot);
        Deserialize::deserialize(serialized)
    }

    /// Retrieves the value stored at `index`. Implementors are required to panic if the index is out of bounds.
    pub unconstrained fn get(self, index: u32) -> T
    where
        T: Deserialize,
    {
        let serialized = Oracle::get_oracle(self.slot, index);
        Deserialize::deserialize(serialized)
    }

    /// Overwrites the value stored at `index`. Implementors are required to panic if the index is out of bounds.
    pub unconstrained fn set(self, index: u32, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        Oracle::set_oracle(self.slot, index, serialized);
    }

    /// Removes the element at `index`, shifting subsequent elements backward. Implementors are required to panic if
    /// the index is out of bounds.
    pub unconstrained fn remove(self, index: u32) {
        Oracle::remove_oracle(self.slot, index);
    }

    /// Removes all elements from the array and returns self for chaining.
    pub unconstrained fn clear(self) -> Self {
        Oracle::clear_oracle(self.slot);
        self
    }

    /// Calls a function on each element of the array.
    ///
    /// The function `f` is called once with each array value and its corresponding index, in order (from the first
    /// element to the last).
    ///
    /// Structurally mutating the array from inside the callback (e.g. via `push`, `pop`, `remove` or `clear`) is
    /// **not** supported: it can cause elements to be skipped, visited more than once, or read out of bounds.
    pub unconstrained fn for_each<Env>(self, f: unconstrained fn[Env](u32, T) -> ())
    where
        T: Deserialize,
    {
        let n = self.len();
        for i in 0..n {
            f(i, self.get(i));
        }
    }

    /// Applies `f` to every element and collects the results into a fresh array.
    pub unconstrained fn map<U, Env>(self, f: unconstrained fn[Env](T) -> U) -> UnconstrainedArray<U, Oracle>
    where
        T: Deserialize,
        U: Serialize,
    {
        let dest: UnconstrainedArray<U, Oracle> = UnconstrainedArray::empty();
        let n = self.len();
        for i in 0..n {
            dest.push(f(self.get(i)));
        }
        dest
    }

    /// Collects every element satisfying the predicate `f` into a fresh array.
    pub unconstrained fn filter<Env>(self, f: unconstrained fn[Env](T) -> bool) -> Self
    where
        T: Serialize + Deserialize,
    {
        let dest: Self = UnconstrainedArray::empty();
        let n = self.len();
        for i in 0..n {
            let value = self.get(i);
            if f(value) {
                dest.push(value);
            }
        }
        dest
    }

    /// Returns `true` if at least one element satisfies the predicate `f`.
    pub unconstrained fn any<Env>(self, f: unconstrained fn[Env](T) -> bool) -> bool
    where
        T: Serialize + Deserialize,
    {
        self.filter(f).len() != 0
    }

    /// Returns `true` if every element satisfies the predicate `f` (vacuously `true` for an empty array).
    pub unconstrained fn all<Env>(self, f: unconstrained fn[Env](T) -> bool) -> bool
    where
        T: Serialize + Deserialize,
    {
        self.filter(f).len() == self.len()
    }

    /// Returns the first element satisfying the predicate `f`, or `Option::none` if none do.
    pub unconstrained fn find<Env>(self, f: unconstrained fn[Env](T) -> bool) -> Option<T>
    where
        T: Deserialize,
    {
        let n = self.len();
        let mut result: Option<T> = Option::none();
        let mut i = 0;
        while (i < n) & result.is_none() {
            let value = self.get(i);
            if f(value) {
                result = Option::some(value);
            }
            i += 1;
        }
        result
    }
}
