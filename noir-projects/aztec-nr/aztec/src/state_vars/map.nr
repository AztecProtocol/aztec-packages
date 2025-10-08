use crate::state_vars::storage::HasStorageSlot;
use dep::protocol_types::{storage::map::derive_storage_slot_in_map, traits::ToField};

/// Map
///
/// A key-value storage container that maps keys to state variables, similar
/// to Solidity mappings.
///
/// `Map` enables you to associate keys (like addresses or other identifiers)
/// with state variables in your Aztec smart contract. This is conceptually
/// similar to Solidity's `mapping(K => V)` syntax, where you can store and
/// retrieve values by their associated keys.
///
/// You can declare a state variable contained within a Map in your contract's
/// #[storage] struct.
///
/// For example, you might use
/// `Map<AztecAddress, PrivateMutable<ValueNote, Context>, Context>` to track
/// token balances for different users, similar to how you'd use
/// `mapping(address => uint256)` in Solidity.
///
/// > Aside: the verbose `Context` in the declaration is a consequence of
/// > leveraging Noir's regular syntax for generics to ensure that certain
/// > state variable methods can only be called in some contexts (private,
/// > public, utility).
///
/// The methods of Map are:
/// - `at` (access state variable for a given key)
/// (see the method's own doc comments for more info).
///
/// ## Generic Parameters
/// - `K`: The key type (must implement `ToField` trait for hashing)
/// - `V`: The value type:
///   - any Aztec state variable:
///     - `PublicMutable`
///     - `PublicImmutable`
///     - `PrivateMutable`
///     - `PrivateImmutable`
///     - `PrivateSet`
///     - `DelayedPublicMutable`
///     - `Map`
/// - `Context`: The execution context (handles private/public function
///   contexts)
///
/// ## Usage
/// Maps are typically declared in your contract's #[storage] struct and
/// accessed
/// using the `at(key)` method to get the state variable for a specific key.
/// The resulting state variable can then be read from or written to using its
/// own methods.
///
/// ## Advanced
/// Internally, `Map` uses a single base storage slot to represent the
/// mapping
/// itself, similar to Solidity's approach. Individual key-value pairs are
/// stored at derived storage slots computed by hashing the base storage
/// slot
/// with the key using Poseidon2. This ensures:
/// - No storage slot collisions between different keys
/// - Uniform distribution of storage slots across the storage space
/// - Compatibility with Aztec's storage tree structure
/// - Gas-efficient storage access patterns similar to Solidity mappings
///
/// The storage slot derivation uses `derive_storage_slot_in_map(base_slot,
/// key)` which computes `poseidon2_hash([base_slot, key.to_field()])`,
/// ensuring cryptographically secure slot separation.
///
/// docs:start:map
pub struct Map<K, V, Context> {
    context: Context,
    storage_slot: Field,
    state_var_constructor: fn(Context, Field) -> V,
}

// Map reserves a single storage slot regardless of what it stores because
// nothing is stored at said slot: it is only used to derive the storage slots
// of nested state variables, which is expected to never result in collisions
// or slots being close to one another due to these being hashes. This mirrors
// the strategy adopted by Solidity mappings.
impl<K, T, Context> HasStorageSlot<1> for Map<K, T, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<K, V, Context> Map<K, V, Context> {
    /// Initializes a new Map state variable.
    ///
    /// This function is usually automatically called within the #[storage]
    /// macro.
    /// You typically don't need to call this directly when writing smart contracts.
    ///
    /// # Arguments
    ///
    /// * `context` - One of `PrivateContext`/`PublicContext`/`UtilityContext`.
    ///               The Context determines which methods of this struct will
    ///               be made available to the calling smart contract function.
    /// * `storage_slot` - A unique identifier for this Map within the contract.
    ///                    Usually, the #[storage] macro will determine an
    ///                    appropriate storage_slot automatically. A smart
    ///                    contract dev shouldn't have to worry about this, as
    ///                    it's managed behind the scenes.
    /// * `state_var_constructor` - A function that creates the value type (V)
    ///                             given a context and storage slot. This is
    ///                             typically the constructor of the state
    ///                             variable type being stored in the Map.
    ///
    pub fn new(
        context: Context,
        storage_slot: Field,
        state_var_constructor: fn(Context, Field) -> V,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Map { context, storage_slot, state_var_constructor }
    }

    /// Returns the state variable associated with the given key.
    ///
    /// This is equivalent to accessing `mapping[key]` in Solidity. It returns
    /// the state variable instance for the specified key, which can then be
    /// used to read or write the value at that key.
    ///
    /// Unlike Solidity mappings which return the value directly, this returns
    /// the state variable wrapper (like PrivateMutable, PublicMutable, etc.)
    /// that you then call methods on to interact with the actual value.
    ///
    /// # Arguments
    ///
    /// * `key` - The key to look up in the map. Must implement the ToField
    ///           trait (which most basic Noir & Aztec types do).
    ///
    /// # Returns
    ///
    /// * `V` - The state variable instance for this key. You can then call
    ///         methods like `.read()`, `.write()`, `.get_note()`, etc. on this
    ///         depending on the specific state variable type.
    ///
    /// # Example
    ///
    /// ```noir
    /// // Get a user's balance (assuming PrivateMutable<ValueNote>)
    /// let user_balance = storage.balances.at(user_address);
    /// let current_note = user_balance.get_note();
    ///
    /// // Update the balance
    /// user_balance.replace(new_note);
    /// ```
    ///
    pub fn at(self, key: K) -> V
    where
        K: ToField,
    {
        // TODO(#1204): use a generator index for the storage slot
        let derived_storage_slot = derive_storage_slot_in_map(self.storage_slot, key);

        let state_var_constructor = self.state_var_constructor;
        state_var_constructor(self.context, derived_storage_slot)
    }
}
