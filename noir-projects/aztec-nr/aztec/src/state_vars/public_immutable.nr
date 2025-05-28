use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::storage::Storage,
    utils::with_hash::WithHash,
};
use dep::protocol_types::{constants::INITIALIZATION_SLOT_SEPARATOR, traits::Packable};

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
impl<T, Context, let M: u32, let N: u32> Storage<N> for PublicImmutable<T, Context>
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
}

impl<T> PublicImmutable<T, &mut PublicContext> {
    // docs:start:public_immutable_struct_write
    pub fn initialize<let T_PACKED_LEN: u32>(self, value: T)
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        // We check that the struct is not yet initialized by checking if the initialization slot is 0
        let initialization_slot = INITIALIZATION_SLOT_SEPARATOR + self.storage_slot;
        let init_field: Field = self.context.storage_read(initialization_slot);
        assert(init_field == 0, "PublicImmutable already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        self.context.storage_write(initialization_slot, 0xdead);
        self.context.storage_write(self.storage_slot, WithHash::new(value));
    }
    // docs:end:public_immutable_struct_write

    // Note that we don't access the context, but we do call oracles that are only available in public
    // docs:start:public_immutable_struct_read
    pub fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        assert(self.is_initialized(), "Trying to read from uninitialized PublicImmutable");
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }
    // docs:end:public_immutable_struct_read

    pub fn read_unsafe<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }

    fn is_initialized(self) -> bool {
        let initialization_slot = INITIALIZATION_SLOT_SEPARATOR + self.storage_slot;
        let init_field: Field = self.context.storage_read(initialization_slot);
        init_field != 0
    }
}

impl<T> PublicImmutable<T, UtilityContext> {
    pub unconstrained fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        WithHash::utility_public_storage_read(self.context, self.storage_slot)
    }
}

impl<T> PublicImmutable<T, &mut PrivateContext> {
    pub fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN> + Eq,
    {
        WithHash::historical_public_storage_read(
            self.context.get_block_header(),
            self.context.this_address(),
            self.storage_slot,
        )
    }
}
