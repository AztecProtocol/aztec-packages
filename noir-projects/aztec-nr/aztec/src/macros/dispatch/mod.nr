use protocol_types::abis::function_selector::FunctionSelector;
use crate::context::inputs::public_context_inputs::PublicContextInputs;
use super::utils::compute_fn_selector;

/// Returns an `fn public_dispatch(...)` function for the given module that's assumed to be an Aztec contract.
pub comptime fn generate_public_dispatch(m: Module) -> Quoted {
    let functions = m.functions();
    let functions = functions.filter(|function: FunctionDefinition| function.has_named_attribute("public"));

    let public_context_inputs = get_type::<PublicContextInputs>();
    let unit = get_type::<()>();
    let initial_offset = size_in_fields(public_context_inputs) + 1; // +1 for the Field selector

    let ifs = functions.map(
        |function: FunctionDefinition| {
        let name = function.name();
        let parameters = function.parameters();
        let return_type = function.return_type();

        let selector: Field = compute_fn_selector(function);

        let mut parameter_index = 0;
        let mut offset = initial_offset;

        let reads = parameters.map(|param: (Quoted, Type)| {
            // Skip the `PublicContextInputs` argument as we already have that
            let read = if parameter_index == 0 {
                quote {}
            } else {
                let param_type = param.1;
                let param_size = size_in_fields(param_type);
                let param_name = f"arg{parameter_index}".quoted_contents();
                let read = quote { let $param_name = dep::aztec::protocol_types::traits::Deserialize::deserialize(dep::aztec::context::public_context::calldata_copy($offset, $param_size)); };
                offset += param_size;
                quote { $read }
            };
            parameter_index += 1;
            read
        });
        let read = reads.join(quote { });

        let mut args = &[];
        for parameter_index in 0..parameters.len() {
            let param_name = f"arg{parameter_index}".quoted_contents();
            args = args.push_back(quote { $param_name });
        }

        let args = args.join(quote { , });
        let call = quote { $name($args) };

        let return_code = if return_type == unit {
            quote { $call }
        } else {
            quote { 
                let return_value = dep::aztec::protocol_types::traits::Serialize::serialize($call);
                dep::aztec::context::public_context::avm_return(return_value);
            }
        };

        let if_ = quote { 
            if selector == $selector {
                $read
                $return_code
            }
        };
        if_
    }
    );

    let ifs = ifs.push_back(quote { { panic(f"Unknown selector") } });
    let dispatch = ifs.join(quote { else });

    let body = quote {
        pub fn public_dispatch(arg0: $public_context_inputs, selector: Field) {
            $dispatch
        }
    };

    println(body);

    body
}

comptime fn size_in_fields(typ: Type) -> u32 {
    if typ.as_slice().is_some() {
        panic(f"Can't determine size in fields of Slice type")
    } else {
        let size = array_size_in_fields(typ);
        let size = size.or_else(|| struct_size_in_fields(typ));
        let size = size.or_else(|| tuple_size_in_fields(typ));
        size.unwrap_or(1)
    }
}

comptime fn array_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_array().and_then(
        |typ: (Type, Type)| {
        let (typ, element_size) = typ;
        element_size.as_constant().map(|x: u32| {
            x * size_in_fields(typ)
        })
    }
    )
}

comptime fn struct_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_struct().map(
        |typ: (StructDefinition, [Type])| {
        let struct_type = typ.0;
        let mut size = 0;
        for field in struct_type.fields() {
            size += size_in_fields(field.1);
        }
        size
    }
    )
}

comptime fn tuple_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_tuple().map(
        |types: [Type]| {
        let mut size = 0;
        for typ in types {
            size += size_in_fields(typ);
        }
        size
    }
    )
}

comptime fn get_type<T>() -> Type {
    let t: T = std::mem::zeroed();
    std::meta::type_of(t)
}
