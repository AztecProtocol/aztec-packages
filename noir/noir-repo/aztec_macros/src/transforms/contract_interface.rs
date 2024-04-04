use noirc_frontend::{parse_program, parser::SortedModule, NoirFunction};

use crate::utils::errors::AztecMacroError;

fn compute_fn_signature(func: &NoirFunction) -> String {}

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
        .map(|param| param.pattern.name_ident().0.contents.clone())
        .collect::<Vec<_>>()
        .join(", ");
    let context_call = if aztec_visibility == "Private" {
        format!(
            "context.private.unwrap().call_private_function(target_contract, {}, [{}])",
            fn_signature, call_args
        )
    } else {
        format!(
            "
            if context.private.is_some() {{
                context.private.unwrap().call_private_function(target_contract, {0}, [{1}])
            }} else {{
                context.public.unwrap().call_public_function(target_contract, {0}, [{1}])
            }}
        ",
            fn_signature, call_args
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

    println!("{}", contract_interface);

    let (contract_interface_ast, errors) = parse_program(&contract_interface);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::AztecDepNotFound);
    }

    let mut contract_interface_ast = contract_interface_ast.into_sorted();
    module.types.push(contract_interface_ast.types.pop().unwrap());
    module.impls.push(contract_interface_ast.impls.pop().unwrap());

    Ok(())
}
