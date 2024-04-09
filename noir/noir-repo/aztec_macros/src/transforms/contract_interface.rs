use noirc_frontend::{
    parse_program, parser::SortedModule, NoirFunction, NoirStruct, Signedness, UnresolvedType,
    UnresolvedTypeData, UnresolvedTypeExpression,
};

use crate::utils::errors::AztecMacroError;

fn get_parameter_type(module_types: &Vec<NoirStruct>, typ: UnresolvedType) -> String {
    match typ.typ {
        UnresolvedTypeData::FieldElement => "Field".to_string(),
        UnresolvedTypeData::Integer(signed, width) => {
            if signed == Signedness::Signed {
                panic!("Signed integers are not supported")
            } else {
                format!("u{}", width)
            }
        }
        UnresolvedTypeData::Bool => "bool".to_string(),
        UnresolvedTypeData::Array(len_typ, typ) => {
            let len = match len_typ {
                UnresolvedTypeExpression::Constant(value, _) => value.to_string(),
                _ => panic!("Only constant array lengths are supported"),
            };
            format!("[{}; {}]", get_parameter_type(module_types, *typ), len)
        }
        UnresolvedTypeData::String(len_typ) => {
            let len = if let Some(UnresolvedTypeExpression::Constant(value, _)) = len_typ {
                value.to_string()
            } else {
                panic!("Only constant string lengths are supported");
            };
            format!("str<{}>", len)
        }
        UnresolvedTypeData::Named(path, _, _) => {
            let fields = module_types
                .iter()
                .find_map(|r#struct| {
                    if r#struct.name.0.contents == path.last_segment().0.contents {
                        Some(r#struct.fields.clone())
                    } else {
                        None
                    }
                })
                .unwrap();

            let fields = fields
                .iter()
                .map(|(_, typ)| get_parameter_type(module_types, typ.clone()))
                .collect::<Vec<_>>()
                .join(", ");

            println!("fields are {:?}", fields);

            format!("({})", fields)
        }
        _ => panic!("Unsupported type"),
    }
}

fn compute_fn_signature(module_types: &Vec<NoirStruct>, func: &NoirFunction) -> String {
    format!(
        "{}({})",
        func.name(),
        func.parameters()
            .iter()
            .map(|param| get_parameter_type(module_types, param.typ.clone()))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

pub fn stub_function(
    module_types: &Vec<NoirStruct>,
    aztec_visibility: &str,
    func: &NoirFunction,
) -> String {
    let fn_name = func.name().to_string();
    let fn_parameters = func
        .parameters()
        .iter()
        .map(|param| {
            format!(
                "{}: {}",
                param.pattern.name_ident().0.contents,
                param.typ.to_string().replace("plain::", "")
            )
        })
        .collect::<Vec<_>>()
        .join(", ");

    let return_type = "[Field; 4]"; // func.return_type()

    let fn_selector = format!("dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature(\"{}\")", compute_fn_signature(    module_types,        func));

    let call_args = func
        .parameters()
        .iter()
        .map(|arg| {
            let param_name = arg.pattern.name_ident().0.contents.clone();
            match arg.typ.typ {
                UnresolvedTypeData::Array(_, _) => {
                    format!(
                        "let hash_{0} = an_array.map(|x: Field| x.serialize());
                        for i in 0..{0}.len() {{
                            args = args.append(hash_{0}[i].as_slice());
                        }}\n",
                        param_name
                    )
                }
                _ => format!("args = args.append({}.serialize().as_slice());\n", param_name),
            }
        })
        .collect::<Vec<_>>()
        .join("");
    if aztec_visibility == "Private" {
        let fn_source = format!(
            "let mut args: [Field] = [0; 0].as_slice();
            {1}
            let args_hash = dep::aztec::hash::hash_args(args);
            assert(args_hash == dep::aztec::oracle::arguments::pack_arguments(args));
            context.call_private_function_with_packed_args(self.target_contract, {0}, args_hash, false, false)",
            fn_selector, call_args
        );
        format!(
            "pub fn {}(self, context: &mut dep::aztec::context::PrivateContext, {}) -> {} {{
                {}
            }}",
            fn_name, fn_parameters, return_type, fn_source
        )
    } else {
        let fn_source = format!(
            "let mut args: [Field] = [0; 0].as_slice();
            {1}
            let args_hash = dep::aztec::hash::hash_args(args);
            assert(args_hash == dep::aztec::oracle::arguments::pack_arguments(args));
            if context.private.is_some() {{
                context.private.unwrap().call_private_function_with_packed_args(self.target_contract, {0}, args_hash, false, false)
            }} else {{
                context.public.unwrap().call_public_function_with_packed_args(self.target_contract, {0}, args_hash, false, false)
            }}",
            fn_selector, call_args
        );
        format!(
            "pub fn {}(self, context: &mut dep::aztec::context::Context, {}) -> {} {{
                {}
            }}",
            fn_name, fn_parameters, return_type, fn_source
        )
    }
}

pub fn generate_contract_interface(
    module: &mut SortedModule,
    module_name: &str,
    stubs: &[String],
) -> Result<(), AztecMacroError> {
    let contract_interface = format!(
        "
        struct {0}Interface {{
            target_contract: dep::aztec::protocol_types::address::AztecAddress
        }}

        impl {0}Interface {{
            {1}
        }}

        #[contract_library_method]
        pub fn at(
            target_contract: dep::aztec::protocol_types::address::AztecAddress
        ) -> pub {0}Interface {{
            {0}Interface {{ target_contract }}
        }}
    ",
        module_name,
        stubs.join("\n"),
    );

    let (contract_interface_ast, errors) = parse_program(&contract_interface);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::AztecDepNotFound);
    }

    let mut contract_interface_ast = contract_interface_ast.into_sorted();
    module.types.push(contract_interface_ast.types.pop().unwrap());
    module.impls.push(contract_interface_ast.impls.pop().unwrap());
    module.functions.push(contract_interface_ast.functions.pop().unwrap());

    Ok(())
}
