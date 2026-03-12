use crate::macros::{
    functions::initialization_utils::{EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME, has_public_init_checked_functions},
    internals_functions_generation::external_functions_registry::get_private_functions,
    utils::is_fn_initializer,
};

/// Returns `(has_public_init_nullifier_fn, fn_body)` for the auto-generated public init nullifier function.
///
/// Contracts with a private initializer and public functions that check initialization need an auto-generated public
/// function to emit the public init nullifier. If these conditions are met, returns `(true, fn_body_quoted)`;
/// otherwise returns `(false, quote {})`.
pub(crate) comptime fn generate_emit_public_init_nullifier(m: Module) -> (bool, Quoted) {
    let has_private_initializer = get_private_functions(m).any(|f: FunctionDefinition| is_fn_initializer(f));
    let has_public_fns_with_init_check = has_public_init_checked_functions(m);

    if has_private_initializer & has_public_fns_with_init_check {
        let name = EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME;
        let assertion_message = f"Function {name} can only be called by the same contract".as_quoted_str();
        let body = quote {
            #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
            unconstrained fn $name() {
                let context = aztec::context::PublicContext::new(|| { 0 });
                assert(
                    context.maybe_msg_sender().unwrap() == context.this_address(),
                    $assertion_message,
                );
                aztec::macros::functions::initialization_utils::mark_as_initialized_public(context);
            }
        };
        (true, body)
    } else {
        (false, quote {})
    }
}
