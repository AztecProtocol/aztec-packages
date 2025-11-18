use crate::macros::{
    internals_functions_generation::external::helpers::{
        create_authorize_once_check, create_message_discovery_call, get_abi_relevant_attributes,
    },
    notes::NOTES,
    utils::{
        fn_has_authorize_once, fn_has_noinitcheck, is_fn_initializer, is_fn_only_self, is_fn_view,
        module_has_initializer, module_has_storage,
    },
};
use protocol_types::meta::utils::derive_serialization_quotes;
use std::meta::{ctstring::AsCtString, type_of};

pub(crate) comptime fn generate_private_external(f: FunctionDefinition) -> Quoted {
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
