use crate::macros::{
    functions::auth_registry::AUTHORIZE_ONCE_REGISTRY,
    utils::{is_fn_initializer, is_fn_only_self, is_fn_view},
};
use std::meta::ctstring::AsCtString;

/// Gathers all attributes relevant to the function's ABI and returns a quote that can be applied to the newly generated
/// function. We apply the abi marker attributes instead of the original ones (e.g. abi_view instead of view) to avoid
/// the relevant attribute's functionality from getting triggered.
pub(crate) comptime fn get_abi_relevant_attributes(f: FunctionDefinition) -> Quoted {
    let mut attributes = quote {};

    if is_fn_view(f) {
        attributes = quote { $attributes #[aztec::macros::internals_functions_generation::abi_attributes::abi_view] };
    }

    if is_fn_only_self(f) {
        attributes = quote { $attributes #[aztec::macros::internals_functions_generation::abi_attributes::abi_only_self] };
    }

    if is_fn_initializer(f) {
        attributes = quote { $attributes #[aztec::macros::internals_functions_generation::abi_attributes::abi_initializer] };
    }

    attributes
}

/// Injects a call to `aztec::messages::discovery::discover_new_messages`, causing for new notes to be added to PXE and made
/// available for the current execution.
pub(crate) comptime fn create_message_discovery_call() -> Quoted {
    quote {
        /// Safety: message discovery returns nothing and is performed solely for its side-effects. It is therefore
        /// always safe to call.
        unsafe {
            dep::aztec::messages::discovery::discover_new_messages(
                self.address,
                _compute_note_hash_and_nullifier,
            );
        };
    }
}

/// Injects an authwit verification check of the form:
/// ```
///   if (!from.eq(context.msg_sender().unwrap())) {
///         assert_current_call_valid_authwit::<N>(&mut context, from);
///     } else {
///         assert(authwit_nonce, "Invalid authwit nonce. When 'from' and 'msg_sender' are the same, authwit_nonce must be zero");
///     }
/// ```
/// where `from` and `authwit_nonce` are the names of the parameters that are expected to be present in the function definition.
/// This check is injected by the `#[authorize_once("from_arg_name", "nonce_arg_name")]`, which allows the user to define
/// which parameters to use.
///
/// # Arguments
/// * `f` - The function definition to inject the authwit verification check into. The function must have parameters
///         matching the names specified in the `#[authorize_once]` attribute.
/// * `is_private` - Whether the function is a private function (`true`) or a public function (`false`). This determines
///                  which authwit verification method to use: `assert_current_call_valid_authwit` for private functions
///                  or `assert_current_call_valid_authwit_public` for public functions.
pub(crate) comptime fn create_authorize_once_check(
    f: FunctionDefinition,
    is_private: bool,
) -> Quoted {
    let maybe_authorize_once_args = AUTHORIZE_ONCE_REGISTRY.get(f);
    let authorize_once_args = if maybe_authorize_once_args.is_some() {
        maybe_authorize_once_args.unwrap()
    } else {
        // We need to for authorize_once to have already executed so that we can retrieve its params - this depends on
        // the order in which the attributes are applied.
        panic(
            f"Functions marked with #[authorize_once] must have the #[external(\"private\")] or #[external(\"public\")] attribute placed last",
        )
    };

    let (from_arg_name, nonce_arg_name) = authorize_once_args;
    let name: Quoted = f.name();

    let from_arg_candidates =
        f.parameters().filter(|(name, _)| name == f"{from_arg_name}".quoted_contents());
    let (from_arg_name_quoted, from_arg_type) = if from_arg_candidates.len() == 1 {
        from_arg_candidates[0]
    } else {
        panic(
            f"Function {name} does not have a {from_arg_name} parameter. Please specify which one to use in #[authorize_once(\"...\", \"authwit_nonce\")]",
        )
    };
    if from_arg_type
        != quote { dep::protocol_types::address::aztec_address::AztecAddress }.as_type() {
        panic(
            f"Argument {from_arg_name_quoted} in function {name} must be of type AztecAddress, but is of type {from_arg_type}",
        )
    }

    let nonce_arg_candidates =
        f.parameters().filter(|(name, _)| name == f"{nonce_arg_name}".quoted_contents());
    let (nonce_arg_name_quoted, nonce_arg_type) = if nonce_arg_candidates.len() == 1 {
        nonce_arg_candidates[0]
    } else {
        panic(
            f"Function {name} does not have a {nonce_arg_name}. Please specify which one to use in #[authorize_once(\"from\", \"...\")]",
        )
    };
    if nonce_arg_type != quote { Field }.as_type() {
        panic(
            f"Argument {nonce_arg_name_quoted} in function {name} must be of type Field, but is of type {nonce_arg_type}",
        );
    }

    let nonce_check_quote = f"{nonce_arg_name_quoted} == 0".quoted_contents();

    let fn_call = if is_private {
        let args_len = f.parameters().len();
        quote { dep::aztec::authwit::auth::assert_current_call_valid_authwit::<$args_len> }
    } else {
        quote { dep::aztec::authwit::auth::assert_current_call_valid_authwit_public }
    };
    let invalid_nonce_message = f"Invalid authwit nonce. When '{from_arg_name}' and 'msg_sender' are the same, '{nonce_arg_name}' must be zero"
        .as_ctstring()
        .as_quoted_str();
    quote {         
        if (!$from_arg_name_quoted.eq(self.msg_sender().unwrap())) {
            $fn_call(self.context, $from_arg_name_quoted);
        } else {
            assert($nonce_check_quote, $invalid_nonce_message);
        }
    }
}
