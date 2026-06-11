pub(crate) mod test_helpers;

use crate::oracle::random::random;
use crate::protocol::traits::{Deserialize, Serialize};
use crate::protocol::utils::{reader::Reader, writer::Writer};

/// Oracle backend for an [`UnconstrainedArray`]: the set of PXE-side operations that implement its storage.
pub trait ArrayOracles {
    /// Returns the number of elements in the array at `slot`.
    unconstrained fn len_oracle(slot: Field) -> u32;

    /// Appends a serialized element to the array at `slot` and returns the new length.
    unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32;

    /// Removes and returns the last serialized element of the array at `slot`.
    unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N];

    /// Returns the serialized element at the given index of the array at `slot`.
    unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N];

    /// Overwrites the serialized element at the given index of the array at `slot`.
    unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]);

    /// Removes the element at the given index of the array at `slot`, shifting subsequent elements backward.
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
    pub slot: Field,
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
        Self::empty_at(random())
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

    /// Removes and returns the last element. Panics if the array is empty.
    pub unconstrained fn pop(self) -> T
    where
        T: Deserialize,
    {
        let serialized = Oracle::pop_oracle(self.slot);
        Deserialize::deserialize(serialized)
    }

    /// Retrieves the value stored at `index`. Panics if the index is out of bounds.
    pub unconstrained fn get(self, index: u32) -> T
    where
        T: Deserialize,
    {
        let serialized = Oracle::get_oracle(self.slot, index);
        Deserialize::deserialize(serialized)
    }

    /// Overwrites the value stored at `index`. Panics if the index is out of bounds.
    pub unconstrained fn set(self, index: u32, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        Oracle::set_oracle(self.slot, index, serialized);
    }

    /// Removes the element at `index`, shifting subsequent elements backward. Panics if out of bounds.
    pub unconstrained fn remove(self, index: u32) {
        Oracle::remove_oracle(self.slot, index);
    }

    /// Removes all elements from the array and returns self for chaining.
    ///
    /// Prefer [`UnconstrainedArray::empty_at`] when the intent is to start with a fresh array.
    pub unconstrained fn clear(self) -> Self {
        Oracle::clear_oracle(self.slot);
        self
    }

    /// Calls a function on each element of the array.
    ///
    /// The function `f` is called once with each array value and its corresponding index. Iteration proceeds
    /// backwards so that it is safe to remove the current element (and only the current element) inside the
    /// callback.
    ///
    /// It is **not** safe to push new elements from inside the callback.
    pub unconstrained fn for_each<Env>(self, f: unconstrained fn[Env](u32, T) -> ())
    where
        T: Deserialize,
    {
        let mut i = self.len();
        while i > 0 {
            i -= 1;
            f(i, self.get(i));
        }
    }

    /// Applies `f` to every element and collects the results into a fresh array.
    ///
    /// Reads each element in order, transforms it with `f`, and pushes the result onto a new array at a freshly
    /// allocated slot (see [`UnconstrainedArray::empty`]). The source array is left unchanged, and the result is
    /// isolated from it, so `map` can be chained.
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
    ///
    /// Reads each element in order, keeps those for which `f` returns `true`, and pushes them onto a new array at a
    /// freshly allocated slot (see [`UnconstrainedArray::empty`]). Relative order is preserved. The source array is
    /// left unchanged, and the result is isolated from it, so `filter` can be chained.
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
    ///
    /// Matches the `any` combinator on Noir's [`array`](std::array), slice, and `BoundedVec` collections. Defined in
    /// terms of [`UnconstrainedArray::filter`]: it keeps the matching elements and checks whether any survived. This is
    /// not short-circuiting — every element is tested even after the first match.
    pub unconstrained fn any<Env>(self, f: unconstrained fn[Env](T) -> bool) -> bool
    where
        T: Serialize + Deserialize,
    {
        self.filter(f).len() != 0
    }

    /// Returns `true` if every element satisfies the predicate `f` (vacuously `true` for an empty array).
    ///
    /// Matches the `all` combinator on Noir's [`array`](std::array) and slice collections. Defined in terms of
    /// [`UnconstrainedArray::filter`]: every element matches exactly when filtering keeps all of them. This is not
    /// short-circuiting — every element is tested even after the first failure.
    pub unconstrained fn all<Env>(self, f: unconstrained fn[Env](T) -> bool) -> bool
    where
        T: Serialize + Deserialize,
    {
        self.filter(f).len() == self.len()
    }

    /// Returns the first element satisfying the predicate `f`, or `Option::none` if none do.
    ///
    /// Mirrors Rust's `Iterator::find`. Defined in terms of [`UnconstrainedArray::filter`], which preserves order, so
    /// the first kept element is the first match. This is not short-circuiting — every element is tested even after
    /// the match is found.
    pub unconstrained fn find<Env>(self, f: unconstrained fn[Env](T) -> bool) -> Option<T>
    where
        T: Serialize + Deserialize,
    {
        let matches = self.filter(f);
        if matches.len() != 0 {
            Option::some(matches.get(0))
        } else {
            Option::none()
        }
    }
}

impl<Oracle> UnconstrainedArray<Field, Oracle>
where
    Oracle: ArrayOracles,
{
    /// Deserializes the whole array into a `T`.
    ///
    /// Asserts the array holds exactly `<T as Deserialize>::N` fields, then reconstructs a `T` from them. This is the
    /// read-back counterpart to pushing a value's serialized fields onto the array, and is defined only on arrays of
    /// `Field` because deserialization reconstructs a type from raw fields.
    pub unconstrained fn read_as<T>(self) -> T
    where
        T: Deserialize,
    {
        assert_eq(self.len(), <T as Deserialize>::N, "UnconstrainedArray length mismatch for read_as");
        let mut fields: [Field; <T as Deserialize>::N] = [0; <T as Deserialize>::N];
        for i in 0..<T as Deserialize>::N {
            fields[i] = self.get(i);
        }
        Deserialize::deserialize(fields)
    }
}

/// Serializes an `UnconstrainedArray` as its slot identifier, allowing oracle function signatures to use array types
/// instead of opaque `Field` slots.
impl<T, Oracle> Serialize for UnconstrainedArray<T, Oracle> {
    let N: u32 = 1;

    fn serialize(self) -> [Field; Self::N] {
        [self.slot]
    }

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.slot);
    }
}

/// Deserializes a single Field into an `UnconstrainedArray` handle, treating the field value as the slot identifier.
/// This is the inverse of [`Serialize`].
impl<T, Oracle> Deserialize for UnconstrainedArray<T, Oracle> {
    let N: u32 = 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { slot: fields[0] }
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { slot: reader.read() }
    }
}

/// Stores a single value at `slot`, overwriting any value previously stored there.
///
/// The value is stored as a length-one array at the slot: read it back with [`load`] and remove it with [`delete`].
pub(crate) unconstrained fn store<T, Oracle>(slot: Field, value: T)
where
    T: Serialize,
    Oracle: ArrayOracles,
{
    let array: UnconstrainedArray<T, Oracle> = UnconstrainedArray::at(slot);
    array.clear().push(value);
}

/// Returns the value previously stored at `slot` with [`store`], or `Option::none()` if the slot holds no value.
pub(crate) unconstrained fn load<T, Oracle>(slot: Field) -> Option<T>
where
    T: Deserialize,
    Oracle: ArrayOracles,
{
    let array: UnconstrainedArray<T, Oracle> = UnconstrainedArray::at(slot);
    if array.len() == 0 {
        Option::none()
    } else {
        Option::some(array.get(0))
    }
}

/// Deletes the value stored at `slot`. Does nothing if the slot is already empty.
pub(crate) unconstrained fn delete<Oracle>(slot: Field)
where
    Oracle: ArrayOracles,
{
    Oracle::clear_oracle(slot)
}
