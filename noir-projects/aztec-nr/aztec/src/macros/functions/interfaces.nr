use std::{
    meta::{unquote, type_of}, collections::umap::UHashMap,
    hash::{BuildHasherDefault, poseidon2::Poseidon2Hasher}
};
use crate::macros::utils::{get_fn_visibility, is_fn_view, is_fn_private, add_to_field_slice, compute_fn_selector, is_fn_public};

comptime mut global STUBS: UHashMap<Module, [Quoted], BuildHasherDefault<Poseidon2Hasher>> = UHashMap::default();

pub(crate) comptime fn create_fn_abi_export(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    // Remove first arg (inputs)
    let mut parameters = f.parameters().map(
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

pub comptime fn stub_fn(f: FunctionDefinition) -> Quoted {
    let fn_name = f.name();
    let fn_parameters = f.parameters();
    // Fixes [ typ ; ( len : numeric Field ) ] error
    let fn_return_type = f.return_type();
    // let fn_return_type_quoted = if fn_return_type.as_array().is_some() {
    //     let (element_type, array_len) = fn_return_type.as_array().unwrap();
    //     let array_len = array_len.as_constant().unwrap();
    //     quote { [$element_type; $array_len] }
    // } else {
    //     quote { $fn_return_type }
    // };
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

    let arg_types_list: Quoted = fn_parameters.map(|(_, typ): (_, Type)| quote { $typ }).join(quote {,});
    let arg_types = if fn_parameters.len() == 1 {
        // Extra colon to avoid it being interpreted as a parenthesized expression instead of a tuple
        quote { ($arg_types_list,) }
    } else {
        quote { ($arg_types_list) }
    };

    let call_interface_generics = if is_void {
        quote { $fn_name_len, $arg_types }
    } else {
        quote { $fn_name_len, $fn_return_type, $arg_types }
    };

    let call_interface_name = f"dep::aztec::context::call_interfaces::{fn_visibility_capitalized}{is_static_call_capitalized}{is_void_capitalized}CallInterface".quoted_contents();

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
        quote  { inputs, $params }
    } else {
        quote {inputs}
    };

    let original = quote {
        | inputs: $input_type  | -> $return_type_hint {
            $fn_name($parameter_names)
        }
    };

    let args_hash = if fn_visibility == quote { private } {
        quote { $args_hash_name, }
    } else {
        quote {}
    };

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> $call_interface_name<$call_interface_generics> {
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

pub(crate) comptime fn register_stub(m: Module, stub: Quoted) {
    let current_stubs = STUBS.get(m);
    let stubs_to_insert = if current_stubs.is_some() {
        current_stubs.unwrap().push_back(stub)
    } else {
        &[stub]
    };
    STUBS.insert(m, stubs_to_insert);
}
