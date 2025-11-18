use crate::macros::{
    internals_functions_generation::external::helpers::{
        create_authorize_once_check, get_abi_relevant_attributes,
    },
    utils::{
        fn_has_authorize_once, fn_has_noinitcheck, is_fn_initializer, is_fn_only_self, is_fn_view,
        module_has_initializer, module_has_storage,
    },
};
use std::meta::ctstring::AsCtString;

pub(crate) comptime fn generate_public_external(f: FunctionDefinition) -> Quoted {
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
