use super::utils::compute_fn_selector;
use std::panic;

/// Returns an `fn public_dispatch(...)` function for the given module that's assumed to be an Aztec contract.
pub comptime fn generate_public_dispatch(m: Module) -> Quoted {
    let functions = m.functions();
    let functions =
        functions.filter(|function: FunctionDefinition| function.has_named_attribute("public"));

    let unit = get_type::<()>();

    let ifs = functions.map(|function: FunctionDefinition| {
        let name = function.name();
        let parameters = function.parameters();
        let return_type = function.return_type();

        let selector: Field = compute_fn_selector(function);

        let mut parameters_size = 0;
        for param in parameters {
            parameters_size += size_in_fields(param.1);
        }

        let initial_read = if parameters.len() == 0 {
            quote {}
        } else {
            // The initial calldata_copy offset is 1 to skip the Field selector
            // The expected calldata is the serialization of
            // - FunctionSelector: the selector of the function intended to dispatch
            // - Parameters: the parameters of the function intended to dispatch
            // That is, exactly what is expected for a call to the target function,
            // but with a selector added at the beginning.
            quote {
                let input_calldata: [Field; $parameters_size] = dep::aztec::context::public_context::calldata_copy(1, $parameters_size);
                let mut reader = dep::aztec::protocol_types::utils::reader::Reader::new(input_calldata);
            }
        };

        let mut parameter_index = 0;
        let reads = parameters.map(|param: (Quoted, Type)| {
            let param_name = f"arg{parameter_index}".quoted_contents();
            let param_type = param.1;
            let read = quote {
                let $param_name: $param_type = reader.read_struct(dep::aztec::protocol_types::traits::Deserialize::deserialize);
            };
            parameter_index += 1;
            quote { $read }
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
            quote {
                $call;
                // Force early return.
                dep::aztec::context::public_context::avm_return([]);
            }
        } else {
            quote {
                let return_value = dep::aztec::protocol_types::traits::Serialize::serialize($call);
                dep::aztec::context::public_context::avm_return(return_value.as_slice());
            }
        };

        let if_ = quote {
            if selector == $selector {
                $initial_read
                $read
                $return_code
            }
        };
        if_
    });

    if ifs.len() == 0 {
        // No dispatch function if there are no public functions
        quote {}
    } else {
        let ifs = ifs.push_back(quote { panic(f"Unknown selector") });
        let dispatch = ifs.join(quote {  });

        let body = quote {
            // We mark this as public because our whole system depends on public
            // functions having this attribute. However, the public MACRO will
            // handle the public_dispatch function specially and do nothing.
            #[public]
            pub unconstrained fn public_dispatch(selector: Field) {
                $dispatch
            }
        };

        body
    }
}

comptime fn size_in_fields(typ: Type) -> u32 {
    let size = array_size_in_fields(typ);
    let size = size.or_else(|| bool_size_in_fields(typ));
    let size = size.or_else(|| constant_size_in_fields(typ));
    let size = size.or_else(|| field_size_in_fields(typ));
    let size = size.or_else(|| int_size_in_fields(typ));
    let size = size.or_else(|| str_size_in_fields(typ));
    let size = size.or_else(|| struct_size_in_fields(typ));
    let size = size.or_else(|| tuple_size_in_fields(typ));
    if size.is_some() {
        size.unwrap()
    } else {
        panic(f"Can't determine size in fields of {typ}")
    }
}

comptime fn array_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_array().and_then(|typ: (Type, Type)| {
        let (typ, element_size) = typ;
        element_size.as_constant().map(|x: u32| x * size_in_fields(typ))
    })
}

comptime fn bool_size_in_fields(typ: Type) -> Option<u32> {
    if typ.is_bool() {
        Option::some(1)
    } else {
        Option::none()
    }
}

comptime fn field_size_in_fields(typ: Type) -> Option<u32> {
    if typ.is_field() {
        Option::some(1)
    } else {
        Option::none()
    }
}

comptime fn int_size_in_fields(typ: Type) -> Option<u32> {
    if typ.as_integer().is_some() {
        Option::some(1)
    } else {
        Option::none()
    }
}

comptime fn constant_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_constant()
}

comptime fn str_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_str().map(|typ| size_in_fields(typ))
}

comptime fn struct_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_struct().map(|typ: (StructDefinition, [Type])| {
        let struct_type = typ.0;
        let mut size = 0;
        for field in struct_type.fields() {
            size += size_in_fields(field.1);
        }
        size
    })
}

comptime fn tuple_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_tuple().map(|types: [Type]| {
        let mut size = 0;
        for typ in types {
            size += size_in_fields(typ);
        }
        size
    })
}

comptime fn get_type<T>() -> Type {
    let t: T = std::mem::zeroed();
    std::meta::type_of(t)
}

