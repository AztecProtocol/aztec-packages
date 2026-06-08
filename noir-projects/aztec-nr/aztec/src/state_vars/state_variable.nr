/// A container for contract state.
///
/// All contract state is stored in state variables, and all state variables implement the `StateVariable` trait. For
/// more information on the different types of state variables see the [`state_vars`](crate::state_vars) module.
///
/// `StateVariable` is a _spec_ trait: types that implement it (e.g. [`PublicMutable`](crate::state_vars::PublicMutable))
/// are lightweight markers written by users in the [`#[storage]`](crate::macros::storage::storage) struct. They carry
/// no execution context and have no runtime behavior of their own. The `#[storage]` macro reads [`N`](Self::N) for
/// storage slot allocation and projects [`Runtime`](Self::Runtime) to obtain the context-aware type that actually
/// reads and writes state (see [`RuntimeStateVariable`](crate::state_vars::RuntimeStateVariable)).
pub trait StateVariable<Context> {
    /// The number of storage slots this state variable occupies.
    ///
    /// This is a property of the state variable type (and the value it stores), independent of the execution context.
    /// The `#[storage]` macro uses it to assign each state variable a unique, non-overlapping range of storage slots.
    let N: u32;

    /// The runtime representation of this state variable, with the execution `Context` threaded in.
    ///
    /// The `#[storage]` macro projects this type (`<Self as StateVariable<Context>>::Runtime`) for each field of the
    /// `Storage` struct, so that users never have to write the `Context` generic themselves. The projected type
    /// implements [`RuntimeStateVariable`](crate::state_vars::RuntimeStateVariable) and exposes the context-dependent
    /// read/write methods.
    type Runtime;
}

/// The runtime behavior of a [`StateVariable`](crate::state_vars::StateVariable).
///
/// Implemented by the runtime types that the [`#[storage]`](crate::macros::storage::storage) macro instantiates (e.g.
/// `RuntimePublicMutable`). Users do not name these types directly except when using the
/// [`#[storage_no_init]`](crate::macros::storage::storage_no_init) macro.
pub trait RuntimeStateVariable<Context> {
    /// Creates a state variable.
    ///
    /// This function is automatically called by aztec-nr as the [`self`](crate::contract_self) object is created. Users
    /// are expected to only ever need to invoke it when using the
    /// [`#[storage_no_init]`](crate::macros::storage::storage_no_init) macro.
    fn new(context: Context, storage_slot: Field) -> Self;

    /// Returns the state variable's storage slot.
    fn get_storage_slot(self) -> Field;
}
