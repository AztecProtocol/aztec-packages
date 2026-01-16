//! Generates functionality such that the following API for performing calls to `#[internal("...")]` functions is
//! available:
//! ```noir
//! self.internal.my_internal_function(...)
//! ```
//! Injected into the contract by the `#[aztec]` macro.

use crate::macros::internals_functions_generation::internal_functions_registry;

/// Generates a method for the `CallInternal` struct that makes a call to the `#[internal("private")]` function `f`.
comptime fn generate_private_internal_function_call(f: FunctionDefinition) -> Quoted {
    let original_function_name = f.name();
    let original_return_type = f.return_type();
    let original_params = f
        .parameters()
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });

    let params_at_callsite =
        f.parameters().map(|(param_name, _)| quote { $param_name }).join(quote {, });

    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();

    quote {
        pub fn $original_function_name(self: CallInternal<&mut aztec::context::private_context::PrivateContext>, $original_params) -> $original_return_type {
            $fn_name(self.context, $params_at_callsite)
        }
    }
}

/// Generates a method for the `CallInternal` struct that makes a call to the `#[internal("public")]` function `f`.
comptime fn generate_public_internal_function_call(f: FunctionDefinition) -> Quoted {
    let original_function_name = f.name();
    let original_return_type = f.return_type();
    let original_params = f
        .parameters()
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });

    let params_at_callsite =
        f.parameters().map(|(param_name, _)| quote { $param_name }).join(quote {, });

    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();

    quote {
        pub unconstrained fn $original_function_name(self: CallInternal<aztec::context::public_context::PublicContext>, $original_params) -> $original_return_type {
            $fn_name(self.context, $params_at_callsite)
        }
    }
}

/// Generates a struct which is injected into contracts via the `#[aztec]` macro and which is then instantiated in the
/// external and internal functions' bodies and provided into the `ContractSelf` struct. This then allows for the
/// following API:
///
/// ```noir
/// self.internal.my_internal_function(arg1, arg2);
/// ```
pub(crate) comptime fn generate_call_internal_struct(m: Module) -> Quoted {
    let private_internal_functions = internal_functions_registry::get_private_functions(m);
    let public_internal_functions = internal_functions_registry::get_public_functions(m);

    let private_internal_functions_calls = private_internal_functions
        .map(|function| generate_private_internal_function_call(function))
        .join(quote {});
    let public_internal_functions_calls = public_internal_functions
        .map(|function| generate_public_internal_function_call(function))
        .join(quote {});

    quote {
        pub struct CallInternal<Context> {
            pub context: Context,
        }

        impl CallInternal<&mut aztec::context::private_context::PrivateContext> {
            $private_internal_functions_calls
        }

        impl CallInternal<aztec::context::public_context::PublicContext> {
            $public_internal_functions_calls
        }
    }
}
