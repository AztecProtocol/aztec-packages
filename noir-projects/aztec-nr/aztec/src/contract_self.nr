use crate::{
    context::{private_context::PrivateContext, public_context::PublicContext},
    event::{event_emission::emit_event_in_private, event_interface::EventInterface},
};
use super::{context::utility_context::UtilityContext, event::event_emission::emit_event_in_public};
use protocol_types::{
    address::AztecAddress, constants::NULL_MSG_SENDER_CONTRACT_ADDRESS, traits::Serialize,
};

/// `ContractSelf` is the core interface for interacting with an Aztec contract's own state and context.
///
/// This struct is automatically injected into every #[external(...)] contract function by the Aztec macro system and is
/// accessible through the `self` variable.
///
/// # Usage in Contract Functions
///
/// Once injected, you can use `self` to:
/// - Access storage: `self.storage.balances.at(owner).read()`
/// - Call contracts: `self.call(Token::at(address).transfer(recipient, amount))`
/// - Emit events: `self.emit(event, recipient, delivery_mode)` (private) or `self.emit(event)` (public)
/// - Get the contract address: `self.address`
/// - Get the caller: `self.msg_sender()`
/// - Access low-level Aztec.nr APIs through the context: `self.context`
///
/// # Example
///
/// ```noir
/// #[external("private")]
/// fn withdraw(amount: u128, recipient: AztecAddress) {
///     // Get the caller of this function
///     let sender = self.msg_sender().unwrap();
///
///     // Access storage
///     let token = self.storage.donation_token.get_note().get_address();
///
///     // Call contracts
///     self.call(Token::at(token).transfer(recipient, amount));
/// }
/// ```
///
/// # Type Parameters
///
/// - `Context`: The execution context type - either `&mut PrivateContext`, `PublicContext`, or `UtilityContext`
/// - `Storage`: The contract's storage struct (defined with `#[storage]`), or `()` if the contract has no storage
pub struct ContractSelf<Context, Storage> {
    /// The address of this contract
    pub address: AztecAddress,
    /// The contract's storage instance, representing the struct to which the `#[storage]` macro was applied in your
    /// contract. If the contract has no storage, the type of this will be `()`.
    ///
    /// This storage instance is specialized for the current execution context (private, public, or utility) and
    /// provides access to the contract's state variables. Each state variable accepts the context as a generic
    /// parameter, which determines its available functionality. For example, a PublicImmutable variable can be read
    /// from any context (public, private, or utility) but can only be written to from public contexts.
    ///
    /// # Developer Note
    /// If you've arrived here while trying to access your contract's storage while the `Storage` generic type is set to
    /// unit type `()`, it means you haven't yet defined a Storage struct using the #[storage] macro in your contract.
    /// For guidance on setting this up, please refer to our docs:
    /// https://docs.aztec.network/developers/docs/guides/smart_contracts/storage
    pub storage: Storage,
    /// The execution context whose type is determined by the #[external(...)] attribute of the contract function based
    /// on the external function type (private, public, or utility).
    pub context: Context,
}

/// Implementation for `ContractSelf` in private execution contexts.
///
/// This implementation is used when a contract function is marked with `#[external("private")]`.
/// Private functions execute client-side and generate zero-knowledge proofs of their execution.
impl<Storage> ContractSelf<&mut PrivateContext, Storage> {
    /// Creates a new `ContractSelf` instance for a private function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new_private(context: &mut PrivateContext, storage: Storage) -> Self {
        Self { context, storage, address: context.this_address() }
    }

    /// Returns the contract address that initiated this function call. This is similar to `msg.sender` in Solidity.
    ///
    /// Important Note: Since Aztec doesn't have a concept of an EoA ( Externally-owned Account), the msg_sender is
    /// "null" for the first function call of every transaction. The first function call of a tx is likely to be a call
    /// to the user's account contract, so this quirk will most often be handled by account contract developers.
    ///
    /// # Returns
    /// * `Option<AztecAddress>` - The address of the smart contract that called this function (be it an app contract or
    ///   a user's account contract). Returns `Option<AztecAddress>::none` for the first function call of the tx. No
    ///   other _private_ function calls in the tx will have a `none` msg_sender, but _public_ function calls might (see
    ///   the PublicContext).
    ///
    pub fn msg_sender(self) -> Option<AztecAddress> {
        let maybe_msg_sender = self.context.msg_sender_unsafe();
        if maybe_msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS {
            Option::none()
        } else {
            Option::some(maybe_msg_sender)
        }
    }

    /// Emits an event from a private function. Private events can be delivered either via private logs or offchain
    /// messages, with configurable encryption and tagging constraints.
    ///
    /// Events in private functions are encrypted and sent to a specific recipient. This ensures that only the intended
    /// recipient can read the event data.
    ///
    /// # Parameters
    /// - `event`: The event to emit (must implement `EventInterface` and `Serialize`)
    /// - `recipient`: The address that should be able to decrypt and read this event
    /// - `delivery_mode`: The delivery mode for the event (e.g., `MessageDelivery.CONSTRAINED_ONCHAIN`)
    ///
    /// # Example
    /// ```noir
    /// #[external("private")]
    /// fn transfer(amount: u128, to: AztecAddress) {
    ///     // ... transfer logic ...
    ///     self.emit(
    ///         TransferEvent { from: sender, to, amount },
    ///         to,
    ///         MessageDelivery.CONSTRAINED_ONCHAIN
    ///     );
    /// }
    /// ```
    pub fn emit<Event>(&mut self, event: Event, recipient: AztecAddress, delivery_mode: u8)
    where
        Event: EventInterface + Serialize,
    {
        emit_event_in_private(event, self.context, recipient, delivery_mode);
    }
}

/// Implementation for `ContractSelf` in public execution contexts.
///
/// This implementation is used when a contract function is marked with `#[external("public")]`.
/// Public functions are executed by the sequencer in the Aztec Virtual Machine (AVM) and can work only with public
/// state.
impl<Storage> ContractSelf<PublicContext, Storage> {
    /// Creates a new `ContractSelf` instance for a public function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    ///
    /// # Parameters
    /// - `context`: A mutable reference to the public execution context
    /// - `storage`: The contract's storage instance
    pub fn new_public(context: PublicContext, storage: Storage) -> Self {
        Self { context, storage, address: context.this_address() }
    }

    /// Returns the contract address that initiated this function call.
    ///
    /// This is similar to `msg.sender` in Solidity (hence the name).
    ///
    /// Important Note: If the calling function is a _private_ function, then it had the option of hiding its address
    /// when enqueuing this public function call. In such cases, this `context.msg_sender()` method will return
    /// `Option<AztecAddress>::none`. If the calling function is a _public_ function, it will always return an
    /// `Option<AztecAddress>::some` (i.e. a non-null value).
    ///
    /// # Returns
    /// * `Option<AztecAddress>` - The address of the smart contract that called this function (be it an app contract or
    ///   a user's account contract).
    ///
    /// # Advanced
    /// * Value is provided by the AVM sender opcode
    /// * In nested calls, this is the immediate caller, not the original transaction sender
    ///
    pub fn msg_sender(self: Self) -> Option<AztecAddress> {
        // Safety: AVM opcodes are constrained by the AVM itself
        let maybe_msg_sender = self.context.msg_sender_unsafe();
        if maybe_msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS {
            Option::none()
        } else {
            Option::some(maybe_msg_sender)
        }
    }

    /// Emits an event from a public function.
    ///
    /// Events in public functions are emitted in plaintext and are visible to everyone.
    /// Unlike private events, they don't require a recipient parameter.
    ///
    /// # Parameters
    /// - `event`: The event to emit (must implement `EventInterface` and `Serialize`)
    ///
    /// # Example
    /// ```noir
    /// #[external("public")]
    /// fn publish_update(value: Field) {
    ///     // ... update logic ...
    ///     self.emit(UpdateEvent { value });
    /// }
    /// ```
    pub fn emit<Event>(&mut self, event: Event)
    where
        Event: EventInterface + Serialize,
    {
        emit_event_in_public(event, self.context);
    }
}

/// Implementation for `ContractSelf` in utility execution contexts.
///
/// This implementation is used when a contract function is marked with `#[external("utility")]`.
/// Utility functions are unconstrained functions that can read private state for offchain queries.
/// They are typically used for view functions that need to access private notes (e.g. a Token's balance_of function).
impl<Storage> ContractSelf<UtilityContext, Storage> {
    /// Creates a new `ContractSelf` instance for a utility function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    ///
    /// # Parameters
    /// - `context`: The utility execution context (not a mutable reference, as utility functions don't modify state)
    /// - `storage`: The contract's storage instance
    pub fn new_utility(context: UtilityContext, storage: Storage) -> Self {
        Self { context, storage, address: context.this_address() }
    }
}
