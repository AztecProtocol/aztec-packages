use std::meta::{unquote, type_of};

use super::utils::{
    modify_fn_body, is_fn_private, get_fn_visibility, is_fn_view, is_fn_initializer, is_fn_internal,
    fn_has_noinitcheck, compute_fn_selector, add_to_field_slice, add_to_hasher
};
use super::utils::is_fn_public;

comptime mut global STUBS: [Quoted] = &[];

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private]
pub comptime fn internal(_f: FunctionDefinition) {}

comptime fn create_internal_check(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called internally";
    quote { assert(context.msg_sender() == context.this_address(), $assertion_message); }
}

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private]
pub comptime fn view(_f: FunctionDefinition) {}

comptime fn create_view_check(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called statically";
    if is_fn_private(f) {
        quote { assert(context.inputs.call_context.is_static_call == true, $assertion_message); }
    } else {
        quote { assert(context.inputs.is_static_call == true, $assertion_message); }
    }
}

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private]
pub comptime fn initializer(_f: FunctionDefinition) {}

comptime fn create_assert_initializer(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::assert_initialization_matches_address_preimage_{fn_visibility}(context);".quoted_contents()
}

comptime fn create_init_check(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::assert_is_initialized_{fn_visibility}(&mut context);".quoted_contents()
}

comptime fn create_mark_as_initialized(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::mark_as_initialized_{fn_visibility}(&mut context);".quoted_contents()
}

comptime fn create_fn_abi_export(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    // Remove first arg (inputs)
    let mut parameters = f.parameters().pop_front().1.map(
        | (name, typ): (Quoted, Type) | {
        quote { $name: $typ }
    }
    ).join(quote{,});

    let parameters_struct_name = f"{name}_parameters".quoted_contents();
    let parameters = quote {
        struct $parameters_struct_name {
            $parameters
        }
    };

    let return_value_type = f.return_type();
    let return_type = if return_value_type != type_of(()) {
        quote { return_type: $return_value_type }
    } else {
        quote {}
    };

    let abi_struct_name = f"{name}_abi".quoted_contents();

    let result = quote {

        $parameters

        #[abi(functions)]
        struct $abi_struct_name {
            parameters: $parameters_struct_name,
            $return_type
        }
    };
    result
}

pub comptime fn private(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    STUBS = STUBS.push_back(fn_stub);

    let module_has_initializer = f.module().functions().any(|f: FunctionDefinition| is_fn_initializer(f));
    let module_has_storage = f.module().structs().any(|s: StructDefinition| s.has_named_attribute("storage"));

    let current_params = f.parameters();
    f.set_parameters(
        &[
        (
            quote { inputs }, quote { crate::context::inputs::private_context_inputs::PrivateContextInputs }.as_type()
        )
    ].append(current_params)
    );
    let mut body = f.body().as_block().unwrap();
    let args_hasher_name = quote { args_hasher };
    let args_hasher = current_params.fold(
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
    }
    );
    let context_creation = quote { let mut context = dep::aztec::context::private_context::PrivateContext::new(inputs, args_hasher.hash()); };
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
        (create_assert_initializer(f), create_mark_as_initialized(f))
    } else {
        (quote {}, quote {})
    };
    let storage_init = if module_has_storage {
        quote { let storage = Storage::init(&mut context); }
    } else {
        quote {}
    };
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) {
        create_init_check(f)
    } else {
        quote {}
    };

    let return_value_type = f.return_type();

    let return_value = if return_value_type != type_of(()) {
        let (body_without_return, return_value) = body.pop_back();
        let return_value = return_value.quoted();
        let return_hasher_name = quote { return_hasher };
        let return_value_into_hasher = add_to_hasher(return_hasher_name, return_value, return_value_type);

        body = body_without_return;

        quote {
            let $return_hasher_name = dep::aztec::hash::ArgsHasher::new();
            $return_value_into_hasher
            context.set_return_hash($return_hasher_name);
        }
    } else {
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
    };

    let to_append = quote {
        $return_value
        $mark_as_initialized
        $context_finish
    };

    modify_fn_body(f, to_prepend, to_append);
    f.add_attribute("recursive");
    f.set_return_public(true);
    f.set_return_type(
        quote { dep::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }.as_type()
    );
    fn_abi
}

pub comptime fn public(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    STUBS = STUBS.push_back(fn_stub);

    let module_has_initializer = f.module().functions().any(|f: FunctionDefinition| is_fn_initializer(f));
    let module_has_storage = f.module().structs().any(|s: StructDefinition| s.has_named_attribute("storage"));

    let current_params = f.parameters();
    f.set_parameters(
        &[
        (
            quote { inputs }, quote { crate::context::inputs::public_context_inputs::PublicContextInputs }.as_type()
        )
    ].append(current_params)
    );
    let context_creation = quote { let mut context = dep::aztec::context::public_context::PublicContext::new(inputs); };
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
        (create_assert_initializer(f), create_mark_as_initialized(f))
    } else {
        (quote {}, quote {})
    };
    let storage_init = if module_has_storage {
        quote { let storage = Storage::init(&mut context); }
    } else {
        quote {}
    };
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) {
        create_init_check(f)
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
    };

    let to_append = quote {
        $mark_as_initialized
    };

    modify_fn_body(f, to_prepend, to_append);
    f.set_unconstrained(true);
    f.set_return_public(true);
    fn_abi
}

pub comptime fn transform_unconstrained(f: FunctionDefinition) {
    let context_creation = quote { let mut context = dep::aztec::context::unconstrained_context::UnconstrainedContext::new(); };
    let module_has_storage = f.module().structs().any(|s: StructDefinition| s.has_named_attribute("storage"));

    let storage_init = if module_has_storage {
        quote { let storage = Storage::init(context); }
    } else {
        quote {}
    };
    let to_prepend = quote {
        $context_creation
        $storage_init
    };

    modify_fn_body(f, to_prepend, quote {});
}

pub comptime fn stub_fn(f: FunctionDefinition) -> Quoted {
    let fn_name = f.name();
    let fn_parameters = f.parameters();
    let fn_return_type = f.return_type();
    let fn_visibility = get_fn_visibility(f);
    let is_static_call = is_fn_view(f);
    let is_void = fn_return_type == type_of(());
    let fn_visibility_capitalized = if is_fn_private(f) {
        quote { Private }
    } else {
        quote { Public }
    };
    let is_static_call_capitalized = if is_static_call {
        quote { Static }
    } else {
        quote { }
    };
    let is_void_capitalized = if is_void { quote { Void } } else { quote { } };
    let args_acc_name = quote { args_acc };
    let args_acc = fn_parameters.fold(
        quote {
                let mut $args_acc_name = &[];
            },
        |args_hasher, param: (Quoted, Type)| {
            let (name, typ) = param;
            let appended_arg = add_to_field_slice(args_acc_name, name, typ);
            quote {
                $args_hasher
                $appended_arg
            }
        }
    );

    let args_hash_name = if fn_visibility == quote { private } {
        quote { args_hash }
    } else {
        quote {}
    };

    let args = if fn_visibility == quote { private } {
        quote {
            $args_acc
            let $args_hash_name = dep::aztec::hash::hash_args($args_acc_name);
        }
    } else {
        args_acc
    };

    let fn_parameters_list = fn_parameters.map(
        | (name, typ): (Quoted, Type) | {
            quote { $name: $typ }
        }
    ).join(quote{,});

    let fn_name_str = fn_name.as_str_quote();

    let fn_name_len: u32 = unquote!(quote { $fn_name_str.as_bytes().len()});

    let arg_types_list = fn_parameters.map(|(_, typ): (_, Type)| quote { $typ }).join(quote {,});
    let arg_types = if fn_parameters.len() == 1 {
        f"({arg_types_list},)".quoted_contents()
    } else {
        f"({arg_types_list})".quoted_contents()
    };

    let generics = if is_void {
        f"{arg_types}>".quoted_contents()
    } else {
        f"{fn_return_type}, {arg_types}>".quoted_contents()
    };

    let call_interface_name = f"dep::aztec::context::call_interfaces::{fn_visibility_capitalized}{is_static_call_capitalized}{is_void_capitalized}CallInterface".quoted_contents();
    let call_interface_name_w_generics = f"{call_interface_name}<{fn_name_len}, {generics}".quoted_contents();

    let fn_selector: Field = compute_fn_selector(f);

    let gas_opts = if is_fn_public(f) {
        quote { gas_opts: dep::aztec::context::gas::GasOpts::default() }
    } else {
        quote {}
    };

    let input_type = f"crate::context::inputs::{fn_visibility_capitalized}ContextInputs".quoted_contents().as_type();

    let return_type_hint = if is_fn_private(f) {
        quote { protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }.as_type()
    } else {
        fn_return_type
    };

    let parameter_names = if fn_parameters.len() > 0 {
        let params = fn_parameters.map(|(name, _): (Quoted, _)| name).join(quote {,});
        f",{params}".quoted_contents()
    } else {
        quote {}
    };

    let original = quote {
        | inputs: $input_type  | -> $return_type_hint {
            $fn_name(inputs $parameter_names)
        }
    };

    let args_hash = if fn_visibility == quote { private } {
        quote { $args_hash_name, }
    } else {
        quote {}
    };

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> $call_interface_name_w_generics {
            $args
            let selector = dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_field($fn_selector);
            $call_interface_name {
                target_contract: self.target_contract,
                selector,
                name: $fn_name_str,
                $args_hash
                args: $args_acc_name,
                original: $original,
                is_static: $is_static_call,
                $gas_opts
            }
        }
    }
}
