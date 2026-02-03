use crate::protocol::{storage::map::derive_storage_slot_in_map, traits::ToField};
use crate::state_vars::StateVariable;

/// A key-value container for state variables.
///
/// A key-value storage container that maps keys to state variables, similar to Solidity mappings.
///
/// `Map` enables you to associate keys (like addresses or other identifiers) with state variables in your Aztec smart
/// contract. This is conceptually similar to Solidity's `mapping(K => V)` syntax, where you can store and retrieve
/// values by their associated keys.
///
/// You can declare a state variable contained within a Map in your contract's
/// [`storage`](crate::macros::storage::storage) struct.
///
/// For example, you might use `Map<AztecAddress, PublicMutable<FieldNote, Context>, Context>` to track token balances
/// for different users, similar to how you'd use `mapping(address => uint256)` in Solidity.
///
/// > Aside: the verbose `Context` in the declaration is a consequence of > leveraging Noir's regular syntax for
/// generics to ensure that certain > state variable methods can only be called in some contexts (private, > public,
/// utility).
///
/// The methods of Map are:
/// - `at` (access state variable for a given key) (see the method's own doc comments for more info).
///
/// ## Generic Parameters
/// - `K`: The key type (must implement `ToField` trait for hashing)
/// - `V`: The value type:
/// - any Aztec state variable (variable that implements the StateVariable trait):
/// - `PublicMutable`
/// - `PublicImmutable`
/// - `DelayedPublicMutable`
/// - `Map`
/// - `Context`: The execution context (handles private/public function contexts)
///
/// ## Usage Maps are typically declared in your contract's [`storage`](crate::macros::storage::storage) struct and accessed using the `at(key)` method to get the state variable for a specific key. The resulting state variable can then be read from or written to using its own methods.
///
/// Note that maps cannot be used with owned state variables (variables that implement the OwnedStateVariable trait) -
/// those need to be wrapped in an `Owned` state variable instead.
///
/// ## Advanced Internally, `Map` uses a single base storage slot to represent the mapping itself, similar to Solidity's approach. Individual key-value pairs are stored at derived storage slots computed by hashing the base storage slot with the key using Poseidon2. This ensures:
/// - No storage slot collisions between different keys
/// - Uniform distribution of storage slots across the storage space
/// - Compatibility with Aztec's storage tree structure
/// - Gas-efficient storage access patterns similar to Solidity mappings
///
/// The storage slot derivation uses `derive_storage_slot_in_map(base_slot, key)` which computes
/// `poseidon2_hash([base_slot, key.to_field()])`, ensuring cryptographically secure slot separation.
///
/// docs:start:map
pub struct Map<K, V, Context> {
    pub context: Context,
    storage_slot: Field,
}

// Map reserves a single storage slot regardless of what it stores because nothing is stored at said slot: it is only
// used to derive the storage slots of nested state variables, which is expected to never result in collisions or slots
// being close to one another due to these being hashes. This mirrors the strategy adopted by Solidity mappings.
impl<K, V, Context> StateVariable<1, Context> for Map<K, V, Context> {
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Map { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<K, V, Context> Map<K, V, Context> {
    /// Returns the state variable associated with the given key.
    ///
    /// This is equivalent to accessing `mapping[`key`]` in Solidity. It returns the state variable instance for the
    /// specified key, which can then be used to read or write the value at that key.
    ///
    /// Unlike Solidity mappings which return the value directly, this returns the state variable wrapper (like
    /// PublicMutable, nested Map etc.) that you then call methods on to interact with the actual value.
    ///
    /// # Arguments
    ///
    /// * `key` - The key to look up in the map. Must implement the ToField trait (which most basic Noir & Aztec types
    /// do).
    ///
    /// # Returns
    ///
    /// * `V` - The state variable instance for this key. You can then call methods like `.read()`, `.write()`,
    /// `.get_note()`, etc. on this depending on the specific state variable type.
    ///
    /// # Example
    ///
    /// ```noir
    /// // Get a user's balance (assuming PrivateMutable<FieldNote>)
    /// let user_balance = self.storage.balances.at(user_address);
    /// let current_note = user_balance.get_note();
    ///
    /// // Update the balance
    /// user_balance.replace(new_note);
    /// ```
    ///
    pub fn at<let N: u32>(self, key: K) -> V
    where
        K: ToField,
        V: StateVariable<N, Context>,
    {
        V::new(
            self.context,
            derive_storage_slot_in_map(self.storage_slot, key),
        )
    }
}
