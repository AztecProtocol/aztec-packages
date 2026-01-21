//! The `self` contract value.

use crate::{
    context::{
        calls::{PrivateCall, PrivateStaticCall, PublicCall, PublicStaticCall},
        private_context::PrivateContext,
        public_context::PublicContext,
        utility_context::UtilityContext,
    },
    event::{
        event_emission::{emit_event_in_private, emit_event_in_public},
        event_interface::EventInterface,
        event_message::EventMessage,
    },
};
use protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// Core interface for interacting with aztec-nr contract features.
///
/// This struct is automatically injected into every [external](crate::macros::functions::external) and
/// [internal](crate::macros::functions::internal) contract function by the Aztec macro system and is accessible through
/// the `self` variable.
///
/// ## Usage in Contract Functions
///
/// Once injected, you can use `self` to:
/// - Access storage: `self.storage.balances.at(owner).read()`
/// - Call contracts: `self.call(Token::at(address).transfer(recipient, amount))`
/// - Emit events: `self.emit(event).deliver_to(recipient, delivery_mode)` (private) or `self.emit(event)` (public)
/// - Get the contract address: `self.address`
/// - Get the caller: `self.msg_sender()`
/// - Access low-level Aztec.nr APIs through the context: `self.context`
///
/// ## Example
///
/// ```noir
/// #[external("private")]
/// fn withdraw(amount: u128, recipient: AztecAddress) {
///     // Get the caller of this function
///     let sender = self.msg_sender();
///
///     // Access storage
///     let token = self.storage.donation_token.get_note().get_address();
///
///     // Call contracts
///     self.call(Token::at(token).transfer(recipient, amount));
/// }
/// ```
///
/// ## Type Parameters
///
/// - `Context`: The execution context type - either `&mut PrivateContext`, `PublicContext`, or `UtilityContext`
/// - `Storage`: The contract's storage struct (defined with [storage](crate::macros::storage::storage), or `()` if the
///    contract has no storage
/// - `CallSelf`: Macro-generated type for calling contract's own non-view functions
/// - `EnqueueSelf`: Macro-generated type for enqueuing calls to the contract's own non-view functions
/// - `CallSelfStatic`: Macro-generated type for calling contract's own view functions
/// - `EnqueueSelfStatic`: Macro-generated type for enqueuing calls to the contract's own view functions
pub struct ContractSelf<Context, Storage, CallSelf, EnqueueSelf, CallSelfStatic, EnqueueSelfStatic, CallInternal> {
    /// The address of this contract
    pub address: AztecAddress,

    /// The contract's storage instance, representing the struct to which the [storage](crate::macros::storage::storage)
    /// macro was applied in your contract. If the contract has no storage, the type of this will be `()`.
    ///
    /// This storage instance is specialized for the current execution context (private, public, or utility) and
    /// provides access to the contract's state variables. Each state variable accepts the context as a generic
    /// parameter, which determines its available functionality. For example, a PublicImmutable variable can be read
    /// from any context (public, private, or utility) but can only be written to from public contexts.
    ///
    /// ## Developer Note
    ///
    /// If you've arrived here while trying to access your contract's storage while the `Storage` generic type is set to
    /// unit type `()`, it means you haven't yet defined a Storage struct using the
    /// [storage](crate::macros::storage::storage) macro in your contract.
    /// For guidance on setting this up, please refer to our docs:
    /// https://docs.aztec.network/developers/docs/guides/smart_contracts/storage

    pub storage: Storage,

    /// The execution context whose type is determined by the [external](crate::macros::functions::external) attribute
    /// of the contract function based on the external function type (private, public, or utility).
    pub context: Context,

    /// Provides type-safe methods for calling this contract's own non-view functions.
    ///
    /// In private and public contexts this will be a struct with appropriate methods;
    /// in utility context it will be the unit type `()`.
    ///
    /// Example API:
    /// ```noir
    /// self.call_self.some_private_function(args)
    /// ```
    pub call_self: CallSelf,

    /// Provides type-safe methods for enqueuing calls to this contract's own non-view functions.
    ///
    /// In private context this will be a struct with appropriate methods;
    /// in public and utility contexts it will be the unit type `()`.
    ///
    /// Example API:
    /// ```noir
    /// self.enqueue_self.some_public_function(args)
    /// ```
    pub enqueue_self: EnqueueSelf,

    /// Provides type-safe methods for calling this contract's own view functions.
    ///
    /// In private and public contexts this will be a struct with appropriate methods;
    /// in utility context it will be the unit type `()`.
    ///
    /// Example API:
    /// ```noir
    /// self.call_self_static.some_view_function(args)
    /// ```
    pub call_self_static: CallSelfStatic,

    /// Provides type-safe methods for enqueuing calls to this contract's own view functions.
    ///
    /// In private context this will be a struct with appropriate methods;
    /// in public and utility contexts it will be the unit type `()`.
    ///
    /// Example API:
    /// ```noir
    /// self.enqueue_self_static.some_public_view_function(args)
    /// ```
    pub enqueue_self_static: EnqueueSelfStatic,

    /// Provides type-safe methods for calling internal functions.
    ///
    /// In private and public contexts this will be a struct with appropriate methods;
    /// in utility context it will be the unit type `()`.
    ///
    /// Example API:
    /// ```noir
    /// self.internal.some_internal_function(args)
    /// ```
    pub internal: CallInternal,
}

// Implementation for `ContractSelf` in private execution contexts.
//
// This implementation is used when an external or internal contract function is marked with "private".
impl<Storage, CallSelf, EnqueueSelf, CallSelfStatic, EnqueueSelfStatic, CallInternal> ContractSelf<&mut PrivateContext, Storage, CallSelf, EnqueueSelf, CallSelfStatic, EnqueueSelfStatic, CallInternal> {
    /// Creates a new `ContractSelf` instance for a private function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new_private(
        context: &mut PrivateContext,
        storage: Storage,
        call_self: CallSelf,
        enqueue_self: EnqueueSelf,
        call_self_static: CallSelfStatic,
        enqueue_self_static: EnqueueSelfStatic,
        internal: CallInternal,
    ) -> Self {
        Self {
            context,
            storage,
            address: context.this_address(),
            call_self,
            enqueue_self,
            call_self_static,
            enqueue_self_static,
            internal,
        }
    }

    /// The address of the contract address that made this function call.
    ///
    /// This is similar to Solidity's `msg.sender` value.
    ///
    /// ## Transaction Entrypoints
    ///
    /// As there are no EOAs (externally owned accounts) in Aztec, unlike on Ethereum, the first contract function
    /// executed in a transaction (i.e. transaction entrypoint) does **not** have a caller. This function panics when
    /// executed in such a context.
    ///
    /// If you need to handle these cases, use [PrivateContext::maybe_msg_sender].
    pub fn msg_sender(self) -> AztecAddress {
        self.context.maybe_msg_sender().unwrap()
    }

    /// Emits an event privately.
    ///
    /// Unlike public events, private events do not reveal their contents publicly. They instead create an
    /// [EventMessage] containing the private event information, which **MUST** be delivered to a recipient via
    /// [EventMessage::deliver_to] in order for them to learn about the event. Multiple recipients can have the same
    /// message be delivered to them.
    ///
    /// # Example
    /// ```noir
    /// #[event]
    /// struct Transfer { from: AztecAddress, to: AztecAddress, amount: u128 }
    ///
    /// #[external("private")]
    /// fn transfer(to: AztecAddress, amount: u128) {
    ///     let from = self.msg_sender();
    ///
    ///     let message: EventMessage = self.emit(Transfer { from, to, amount });
    ///     message.deliver_to(from, MessageDelivery.OFFCHAIN);
    ///     message.deliver_to(to, MessageDelivery.ONCHAIN_CONSTRAINED);
    /// }
    /// ```
    ///
    /// # Cost
    ///
    /// Private event emission always results in the creation of a nullifer, which acts as a commitment to the event and
    /// is used by third parties to verify its authenticity. See [EventMessage::deliver_to] for the costs associated to
    /// delivery.
    ///
    /// # Privacy
    ///
    /// The nullifier created when emitting a private event leaks nothing about the content of the event - it's a
    /// commitment that includes a random value, so even with full knowledge of the event preimage determining if an
    /// event was emitted or not requires brute-forcing the entire `Field` space.
    pub fn emit<Event>(&mut self, event: Event) -> EventMessage<Event>
    where
        Event: EventInterface + Serialize,
    {
        emit_event_in_private(self.context, event)
    }

    /// Makes a private contract call.
    ///
    /// # Arguments
    /// * `call` - The object representing the private function to invoke.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    /// # Example
    /// ```noir
    /// self.call(Token::at(address).transfer_in_private(recipient, amount));
    /// ```
    ///
    /// This enables contracts to interact with each other while maintaining
    /// privacy. This "composability" of private contract functions is a key
    /// feature of the Aztec network.
    ///
    /// If a user's transaction includes multiple private function calls, then
    /// by the design of Aztec, the following information will remain private[1]:
    /// - The function selectors and contract addresses of all private function
    ///   calls will remain private, so an observer of the public mempool will
    ///   not be able to look at a tx and deduce which private functions have
    ///   been executed.
    /// - The arguments and return values of all private function calls will
    ///   remain private.
    /// - The person who initiated the tx will remain private.
    /// - The notes and nullifiers and private logs that are emitted by all
    ///   private function calls will (if designed well) not leak any user
    ///   secrets, nor leak which functions have been executed.
    ///
    /// [1] Caveats: Some of these privacy guarantees depend on how app
    /// developers design their smart contracts. Some actions _can_ leak
    /// information, such as:
    /// - Calling an internal public function.
    /// - Calling a public function and not setting msg_sender to Option::none
    ///   (see https://github.com/AztecProtocol/aztec-packages/pull/16433)
    /// - Calling any public function will always leak details about the nature
    ///   of the transaction, so devs should be careful in their contract
    ///   designs. If it can be done in a private function, then that will give
    ///   the best privacy.
    /// - Not padding the side-effects of a tx to some standardized, uniform
    ///   size. The kernel circuits can take hints to pad side-effects, so a
    ///   wallet should be able to request for a particular amount of padding.
    ///   Wallets should ideally agree on some standard.
    ///   - Padding should include:
    ///     - Padding the lengths of note & nullifier arrays
    ///     - Padding private logs with random fields, up to some standardized
    ///       size.
    /// See also: https://docs.aztec.network/developers/resources/considerations/privacy_considerations
    ///
    /// # Advanced
    /// * The call is added to the private call stack and executed by kernel
    ///   circuits after this function completes
    /// * The called function can modify its own contract's private state
    /// * Side effects from the called function are included in this transaction
    /// * The call inherits the current transaction's context and gas limits
    ///
    pub fn call<let M: u32, let N: u32, T>(&mut self, call: PrivateCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        call.call(self.context)
    }

    /// Makes a read-only private contract call.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state, emit L2->L1 messages, nor emit events. Any nested
    /// calls are constrained to also be static calls.
    ///
    /// # Arguments
    /// * `call` - The object representing the read-only private function to invoke.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    /// # Example
    /// ```noir
    /// self.view(Token::at(address).balance_of_private(recipient));
    /// ```
    pub fn view<let M: u32, let N: u32, T>(&mut self, call: PrivateStaticCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        call.view(self.context)
    }

    /// Enqueues a public contract call function.
    ///
    /// Unlike private functions which execute immediately on the user's device,
    /// public function calls are "enqueued" and executed some time later by a
    /// block proposer.
    ///
    /// This means a public function cannot return any values back to a private
    /// function, because by the time the public function is being executed,
    /// the private function which called it has already completed execution.
    /// (In fact, the private function has been executed and proven, along with
    /// all other private function calls of the user's tx. A single proof of the
    /// tx has been submitted to the Aztec network, and some time later a
    /// proposer has picked the tx up from the mempool and begun executing all
    /// of the enqueued public functions).
    ///
    /// # Privacy warning
    /// Enqueueing a public function call is an inherently leaky action.
    /// Many interesting applications will require some interaction with public
    /// state, but smart contract developers should try to use public function
    /// calls sparingly, and carefully.
    /// _Internal_ public function calls are especially leaky, because they
    /// completely leak which private contract made the call.
    /// See also: https://docs.aztec.network/developers/resources/considerations/privacy_considerations
    ///
    /// # Arguments
    /// * `call` - The interface representing the public function to enqueue.
    pub fn enqueue<let M: u32, let N: u32, T>(&mut self, call: PublicCall<M, N, T>) {
        call.enqueue(self.context)
    }

    /// Enqueues a read-only public contract call function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state, emit L2->L1 messages, nor emit events. Any nested
    /// calls are constrained to also be static calls.
    ///
    /// # Arguments
    /// * `call` - The object representing the read-only public function to enqueue.
    ///
    /// # Example
    /// ```noir
    /// self.enqueue_view(MyContract::at(address).assert_timestamp_less_than(timestamp));
    /// ```
    pub fn enqueue_view<let M: u32, let N: u32, T>(&mut self, call: PublicStaticCall<M, N, T>) {
        call.enqueue_view(self.context)
    }

    /// Enqueues a privacy-preserving public contract call function.
    ///
    /// This is the same as [ContractSelf::enqueue], except it hides this calling contract's address from the target
    /// public function (i.e. [ContractSelf::msg_sender] will panic).
    ///
    /// This means the origin of the call (msg_sender) will not be publicly
    /// visible to any blockchain observers, nor to the target public function.
    /// If the target public function reads `self.msg_sender()` the call will
    /// revert.
    ///
    /// NOTES:
    /// - Not all public functions will accept a msg_sender of "none". Many
    ///   public functions will require that msg_sender is "some" and will
    ///   revert otherwise. Therefore, if using `enqueue_incognito`, you must
    ///   understand whether the function you're calling will accept a
    ///   msg_sender of "none".
    ///   Lots of public bookkeeping patterns rely on knowing which address made
    ///   the call, so as to ascribe state against the caller's address.
    ///   (There are patterns whereby bookkeeping could instead be done in
    ///   private-land).
    /// - If you are enqueueing a call to an _internal_ public function (i.e.
    ///   a public function that will only accept calls from other functions
    ///   of its own contract), then by definition a call to it cannot possibly
    ///   be "incognito": the msg_sender must be its own address, and indeed the
    ///   called public function will assert this. Tl;dr this is not usable for
    ///   enqueued internal public calls.
    ///
    /// # Arguments
    /// * `call` - The object representing the public function to enqueue.
    ///
    /// # Example
    /// ```noir
    /// self.enqueue_incognito(Token::at(address).increase_total_supply_by(amount));
    /// ```
    ///
    /// Advanced:
    /// - The kernel circuits will permit _any_ private function to set the
    ///   msg_sender field of any enqueued public function call to
    ///   NULL_MSG_SENDER_CONTRACT_ADDRESS.
    /// - When the called public function calls `PublicContext::msg_sender()`,
    ///   aztec-nr will translate NULL_MSG_SENDER_CONTRACT_ADDRESS into
    ///   `Option<AztecAddress>::none` for familiarity to devs.
    ///
    pub fn enqueue_incognito<let M: u32, let N: u32, T>(&mut self, call: PublicCall<M, N, T>) {
        call.enqueue_incognito(self.context)
    }

    /// Enqueues a privacy-preserving read-only public contract call function.
    ///
    /// As per `enqueue_view`, but hides this calling contract's address from
    /// the target public function.
    ///
    /// See `enqueue_incognito` for more details relating to hiding msg_sender.
    ///
    /// # Arguments
    /// * `call` - The object representing the read-only public function to enqueue.
    ///
    /// # Example
    /// ```noir
    /// self.enqueue_view_incognito(MyContract::at(address).assert_timestamp_less_than(timestamp));
    /// ```
    ///
    pub fn enqueue_view_incognito<let M: u32, let N: u32, T>(
        &mut self,
        call: PublicStaticCall<M, N, T>,
    ) {
        call.enqueue_view_incognito(self.context)
    }

    /// Enqueues a call to the public function defined by the `call` parameter,
    /// and designates it to be the teardown function for this tx. Only one teardown
    /// function call can be made by a tx.
    ///
    /// Niche function: Only wallet developers and paymaster contract developers
    /// (aka Fee-payment contracts) will need to make use of this function.
    ///
    /// Aztec supports a three-phase execution model: setup, app logic, teardown.
    /// The phases exist to enable a fee payer to take on the risk of paying
    /// a transaction fee, safe in the knowledge that their payment (in whatever
    /// token or method the user chooses) will succeed, regardless of whether
    /// the app logic will succeed. The "setup" phase ensures the fee payer
    /// has sufficient balance to pay the proposer their fees.
    /// The teardown phase is primarily intended to: calculate exactly
    /// how much the user owes, based on gas consumption, and refund the user
    /// any change.
    ///
    /// Note: in some cases, the cost of refunding the user (i.e. DA costs of
    /// tx side-effects) might exceed the refund amount. For app logic with
    /// fairly stable and predictable gas consumption, a material refund amount
    /// is unlikely. For app logic with unpredictable gas consumption, a
    /// refund might be important to the user (e.g. if a hefty function reverts
    /// very early). Wallet/FPC/Paymaster developers should be mindful of this.
    ///
    /// See `enqueue` for more information about enqueuing public function calls.
    ///
    /// # Arguments
    /// * `call` - The object representing the public function to designate as teardown.
    ///
    pub fn set_as_teardown<let M: u32, let N: u32, T>(&mut self, call: PublicCall<M, N, T>) {
        call.set_as_teardown(self.context)
    }

    /// Enqueues a call to the public function defined by the `call` parameter,
    /// and designates it to be the teardown function for this tx. Only one teardown
    /// function call can be made by a tx.
    ///
    /// As per `set_as_teardown`, but hides this calling contract's address from
    /// the target public function.
    ///
    /// See `enqueue_incognito` for more details relating to hiding msg_sender.
    ///
    pub fn set_as_teardown_incognito<let M: u32, let N: u32, T>(
        &mut self,
        call: PublicCall<M, N, T>,
    ) {
        call.set_as_teardown_incognito(self.context)
    }
}

// Implementation for `ContractSelf` in public execution contexts.
//
// This implementation is used when an external or internal contract function is marked with "public".
impl<Storage, CallSelf, CallSelfStatic, CallInternal> ContractSelf<PublicContext, Storage, CallSelf, (), CallSelfStatic, (), CallInternal> {
    /// Creates a new `ContractSelf` instance for a public function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new_public(
        context: PublicContext,
        storage: Storage,
        call_self: CallSelf,
        call_self_static: CallSelfStatic,
        internal: CallInternal,
    ) -> Self {
        Self {
            context,
            storage,
            address: context.this_address(),
            call_self,
            enqueue_self: (),
            call_self_static,
            enqueue_self_static: (),
            internal,
        }
    }

    /// The address of the contract address that made this function call.
    ///
    /// This is similar to Solidity's `msg.sender` value.
    ///
    /// ## Incognito Calls
    ///
    /// Contracts can call public functions from private ones hiding their identity (see
    /// [enqueue_incognito](ContractSelf::enqueue_incognito)). This function reverts when executed in such a context.
    ///
    /// If you need to handle these cases, use [PublicContext::maybe_msg_sender].
    pub fn msg_sender(self: Self) -> AztecAddress {
        self.context.maybe_msg_sender().unwrap()
    }

    /// Emits an event publicly.
    ///
    /// Public events are emitted as plaintext and are therefore visible to everyone. This is is the same as Solidity
    /// events on EVM chains.
    ///
    /// Unlike private events, they don't require delivery of an event message.
    ///
    /// # Example
    /// ```noir
    /// #[event]
    /// struct Update { value: Field }
    ///
    /// #[external("public")]
    /// fn publish_update(value: Field) {
    ///     self.emit(Update { value });
    /// }
    /// ```
    ///
    /// # Cost
    ///
    /// Public event emission is achieved by emitting public transaction logs. A total of `N+1` fields are emitted,
    /// where `N` is the serialization length of the event.
    pub fn emit<Event>(&mut self, event: Event)
    where
        Event: EventInterface + Serialize,
    {
        emit_event_in_public(self.context, event);
    }

    /// Makes a public contract call.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `call` - The object representing the public function to invoke.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    /// # Example
    /// ```noir
    /// self.call(Token::at(address).transfer_in_public(recipient, amount));
    /// ```
    ///
    pub unconstrained fn call<let M: u32, let N: u32, T>(self, call: PublicCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        call.call(self.context)
    }

    /// Makes a public read-only contract call.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state or emit events. Any nested calls are constrained to
    /// also be static calls.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `call` - The object representing the read-only public function to invoke.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    /// # Example
    /// ```noir
    /// self.view(Token::at(address).balance_of_public(recipient));
    /// ```
    ///
    pub unconstrained fn view<let M: u32, let N: u32, T>(self, call: PublicStaticCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        call.view(self.context)
    }
}

// Implementation for `ContractSelf` in utility execution contexts.
//
// This implementation is used when an external or internal contract function is marked with "utility".
impl<Storage> ContractSelf<UtilityContext, Storage, (), (), (), (), ()> {
    /// Creates a new `ContractSelf` instance for a utility function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new_utility(context: UtilityContext, storage: Storage) -> Self {
        Self {
            context,
            storage,
            address: context.this_address(),
            call_self: (),
            enqueue_self: (),
            call_self_static: (),
            enqueue_self_static: (),
            internal: (),
        }
    }
}
