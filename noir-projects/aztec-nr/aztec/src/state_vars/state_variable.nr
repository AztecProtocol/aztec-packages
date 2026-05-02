/// A container for contract state.
///
/// All contract state is stored in state variables, and all state variables implement the `StateVariable` trait. For
/// more information on the different types of state variables see the [`state_vars`](crate::state_vars) module.
pub trait StateVariable<let N: u32, Context> {
    /// Creates a state variable.
    ///
    /// This function is automatically called by aztec-nr as the [`self`](crate::contract_self) object is created. Users
    /// are expected to only ever need to invoke it when using the
    /// [`#[storage_no_init]`](crate::macros::storage::storage_no_init) macro.
    fn new(context: Context, storage_slot: Field) -> Self;

    /// Returns the state variable's storage slot.
    fn get_storage_slot(self) -> Field;
}
