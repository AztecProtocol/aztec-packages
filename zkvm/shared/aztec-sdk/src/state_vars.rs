use core::marker::PhantomData;
use zkvm_data_types::field::Digest;

/// A set of private notes at a given storage slot. Supports insert and remove.
/// Analogous to PrivateSet in aztec.nr.
pub struct PrivateSet<N, D: Digest> {
    pub storage_slot: D,
    _phantom: PhantomData<N>,
}

impl<N, D: Digest> PrivateSet<N, D> {
    pub fn new(storage_slot: D) -> Self {
        Self { storage_slot, _phantom: PhantomData }
    }
}

/// A single private note at a given storage slot. Supports replace.
/// Analogous to PrivateMutable in aztec.nr.
pub struct PrivateMutable<N, D: Digest> {
    pub storage_slot: D,
    _phantom: PhantomData<N>,
}

impl<N, D: Digest> PrivateMutable<N, D> {
    pub fn new(storage_slot: D) -> Self {
        Self { storage_slot, _phantom: PhantomData }
    }
}

/// A key-value map of state variables. The storage slot for each entry is
/// derived from the base slot and the key via `poseidon2_hash([base_slot, key])`.
/// Analogous to Map in aztec.nr.
pub struct Map<K, V, D: Digest> {
    pub storage_slot: D,
    _phantom: PhantomData<(K, V)>,
}

impl<K, V, D: Digest> Map<K, V, D> {
    pub fn new(storage_slot: D) -> Self {
        Self { storage_slot, _phantom: PhantomData }
    }
}
