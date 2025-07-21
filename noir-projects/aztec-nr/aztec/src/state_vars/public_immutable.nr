use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::storage::HasStorageSlot,
    utils::with_hash::WithHash,
};
use protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::Packable,
};

mod test;

/// Stores an immutable value in public state which can be read from public, private and unconstrained execution
/// contexts.
///
/// Leverages `WithHash<T>` to enable efficient private reads of public storage. `WithHash` wrapper allows for
/// efficient reads by verifying large values through a single hash check and then proving inclusion only of the hash
/// in the public storage. This reduces the number of required tree inclusion proofs from O(M) to O(1).
///
/// This is valuable when T packs to multiple fields, as it maintains "almost constant" verification overhead
/// regardless of the original data size.
///
/// # Optimizing private reads in your contract
/// Given that reading T from public immutable in private has "almost constant" constraints cost for different sizes
/// of T it is recommended to group multiple values into a single struct when they are being read together. This can
/// typically be some kind of configuration set up during contract initialization. E.g.:
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
// docs:start:public_immutable_struct
pub struct PublicImmutable<T, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_immutable_struct

/// `WithHash<T>` stores both the packed value (using N fields) and its hash (1 field), requiring N = M + 1 total
/// fields.
impl<T, Context, let M: u32, let N: u32> HasStorageSlot<N> for PublicImmutable<T, Context>
where
    WithHash<T, M>: Packable<N>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, Context> PublicImmutable<T, Context> {
    // docs:start:public_immutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicImmutable { context, storage_slot }
    }
    // docs:end:public_immutable_struct_new

    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<T> PublicImmutable<T, &mut PublicContext> {
    /// Initializes the value.
    ///
    /// # Panics
    /// Panics if the value is already initialized.
    // docs:start:public_immutable_struct_write
    pub fn initialize<let T_PACKED_LEN: u32>(self, value: T)
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents
        // the value from being initialized again as a nullifier can be included only once.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        self.context.storage_write(self.storage_slot, WithHash::new(value));
    }
    // docs:end:public_immutable_struct_write

    /// Reads the value.
    ///
    /// # Panics
    /// Panics if the value is not initialized.
    // docs:start:public_immutable_struct_read
    pub fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        assert(self.is_initialized(), "Trying to read from uninitialized PublicImmutable");
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }
    // docs:end:public_immutable_struct_read

    /// Reads the value without checking if the value is initialized.
    pub fn read_unsafe<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }

    fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_nullifier();
        self.context.nullifier_exists(nullifier, self.context.this_address())
    }
}

impl<T> PublicImmutable<T, UtilityContext> {
    pub unconstrained fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        // TODO(#15703): this fn should fail if the variable is not initialized
        WithHash::utility_public_storage_read(self.context, self.storage_slot)
    }
}

impl<T> PublicImmutable<T, &mut PrivateContext> {
    pub fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        // TODO(#15703): this fn should fail if the variable is not initialized
        WithHash::historical_public_storage_read(
            self.context.get_block_header(),
            self.context.this_address(),
            self.storage_slot,
        )
    }
}
