use crate::macros::{
    calls_generation::external_functions_stubs::{
        create_private_self_call_stub, create_private_static_stub, create_private_stub,
        create_public_self_call_static_stub, create_public_self_call_stub, create_public_self_enqueue_static_stub,
        create_public_self_enqueue_stub, create_public_static_stub, create_public_stub, create_utility_stub,
        create_utility_stub_from_parts,
    },
    internals_functions_generation::external_functions_registry,
    offchain_receive::{
        OFFCHAIN_RECEIVE_FN_NAME, OFFCHAIN_RECEIVE_PARAM_NAME, offchain_receive_param_type,
        OFFCHAIN_RECEIVE_RETURN_TYPE,
    },
    utils::is_fn_view,
};

/// Generates external function calls that are to be injected into the contract interface.
///
/// The contract interface enables you to form calls such as `Token::at(address).some_function(args)`. This function
/// generates the implementation of `some_function` within the interface.
pub(crate) comptime fn generate_external_function_calls(m: Module) -> Quoted {
    let private_functions = external_functions_registry::get_private_functions(m);
    let public_functions = external_functions_registry::get_public_functions(m);
    let utility_functions = external_functions_registry::get_utility_functions(m);

    let private_contract_methods = private_functions
        .map(|function| {
            if is_fn_view(function) {
                create_private_static_stub(function)
            } else {
                create_private_stub(function)
            }
        })
        .join(quote {});

    let public_contract_methods = public_functions
        .map(|function| {
            if is_fn_view(function) {
                create_public_static_stub(function)
            } else {
                create_public_stub(function)
            }
        })
        .join(quote {});

    // `offchain_receive` is injected into every contract by `#[aztec]` as quoted code rather than via the
    // `#[external("utility")]` attribute that populates `UTILITY_REGISTRY`, so it doesn't appear in
    // `utility_functions`. We append its stub so it shows up in the interface like any other utility.
    let utility_stubs =
        utility_functions.map(|function| create_utility_stub(function)).push_back(create_offchain_receive_stub());
    let utility_contract_methods = utility_stubs.join(quote {});

    quote {
        $private_contract_methods
        $public_contract_methods
        $utility_contract_methods
    }
}

/// Builds the interface stub for the macro-injected `offchain_receive` utility. Pulls the signature
/// from `crate::macros::offchain_receive` so it stays in lockstep with `generate_offchain_receive`.
comptime fn create_offchain_receive_stub() -> Quoted {
    let param_type = offchain_receive_param_type(quote { crate }).as_type();
    let fn_parameters = @[(OFFCHAIN_RECEIVE_PARAM_NAME, param_type)];
    let fn_return_type = OFFCHAIN_RECEIVE_RETURN_TYPE.as_type();

    create_utility_stub_from_parts(OFFCHAIN_RECEIVE_FN_NAME, fn_parameters, fn_return_type)
}

/// Generates helper structs for convenient self-invocation of contract functions:
///
/// - `CallSelf`: Call your own private or public functions, e.g.: `self.call_self.some_private_function(args)`
/// - `CallSelfStatic`: Call your own view (static) functions, e.g.: `self.call_self_static.some_view_function(args)`
/// - `EnqueueSelf`: Enqueue your own (non-view) public functions for deferred execution, e.g.:
/// `self.enqueue_self.some_public_function(args)`
/// - `EnqueueSelfStatic`: Enqueue your own view public functions, e.g.:
/// `self.enqueue_self_static.some_view_function(args)`
pub(crate) comptime fn generate_external_function_self_calls_structs(m: Module) -> Quoted {
    let private_functions = external_functions_registry::get_private_functions(m);
    let public_functions = external_functions_registry::get_public_functions(m);

    let call_self_private_methods = private_functions
        .map(|function| {
            if is_fn_view(function) {
                quote {}
            } else {
                create_private_self_call_stub(function, false)
            }
        })
        .join(quote {});

    let call_self_private_static_methods = private_functions
        .map(|function| {
            if is_fn_view(function) {
                create_private_self_call_stub(function, true)
            } else {
                quote {}
            }
        })
        .join(quote {});

    let call_self_public_methods = public_functions
        .map(|function| {
            if is_fn_view(function) {
                quote {}
            } else {
                create_public_self_call_stub(function)
            }
        })
        .join(quote {});

    let call_self_public_static_methods = public_functions
        .map(|function| {
            if is_fn_view(function) {
                create_public_self_call_static_stub(function)
            } else {
                quote {}
            }
        })
        .join(quote {});

    let enqueue_self_methods = public_functions
        .map(|function| {
            if is_fn_view(function) {
                quote {}
            } else {
                create_public_self_enqueue_stub(function)
            }
        })
        .join(quote {});

    let enqueue_self_static_methods = public_functions
        .map(|function| {
            if is_fn_view(function) {
                create_public_self_enqueue_static_stub(function)
            } else {
                quote {}
            }
        })
        .join(quote {});

    quote {
        pub struct CallSelf<Context> {
            pub address: aztec::protocol::address::AztecAddress,
            pub context: Context,
        }

        impl CallSelf<&mut aztec::context::PrivateContext> {
            $call_self_private_methods
        }

        impl CallSelf<aztec::context::PublicContext> {
            $call_self_public_methods
        }

        pub struct CallSelfStatic<Context> {
            pub address: aztec::protocol::address::AztecAddress,
            pub context: Context,
        }

        impl CallSelfStatic<&mut aztec::context::PrivateContext> {
            $call_self_private_static_methods
        }

        impl CallSelfStatic<aztec::context::PublicContext> {
            $call_self_public_static_methods
        }

        pub struct EnqueueSelf<Context> {
            pub address: aztec::protocol::address::AztecAddress,
            pub context: Context,
        }

        impl EnqueueSelf<&mut aztec::context::PrivateContext> {
            $enqueue_self_methods
        }

        pub struct EnqueueSelfStatic<Context> {
            pub address: aztec::protocol::address::AztecAddress,
            pub context: Context,
        }

        impl EnqueueSelfStatic<&mut aztec::context::PrivateContext> {
            $enqueue_self_static_methods
        }
    }
}
