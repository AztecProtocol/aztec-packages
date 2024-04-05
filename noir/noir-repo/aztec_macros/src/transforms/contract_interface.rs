use noirc_frontend::{
    parse_program, parser::SortedModule, NoirFunction, Signedness, UnresolvedType,
    UnresolvedTypeData, UnresolvedTypeExpression,
};

use crate::utils::errors::AztecMacroError;

fn get_parameter_type(typ: UnresolvedType) -> String {
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
            format!("[{}; {}]", get_parameter_type(*typ), len)
        }
        UnresolvedTypeData::String(len_typ) => {
            let len = if let Some(UnresolvedTypeExpression::Constant(value, _)) = len_typ {
                value.to_string()
            } else {
                panic!("Only constant string lengths are supported");
            };
            format!("str<{}>", len)
        }
        UnresolvedTypeData::Named(_, fields, _) => format!(
            "({})",
            fields
                .iter()
                .map(|field| get_parameter_type(field.clone()))
                .collect::<Vec<_>>()
                .join(", ")
        ),
        _ => panic!("Unsupported type"),
    }
}

fn compute_fn_signature(func: &NoirFunction) -> String {
    format!(
        "{}({})",
        func.name(),
        func.parameters()
            .iter()
            .map(|param| get_parameter_type(param.typ.clone()))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

pub fn stub_function(aztec_visibility: &str, func: &NoirFunction) -> (String, String, String) {
    let (fn_name, fn_type) = (
        func.name().to_string(),
        format!(
            "fn[(dep::aztec::context::Context, dep::aztec::protocol_types::address::AztecAddress)]({}) -> {}",
            func.parameters()
                .iter()
                .map(|param| param.typ.to_string().replace("plain::", ""))
                .collect::<Vec<_>>()
                .join(", "),
            "[Field; 4]" // func.return_type()
        ),
    );
    let fn_selector = format!("dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature(\"{}\")", compute_fn_signature(func));
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
    let call_args = func
        .parameters()
        .iter()
        .map(|arg| {
            format!(
                "hasher.add_multiple({}.serialize());\n",
                arg.pattern.name_ident().0.contents.clone()
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let context_call = if aztec_visibility == "Private" {
        format!(
            "let hasher = dep::aztec::hash::ArgsHasher::new();
            {1}
            assert(args_hash == arguments::pack_arguments(args));
            let args_hash = hasher.hash();
            context.private.unwrap().call_private_function(target_contract, {}, args_hash, false, false)",
            fn_selector, call_args
        )
    } else {
        format!(
            "let hasher = dep::aztec::hash::ArgsHasher::new();
            {1}
            let args_hash = hasher.hash();
            assert(args_hash == arguments::pack_arguments(args));
            if context.private.is_some() {{
                context.private.unwrap().call_private_function_with_packed_args(target_contract, {0}, args_hash, false, false)
            }} else {{
                context.public.unwrap().call_public_function_with_packed_args(target_contract, {0}, args_hash, false, false)
            }}",
            fn_selector, call_args
        )
    };
    let fn_source = format!(
        "|{}| {{
            {}
        }}",
        fn_parameters, context_call
    );
    (fn_name, fn_type, fn_source)
}

pub fn generate_contract_interface(
    module: &mut SortedModule,
    module_name: &str,
    stubs: &[(String, String, String)],
) -> Result<(), AztecMacroError> {
    let contract_interface = format!(
        "
        struct {0}Interface {{
            {1}
        }}

        #[contract_library_method]
        fn at(
            context: dep::aztec::context::Context,
            target_contract: dep::aztec::protocol_types::address::AztecAddress
        ) -> {0}Interface {{
            {0}Interface {{ 
                {2} 
            }}
        }}
    ",
        module_name,
        stubs
            .iter()
            .map(|(fn_name, fn_type, _)| format!("{}: {}", fn_name, fn_type))
            .collect::<Vec<_>>()
            .join(",\n"),
        stubs
            .iter()
            .map(|(fn_name, _, fn_source)| format!("{}: {}", fn_name, fn_source))
            .collect::<Vec<_>>()
            .join(",\n")
    );

    let (contract_interface_ast, errors) = parse_program(&contract_interface);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::AztecDepNotFound);
    }

    let mut contract_interface_ast = contract_interface_ast.into_sorted();
    module.types.push(contract_interface_ast.types.pop().unwrap());
    module.functions.push(contract_interface_ast.functions.pop().unwrap());

    Ok(())
}
