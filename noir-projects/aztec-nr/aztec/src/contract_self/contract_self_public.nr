//! The `self` contract value for public execution contexts.

use crate::{
    context::{calls::{PublicCall, PublicStaticCall}, PublicContext},
    event::{event_emission::emit_event_in_public, event_interface::EventInterface},
};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// Core interface for interacting with aztec-nr contract features in public execution contexts.
///
/// This struct is automatically injected into every [`external`](crate::macros::functions::external) and
/// [`internal`](crate::macros::functions::internal) contract function marked with `"public"` by the Aztec macro
/// system and is accessible through the `self` variable.
///
/// ## Type Parameters
///
/// - `Storage`: The contract's storage struct (defined with [`storage`](crate::macros::storage::storage), or `()` if
/// the contract has no storage
/// - `CallSelf`: Macro-generated type for calling contract's own non-view functions
/// - `CallSelfStatic`: Macro-generated type for calling contract's own view functions
/// - `CallInternal`: Macro-generated type for calling internal functions
pub struct ContractSelfPublic<Storage, CallSelf, CallSelfStatic, CallInternal> {
    /// The address of this contract
    pub address: AztecAddress,

    /// The contract's storage instance, representing the struct to which the
    /// [`storage`](crate::macros::storage::storage) macro was applied in your contract. If the contract has no
    /// storage, the type of this will be `()`.
    ///
    /// This storage instance is specialized for the current execution context (public) and
    /// provides access to the contract's state variables.
    ///
    /// ## Developer Note
    ///
    /// If you've arrived here while trying to access your contract's storage while the `Storage` generic type is set
    /// to unit type `()`, it means you haven't yet defined a Storage struct using the
    /// [`storage`](crate::macros::storage::storage) macro in your contract. For guidance on setting this up, please
    /// refer to our docs: https://docs.aztec.network/developers/docs/guides/smart_contracts/storage
    pub storage: Storage,

    /// The public execution context.
    pub context: PublicContext,

    /// Provides type-safe methods for calling this contract's own non-view functions.
    ///
    /// Example API:
    /// ```noir
    /// self.call_self.some_public_function(args)
    /// ```
    pub call_self: CallSelf,

    /// Provides type-safe methods for calling this contract's own view functions.
    ///
    /// Example API:
    /// ```noir
    /// self.call_self_static.some_view_function(args)
    /// ```
    pub call_self_static: CallSelfStatic,

    /// Provides type-safe methods for calling internal functions.
    ///
    /// Example API:
    /// ```noir
    /// self.internal.some_internal_function(args)
    /// ```
    pub internal: CallInternal,
}

impl<Storage, CallSelf, CallSelfStatic, CallInternal> ContractSelfPublic<Storage, CallSelf, CallSelfStatic, CallInternal> {
    /// Creates a new `ContractSelfPublic` instance for a public function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new(
        context: PublicContext,
        storage: Storage,
        call_self: CallSelf,
        call_self_static: CallSelfStatic,
        internal: CallInternal,
    ) -> Self {
        Self { context, storage, address: context.this_address(), call_self, call_self_static, internal }
    }

    /// The address of the contract address that made this function call.
    ///
    /// This is similar to Solidity's `msg.sender` value.
    ///
    /// ## Incognito Calls
    ///
    /// Contracts can call public functions from private ones hiding their identity (see
    ///
    /// [`ContractSelfPrivate::enqueue_incognito`](crate::contract_self::ContractSelfPrivate::enqueue_incognito)).
    /// This function reverts when executed in such a context.
    ///
    /// If you need to handle these cases, use [`PublicContext::maybe_msg_sender`].
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
    /// This is similar to Solidity's `staticcall`. The called function cannot modify state or emit events. Any nested
    /// calls are constrained to also be static calls.
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
