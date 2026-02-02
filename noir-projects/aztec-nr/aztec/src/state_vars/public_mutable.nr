use crate::context::{PublicContext, UtilityContext};
use crate::protocol::traits::Packable;
use crate::state_vars::StateVariable;

/// Mutable public values.
///
/// This is one of the most basic public state variables. It is equivalent to a non-`immutable` non-`constant` Solidity
/// state variable.
///
/// It represents a public value of type `T` that can be written to repeatedly over the lifetime of the contract,
/// allowing the last value that was written to be read.
///
/// ## Access Patterns
///
/// A value stored in a `PublicMutable` can be read and written from public contract functions.
///
/// It is not possible to read or write a `PublicMutable` from private contract functions. A common pattern is to have
/// these functions [enqueue a public self calls](crate::contract_self::ContractSelf::enqueue_self) in which the
/// required operation is performed.
///
/// For an immutable variant which can be read from private functions, see
/// [`PublicImmutable`](crate::state_vars::PublicImmutable).
///
/// For a mutable (with restrictions) variant which can be read from private functions see
/// [`DelayedPublicMutable`](crate::state_vars::DelayedPublicMutable).
///
/// ## Privacy
///
/// `PublicMutable` provides zero privacy. All write and read operations are public: the entire network can see these
/// accesses and the data involved.
///
/// ## Use Cases
///
/// This is suitable for any kind of global state that needs to be accessible by everyone. For example, a token may
/// have a public total supply, or a voting contract may have public vote tallies.
///
/// Note that contracts having public values does not necessarily mean the the actions that update these values must
/// themselves be wholly public. For example, the token could allow for private minting and burning, and casting a vote
/// could be kept private: these private functions would enqueue a public function that writes to the `PublicMutable`.
///
/// Similarly, private functions can enqueue a public call in which the `PublicMutable` is checked to meet some
/// condition. For example, a private action might be executable only if the vote count has exceeded some threshold, in
/// which case the private function would enqueue a public function that reads from the `PublicMutable`.
///
/// Such patterns preserve the privacy of the account that executed the action, as well as details related to the
/// private execution itself, but they _do_ reveal that the transaction interacted with the `PublicMutable` value (and
/// hence that the contract was called), as all accesses to it are public. The
/// [`only_self`](crate::macros::functions::only_self) attribute is very useful when implementing this.
///
/// ## Examples
///
/// Declaring a `PublicMutable` in the the contract's [`storage`](crate::macros::storage::storage) struct requires
/// specifying the type `T` that is stored in the variable:
///
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     total_supply: PublicMutable<u128, Context>,
///     public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
///
///     vote_tallies: Map<ElectionId, PublicMutable<u128, Context>, Context>,
/// }
/// ```
///
/// ## Requirements
///
/// The type `T` stored in the `PublicMutable` must implement the `Packable` trait.
///
/// ## Implementation Details
///
/// Values are packed and stored directly in the public storage tree, with no overhead. A `PublicMutable` therefore
/// takes up as many storage slots as the packing length of the stored type `T`.
///
/// Private reads are not possible because private functions do not have access to the current network state, only the
/// _past_ state at the anchor block. They _can_ perform historical reads of `PublicMutable` values at past times, but
/// they have no way to guarantee that the value has not changed since then.
/// [`PublicImmutable`](crate::state_vars::PublicImmutable) and
/// [`DelayedPublicMutable`](crate::state_vars::DelayedPublicMutable) are examples of public state variables that _can_
/// be read privately by restricting mutation.
pub struct PublicMutable<T, Context> {
    context: Context,
    storage_slot: Field,
}

impl<T, Context, let M: u32> StateVariable<M, Context> for PublicMutable<T, Context>
where
    T: Packable<N = M>,
{
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicMutable { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T> PublicMutable<T, PublicContext> {
    /// Returns the current value.
    ///
    /// If [`write`](PublicMutable::write) has never been called, then this returns the default empty public storage
    /// value, which is all zeroes - equivalent to `let t = T::unpack(std::mem::zeroed());`.
    ///
    /// It is not possible to detect if a `PublicMutable` has ever been initialized or not other than by testing for
    /// the zero sentinel value. For a more robust solution, store an `Option<T>` in the `PublicMutable`.
    ///
    /// ## Examples
    ///
    /// A public getter that returns the current value:
    /// ```noir
    /// #[external("public")]
    /// fn get_total_supply() -> u128 {
    ///     self.storage.total_supply.read()
    /// }
    /// ```
    ///
    /// An [`only_self`](crate::macros::functions::only_self) helper that asserts a condition a private function
    /// requires:
    /// ```noir
    /// #[external("private")]
    /// fn execute_proposal(election_id: ElectionId) {
    ///     self.enqueue_self._assert_vote_passed(election_id);
    ///
    ///     // execute the proposal - this remains private
    /// }
    ///
    /// #[external("public")]
    /// #[only_self]
    /// fn _assert_vote_passed(election_id: ElectionId) {
    ///     assert(self.storage.vote_tallies.at(election_id).read() >= VOTE_PASSED_THRESHOLD);
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SLOAD` AVM opcode is invoked a number of times equal to `T`'s packed length.
    pub fn read(self) -> T
    where
        T: Packable,
    {
        self.context.storage_read(self.storage_slot)
    }

    /// Stores a new value.
    ///
    /// The old value is overridden and cannot be recovered. The new value can be immediately retrieved by
    /// [`read`](PublicMutable::read).
    ///
    /// ## Examples
    ///
    /// A public setter that updates the current value:
    /// ```noir
    /// #[external("public")]
    /// fn mint_tokens(recipient: AztecAddress, amount: u128) {
    ///     let current_recipient_balance = self.storage.public_balances.at(recipient).read();
    ///     self.storage.public_balances.at(recipient).write(current_recipient_balance + amount);
    ///
    ///     let current_supply = self.storage.total_supply.read();
    ///     self.storage.total_supply.write(current_supply + amount);
    /// }
    /// ```
    ///
    /// An [`only_self`](crate::macros::functions::only_self) helper that updates public state trigered by a private
    /// function:
    /// ```noir
    /// #[external("private")]
    /// fn vote_for_proposal(election_id: ElectionId, votes: u128) {
    ///     // validate the sender can cast this many votes - this remains private
    ///
    ///     self.enqueue_self._tally_vote(election_id, votes);
    /// }
    ///
    /// #[external("public")]
    /// #[only_self]
    /// fn _tally_vote(election_id: ElectionId, votes: u128) {
    ///     let current = self.storage.vote_tallies.read();
    ///     self.storage.vote_tallies.write(current + votes);
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SSTORE` AVM opcode is invoked a number of times equal to `T`'s packed length.
    pub fn write(self, value: T)
    where
        T: Packable,
    {
        self.context.storage_write(self.storage_slot, value);
    }
}

impl<T> PublicMutable<T, UtilityContext> {
    /// Returns the value at the anchor block.
    ///
    /// If [`write`](PublicMutable::write) has never been called, then this returns the default empty public storage
    /// value, which is all zeroes - equivalent to `let t = T::unpack(std::mem::zeroed());`.
    ///
    /// It is not possible to detect if a `PublicMutable` has ever been initialized or not other than by testing for
    /// the zero sentinel value. For a more robust solution, store an `Option<T>` in the `PublicMutable`.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// #[external("utility")]
    /// fn get_total_supply() -> u128 {
    ///     self.storage.total_supply.read()
    /// }
    /// ```
    pub unconstrained fn read(self) -> T
    where
        T: Packable,
    {
        self.context.storage_read(self.storage_slot)
    }
}
