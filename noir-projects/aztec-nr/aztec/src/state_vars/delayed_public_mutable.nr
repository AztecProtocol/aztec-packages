use crate::protocol::{
    delayed_public_mutable::{
        delayed_public_mutable_values::{unpack_delay_change, unpack_value_change},
        DelayedPublicMutableValues,
        ScheduledDelayChange,
        ScheduledValueChange,
    },
    traits::Packable,
};

use crate::{context::{PrivateContext, PublicContext, UtilityContext}, state_vars::StateVariable, utils::WithHash};

mod test;

/// Mutable public values with private read access.
///
/// This is an advanced public state variable, with no native Solidity equivalent.
///
/// Like [`PublicMutable`](crate::state_vars::PublicMutable) it represents a public value of type `T` that can be
/// written to repeatedly, but with a key improvement: the current value can also be **read from a private contract
/// function**.
///
/// This comes at the cost of extra restrictions on the state variable: writes do not come into effect immediately,
/// they must be **scheduled** to take place after some minimum delay. Reading from the state variable will therefore
/// return the previous value until some time passes, which is why this is a _delayed_ mutable variable.
///
/// It is these delays that enable the capacity for reads from private contract functions, as they provide guarantees
/// regarding how long can some historical state observed at the anchor block be known to not change.
///
/// Delays can be modified during the lifetime of the contract.
///
/// ## Access Patterns
///
/// The current value stored in a `DelayedPublicMutable` can be read from public contract functions, and writes can be
/// scheduled to happen in the future.
///
/// Public contract functions can also schedule changes to the write delay, as well as inspect any already scheduled
/// value or delay changes.
///
/// Private contract functions can read the **current** value of the state variable, but not past or scheduled values.
/// They cannot read the current delay, and they cannot schedule any kind of value change.
///
/// ## Privacy
///
/// The value stored in `DelayedPublicMutable` is fully public, as are all scheduled value and delay changes.
///
/// Reads from a private contract function are almost fully private: the only observable effect is that they set the
/// transaction's `expiration_timestamp` property, possibly reducing the privacy set. See
/// [`PrivateContext::set_expiration_timestamp`](crate::context::PrivateContext::set_expiration_timestamp).
///
/// ## Use Cases
///
/// These are mostly an extension of [`PublicMutable`](crate::state_vars::PublicMutable)'s, given that what this state
/// variable essentially achieves is to provide private reads to it. For example, it can be used for global contract
/// configuration (such as fees, access control, etc.) that users will need to access during private interactions.
///
/// The key consideration is whether the enforced minimum delay on writes prevents using this state variable. In some
/// scenarios this restriction is incompatible with requirements (such as a token's total supply, which must always be
/// up to date), while in others the enhanced privacy might make the tradeoff acceptable (such as when dealing with
/// contract pauses or access control revocation, where a delay of some hours could be acceptable).
///
/// Note that, just like in [`PublicMutable`](crate::state_vars::PublicMutable), the fact that the values are public
/// does not necessarily mean the actions that update these values must themselves be wholly public. To learn more,
/// see the notes there regarding usage of [`only_self`](crate::macros::functions::only_self).
///
/// ## Choosing Delays
///
/// A short delay reduces the most obvious downside of `DelayedPublicMutable`, and so it is natural to wish to make it
/// be as low as possible. It is therefore important to understand the tradeoffs involved in delay selection.
///
/// A shorter delay will result in a lower `expiration_timestamp` property of transactions that privately read the
/// state variable, reducing its privacy set. If the delay is smaller than that of any other contract, then this
/// privacy leak might be large enough to uniquely identify those transactions that interact with the contract - fully
/// defeating the purpose of `DelayedPublicMutable`.
///
/// Additionally, a lower `expiration_timestamp` obviously causes transactions to expire earlier, resulting in
/// multiple issues. Among others, this can make large transactions that take long to prove be unfeasible, restrict
/// users with slow proving devices, and force large transaction fees to guarantee fast inclusion.
///
/// In practice, a delay of at least a couple hours is recommended. From a privacy point of view the optimal delay is
/// [`crate::protocol::constants::MAX_TX_LIFETIME`], which puts contracts in the same privacy set as those that do not
/// use `DelayedPublicMutable` at all.
///
/// ## Examples
///
/// Declaring a `DelayedPublicMutable` in the contract's [`storage`](crate::macros::storage::storage) struct
/// requires specifying the type `T` that is stored in the variable, along with the initial delay used when scheduling
/// value changes:
///
/// ```noir
/// global PAUSE_CONTRACT_INITIAL_DELAY_S: u64 = 6 * 60 * 60; // 6 hours
/// global CHANGE_AUTHORIZATION_INITIAL_DELAY_S: u64 = 24 * 60 * 60; // 24 hours
///
/// #[storage]
/// struct Storage<C> {
///     paused: DelayedPublicMutable<bool, PAUSE_CONTRACT_INITIAL_DELAY_S, C>,
///     user_authorization: Map<AztecAddress, DelayedPublicMutable<bool, CHANGE_AUTHORIZATION_INITIAL_DELAY_S, C>, C>,
/// }
/// ```
///
/// Note that this initial delay can be altered during the contract's lifetime via
/// [`DelayedPublicMutable::schedule_delay_change`].
///
/// ## Requirements
///
/// The type `T` stored in the `DelayedPublicMutable` must implement the `Eq` and
/// [`Packable`](crate::protocol::traits::Packable) traits.
///
/// ## Implementation Details
///
/// This state variable stores more information in public storage than
/// [`PublicMutable`](crate::state_vars::PublicMutable), as it needs to keep track of the current and scheduled change
/// information for both the value and the delay - see
/// [`crate::protocol::delayed_public_mutable::DelayedPublicMutableValues`].
///
/// It also stores a hash of this entire configuration so that private reads can be performed in a single historical
/// public storage read - see [`crate::utils::WithHash`].
///
/// This results in a total of `N * 2 + 2` storage slots used, where `N` is the packing length of the stored type `T`.
/// This makes it quite important to ensure `T`'s implementation of [`Packable`](crate::protocol::traits::Packable) is
/// space-efficient.
pub struct DelayedPublicMutable<T, let InitialDelay: u64, Context> {
    context: Context,
    storage_slot: Field,
}

// We allocate `M + 1` slots because we're going to store a `WithHash<DelayedPublicMutableValues<T, InitialDelay>>`,
// and `WithHash` increases the packing length by one.
impl<T, let InitialDelay: u64, Context, let M: u32> StateVariable<M + 1, Context> for DelayedPublicMutable<T, InitialDelay, Context>
where
    DelayedPublicMutableValues<T, InitialDelay>: Packable<N = M>,
{
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, PublicContext>
where
    T: Eq,
{
    /// Schedules a write to the current value.
    ///
    /// The current value does not immediately change. Once the current delay passes,
    /// [`get_current_value`](DelayedPublicMutable::get_current_value) automatically begins to return `new_value`.
    ///
    /// ## Multiple Scheduled Changes
    ///
    /// Only a **single** value can be scheduled to become the new value at a given point in time. Any prior scheduled
    /// changes which have not yet become current are **replaced** with the new one and discarded.
    ///
    /// To illustrate this, consider a scenario at `t0` with a current value `A`. A value change to `B` is scheduled to
    /// occur at `t1`. At some point _before_ `t1`, a second value change to `C` is scheduled to occur at `t2` (`t2 >
    /// t1`). The result is that the current value continues to be `A` all the way until `t2`, at which point it
    /// changes to `C`.
    ///
    /// This also means that it is possible to **cancel** a scheduled change by calling `schedule_value_change` with
    /// the current value.
    ///
    /// ## Examples
    ///
    /// A public setter that authorizes a user:
    /// ```noir
    /// #[external("public")]
    /// fn authorize_user(user: AztecAddress) {
    ///     assert_eq(self.storage.admin.read(), self.msg_sender(), "caller is not admin");
    ///     self.storage.user_authorization.at(user).schedule_value_change(true);
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SSTORE` AVM opcode is invoked `2 * N + 2` times, where `N` is `T`'s packed length.
    pub fn schedule_value_change(self, new_value: T)
    where
        T: Packable,
    {
        let _ = self.schedule_and_get_value_change(new_value);
    }

    /// Schedules a write to the current value, returning the scheduled entry.
    pub fn schedule_and_get_value_change(self, new_value: T) -> ScheduledValueChange<T>
    where
        T: Packable,
    {
        let mut value_change = self.read_value_change();
        let delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();
        let current_delay = delay_change.get_current(current_timestamp);

        // TODO: make this configurable https://github.com/AztecProtocol/aztec-packages/issues/5501
        let timestamp_of_change = current_timestamp + current_delay;
        value_change.schedule_change(new_value, current_timestamp, current_delay, timestamp_of_change);

        self.write(value_change, delay_change);

        value_change
    }

    /// Schedules a write to the current delay.
    ///
    /// This works just like [`schedule_value_change`](DelayedPublicMutable::schedule_value_change), except instead of
    /// changing the value in the state variable, it changes the delay that will govern future invocations of that
    /// function.
    ///
    /// The current delay does not immediately change. Once the current delay passes,
    /// [`get_current_delay`](DelayedPublicMutable::get_current_delay) automatically begins to return `new_delay`, and
    /// [`schedule_value_change`](DelayedPublicMutable::schedule_value_change) begins using it.
    ///
    /// ## Multiple Scheduled Changes
    ///
    /// Only a **single** delay can be scheduled to become the new delay at a given point in time. Any prior scheduled
    /// changes which have not yet become current are **replaced** with the new one and discarded.
    ///
    /// To illustrate this, consider a scenario at `t0` with a current delay `A`. A delay change to `B` is scheduled to
    /// occur at `t1`. At some point _before_ `t1`, a second delay change to `C` is scheduled to occur at `t2` (`t2 >
    /// t1`). The result is that the current delay continues to be `A` all the way until `t2`, at which point it
    /// changes to `C`.
    ///
    /// ## Delays When Changing Delays
    ///
    /// A delay change cannot always be immediate: if it were, then it'd be possible to break `DelayedPublicMutable`'s
    /// invariants by setting the delay to a very low or zero value and then scheduling a value change, resulting in a
    /// new value becoming the current one earlier than was predictable based on the prior delay. This would prohibit
    /// private reads, which is the reason for existence of this state variable.
    ///
    /// Instead, delay changes are themselves scheduled and delay so that the property mentioned above is preserved.
    /// This results in delay increases and decreases being asymmetrical.
    ///
    /// If the delay is being decreased, then this requires a delay equal to the difference between the current and new
    /// delay, so that a scheduled value change that occurred as the new delay came into effect would be scheduled for
    /// the same timestamp as if no delay change had occurred.
    ///
    /// If the delay is being increased, then the new delay becomes effective immediately, as new value changes would
    /// be scheduled for a timestamp that is further than the current delay.
    ///
    /// ## Examples
    ///
    /// A public setter that sets the pause delay:
    /// ```noir
    /// #[public]
    /// fn set_pause_delay(delay: u64) {
    ///     assert_eq(self.storage.admin.read(), self.msg_sender(), "caller is not admin");
    ///     self.storage.paused.schedule_delay_change(delay);
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SSTORE` AVM opcode is invoked `2 * N + 2` times, where `N` is `T`'s packed length.
    pub fn schedule_delay_change(self, new_delay: u64)
    where
        T: Packable,
    {
        let mut delay_change = self.read_delay_change();

        let current_timestamp = self.context.timestamp();

        delay_change.schedule_change(new_delay, current_timestamp);

        // We can't just update the `ScheduledDelayChange`, we need to update the entire storage because we need to
        // also recompute and write the hash.
        // We _could_ just read everything, update the hash and `ScheduledDelayChange` but not overwrite the
        // `ScheduledValueChange`, resulting in fewer storage writes, but that would require careful handling of
        // storage slots and `WithHash`'s internal layout, which is not worth doing at this point.
        self.write(self.read_value_change(), delay_change);
    }

    /// Returns the current value.
    ///
    /// If [`schedule_value_change`](DelayedPublicMutable::schedule_value_change) has never been called, then this
    /// returns the default empty public storage value, which is all zeroes - equivalent to `let t =
    /// T::unpack(std::mem::zeroed());`.
    ///
    /// It is not possible to detect if a `DelayedPublicMutable` has ever been initialized or not other than by testing
    /// for the zero sentinel value. For a more robust solution, store an `Option<T>` in the `DelayedPublicMutable`.
    ///
    /// Use [`get_scheduled_value`](DelayedPublicMutable::get_scheduled_value) to instead get the last value that was
    /// scheduled to become the current one (which will equal the current value if the delay has already passed).
    ///
    /// ## Examples
    ///
    /// A public getter that returns a user's authorization status:
    /// ```noir
    /// #[external("public")]
    /// fn is_authorized(user: AztecAddress) -> bool {
    ///     self.storage.user_authorization.at(user).get_current_value()
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SLOAD` AVM opcode is invoked `2 * N + 1` times, where `N` is `T`'s packed length.
    pub fn get_current_value(self) -> T
    where
        T: Packable,
    {
        let current_timestamp = self.context.timestamp();
        let value_change = self.read_value_change();

        value_change.get_current_at(current_timestamp)
    }

    /// Returns the current delay.
    ///
    /// This is the delay that would be used by [`schedule_value_change`](DelayedPublicMutable::schedule_value_change)
    /// if it were called in the current transaction.
    ///
    /// If [`schedule_delay_change`](DelayedPublicMutable::schedule_delay_change) has never been called, then this
    /// returns the `InitialDelay` used in the [`storage`](crate::macros::storage::storage) struct.
    ///
    /// Use [`get_scheduled_delay`](DelayedPublicMutable::get_scheduled_delay) to instead get the last delay that was
    /// scheduled to become the current one (which will equal the current delay if the delay has already passed).
    ///
    /// ## Examples
    ///
    /// A public getter that returns the pause delay:
    /// ```noir
    /// #[external("public")]
    /// fn get_pause_delay() -> u64 {
    ///     self.storage.paused.get_current_delay()
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// The `SLOAD` AVM opcode is invoked a single time, regardless of `T`.
    pub fn get_current_delay(self) -> u64
    where
        T: Packable,
    {
        let current_timestamp = self.context.timestamp();
        self.read_delay_change().get_current(current_timestamp)
    }

    /// Returns the last scheduled value and timestamp of change.
    pub fn get_scheduled_value(self) -> (T, u64)
    where
        T: Packable,
    {
        self.read_value_change().get_scheduled()
    }

    /// Returns the last scheduled delay and timestamp of change.
    pub fn get_scheduled_delay(self) -> (u64, u64)
    where
        T: Packable,
    {
        self.read_delay_change().get_scheduled()
    }

    fn read_value_change(self) -> ScheduledValueChange<T>
    where
        T: Packable,
    {
        // We don't read ScheduledValueChange directly by having it implement Packable because ScheduledValueChange and
        // ScheduledDelayChange are packed together (sdc and svc.timestamp_of_change are stored in the same slot).
        let packed = self.context.storage_read(self.storage_slot);
        unpack_value_change::<T, <T as Packable>::N>(packed)
    }

    fn read_delay_change(self) -> ScheduledDelayChange<InitialDelay>
    where
        T: Packable,
    {
        // Since all ScheduledDelayChange member are packed into a single field, we can read a single storage slot here
        // and skip the ones that correspond to ScheduledValueChange members. We are abusing the fact that the field
        // containing the ScheduledDelayChange data is the first one in the storage layout - otherwise we'd need to
        // offset the storage slot to get the position where it'd land. We don't read ScheduledDelayChange directly by
        // having it implement Packable because ScheduledValueChange and ScheduledDelayChange are packed together (sdc
        // and svc.timestamp_of_change are stored in the same slot).
        let packed = self.context.storage_read(self.storage_slot);
        unpack_delay_change::<InitialDelay>(packed)
    }

    fn write(self, value_change: ScheduledValueChange<T>, delay_change: ScheduledDelayChange<InitialDelay>)
    where
        T: Packable,
    {
        // Whenever we write to public storage, we write both the value change and delay change to storage at once. We
        // do so by wrapping them in a single struct (`DelayedPublicMutableValues`). Then we wrap the resulting struct
        // in `WithHash`. Wrapping in `WithHash` makes for more costly writes but it also makes private proofs much
        // simpler because they only need to produce a historical proof for the hash, which results in a single
        // inclusion proof (as opposed to 4 in the best case scenario in which T is a single field). Private delayed
        // public mutable reads are assumed to be much more frequent than public writes, so this tradeoff makes sense.
        let values = WithHash::new(DelayedPublicMutableValues::new(value_change, delay_change));

        self.context.storage_write(self.storage_slot, values);
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, &mut PrivateContext>
where
    T: Eq,
{
    /// Returns the current value.
    ///
    /// If [`schedule_value_change`](DelayedPublicMutable::schedule_value_change) has never been called, then this
    /// returns the default empty public storage value, which is all zeroes - equivalent to `let t =
    /// T::unpack(std::mem::zeroed());`.
    ///
    /// It is not possible to detect if a `DelayedPublicMutable` has ever been initialized or not other than by testing
    /// for the zero sentinel value. For a more robust solution, store an `Option<T>` in the `DelayedPublicMutable`.
    ///
    /// ## Privacy
    ///
    /// This function does leak some privacy, though in a subtle way. Understanding this is key to understanding how to
    /// use `DelayedPublicMutable` in a privacy-preserving way.
    ///
    /// Private reads are based on a historical public storage read at the anchor block (i.e.
    /// [`crate::history::storage::public_storage_historical_read`]). `DelayedPublicMutable` is able to provide
    /// guarantees about values read in the past remaining the state variable's current value into the future due to
    /// the existence of delays when scheduling writes. It then sets the `expiration_timestamp` property of the current
    /// transaction (see
    /// [`PrivateContext::set_expiration_timestamp`](crate::context::PrivateContext::set_expiration_timestamp)) to
    /// ensure that the transaction can only be included in a block **prior** to the state variable's value changing.
    /// In other words, it knows some facts about the near future up until some time horizon, and then makes sure that
    /// it doesn't act on this knowledge past said moment.
    ///
    /// Because the `expiration_timestamp` property is part of the transaction's public information, any mutation to
    /// this value could result in transaction fingerprinting. Note that multiple contracts may set this value during a
    /// transaction: it is the smallest (most restrictive) timestamp that will be used.
    ///
    /// If the state variable **does not** have any value changes scheduled, then the timestamp will be set to that of
    /// the anchor block plus the current delay. If multiple contracts use the same delay for their
    /// `DelayedPublicMutable` state variables, then these will all be in the same privacy set.
    ///
    /// If the state variable **does** have a value change scheduled, then the timestamp will be set to equal the time
    /// at which the current value will change, i.e. the one
    /// [`get_scheduled_value`](DelayedPublicMutable::get_scheduled_value) returns - which is public information. This
    /// results in an unavoidable privacy leak of any transactions in which a contract privately reads a
    /// `DelayedPublicMutable` that will change soon.
    ///
    /// Transactions that do not read from a `DelayedPublicMutable` are part of a privacy set in which the
    /// `expiration_timestamp` is set to their anchor block plus [`crate::protocol::constants::MAX_TX_LIFETIME`],
    /// making this the most privacy-preserving delay. The less frequent said value changes are, the more private the
    /// contract is. Wallets can also then choose to further lower this timestamp to make it less obvious that their
    /// transactions are interacting with this soon-to-change variable.
    ///
    /// ## Examples
    ///
    /// A private action that requires authorization:
    /// ```noir
    /// #[external("private")]
    /// fn do_action() {
    ///     assert(
    ///         self.storage.user_authorization.at(self.msg_sender()).get_current_value(),
    ///         "caller is not authorized"
    ///     );
    ///
    ///     // do the action
    /// }
    /// ```
    ///
    /// A private action that can be paused:
    /// ```noir
    /// #[external("private")]
    /// fn do_action() {
    ///     assert(!self.storage.paused.get_current_value(), "contract is paused");
    ///
    ///     // do the action
    /// }
    /// ```
    ///
    /// ## Cost
    ///
    /// This function performs a single merkle tree inclusion proof, which is in the order of 4k gates.
    pub fn get_current_value(self) -> T
    where
        T: Packable,
    {
        // When reading the current value in private we construct a historical state proof for the public value.
        // However, since this value might change, we must constrain the maximum transaction timestamp as this proof
        // will only be valid for the time we can ensure the value will not change, which will depend on the current
        // delay and any scheduled delay changes.
        let (value_change, delay_change, anchor_block_timestamp) = self.anchor_read_from_public_storage();

        // We use the effective minimum delay as opposed to the current delay at the anchor block's timestamp as this
        // one also takes into consideration any scheduled delay changes. For example, consider a scenario in which at
        // timestamp `x` the current delay was 86400 seconds (1 day). We may naively think that the earliest we could
        // change the value would be at timestamp `x + 86400` by scheduling immediately in the block following the
        // anchor block - since blocks within the same checkpoint can share timestamps, the earliest scheduling can
        // happen at the anchor block's timestamp `x`.  But if there was a delay change scheduled for timestamp `y` to
        // reduce the delay to 43200 seconds (12 hours), then if a value change was scheduled at timestamp `y` it would
        // go into effect at timestamp `y + 43200`, which is earlier than what we'd expect if we only considered the
        // current delay.
        let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(anchor_block_timestamp);
        let time_horizon = value_change.get_time_horizon(anchor_block_timestamp, effective_minimum_delay);

        // We prevent this transaction from being included in any timestamp after the time horizon, ensuring that the
        // historical public value matches the current one, since it can only change after the horizon.
        self.context.set_expiration_timestamp(time_horizon);

        value_change.get_current_at(anchor_block_timestamp)
    }

    fn anchor_read_from_public_storage(self) -> (ScheduledValueChange<T>, ScheduledDelayChange<InitialDelay>, u64)
    where
        T: Packable,
    {
        let header = self.context.get_anchor_block_header();
        let address = self.context.this_address();

        let anchor_block_timestamp = header.global_variables.timestamp;

        let values: DelayedPublicMutableValues<T, InitialDelay> =
            WithHash::historical_public_storage_read(header, address, self.storage_slot);

        (values.svc, values.sdc, anchor_block_timestamp)
    }
}

impl<T, let InitialDelay: u64> DelayedPublicMutable<T, InitialDelay, UtilityContext>
where
    T: Eq,
{
    pub unconstrained fn get_current_value(self) -> T
    where
        T: Packable,
    {
        let dpmv: DelayedPublicMutableValues<T, InitialDelay> =
            WithHash::utility_public_storage_read(self.context, self.storage_slot);

        let current_timestamp = self.context.timestamp();
        dpmv.svc.get_current_at(current_timestamp)
    }
}
