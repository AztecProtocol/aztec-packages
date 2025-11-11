use crate::macros::utils::module_has_storage;

/// Generates a private internal function based on the function that was originally marked with #[internal("private")].
/// For more details on why we do this instead of just transforming the original function, see the documentation of this
/// module.
pub(crate) comptime fn generate_private_internal(f: FunctionDefinition) -> Quoted {
    let original_function_name = f.name();
    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();
    let return_type = f.return_type();

    let original_params = f
        .parameters()
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });

    let params = quote {
        context: &mut aztec::context::private_context::PrivateContext,
        $original_params
    };

    let storage_init = if module_has_storage(f.module()) {
        quote {
            let storage = Storage::init(context);
        }
    } else {
        quote {
            let storage = ();
        }
    };

    let body = f.body();

    // Internal functions are inlined within external functions. For this reason we mark them with
    // #[contract_library_method] to prevent them from being compiled as entry points.
    quote {
        #[contract_library_method]
        fn $fn_name($params) -> $return_type {
            #[allow(unused_variables)]
            let mut self = {
                $storage_init
                let self_address = context.this_address();
                let call_self: CallSelf<&mut aztec::context::private_context::PrivateContext> = CallSelf { address: self_address, context };
                let enqueue_self: EnqueueSelf<&mut aztec::context::private_context::PrivateContext> = EnqueueSelf { address: self_address, context };
                let call_self_static: CallSelfStatic<&mut aztec::context::private_context::PrivateContext> = CallSelfStatic { address: self_address, context };
                let enqueue_self_static: EnqueueSelfStatic<&mut aztec::context::private_context::PrivateContext> = EnqueueSelfStatic { address: self_address, context };
                let internal: CallInternal<&mut aztec::context::private_context::PrivateContext> = CallInternal { context };
                aztec::contract_self::ContractSelf::new_private(context, storage, call_self, enqueue_self, call_self_static, enqueue_self_static, internal)
            };
            
            $body
        }
    }
}

/// Generates a public internal function based on the function that was originally marked with #[internal("public")].
/// For more details on why we do this instead of just transforming the original function, see the documentation of this
/// module.
pub(crate) comptime fn generate_public_internal(f: FunctionDefinition) -> Quoted {
    let original_function_name = f.name();
    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();
    let return_type = f.return_type();

    let original_params = f
        .parameters()
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });

    let params = quote {
        context: aztec::context::public_context::PublicContext,
        $original_params
    };

    let storage_init = if module_has_storage(f.module()) {
        quote {
            let storage = Storage::init(context);
        }
    } else {
        quote {
            let storage = ();
        }
    };

    let body = f.body();

    // Internal public functions are marked as unconstrained because they are inlined within external public functions,
    // which are also compiled as unconstrained and later transpiled to AVM bytecode. Since these internal functions are
    // intended to be inlined, we mark them with #[contract_library_method] to prevent them from being compiled as entry
    // points.
    quote {
        #[contract_library_method]
        unconstrained fn $fn_name($params) -> $return_type {
            #[allow(unused_variables)]
            let mut self = {
                $storage_init
                let self_address = context.this_address();
                let call_self: CallSelf<aztec::context::public_context::PublicContext> = CallSelf { address: self_address, context };
                let call_self_static: CallSelfStatic<aztec::context::public_context::PublicContext> = CallSelfStatic { address: self_address, context };
                let internal: CallInternal<aztec::context::public_context::PublicContext> = CallInternal { context };
                aztec::contract_self::ContractSelf::new_public(context, storage, call_self, call_self_static, internal)
            };

            $body
        }
    }
}
