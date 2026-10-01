use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    ephemeral::EphemeralArray,
    facts::{Fact, FactScope, get_fact_collection, record_retractable_fact},
    nullifier::utils::compute_nullifier_existence_request,
    oracle::{block_reference::BlockReference, nullifiers::check_nullifier_exists, storage::storage_read},
    state_vars::StateVariable,
    utils::WithHash,
};
use crate::protocol::{
    abis::block_header::BlockHeader,
    address::AztecAddress,
    constants::DOM_SEP__INITIALIZATION_NULLIFIER,
    hash::{poseidon2_hash_with_separator, sha256_to_field},
    traits::{Hash, Packable},
};

mod test;

/// Fact-collection type ID of the `PublicImmutable` value caches.
///
/// Each `PublicImmutable` has its own collection in the [fact store](crate::facts), identified by its storage slot,
/// which caches the value so that later reads need no node roundtrip.
///
/// ## Lifecycle
///
/// A collection is in one of two states:
///
/// - **Empty**: the value has not been read, so nothing is cached.
/// - **Cached**: the collection holds a single `PUBLIC_IMMUTABLE_VALUE_READ` fact with the value.
///
/// The first read of an initialized `PublicImmutable` takes its collection from **Empty** to **Cached**. It only goes
/// back to **Empty** if the block the value was read at is re-orged out, which retracts the fact. Reads never record a
/// second fact, and collections are never deleted: an initialized `PublicImmutable` never changes, so a cached value
/// never becomes stale (outside of reorgs).
///
/// ## Scope
///
/// Collections are in the [public scope](crate::facts::FactScope::public), because a `PublicImmutable` is not tied to
/// any account and its value is public anyway. All accounts therefore share the cached value. This only reveals to
/// them that the value has been read in this device before, not which account read it, and other contracts cannot
/// access the collection.
global PUBLIC_IMMUTABLE_CACHE_TYPE_ID: Field = sha256_to_field("AZTEC_NR::PUBLIC_IMMUTABLE_CACHE_TYPE_ID".as_bytes());

/// Fact type ID of an observed `PublicImmutable` value.
///
/// A fact of this type states that the value was read from the node at the fact's origin block. Its payload is the
/// packed value.
global PUBLIC_IMMUTABLE_VALUE_READ: Field = sha256_to_field("AZTEC_NR::PUBLIC_IMMUTABLE_VALUE_READ".as_bytes());

/// Immutable public values.
///
/// This is one of the most basic public state variables. It is similar to an `immutable` or `constant` Solidity state
/// variable.
///
/// It represents a public value of type `T` that can be initialized **just once** during the lifetime of the contract,
/// allowing this single value to be read.
///
/// Unlike Solidity's `immutable` or `constant`, a `PublicImmutable`'s initialization does not need to occur during
/// contract initialization - it can happen at any point in time (but only once). This also makes it possible to have a
/// [`Map`](crate::state_vars::Map) of `PublicImmutable`s.
///
/// ## Access Patterns
///
/// A value stored in a `PublicImmutable` can be read and initialized from public contract functions.
///
/// Unlike [`PublicMutable`](crate::state_vars::PublicMutable) it is **also** possible to read a `PublicImmutable` from
/// a private contract function, though it is not possible to initialize one. A common pattern is to have these
/// functions [enqueue a public self calls](crate::contract_self::ContractSelfPrivate::enqueue)
/// in which the
/// initialization operation is performed.
///
/// For a mutable (with restrictions) variant which also can be read from private functions see
/// [`DelayedPublicMutable`](crate::state_vars::DelayedPublicMutable).
///
/// ## Privacy
///
/// `PublicImmutable` provides zero privacy in terms of the value stored and any public accesses: the entire network
/// can see these and the data involved.
///
/// Reading a `PublicImmutable` from a private contract function however is completely private, and leaks zero
/// information about the fact that the value was read.
///
/// ## Use Cases
///
/// This is suitable for any kind of fixed global configuration that needs to be accessible by private contract
/// functions, such as token decimals, related contracts in a multi-contract configuration, etc.
///
/// It is also useful for fixed per-user configuration by combining it with a [`Map`](crate::state_vars::Map), e.g. a
/// registry of their account types.
///
/// `PublicImmutable`'s main limitation is the immutability, which in many cases leads to
/// [`DelayedPublicMutable`](crate::state_vars::DelayedPublicMutable) being used instead. But in those cases where
/// fixed values are not a problem, this is a fine choice for storage.
///
/// ## Examples
///
/// Declaring a `PublicImmutable` in the contract's [`storage`](crate::macros::storage::storage) struct requires
/// specifying the type `T` that is stored in the variable:
///
/// ```noir
/// #[storage]
/// struct Storage<C> {
///     decimals: PublicImmutable<u8, C>,
///
///     account_types: Map<AztecAddress, PublicImmutable<AccountType, C>, C>,
/// }
/// ```
///
/// ## Requirements
///
/// The type `T` stored in the `PublicImmutable` must implement the `Eq` and
/// [`Packable`](crate::protocol::traits::Packable) traits.
///
/// ## Implementation Details
///
/// Values are packed and stored directly in the public storage tree, along with the hash of the packed representation.
/// A `PublicImmutable` therefore takes up as many storage slots as the packing length of the stored type `T`, plus
/// one. This hash allows for efficient private reads, such that only a single public storage value is read. For more
/// details, see [`WithHash`](crate::utils::WithHash).
///
/// An initialization nullifier prevents re-initialization of the `PublicImmutable`. This allows reading an initialized
/// `PublicImmutable` from a private contract function, since the value is guaranteed to not change.
///
/// Private contract functions however **cannot** determine that a `PublicImmutable` has not been initialized, as they
/// do not have access to the current network state, only the _past_ state at the anchor block. They _can_ perform
/// historical non-inclusion proofs of the initialization nullifier at past times, but they have no way to guarantee
/// that it has not been emitted since then.
///
/// A local cache for the immutable value reduces node roundtrips.
pub struct PublicImmutable<T, Context> {
    context: Context,
    storage_slot: Field,
}

// `PublicImmutable` stores both the packed value (using M fields) and its hash (1 field), requiring M + 1 total
// fields.
impl<T, Context, let M: u32> StateVariable<M + 1, Context> for PublicImmutable<T, Context>
where
    T: Packable<N = M>,
{
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicImmutable { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, Context> PublicImmutable<T, Context> {
    /// Returns the inner nullifier emitted during initialization.
    pub fn compute_initialization_inner_nullifier(self) -> Field {
        poseidon2_hash_with_separator([self.storage_slot], DOM_SEP__INITIALIZATION_NULLIFIER)
    }
}

impl<T> PublicImmutable<T, PublicContext> {
    /// Stores a permanent value.
    ///
    /// This function can only be called once on a given `PublicImmutable`: subsequent calls will fail with a duplicate
    /// nullifier.
    ///
    /// ## Examples
    ///
    /// Contract initialization:
    /// ```noir
    /// #[external("public")]
    /// #[initializer]
    /// fn initialize(decimals: u8) {
    ///     self.storage.decimals.initialize(decimals);
    /// }
    /// ```
    ///
    /// Non-initializer initialization:
    /// ```noir
    /// // Can only be called once per account
    /// #[external("public")]
    /// fn set_account_type(account_type: AccountType) {
    ///     self.storage.account_types.at(self.msg_sender()).initialize(account_type);
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SSTORE` AVM opcode is invoked a number of times equal to `T`'s packed length plus one, and the
    /// `EMITNULLIFIER` AVM opcode is invoked once.
    pub fn initialize(self, value: T)
    where
        T: Packable + Eq,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents the value
        // from being initialized again as each nullifier can be emitted only once.
        let nullifier = self.compute_initialization_inner_nullifier();
        self.context.push_nullifier_unsafe(nullifier);

        self.context.storage_write(self.storage_slot, WithHash::new(value));
    }

    /// Reads the permanent value.
    ///
    /// This function reverts the transaction if the `PublicImmutable` is not initialized.
    ///
    /// ## Examples
    ///
    /// A public getter that returns the permanent value:
    /// ```noir
    /// #[external("public")]
    /// fn get_decimals() -> u8 {
    ///     self.storage.decimals.read()
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SLOAD` AVM opcode is invoked a number of times equal to `T`'s packed length, and the `NULLIFIEREXISTS` AVM
    /// opcode is invoked once.
    pub fn read(self) -> T
    where
        T: Packable + Eq,
    {
        assert(self.is_initialized(), "Trying to read from uninitialized PublicImmutable");
        WithHash::public_storage_read(self.context, self.storage_slot)
    }

    /// Reads the permanent value, skipping the initialization check.
    ///
    /// This is cheaper than [`PublicImmutable::read`], but it should only be used if the `PublicImmutable` is known to
    /// be initialized.
    ///
    /// If the `PublicImmutable` is not initialized, this returns the default empty public storage value, which is all
    /// zeroes - equivalent to `let t = T::unpack(std::mem::zeroed());`.
    ///
    /// ## Examples
    ///
    /// A public getter that returns the permanent value:
    /// ```noir
    /// #[external("public")]
    /// fn get_decimals() -> u8 {
    ///     // This call is safe because `decimals` is initialized in the contract's initializer function
    ///     self.storage.decimals.read_unsafe()
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SLOAD` AVM opcode is invoked a number of times equal to `T`'s packed length.
    pub fn read_unsafe(self) -> T
    where
        T: Packable + Eq,
    {
        WithHash::public_storage_read(self.context, self.storage_slot)
    }

    /// Returns `true` if the `PublicImmutable` has been initialized.
    ///
    /// ## Examples:
    ///
    /// Conditional initialization:
    /// ```noir
    /// #[external("public")]
    /// fn set_account_type_if_not_set(account_type: AccountType) {
    ///     if !self.storage.account_types.at(self.msg_sender()).is_initialized() {
    ///         self.storage.account_types.at(self.msg_sender()).initialize(account_type);
    ///     }
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `NULLIFIEREXISTS` AVM opcode is invoked once.
    pub fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_inner_nullifier();

        // Safety: it is safe to assume that the state variable has been initialized if the initialization nullifier
        // exists because the nullifier was emitted in a public function, at the same time the state variable's public
        // storage was written to. This would only be unsafe if the nullifier was emitted in a private function which
        // then enqueued the public storage write, which is not the case.
        self.context.nullifier_exists_unsafe(nullifier, self.context.this_address())
    }
}

impl<T> PublicImmutable<T, UtilityContext> {
    /// Reads the permanent value.
    ///
    /// This function throws if the `PublicImmutable` is not initialized.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// #[external("utility")]
    /// fn get_decimals() -> u8 {
    ///     self.storage.decimals.read()
    /// }
    /// ```
    pub unconstrained fn read(self) -> T
    where
        T: Packable + Eq,
    {
        read_value_if_initialized_at_block(
            self.context.this_address(),
            self.storage_slot,
            self.compute_initialization_inner_nullifier(),
            self.context.block_header(),
        )
    }

    /// Returns `true` if the `PublicImmutable` has been initialized.
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_inner_nullifier();
        check_nullifier_exists(nullifier)
    }
}

impl<T> PublicImmutable<T, &mut PrivateContext> {
    /// Reads the permanent value.
    ///
    /// This function throws if the `PublicImmutable` is not initialized.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// #[external("private")]
    /// fn get_decimals() -> u8 {
    ///     self.storage.decimals.read()
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// A nullifier existence request is pushed to the context, which will be verified by the kernel circuit.
    /// Additionally, a historical public storage read at the anchor block (which is on the order of 4k gates) is
    /// performed for a single storage slot, **regardless of `T`'s packed length**. This is because
    /// [`PublicImmutable::initialize`] stores not just the value but also its hash: this function obtains the preimage
    /// from an oracle and proves that it matches the hash from public storage.
    ///
    /// Because of this reason it is convenient to group together all of a contract's public immutable values that are
    /// read privately in a single type `T`:
    ///
    /// ```noir
    /// // Bad: reading both `decimals` and `symbol` will require two historical public storage reads
    /// #[storage]
    /// struct Storage<Context> {
    ///     decimals: PublicImmutable<u8, Context>,
    ///     symbol: PublicImmutable<FieldCompressedString, Context>,
    /// }
    ///
    /// // Good: both `decimals` and `symbol` are retrieved in a single historical public storage read
    /// #[derive(Packable)]
    /// struct Config {
    ///     decimals: u8,
    ///     symbol: FieldCompressedString,
    /// }
    ///
    /// #[storage]
    /// struct Storage<Context> {
    ///     config: PublicImmutable<Config, Context>,
    /// }
    /// ```
    pub fn read(self) -> T
    where
        T: Packable + Eq,
    {
        let nullifier = self.compute_initialization_inner_nullifier();
        let contract_address = self.context.this_address();

        let nullifier_existence_request = compute_nullifier_existence_request(nullifier, contract_address);
        self.context.assert_nullifier_exists(nullifier_existence_request);

        let anchor_block_header = self.context.get_anchor_block_header();
        // Safety: `WithHash::verify_historical_public_storage_hint` asserts that the hint is the value stored at the
        // anchor block.
        let hint = unsafe {
            read_value_if_initialized_at_block(
                contract_address,
                self.storage_slot,
                nullifier,
                anchor_block_header,
            )
        };

        WithHash::verify_historical_public_storage_hint(
            anchor_block_header,
            contract_address,
            self.storage_slot,
            hint,
        );
        hint
    }
}

/// Returns the value of a `PublicImmutable` as of `anchor_block_header`.
///
/// Fails if the `PublicImmutable` at `storage_slot` is not initialized at that block.
///
/// The value is only fetched from the node if it is not cached, and it is cached once fetched.
unconstrained fn read_value_if_initialized_at_block<T>(
    contract_address: AztecAddress,
    storage_slot: Field,
    initialization_nullifier: Field,
    anchor_block_header: BlockHeader,
) -> T
where
    T: Packable,
{
    let anchor_block_number = anchor_block_header.block_number();
    read_cached_value(
        contract_address,
        storage_slot,
        initialization_nullifier,
        anchor_block_number,
    )
        .unwrap_or_else(|| {
            assert(
                check_nullifier_exists(initialization_nullifier),
                "Trying to read from uninitialized PublicImmutable",
            );

            let value: T = storage_read(anchor_block_header, contract_address, storage_slot);
            record_retractable_fact(
                contract_address,
                FactScope::public(),
                PUBLIC_IMMUTABLE_CACHE_TYPE_ID,
                storage_slot,
                PUBLIC_IMMUTABLE_VALUE_READ,
                EphemeralArray::from_array(value.pack()),
                BlockReference { block_number: anchor_block_number, block_hash: anchor_block_header.hash() },
            );

            value
        })
}

/// Returns the cached value of a `PublicImmutable`, if there is one.
///
/// Fails if the `PublicImmutable` at `storage_slot` is not initialized at the anchor block.
unconstrained fn read_cached_value<T>(
    contract_address: AztecAddress,
    storage_slot: Field,
    initialization_nullifier: Field,
    anchor_block_number: u32,
) -> Option<T>
where
    T: Packable,
{
    get_fact_collection(
        contract_address,
        FactScope::public(),
        PUBLIC_IMMUTABLE_CACHE_TYPE_ID,
        storage_slot,
    )
        .and_then(|collection| collection.facts.find(|fact: Fact| fact.fact_type_id == PUBLIC_IMMUTABLE_VALUE_READ))
        .map(|value_read_fact: Fact| {
            // The existence of a value read fact implies that the state variable was initialized at the time the value
            // was read. It is possible however that the value was read from an anchor block _after_ the one we're
            // currently using, in which case the initialization may not have yet occurred, so we must check for it
            // explicitly.
            // If the state variable _was_ already initialized by the anchor block, then we can still use the cached
            // value, even if read from a block after the anchor, because the value is immutable.
            if value_read_fact.origin_block.unwrap().block_number > anchor_block_number {
                assert(
                    check_nullifier_exists(initialization_nullifier),
                    "Trying to read from uninitialized PublicImmutable",
                );
            }

            let payload = value_read_fact.payload;
            let cached_len = payload.len();
            let packed_len = <T as Packable>::N;
            assert(
                cached_len == packed_len,
                f"Cached PublicImmutable value at slot {storage_slot} has {cached_len} fields, expected {packed_len}",
            );

            let mut packed = [0; <T as Packable>::N];
            for i in 0..packed.len() {
                packed[i] = payload.get(i);
            }
            T::unpack(packed)
        })
}
