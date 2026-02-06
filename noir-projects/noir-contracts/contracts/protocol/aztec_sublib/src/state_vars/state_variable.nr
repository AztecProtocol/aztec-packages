/// A trait that defines the common interface for all Aztec state variables. State variables are variables that can be
/// stored in the contract's storage. Examples of state variables are `PublicMutable`, `Map` or `DelayedPublicMutable`.
///
/// # Type Parameters
///
/// * `N` - A compile-time constant that determines how many storage slots need to be reserved for this state variable.
/// * `CONTEXT` - The execution context type (e.g., `PublicContext`, `PrivateContext`, `UtilityContext`). The context
/// determines which methods of the state variable are available and controls whether the variable can be accessed in
/// public, private or utility functions.
///
pub trait StateVariable<let N: u32, CONTEXT> {
    /// Initializes a new state variable at a given storage slot.
    fn new(context: CONTEXT, storage_slot: Field) -> Self;

    /// Returns the storage slot at which the state variable is placed.
    fn get_storage_slot(self) -> Field;
}
