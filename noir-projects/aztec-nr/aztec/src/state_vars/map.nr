use crate::protocol::{storage::map::derive_storage_slot_in_map, traits::ToField};
use crate::state_vars::StateVariable;

/// A key-value container for state variables.
///
/// A `Map` wraps another state variable type (the 'value') and creates independent instances of it for each key,
/// resulting in effectively as many state variables as there are key values. This behavior is similar to a Solidity
/// `mapping (K => V)`.
///
/// ## Use Cases
///
/// Any scenario in which a fixed number of variables is insufficient to represent contract state requires `Map` e.g.
/// per-election configuration in a voting contract, per-user state, etc. `Map` also composes naturally into more
/// complex containers: an array could be implemented as a `Map` with indices as keys.
///
/// Note that some private state variables, such as [`PrivateMutable`](crate::state_vars::PrivateMutable) and
/// [`PrivateSet`](crate::state_vars::PrivateSet) cannot be wrapped in a `Map`. These types implement the
/// [`OwnedStateVariable`](crate::state_vars::OwnedStateVariable) trait, and as such should instead be wrapped using the
/// [`Owned`](crate::state_vars::Owned) container, which can be thought of as a specialization of `Map` for private
/// state 'owned' by a single account.
///
/// ## Examples
///
/// Since `Map` is also a [`StateVariable`], it is declared in the contract's
/// [`#[storage]`](crate::macros::storage::storage) struct along with all others:
///
/// ```noir
/// #[storage]
/// struct Storage<C> {
///     is_admin: Map<AztecAddress, PublicMutable<bool, C>, C>,
///     vote_tallies: Map<ElectionId, PublicMutable<u128, C>, C>,
/// }
/// ```
///
/// ### Multiple `Map`s
///
/// There is no limit to how many `Map` containers a contract can have, and `Map`s can themselves wrap other `Map`s,
/// resulting in nested layouts.
///
/// ```noir
/// #[storage]
/// struct Storage<C> {
///     // A nested map where the first key is an address and the second a `Year` type, such that
///     // self.storage.user_yearly_config.at(user).at(year) results in distinct `UserConfig` variables for each
///     // `(user, year)` tuple.
///     user_yearly_config: Map<AztecAddress, Map<Year, UserConfig<C>, C>, C>,
/// }
/// ```
///
/// ## Requirements
///
/// The value type `V` must implement the [`StateVariable`] trait. The key type `K` must implement the [`ToField`] trait
/// in such a way that the `Field` representation is unique for each key.
///
/// For key types that cannot be converted into a `Field`, consider wrapping them in a type that implements `ToField` as
/// the hash of the key.
///
/// ```noir
/// struct MyKey {
///     a: Field,
///     b: Field,
/// }
///
/// struct MyKeyWrapper {
///     inner: MyKey,
/// }
///
/// impl ToField for MyKeyWrapper {
///     fn to_field(self) -> Field {
///         poseidon2_hash([self.inner.a, self.inner.b])
///     }
/// }
///
/// #[storage]
/// struct Storage<C> {
///     a: Map<MyKeyWrapper, PublicMutable<bool, C>, C>,
/// }
/// ```
///
/// ## Implementation Details
///
/// Like all other state variables, `Map` gets assigned a unique storage slot. It uses this value to derive unique
/// storage slots for each key, resulting in independent state variables. Nothing gets stored at `Map`'s storage slot.
/// This is equivalent to Solidity's implementation of `mapping`.
///
/// Because the storage slot derivation is done using a hash function, it is not possible to compute the key (preimage)
/// used to obtain a given derived state variable slot.
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
    /// Returns the state variable for a key.
    ///
    /// This derives a unique storage slot for `key` and returns a state variable of type `V` at that slot. It is
    /// equivalent to accessing a `mapping` via the `[]` operator in Solidity (e.g. `balances[user]` would be
    /// `balances.at(user)`).
    ///
    /// ## Example
    ///
    /// ```noir
    /// #[external("utility")]
    /// fn get_election_vote_tallies(election: ElectionId) -> u128 {
    ///     self.storage.vote_tallies.at(election).read()
    /// }
    /// ```
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
