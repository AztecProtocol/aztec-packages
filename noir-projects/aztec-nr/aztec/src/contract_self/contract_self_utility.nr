//! The `self` contract value for utility execution contexts.

use crate::context::{calls::UtilityCall, UtilityContext};
use crate::oracle::call_utility_function::call_utility_function;
use crate::protocol::{address::AztecAddress, traits::Deserialize};

/// Core interface for interacting with aztec-nr contract features in utility execution contexts.
///
/// This struct is automatically injected into every [`external`](crate::macros::functions::external) contract function
/// marked with `"utility"` by the Aztec macro system and is accessible through the `self` variable.
///
/// ## Type Parameters
///
/// - `Storage`: The contract's storage struct (defined with [`storage`](crate::macros::storage::storage), or `()` if
/// the contract has no storage
/// - `CallSelf`: Macro-generated type for calling the contract's own utility functions (same type
/// as `CallSelf` in \[`PrivateUtilityCalls`\])
pub struct ContractSelfUtility<Storage, CallSelf> {
    /// The address of this contract
    pub address: AztecAddress,

    /// The contract's storage instance, representing the struct to which the
    /// [`storage`](crate::macros::storage::storage) macro was applied in your contract. If the contract has no
    /// storage, the type of this will be `()`.
    ///
    /// This storage instance is specialized for the current execution context (utility) and
    /// provides access to the contract's state variables.
    ///
    /// ## Developer Note
    ///
    /// If you've arrived here while trying to access your contract's storage while the `Storage` generic type is set
    /// to unit type `()`, it means you haven't yet defined a Storage struct using the
    /// [`storage`](crate::macros::storage::storage) macro in your contract. For guidance on setting this up, please
    /// refer to our docs: https://docs.aztec.network/developers/docs/guides/smart_contracts/storage
    pub storage: Storage,

    /// The utility execution context.
    pub context: UtilityContext,

    /// Provides type-safe methods for calling this contract's own utility functions.
    ///
    /// Example API:
    /// ```noir
    /// self.call_self.some_utility_function(args)
    /// ```
    pub call_self: CallSelf,
}

impl<Storage, CallSelf> ContractSelfUtility<Storage, CallSelf> {
    /// Creates a new `ContractSelfUtility` instance for a utility function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new(context: UtilityContext, storage: Storage, call_self: CallSelf) -> Self {
        Self { context, storage, address: context.this_address(), call_self }
    }

    /// The address of the contract that made this function call.
    ///
    /// This is similar to Solidity's `msg.sender` value.
    ///
    /// ## Direct Invocation
    ///
    /// A utility function invoked directly (e.g. by a wallet or dApp) rather than from another contract has no caller,
    /// and this function panics. Only a nested (cross-contract) utility call has a `msg_sender`.
    ///
    /// If you need to handle the no-caller case, use [`UtilityContext::maybe_msg_sender`].
    ///
    /// Note that utility functions are simulated client-side and never proven, so this value is unconstrained: see
    /// [`UtilityContext::maybe_msg_sender`] for why it must not be relied on as a security guarantee.
    pub unconstrained fn msg_sender(self) -> AztecAddress {
        self.context.maybe_msg_sender().expect(
            f"msg_sender() called on a top-level utility with no caller; use maybe_msg_sender() instead",
        )
    }

    /// Makes a utility contract call from another utility function.
    ///
    /// Note: only same-contract utility calls are currently supported. See TODO(F-29).
    ///
    /// # Example
    /// ```noir
    /// self.call(Token::at(address).get_balance_of(owner));
    /// ```
    pub unconstrained fn call<let M: u32, let N: u32, T>(_self: Self, call: UtilityCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        let returns = call_utility_function(call.target_contract, call.selector, call.args);
        Deserialize::deserialize(returns)
    }
}
