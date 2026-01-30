use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    nullifier::utils::compute_nullifier_existence_request,
    oracle::nullifiers::check_nullifier_exists,
    state_vars::StateVariable,
    utils::WithHash,
};
use crate::protocol::{
    constants::DOM_SEP__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator, traits::Packable,
};

mod test;

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
/// a
/// private contract function, though it is not possible to initialize one. A common pattern is to have these functions
/// [enqueue a public self calls](crate::contract_self::ContractSelf::enqueue_self) in which the initialization
/// operation is performed.
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
/// fixed
/// values are not a problem, this is a fine choice for storage.
///
/// ## Examples
///
/// Declaring a `PublicImmutable` in the the contract's [`storage`](crate::macros::storage::storage) struct requires
/// specifying the type `T` that is stored in the variable:
///
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     decimals: PublicImmutable<u8, Context>,
///
///     account_types: Map<AztecAddress, PublicImmutable<AccountType, Context>, Context>,
/// }
/// ```
///
/// ## Requirements
///
/// The type `T` stored in the `PublicImmutable` must implement the `Packable` trait.
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
    ///     self.storage.decimals.iniitalize(decimals);
    /// }
    /// ```
    ///
    /// Non-initializer initialization:
    /// ```noir
    /// // Can only be called once per account
    /// #[external("public")]
    /// fn set_account_type(account_type: AccountType) {
    ///     self.storage.account_types.at(self.msg_sender()).iniitalize(account_type);
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
        self.context.push_nullifier(nullifier);

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

    /// Returns true if the `PublicImmutable` has been initialized.
    ///
    /// ## Examples:
    ///
    /// Conditional initialization:
    /// ```noir
    /// #[external("public")]
    /// fn set_account_type_if_not_set(account_type: AccountType) {
    ///     if !self.storage.account_types.at(self.msg_sender()).is_initialized() {
    ///         self.storage.account_types.at(self.msg_sender()).iniitalize(account_type);
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
        assert(self.is_initialized(), "Trying to read from uninitialized PublicImmutable");
        WithHash::utility_public_storage_read(self.context, self.storage_slot)
    }

    /// Returns true if the `PublicImmutable` has been initialized.
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
    /// Additionally, a historical public storage read at the anchor block is performed for a single storage slot,
    /// **regardless of `T`'s packed length**. This is because [`PublicImmutable::initialize`] stores not just the
    /// value
    /// but also its hash: this function obtains the preimage from an oracle and proves that it matches the hash from
    /// public storage.
    ///
    /// Because of this reason it is convenient to group together all of a contract's public immutable values that are
    /// read privately in a single type `T`:
    ///
    /// ```noir
    /// // Bad: reading both `decimals` and `symbol` will require two historical public storage reads
    /// #[storage]
    /// struct Storage<Context> {
    ///     decimals: PublicImmutable<u8, Context>,
    ///     symbol: PubicImmutable<FieldCompressedString, Context>,
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

        // Safety: We use this check to be able to test this function works properly on synthetic envs
        // like TXE. We assert the returned value only to provide a clear error message. The actual
        // constrained check that the nullifier exists is done below with `assert_nullifier_exists`
        // We should improve our synthetic envs because this check forces an unnecesary roundtrip
        let nullifier_exists = unsafe { check_nullifier_exists(nullifier) };
        assert(nullifier_exists, "Trying to read from uninitialized PublicImmutable");

        let nullifier_existence_request = compute_nullifier_existence_request(nullifier, self.context.this_address());
        self.context.assert_nullifier_exists(nullifier_existence_request);
        WithHash::historical_public_storage_read(
            self.context.get_anchor_block_header(),
            self.context.this_address(),
            self.storage_slot,
        )
    }
}
