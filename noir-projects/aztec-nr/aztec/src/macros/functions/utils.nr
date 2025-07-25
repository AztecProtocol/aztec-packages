use crate::macros::{
    functions::{
        abi_export::create_fn_abi_export, auth_registry::AUTHORIZE_ONCE_REGISTRY,
        call_interface_stubs::stub_fn, stub_registry,
    },
    notes::NOTES,
    utils::{
        add_to_hasher, fn_has_authorize_once, fn_has_noinitcheck, get_fn_visibility,
        is_fn_contract_library_method, is_fn_initializer, is_fn_internal, is_fn_private,
        is_fn_public, is_fn_test, is_fn_utility, is_fn_view, modify_fn_body, module_has_initializer,
        module_has_storage,
    },
};
use std::meta::{ctstring::AsCtString, type_of};

pub(crate) comptime fn transform_private(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    stub_registry::register(f.module(), fn_stub);

    // If a function is further modified as unconstrained, we throw an error
    if f.is_unconstrained() {
        let name = f.name();
        panic(
            f"Function {name} is annotated with #[private] but marked as unconstrained, remove unconstrained keyword",
        );
    }

    let module_has_initializer = module_has_initializer(f.module());
    let module_has_storage = module_has_storage(f.module());

    // Private functions undergo a lot of transformations from their Aztec.nr form into a circuit that can be fed to the
    // Private Kernel Circuit.
    // First we change the function signature so that it also receives `PrivateContextInputs`, which contain information
    // about the execution context (e.g. the caller).
    let original_params = f.parameters();
    f.set_parameters(&[(
        quote { inputs },
        quote { crate::context::inputs::private_context_inputs::PrivateContextInputs }.as_type(),
    )]
        .append(original_params));

    let mut body = f.body().as_block().unwrap();

    // The original params are hashed and passed to the `context` object, so that the kernel can verify we've received
    // the correct values.
    // TODO: Optimize args_hasher for small number of arguments
    let args_hasher_name = quote { args_hasher };
    let args_hasher = original_params.fold(
        quote {
            let mut $args_hasher_name = dep::aztec::hash::ArgsHasher::new();
        },
        |args_hasher, param: (Quoted, Type)| {
            let (name, typ) = param;
            let appended_arg = add_to_hasher(args_hasher_name, name, typ);
            quote {
                $args_hasher
                $appended_arg
            }
        },
    );

    let context_creation = quote {
        let mut context = dep::aztec::context::private_context::PrivateContext::new(inputs, dep::aztec::protocol_types::traits::Hash::hash($args_hasher_name));
    };

    // Modifications introduced by the different marker attributes.
    let internal_check = if is_fn_internal(f) {
        create_internal_check(f)
    } else {
        quote {}
    };

    let view_check = if is_fn_view(f) {
        create_view_check(f)
    } else {
        quote {}
    };

    let (assert_initializer, mark_as_initialized) = if is_fn_initializer(f) {
        (create_assert_correct_initializer_args(f), create_mark_as_initialized(f))
    } else {
        (quote {}, quote {})
    };

    let storage_init = if module_has_storage {
        quote {
            // Some functions don't access storage, but it'd be quite difficult to only inject this variable if it is
            // referenced. We instead ignore 'unused variable' warnings for it.
            #[allow(unused_variables)]
            let storage = Storage::init(&mut context);
        }
    } else {
        quote {}
    };

    // Initialization checks are not included in contracts that don't have initializers.
    let init_check = if module_has_initializer & !is_fn_initializer(f) & !fn_has_noinitcheck(f) {
        create_init_check(f)
    } else {
        quote {}
    };

    // All private functions perform message discovery, since they may need to access notes. This is slightly
    // inefficient and could be improved by only doing it once we actually attempt to read any. Note that the message
    // discovery call syncs private events as well. We do not sync those here if there are no notes because we don't
    // have an API that would access events from private functions.
    let message_discovery_call = if NOTES.len() > 0 {
        create_message_discovery_call()
    } else {
        quote {}
    };

    // Inject the authwit check if the function is marked with #[authorize_once].
    let authorize_once_check = if fn_has_authorize_once(f) {
        create_authorize_once_check(f)
    } else {
        quote {}
    };

    // Finally, we need to change the return type to be `PrivateCircuitPublicInputs`, which is what the Private Kernel
    // circuit expects.
    let return_value_var_name = quote { macro__returned__values };

    let return_value_type = f.return_type();
    let return_value = if body.len() == 0 {
        quote {}
    } else if return_value_type != type_of(()) {
        // The original return value is passed to a second args hasher which the context receives.
        let (body_without_return, last_body_expr) = body.pop_back();
        let return_value = last_body_expr.quoted();
        let return_value_assignment =
            quote { let $return_value_var_name: $return_value_type = $return_value; };
        let return_hasher_name = quote { return_hasher };
        let return_value_into_hasher =
            add_to_hasher(return_hasher_name, return_value_var_name, return_value_type);

        body = body_without_return;

        quote {
            let mut $return_hasher_name = dep::aztec::hash::ArgsHasher::new();
            $return_value_assignment
            $return_value_into_hasher
            context.set_return_hash($return_hasher_name);
        }
    } else {
        let (body_without_return, last_body_expr) = body.pop_back();
        if !last_body_expr.has_semicolon()
            & last_body_expr.as_for().is_none()
            & last_body_expr.as_assert().is_none()
            & last_body_expr.as_for_range().is_none()
            & last_body_expr.as_assert_eq().is_none()
            & last_body_expr.as_let().is_none() {
            let unused_return_value_name = f"_{return_value_var_name}".quoted_contents();
            body = body_without_return.push_back(
                quote { let $unused_return_value_name = $last_body_expr; }.as_expr().unwrap(),
            );
        }
        quote {}
    };

    let context_finish = quote { context.finish() };

    let to_prepend = quote {
        $args_hasher
        $context_creation
        $assert_initializer
        $init_check
        $internal_check
        $view_check
        $storage_init
        $message_discovery_call
        $authorize_once_check
    };

    let to_append = quote {
        $return_value
        $mark_as_initialized
        $context_finish
    };
    let modified_body = modify_fn_body(body, to_prepend, to_append);
    f.set_body(modified_body);
    f.set_return_type(
        quote { dep::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }
            .as_type(),
    );
    f.set_return_data();

    fn_abi
}

pub(crate) comptime fn transform_public(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    stub_registry::register(f.module(), fn_stub);

    // If a function is further modified as unconstrained, we throw an error
    if f.is_unconstrained() {
        let name = f.name();
        panic(
            f"Function {name} is annotated with #[public] but marked as unconstrained, remove unconstrained keyword",
        );
    }

    let module_has_initializer = module_has_initializer(f.module());
    let module_has_storage = module_has_storage(f.module());

    // Public functions undergo a lot of transformations from their Aztec.nr form.
    let original_params = f.parameters();

    let args_len_quote = if original_params.len() == 0 {
        // If the function has no parameters, we set the args_len to 0.
        quote { 0 }
    } else {
        // The following will give us <type_of_struct_member_1 as Serialize>::N + <type_of_struct_member_2 as Serialize>::N + ...
        original_params
            .map(|(_, param_type): (Quoted, Type)| {
                quote {
            <$param_type as $crate::protocol_types::traits::Serialize>::N
        }
            })
            .join(quote {+})
    };

    // Unlike in the private case, in public the `context` does not need to receive the hash of the original params.
    let context_creation = quote {
        let mut context = dep::aztec::context::public_context::PublicContext::new(|| {
        // We start from 1 because we skip the selector for the dispatch function.
        let serialized_args : [Field; $args_len_quote] = dep::aztec::context::public_context::calldata_copy(1, $args_len_quote);
        dep::aztec::hash::hash_args_array(serialized_args)
        });
    };

    // Modifications introduced by the different marker attributes.
    let internal_check = if is_fn_internal(f) {
        create_internal_check(f)
    } else {
        quote {}
    };

    let view_check = if is_fn_view(f) {
        create_view_check(f)
    } else {
        quote {}
    };

    let (assert_initializer, mark_as_initialized) = if is_fn_initializer(f) {
        (create_assert_correct_initializer_args(f), create_mark_as_initialized(f))
    } else {
        (quote {}, quote {})
    };

    let storage_init = if module_has_storage {
        // Some functions don't access storage, but it'd be quite difficult to only inject this variable if it is
        // referenced. We instead ignore 'unused variable' warnings for it.
        quote {
            #[allow(unused_variables)]
            let storage = Storage::init(&mut context);
        }
    } else {
        quote {}
    };

    // Initialization checks are not included in contracts that don't have initializers.
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) & !is_fn_initializer(f) {
        create_init_check(f)
    } else {
        quote {}
    };

    // Inject the authwit check if the function is marked with #[authorize_once].
    let authorize_once_check = if fn_has_authorize_once(f) {
        create_authorize_once_check(f)
    } else {
        quote {}
    };

    let to_prepend = quote {
        $context_creation
        $assert_initializer
        $init_check
        $internal_check
        $view_check
        $storage_init
        $authorize_once_check
    };

    let to_append = quote {
        $mark_as_initialized
    };

    let body = f.body().as_block().unwrap();
    let modified_body = modify_fn_body(body, to_prepend, to_append);
    f.set_body(modified_body);

    // All public functions are automatically made unconstrained, even if they were not marked as such. This is because
    // instead of compiling into a circuit, they will compile to bytecode that will be later transpiled into AVM
    // bytecode.
    f.set_unconstrained(true);
    f.set_return_public(true);

    fn_abi
}

pub(crate) comptime fn transform_utility(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    stub_registry::register(f.module(), fn_stub);

    // Check if function is marked as unconstrained
    if !f.is_unconstrained() {
        let name = f.name();
        panic(
            f"Function {name} is annotated with #[utility] but not marked as unconstrained, add unconstrained keyword",
        );
    }

    // Create utility context
    let context_creation =
        quote { let mut context = dep::aztec::context::utility_context::UtilityContext::new(); };
    let module_has_storage = module_has_storage(f.module());

    // Initialize Storage if module has storage
    let storage_init = if module_has_storage {
        quote {
            // Some functions don't access storage, but it'd be quite difficult to only inject this variable if it is
            // referenced. We instead ignore 'unused variable' warnings for it.
            #[allow(unused_variables)]
            let storage = Storage::init(context);
        }
    } else {
        quote {}
    };

    // All utility functions perform message discovery, since they may need to access private notes that would be
    // found during this process or they may be used to sync private events from TypeScript
    // (`sync_private_state` function gets invoked by PXE::getPrivateEvents function).
    let message_discovery_call = create_message_discovery_call();

    // Inject context creation, storage initialization, and message discovery call at the beginning of the function
    // body.
    let to_prepend = quote {
        $context_creation
        $storage_init
        $message_discovery_call
    };
    let body = f.body().as_block().unwrap();
    let modified_body = modify_fn_body(body, to_prepend, quote {});
    f.set_body(modified_body);

    f.set_return_public(true);

    fn_abi
}

comptime fn create_internal_check(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called internally";
    quote { assert(context.msg_sender() == context.this_address(), $assertion_message); }
}

comptime fn create_view_check(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called statically";
    if is_fn_private(f) {
        // Here `context` is of type context::PrivateContext
        quote { assert(context.inputs.call_context.is_static_call, $assertion_message); }
    } else {
        // Here `context` is of type context::PublicContext
        quote { assert(context.is_static_call(), $assertion_message); }
    }
}

comptime fn create_assert_correct_initializer_args(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::macros::functions::initialization_utils::assert_initialization_matches_address_preimage_{fn_visibility}(context);"
        .quoted_contents()
}

comptime fn create_mark_as_initialized(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::macros::functions::initialization_utils::mark_as_initialized_{fn_visibility}(&mut context);"
        .quoted_contents()
}

comptime fn create_init_check(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::macros::functions::initialization_utils::assert_is_initialized_{fn_visibility}(&mut context);"
        .quoted_contents()
}

/// Injects a call to `aztec::messages::discovery::discover_new_messages`, causing for new notes to be added to PXE and made
/// available for the current execution.
pub(crate) comptime fn create_message_discovery_call() -> Quoted {
    quote {
        /// Safety: message discovery returns nothing and is performed solely for its side-effects. It is therefore
        /// always safe to call.
        unsafe {
            dep::aztec::messages::discovery::discover_new_messages(
                context.this_address(),
                _compute_note_hash_and_nullifier,
            );
        };
    }
}

/// Injects an authwit verification check of the form:
/// ```
///   if (!from.eq(context.msg_sender())) {
///         assert_current_call_valid_authwit::<N>(&mut context, from);
///     } else {
///         assert(authwit_nonce, "Invalid auhtwit nonce. When 'from' and 'msg_sender' are the same, authwit_nonce must be zero");
///     }
/// ```
/// where `from` and `authwit_nonce` are the names of the parameters that are expected to be present in the function definition.
/// This check is injected by the `#[authorize_once("from_arg_name", "nonce_arg_name")]`, which allows the user to define
/// which parameters to use.
pub(crate) comptime fn create_authorize_once_check(f: FunctionDefinition) -> Quoted {
    if !is_fn_private(f) & !is_fn_public(f) {
        panic(
            f"Functions marked with #[authorize_once] must either be #[private] or #[public]",
        );
    }
    let maybe_authorize_once_args = AUTHORIZE_ONCE_REGISTRY.get(f);
    let authorize_once_args = if maybe_authorize_once_args.is_some() {
        maybe_authorize_once_args.unwrap()
    } else {
        panic(
            f"Functions marked with #[authorize_once] must have the #[private] or #[public] attribute placed last",
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

    let fn_call = if is_fn_private(f) {
        // At this point, the original args of the fn have already been altered by the macro
        // to include PrivateContextInputs, so we need to adjust the args_len accordingly.
        let args_len = f.parameters().len() - 1;
        quote { dep::aztec::authwit::auth::assert_current_call_valid_authwit::<$args_len> }
    } else {
        quote { dep::aztec::authwit::auth::assert_current_call_valid_authwit_public }
    };
    let invalid_nonce_message = f"Invalid authwit nonce. When '{from_arg_name}' and 'msg_sender' are the same, '{nonce_arg_name}' must be zero"
        .as_ctstring()
        .as_quoted_str();
    quote {         
        if (!$from_arg_name_quoted.eq(context.msg_sender())) {
            $fn_call(&mut context, $from_arg_name_quoted);
        } else {
            assert($nonce_check_quote, $invalid_nonce_message);
        }
    }
}

/// Checks if each function in the module is marked with either #[private], #[public], #[utility],
/// #[contract_library_method], or #[test]. Non-macroified functions are not allowed in contracts.
pub(crate) comptime fn check_each_fn_macroified(m: Module) {
    for f in m.functions() {
        let name = f.name();
        if !is_fn_private(f)
            & !is_fn_public(f)
            & !is_fn_utility(f)
            & !is_fn_contract_library_method(f)
            & !is_fn_test(f) {
            panic(
                f"Function {name} must be marked as either #[private], #[public], #[utility], #[contract_library_method], or #[test]",
            );
        }
    }
}
