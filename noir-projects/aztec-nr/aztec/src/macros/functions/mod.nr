use std::meta::{unquote, type_of};

use super::utils::{
    modify_fn_body, is_fn_private, get_fn_visibility, add_to_hasher, is_fn_view, compute_fn_selector,
    add_to_field_slice
};

comptime mut global STUBS: [Quoted] = &[];

pub comptime fn internal(f: FunctionDefinition) {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called internally";
    let internal_check = quote { assert(context.msg_sender() == context.this_address(), $assertion_message); };
    modify_fn_body(f, internal_check, quote {});
}

pub comptime fn view(f: FunctionDefinition) {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called statically";
    let static_check = if is_fn_private(f) {
        quote { assert(context.inputs.call_context.is_static_call == true, $assertion_message); }
    } else {
        quote { assert(context.inputs.is_static_call == true, $assertion_message); }
    };
    modify_fn_body(f, static_check, quote {});
}

pub comptime fn initializer(f: FunctionDefinition) {
    let fn_visibility = get_fn_visibility(f);
    let to_prepend = f"dep::aztec::initializer::assert_initialization_matches_address_preimage_{fn_visibility}(context);".quoted_contents();
    modify_fn_body(f, to_prepend, quote {});
}

fn create_init_check(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::assert_is_initialized_{fn_visibility}(&mut context);".quoted_contents()
}

fn create_fn_abi_export(f: FunctionDefinition) -> Quoted {
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
    let return_type_quote = if !return_value_type.eq(type_of(())) {
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
            $return_type_quote
        }
    };
    result
}

pub comptime fn private(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    STUBS = STUBS.push_back(fn_stub);

    let module_has_initializer = f.module().functions().any(|f: FunctionDefinition| f.has_named_attribute(quote { initializer }));

    let current_params = f.parameters();
    f.set_parameters(
        &[
        (
            quote { inputs }, quote { crate::context::inputs::private_context_inputs::PrivateContextInputs }.as_type()
        )
    ].append(current_params)
    );
    let mut body = f.body().as_block().unwrap();
    let args_hasher_name_quote = quote { args_hasher };
    let args_hasher_quote = current_params.fold(
        quote {
        let mut $args_hasher_name_quote = dep::aztec::hash::ArgsHasher::new();
        },
        |args_hasher_quote, param: (Quoted, Type)| {
        let (name, typ) = param;
        let appended_arg_quote = add_to_hasher(args_hasher_name_quote, name, typ);
        quote {
            $args_hasher_quote
            $appended_arg_quote
        }
    }
    );
    let context_creation_quote = quote { let mut context = dep::aztec::context::private_context::PrivateContext::new(inputs, args_hasher.hash()); };
    let storage_init_quote = quote { let storage = Storage::init(&mut context); };
    let init_check = if module_has_initializer & !f.has_named_attribute(quote { no_init_check }) {
        create_init_check(f)
    } else {
        quote {}
    }

    let return_value_type = f.return_type();

    let return_value_quote = if !return_value_type.eq(type_of(())) {
        let (body_without_return, return_value) = body.pop_back();
        let return_value_quote = return_value.quoted();
        let return_hasher_name_quote = quote { return_hasher };
        let return_value_into_hasher_quote = add_to_hasher(
            return_hasher_name_quote,
            return_value_quote,
            return_value_type
        );

        body = body_without_return;

        quote {
            let $return_hasher_name_quote = dep::aztec::hash::ArgsHasher::new();
            $return_value_into_hasher_quote
            context.set_return_hash($return_hasher_name_quote);
        }
    } else {
        quote {}
    };

    let context_finish_quote = quote { context.finish() };

    let to_prepend = quote {
        $args_hasher_quote
        $context_creation_quote
        $storage_init_quote
        $init_check
    };

    let to_append = quote {
        $return_value_quote
        $context_finish_quote
    };

    modify_fn_body(f, to_prepend, to_append);
    f.add_attribute("recursive");
    f.set_return_public(true);
    f.set_return_type(
        quote { dep::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }.as_type()
    );
    fn_abi
}

pub fn transform_unconstrained(f: FunctionDefinition) {
    let context_creation_quote = quote { let mut context = dep::aztec::context::unconstrained_context::UnconstrainedContext::new(); };
    let storage_init_quote = quote { let storage = Storage::init(context); };
    let to_prepend = quote {
        $context_creation_quote
        $storage_init_quote
    };

    modify_fn_body(f, to_prepend, quote {});
}

pub comptime fn stub_fn(f: FunctionDefinition) -> Quoted {
    let fn_name = f.name();
    let fn_parameters = f.parameters();
    let fn_return_type = f.return_type();
    let fn_visibility = get_fn_visibility(f);
    let is_static_call = is_fn_view(f);
    let is_void: bool = fn_return_type.eq(type_of(()));
    let fn_visibility_capitalized = if fn_visibility.eq(quote { private }) {
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
    let args_acc_name_quote = quote { args_acc };
    let args_acc_quote = fn_parameters.fold(
        quote {
                let mut $args_acc_name_quote = &[];
            },
        |args_hasher_quote, param: (Quoted, Type)| {
            let (name, typ) = param;
            let appended_arg_quote = add_to_field_slice(args_acc_name_quote, name, typ);
            quote {
                $args_hasher_quote
                $appended_arg_quote
            }
        }
    );

    let args_hash_name_quote = if fn_visibility == quote { private } {
        quote { args_hash }
    } else {
        quote {}
    };

    let args_quote = if fn_visibility == quote { private } {
        quote {
            $args_acc_quote
            let $args_hash_name_quote = dep::aztec::hash::hash_args($args_acc_name_quote);
        }
    } else {
        args_acc_quote
    };

    let fn_parameters_quote = fn_parameters.map(
        | (name, typ): (Quoted, Type) | {
            quote { $name: $typ }
        }
    ).join(quote{,});

    let fn_name_str_quote = fn_name.as_str_quote();

    let fn_name_len: u32 = unquote!(quote { $fn_name_str_quote.as_bytes().len()});

    let arg_types_list = fn_parameters.map(|(_, typ): (_, Type)| quote { $typ }).join(quote {,});
    let arg_types = if fn_parameters.len() == 1 {
        f"({arg_types_list},)".quoted_contents()
    } else {
        f"({arg_types_list})".quoted_contents()
    };

    let generics = if is_void {
        f"{arg_types}>".quoted_contents()
    } else {
        f"{arg_types}, {fn_return_type}>".quoted_contents()
    };

    let call_interface_name_quote = f"dep::aztec::context::call_interfaces::{fn_visibility_capitalized}{is_static_call_capitalized}{is_void_capitalized}CallInterface".quoted_contents();
    let call_interface_name_w_generics_quote = f"{call_interface_name_quote}<{fn_name_len}, {generics}".quoted_contents();

    let fn_selector: Field = compute_fn_selector(f);

    let gas_opts = if fn_visibility.eq(quote { public }) {
        quote { gas_opts: dep::aztec::context::gas::GasOpts::default() }
    } else {
        quote {}
    };

    let input_type = f"crate::context::inputs::{fn_visibility_capitalized}ContextInputs".quoted_contents().as_type();

    let return_type_hint = if fn_visibility.eq(quote { private }) {
        quote { protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }.as_type()
    } else {
        fn_return_type
    };

    let parameter_names_quote = if fn_parameters.len() > 0 {
        let params = fn_parameters.map(|(name, _): (Quoted, _)| name).join(quote {,});
        f",{params}".quoted_contents()
    } else {
        quote {}
    };

    let original = quote {
        | inputs: $input_type  | -> $return_type_hint {
            $fn_name(inputs $parameter_names_quote)
        }
    };

    quote {
        pub fn $fn_name(self, $fn_parameters_quote) -> $call_interface_name_w_generics_quote {
            $args_quote
            let selector = dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_field($fn_selector);
            $call_interface_name_quote {
                target_contract: self.target_contract,
                selector,
                name: $fn_name_str_quote,
                $args_hash_name_quote,
                args: $args_acc_name_quote,
                original: $original,
                is_static: $is_static_call,
                $gas_opts
            }
        }
    }
}
