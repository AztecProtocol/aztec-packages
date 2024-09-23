use protocol_types::abis::function_selector::FunctionSelector;
use std::meta::unquote;

pub comptime fn aztec(m: Module) -> Quoted {
    let functions = m.functions();
    let functions = functions.filter(|function: FunctionDefinition| function.has_named_attribute("public"));

    let ifs = functions.map(
        |function: FunctionDefinition| {
        let name = function.name();
        let parameters = function.parameters();
        let return_type = function.return_type();

        let signature = function_signature(name, parameters).as_quoted_str!();
        let selector: FunctionSelector = unquote!(quote { FunctionSelector::from_signature($signature) });

        let mut parameters_size = 0;
        for param in parameters {
            parameters_size += size_in_fields(param.1);
        }

        let reads = parameters.map(|param: (Quoted, Type)| {
            let (param_name, param_type) = param;
            let param_size = size_in_fields(param_type);
            quote { 
                let $param_name = $param_type::deserialize(dep::aztec::context::public_context::calldata_copy(avm_input_calldata_offset, $param_size));
                avm_input_calldata_offset += $param_size;
            }
        });
        let read = reads.join(quote { });

        let args = parameters.map(|param: (Quoted, Type)| param.0);
        let args = args.join(quote { , });
        let call = quote { $name($args) };

        let if_ = quote { 
            if selector == $selector {
                let mut avm_input_calldata_offset = 0;
                $read
                let avm_return_value = $call.serialize();
                let avm_return_array = avm_return_value.serialize();
                dep::aztec::context::public_context::avm_return(avm_return_array);
            }
        };
        if_
    }
    );

    let ifs = ifs.push_back(quote { { panic(f"Unknown selector") } });
    let dispatch = ifs.join(quote { else });

    let from_field_fn = FunctionSelector::from_field;

    let body = quote {
        pub fn public_entrypoint(selector: Field) {
            let cdoffset = 0;
            let selector = $from_field_fn(selector);
            $dispatch
        }
    };

    println(body);

    body
}

comptime fn function_signature(name: Quoted, parameters: [(Quoted, Type)]) -> CtString {
    let types = parameters.map(
        |param: (Quoted, Type)| {
            let typ = param.1;
            f"{typ}".as_ctstring()
        }
    );
    let types = types.join(", ".as_ctstring());

    f"{name}({types})".as_ctstring()
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
