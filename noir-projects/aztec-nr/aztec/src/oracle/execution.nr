use crate::context::utility_context::UtilityContext;

#[oracle(utilityGetUtilityContext)]
unconstrained fn get_utility_context_oracle() -> UtilityContext {}

/// Returns a utility context built from the global variables of anchor block and the contract address of the function
/// being executed.
pub unconstrained fn get_utility_context() -> UtilityContext {
    get_utility_context_oracle()
}
