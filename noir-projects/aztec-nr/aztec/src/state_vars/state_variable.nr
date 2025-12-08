/// A trait that defines the common interface for all Aztec state variables. State variables are variables that can be
/// stored in the contract's storage. Examples of state variables are `Owned`, `PublicMutable`, `Map` or
/// `DelayedPublicMutable`.
///
/// # Type Parameters
///
/// * `N` - A compile-time constant that determines how many storage slots need to be reserved for this state variable.
/// * `Context` - The execution context type (e.g., `PublicContext`, `PrivateContext`, `UtilityContext`). The context
///               determines which methods of the state variable are available and controls whether the variable can
///               be accessed in public, private or utility functions.
///
pub trait StateVariable<let N: u32, Context> {
    /// Initializes a new state variable at a given storage slot.
    ///
    /// This function is automatically called within the #[storage] macro and needs to be manually called only when
    /// #[storage_no_init] is used.
    ///
    fn new(context: Context, storage_slot: Field) -> Self;

    /// Returns the storage slot at which the state variable is placed. Typically used only when testing the contract or
    /// when using a lower-level API like `get_notes` function.
    fn get_storage_slot(self) -> Field;
}
