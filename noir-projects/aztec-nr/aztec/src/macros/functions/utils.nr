// TODO(benesjan): Move this whole file to `noir-projects/aztec-nr/aztec/src/macros/internals_functions_generation`.
// Not done yet in order to not murder the PR diff.
use crate::macros::{
    functions::{
        auth_registry::AUTHORIZE_ONCE_REGISTRY,
        call_interface_stubs::{
            register_private_fn_stubs, register_public_fn_stubs, register_utility_fn_stub,
        },
    },
    notes::NOTES,
    utils::{
        fn_has_authorize_once, fn_has_noinitcheck, is_fn_contract_library_method, is_fn_external,
        is_fn_initializer, is_fn_internal, is_fn_only_self, is_fn_test, is_fn_view,
        module_has_initializer, module_has_storage,
    },
};
use dep::protocol_types::meta::utils::derive_serialization_quotes;
use std::meta::{ctstring::AsCtString, type_of};

/// Gathers all attributes relevant to the function's ABI and returns a quote that can be applied to the newly generated
/// function. We apply the abi marker attributes instead of the original ones (e.g. abi_view instead of view) to avoid
/// the relevant attribute's functionality from getting triggered.
comptime fn get_abi_relevant_attributes(f: FunctionDefinition) -> Quoted {
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

pub(crate) comptime fn transform_private(f: FunctionDefinition) -> Quoted {
    // TODO(benesjan): This function should only generate the new function's quote. Move the following to a different
    // place.
    register_private_fn_stubs(f);

    let module_has_initializer = module_has_initializer(f.module());
    let module_has_storage = module_has_storage(f.module());

    // Private functions undergo a lot of transformations from their Aztec.nr form into a circuit that can be fed to the
    // Private Kernel Circuit.
    // First we change the function signature so that it also receives `PrivateContextInputs`, which contain information
    // about the execution context (e.g. the caller).
    let original_params = f.parameters();

    let original_params_quotes = original_params
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });

    let params = quote { inputs: aztec::context::inputs::private_context_inputs::PrivateContextInputs, $original_params_quotes };

    let mut body = f.body().as_block().unwrap();

    // The original params are hashed and passed to the `context` object, so that the kernel can verify we've received
    // the correct values.
    let (args_serialization, _, serialized_args_name) =
        derive_serialization_quotes(original_params, false);

    let storage_init = if module_has_storage {
        // Contract has Storage defined so we initialize it.
        quote {
            let storage = Storage::init(&mut context);
        }
    } else {
        // Contract does not have Storage defined, so we set storage to the unit type `()`. ContractSelf requires a
        // storage struct in its constructor. Using an Option type would lead to worse developer experience and higher
        // constraint counts so we use the unit type `()` instead.
        quote {
            let storage = ();
        }
    };

    let contract_self_creation = quote {
        #[allow(unused_variables)]
        let mut self = {
            $args_serialization
            let args_hash = aztec::hash::hash_args_array($serialized_args_name);
            let mut context = aztec::context::private_context::PrivateContext::new(inputs, args_hash);
            $storage_init
            let self_address = context.this_address();
            let call_self: CallSelf<&mut aztec::context::private_context::PrivateContext> = CallSelf { address: self_address, context: &mut context };
            let enqueue_self: EnqueueSelf<&mut aztec::context::private_context::PrivateContext> = EnqueueSelf { address: self_address, context: &mut context };
            let call_self_static: CallSelfStatic<&mut aztec::context::private_context::PrivateContext> = CallSelfStatic { address: self_address, context: &mut context };
            let enqueue_self_static: EnqueueSelfStatic<&mut aztec::context::private_context::PrivateContext> = EnqueueSelfStatic { address: self_address, context: &mut context };
            let internal: CallInternal<&mut aztec::context::private_context::PrivateContext> = CallInternal { context: &mut context };
            aztec::contract_self::ContractSelf::new_private(&mut context, storage, call_self, enqueue_self, call_self_static, enqueue_self_static, internal)
        };
    };

    let original_function_name = f.name();

    // Modifications introduced by the different marker attributes.
    let internal_check = if is_fn_only_self(f) {
        let assertion_message =
            f"Function {original_function_name} can only be called by the same contract";
        quote { assert(self.msg_sender().unwrap() == self.address, $assertion_message); }
    } else {
        quote {}
    };

    let view_check = if is_fn_view(f) {
        let assertion_message = f"Function {original_function_name} can only be called statically"
            .as_ctstring()
            .as_quoted_str();
        quote { assert(self.context.inputs.call_context.is_static_call, $assertion_message); }
    } else {
        quote {}
    };

    let (assert_initializer, mark_as_initialized) = if is_fn_initializer(f) {
        (
            quote { aztec::macros::functions::initialization_utils::assert_initialization_matches_address_preimage_private(*self.context); },
            quote { aztec::macros::functions::initialization_utils::mark_as_initialized_private(self.context); },
        )
    } else {
        (quote {}, quote {})
    };

    // Initialization checks are not included in contracts that don't have initializers.
    let init_check = if module_has_initializer & !is_fn_initializer(f) & !fn_has_noinitcheck(f) {
        quote { aztec::macros::functions::initialization_utils::assert_is_initialized_private(self.context); }
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
        create_authorize_once_check(f, true)
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
        // The original return value is serialized and hashed before being passed to the context.
        let (body_without_return, last_body_expr) = body.pop_back();
        let return_value = last_body_expr.quoted();
        let return_value_assignment =
            quote { let $return_value_var_name: $return_value_type = $return_value; };

        let (return_serialization, _, serialized_return_name) =
            derive_serialization_quotes([(return_value_var_name, return_value_type)], false);

        body = body_without_return;

        quote {
            $return_value_assignment
            $return_serialization
            self.context.set_return_hash($serialized_return_name);
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

    let context_finish = quote { self.context.finish() };

    // Preserve all attributes that are relevant to the function's ABI.
    let abi_relevant_attributes = get_abi_relevant_attributes(f);

    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();

    let to_prepend = quote {
        dep::aztec::oracle::version::assert_compatible_oracle_version();
        $contract_self_creation
        $assert_initializer
        $init_check
        $internal_check
        $view_check
        $message_discovery_call
        $authorize_once_check
    };

    let body_quote = body.map(|expr| expr.quoted()).join(quote { });

    let to_append = quote {
        $return_value
        $mark_as_initialized
        $context_finish
    };

    quote {
        #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
        $abi_relevant_attributes
        fn $fn_name($params) -> return_data aztec::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
            $to_prepend
            $body_quote
            $to_append
        }
    }
}

pub(crate) comptime fn transform_public(f: FunctionDefinition) -> Quoted {
    // TODO(benesjan): This function should only generate the new function's quote. Move the following to a different
    // place.
    register_public_fn_stubs(f);

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

    let storage_init = if module_has_storage {
        quote {
            let storage = Storage::init(context);
        }
    } else {
        // Contract does not have Storage defined, so we set storage to the unit type `()`. ContractSelf requires a
        // storage struct in its constructor. Using an Option type would lead to worse developer experience and higher
        // constraint counts so we use the unit type `()` instead.
        quote {
            let storage = ();
        }
    };

    // Unlike in the private case, in public the `context` does not need to receive the hash of the original params.
    let contract_self_creation = quote {
        #[allow(unused_variables)]
        let mut self = {
            let context = dep::aztec::context::public_context::PublicContext::new(|| {
            // We start from 1 because we skip the selector for the dispatch function.
            let serialized_args : [Field; $args_len_quote] = dep::aztec::context::public_context::calldata_copy(1, $args_len_quote);
            dep::aztec::hash::hash_args_array(serialized_args)
            });
            $storage_init
            let self_address = context.this_address();
            let call_self: CallSelf<aztec::context::public_context::PublicContext> = CallSelf { address: self_address, context };
            let call_self_static: CallSelfStatic<aztec::context::public_context::PublicContext> = CallSelfStatic { address: self_address, context };
            let internal: CallInternal<aztec::context::public_context::PublicContext> = CallInternal { context };
            aztec::contract_self::ContractSelf::new_public(context, storage, call_self, call_self_static, internal)
        };
    };

    let original_function_name = f.name();

    // Modifications introduced by the different marker attributes.
    let internal_check = if is_fn_only_self(f) {
        let assertion_message =
            f"Function {original_function_name} can only be called by the same contract";
        quote { assert(self.msg_sender().unwrap() == self.address, $assertion_message); }
    } else {
        quote {}
    };

    let view_check = if is_fn_view(f) {
        let assertion_message = f"Function {original_function_name} can only be called statically"
            .as_ctstring()
            .as_quoted_str();
        quote { assert(self.context.is_static_call(), $assertion_message); }
    } else {
        quote {}
    };

    let (assert_initializer, mark_as_initialized) = if is_fn_initializer(f) {
        (
            quote { aztec::macros::functions::initialization_utils::assert_initialization_matches_address_preimage_public(self.context); },
            quote { aztec::macros::functions::initialization_utils::mark_as_initialized_public(self.context); },
        )
    } else {
        (quote {}, quote {})
    };

    // Initialization checks are not included in contracts that don't have initializers.
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) & !is_fn_initializer(f) {
        quote { aztec::macros::functions::initialization_utils::assert_is_initialized_public(self.context); }
    } else {
        quote {}
    };

    // Inject the authwit check if the function is marked with #[authorize_once].
    let authorize_once_check = if fn_has_authorize_once(f) {
        create_authorize_once_check(f, false)
    } else {
        quote {}
    };

    let to_prepend = quote {
        $contract_self_creation
        $assert_initializer
        $init_check
        $internal_check
        $view_check
        $authorize_once_check
    };

    let to_append = quote {
        $mark_as_initialized
    };

    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();
    let body = f.body();
    let return_type = f.return_type();

    // New function parameters are the same as the original function's ones.
    let params = original_params
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });

    // Preserve all attributes that are relevant to the function's ABI.
    let abi_relevant_attributes = get_abi_relevant_attributes(f);

    // All public functions are automatically made unconstrained, even if they were not marked as such. This is because
    // instead of compiling into a circuit, they will compile to bytecode that will be later transpiled into AVM
    // bytecode.
    quote {
        #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
        $abi_relevant_attributes
        unconstrained fn $fn_name($params) -> pub $return_type {
            $to_prepend
            $body
            $to_append
        }
    }
}

pub(crate) comptime fn transform_utility(f: FunctionDefinition) -> Quoted {
    // TODO(benesjan): This function should only generate the new function's quote. Move the following to a different
    // place.
    register_utility_fn_stub(f);

    // Initialize Storage if module has storage
    let storage_init = if module_has_storage(f.module()) {
        quote {
            let storage = Storage::init(context);
        }
    } else {
        // Contract does not have Storage defined, so we set storage to the unit type `()`. ContractSelf requires a
        // storage struct in its constructor. Using an Option type would lead to worse developer experience and higher
        // constraint counts so we use the unit type `()` instead.
        quote {
            let storage = ();
        }
    };

    // Create utility context
    let contract_self_creation = quote {
        #[allow(unused_variables)]
        let mut self = {
            let context = dep::aztec::context::utility_context::UtilityContext::new();
            $storage_init
            aztec::contract_self::ContractSelf::new_utility(context, storage)
        };
    };

    // All utility functions perform message discovery, since they may need to access private notes that would be
    // found during this process or they may be used to sync private events from TypeScript
    // (`sync_private_state` function gets invoked by PXE::getPrivateEvents function).
    let message_discovery_call = create_message_discovery_call();

    // A quote to be injected at the beginning of the function body.
    let to_prepend = quote {
        dep::aztec::oracle::version::assert_compatible_oracle_version();
        $contract_self_creation
        $message_discovery_call
    };

    let original_function_name = f.name();
    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();
    let body = f.body();
    let params = f
        .parameters()
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });
    let return_type = f.return_type();

    quote {
        #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
        unconstrained fn $fn_name($params) -> pub $return_type {
            $to_prepend
            $body
        }
    }
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

/// Checks if each function in the module is marked with either #[external(...)], #[contract_library_method], or #[test].
/// Non-macroified functions are not allowed in contracts.
pub(crate) comptime fn check_each_fn_macroified(m: Module) {
    for f in m.functions() {
        let name = f.name();
        if !is_fn_external(f)
            & !is_fn_contract_library_method(f)
            & !is_fn_internal(f)
            & !is_fn_test(f) {
            // We  don't suggest that #[contract_library_method] is allowed because we don't want to introduce another
            // concept
            panic(
                f"Function {name} must be marked as either #[external(...)], #[internal(...)], or #[test]",
            );
        }
    }
}
