use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::storage::HasStorageSlot,
    utils::with_hash::WithHash,
};
use protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::Packable,
};

/// # PublicImmutable
///
/// PublicImmutable is a public state variable type for values that are set once
/// during initialization and remain permanently unchanged.
///
/// You can declare a state variable of type PublicImmutable within your contract's
/// #[storage] struct:
///
/// E.g.:
/// `your_variable: PublicImmutable<T, Context>`
///
/// PublicImmutable stores an immutable value in public state which can be _read_
/// from public, utility and even _private_ execution contexts.
///
/// The methods of PublicImmutable are:
/// - `initialize`
/// - `read`
/// (see the methods' own doc comments for more info).
///
/// # Generic Parameters:
///
/// * `T` - The type of value stored (must implement Packable).
/// * `Context` - The execution context (PublicContext, PrivateContext, or UtilityContext).
///
/// # Advanced
///
/// PublicImmutable leverages `WithHash<T>` to enable efficient private reads of
/// public storage. The `WithHash` wrapper optimizes reads by hashing values that would
/// be larger than a single field into a single field, then proving inclusion of only
/// the hash in public storage.
///
/// This optimization is particularly valuable when T packs to multiple fields,
/// as it maintains "almost constant" verification overhead regardless of the
/// original data size.
///
/// ## Optimizing private reads in your contract
/// Since reading T from public immutable storage in private contexts has "almost
/// constant" constraint costs regardless of T's size, it's recommended to group
/// multiple values into a single struct when they are to be read together. This is
/// typically useful for configuration data set during contract initialization. E.g.:
///
/// ```noir
/// use dep::aztec::protocol_types::{address::AztecAddress, traits::Packable};
/// use std::meta::derive;
///
/// #[derive(Eq, Packable)]
/// pub struct Config \{
///     pub address_1: AztecAddress,
///     pub value_1: u128,
///     pub value_2: u64,
///     ...
/// }
/// ```
///
pub struct PublicImmutable<T, Context> {
    context: Context,
    storage_slot: Field,
}

/// `PublicImmutable` stores both the packed value (using M fields) and its hash (1 field), requiring M + 1 total
/// fields.
impl<T, Context, let M: u32> HasStorageSlot<M + 1> for PublicImmutable<T, Context>
where
    T: Packable<N = M>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, Context> PublicImmutable<T, Context> {
    /// Initializes a new PublicImmutable state variable.
    ///
    /// This function is usually automatically called within the #[storage] macro.
    /// You typically don't need to call this directly when writing smart contracts.
    ///
    /// # Arguments
    ///
    /// * `context` - One of `PublicContext`/`PrivateContext`/`UtilityContext`. The
    ///               Context determines which methods of this struct will be made
    ///               available to the calling smart contract function.
    /// * `storage_slot` - A unique identifier for this state variable within the
    ///                    contract. Usually, the #[storage] macro will determine an
    ///                    appropriate storage_slot automatically. A smart contract
    ///                    dev shouldn't have to worry about this, as it's managed
    ///                    behind the scenes.
    ///
    /// docs:start:public_immutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicImmutable { context, storage_slot }
    }

    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<T> PublicImmutable<T, &mut PublicContext> {
    /// Initializes a PublicImmutable state variable instance with a permanent value.
    ///
    /// This function sets the immutable value for this state variable. It can only
    /// be called once per PublicImmutable. Subsequent calls will fail because the
    /// initialization nullifier will already exist.
    ///
    /// # Arguments
    /// * `value` - The permanent value to store in this PublicImmutable.
    ///
    /// # Panics
    /// Panics if the value is already initialized.
    ///
    /// # Advanced
    ///
    /// This function performs the following operations:
    /// - Creates and emits an initialization nullifier to mark this storage slot
    ///   as initialized. This prevents double-initialization.
    /// - Wraps the value in `WithHash<T>` for efficient private reads.
    /// - Stores the wrapped value in Aztec's public data tree.
    ///
    /// docs:start:public_immutable_struct_write
    pub fn initialize(self, value: T)
    where
        T: Packable + Eq,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents
        // the value from being initialized again as a nullifier can be included only once.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        self.context.storage_write(self.storage_slot, WithHash::new(value));
    }

    /// Reads the permanent value stored in this PublicImmutable state variable.
    ///
    /// # Returns
    /// * `T` - The permanent value stored in this PublicImmutable.
    ///
    /// # Panics
    /// Panics if the value is not initialized.
    ///
    /// # Advanced
    ///
    /// This function performs the following operations:
    /// - Checks that the state variable has been initialized by verifying the
    ///   initialization nullifier exists
    /// - Reads the `WithHash<T>` wrapper from public storage
    /// - Extracts and returns the original value T
    ///
    /// The function will panic if called on an uninitialized PublicImmutable.
    ///
    /// docs:start:public_immutable_struct_read
    pub fn read(self) -> T
    where
        T: Packable + Eq,
    {
        assert(self.is_initialized(), "Trying to read from uninitialized PublicImmutable");
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }

    /// Reads the value stored in this PublicImmutable without checking if the value
    /// is initialized.
    ///
    /// This function bypasses the initialization check and directly reads from
    /// storage.
    /// If the PublicImmutable has not been initialized, this will return a
    /// zeroed value.
    /// However, if the variable is _known_ to be initialized, this is cheaper
    /// to call than `read`.
    ///
    /// # Returns
    ///
    /// * `T` - The value stored in this PublicImmutable, or empty/default values if
    ///         uninitialized.
    ///
    pub fn read_unsafe(self) -> T
    where
        T: Packable + Eq,
    {
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }

    fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_nullifier();
        self.context.nullifier_exists(nullifier, self.context.this_address())
    }
}

impl<T> PublicImmutable<T, UtilityContext> {
    /// Reads the permanent value stored in this PublicImmutable state variable.
    ///
    /// Notice that this function is executable only within a UtilityContext, which
    /// is an unconstrained environment on the user's local device.
    ///
    /// # Returns
    ///
    /// * `T` - The permanent value stored in this PublicImmutable.
    ///
    pub unconstrained fn read(self) -> T
    where
        T: Packable + Eq,
    {
        // TODO(#15703): this fn should fail if the variable is not initialized
        WithHash::utility_public_storage_read(self.context, self.storage_slot)
    }
}

impl<T> PublicImmutable<T, &mut PrivateContext> {
    /// Reads the permanent value stored in this PublicImmutable from the anchor
    /// block.
    ///
    /// Private functions execute asynchronously and offchain. When a user begins
    /// private execution, their view of the chain 'branches off' from the current
    /// public state, since public state continues to advance while they execute
    /// privately. Therefore, private functions read from a historical snapshot of
    /// public state rather than the current state.
    ///
    /// # Returns
    ///
    /// * `T` - The permanent value stored in this PublicImmutable at the historical
    ///         block referenced by the private context.
    ///
    /// # Advanced
    ///
    /// This function performs a historical read using the block header from the private
    /// context. The `WithHash` optimization is particularly valuable here because it
    /// reduces the number of required inclusion proofs by proving membership of
    /// only the hash instead of the full packed value.
    ///
    /// The historical read mechanism:
    /// - Uses an oracle to obtain the value from the anchor block
    /// - Proves inclusion of the value's hash in the public data tree
    /// - Proves that the root of this public data tree is correct, relative to the
    ///   anchor block header.
    /// - Verifies that the oracle-provided value matches the stored hash
    ///
    pub fn read(self) -> T
    where
        T: Packable + Eq,
    {
        // TODO(#15703): this fn should fail if the variable is not initialized
        WithHash::historical_public_storage_read(
            self.context.get_anchor_block_header(),
            self.context.this_address(),
            self.storage_slot,
        )
    }
}
