use std::meta::type_of;

use crate::macros::utils::{modify_fn_body, serialize_to_hasher, is_fn_private};
use super::utils::get_fn_visibility;

pub comptime fn internal(func: FunctionDefinition) {
    let name = func.name();
    let internal_check = quote { assert(context.msg_sender() == context.this_address(), f"Function {name} can only be called internally"); };
    modify_fn_body(func, internal_check, quote {});
}

pub comptime fn view(func: FunctionDefinition) {
    let name = func.name();
    let static_check = if is_fn_private(func) {
        quote { assert(context.inputs.call_context.is_static_call == true, f"Function {name} can only be called statically"); }
    } else {
        quote { assert(context.inputs.is_static_call == true, f"Function {name} can only be called statically"); }
    };
    modify_fn_body(func, static_check, quote {});
}

pub comptime fn initializer(func: FunctionDefinition) {
    let fn_visibility = get_fn_visibility(func);
    let to_prepend = f"dep::aztec::initializer::assert_initialization_matches_address_preimage_{fn_visibility}(context);".quoted_contents();
    modify_fn_body(func, to_prepend, quote {});
}

fn create_init_check(func: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(func);
    f"dep::aztec::initializer::assert_is_initialized_{fn_visibility}(&mut context);".quoted_contents()
}

fn create_fn_abi_export(func: FunctionDefinition) -> Quoted {
    let name = func.name();
    // Remove first arg (inputs)
    let mut parameters = func.parameters().pop_front().1.map(
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

    let return_value_type = func.return_type();
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

pub comptime fn private(func: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(func);
    let current_params = func.parameters();
    func.set_parameters(
        &[
        (
            quote { inputs }, quote { crate::context::inputs::private_context_inputs::PrivateContextInputs }.as_type()
        )
    ].append(current_params)
    );
    let mut body = func.body().as_block().unwrap();
    let args_hasher_name_quote = quote { args_hasher };
    let args_hasher_quote = current_params.fold(
        quote {
        let mut $args_hasher_name_quote = dep::aztec::hash::ArgsHasher::new();
        },
        |args_hasher_quote, param: (Quoted, Type)| {
        let (name, typ) = param;
        let appended_arg_quote = serialize_to_hasher(args_hasher_name_quote, name, typ);
        quote {
            $args_hasher_quote
            $appended_arg_quote
        }
    }
    );
    let context_creation_quote = quote { let mut context = dep::aztec::context::private_context::PrivateContext::new(inputs, args_hasher.hash()); };
    let storage_init_quote = quote { let storage = Storage::init(&mut context); };
    let init_check = create_init_check(func);

    let return_value_type = func.return_type();

    let return_value_quote = if !return_value_type.eq(type_of(())) {
        let (body_without_return, return_value) = body.pop_back();
        let return_value_quote = return_value.quoted();
        let return_hasher_name_quote = quote { return_hasher };
        let return_value_into_hasher_quote = serialize_to_hasher(
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

    modify_fn_body(func, to_prepend, to_append);
    func.set_return_type(
        quote { dep::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }.as_type()
    );
    fn_abi
}
