//! The `self` contract value for utility execution contexts.

use crate::context::UtilityContext;
use crate::protocol::address::AztecAddress;

/// Core interface for interacting with aztec-nr contract features in utility execution contexts.
///
/// This struct is automatically injected into every [`external`](crate::macros::functions::external) contract function
/// marked with `"utility"` by the Aztec macro system and is accessible through the `self` variable.
///
/// ## Type Parameters
///
/// - `Storage`: The contract's storage struct (defined with [`storage`](crate::macros::storage::storage), or `()` if
/// the contract has no storage
pub struct ContractSelfUtility<Storage> {
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
}

impl<Storage> ContractSelfUtility<Storage> {
    /// Creates a new `ContractSelfUtility` instance for a utility function.
    ///
    /// This constructor is called automatically by the macro system and should not be called directly.
    pub fn new(context: UtilityContext, storage: Storage) -> Self {
        Self { context, storage, address: context.this_address() }
    }
}
