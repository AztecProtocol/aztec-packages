use noirc_frontend::{parse_program, parser::SortedModule, NoirFunction};

use crate::utils::errors::AztecMacroError;

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
            func.return_type()
        ),
    );
    let fn_source = format!(
        "|{}| {{
            context.call_{}_function(target_contract, [{}])
        }}",
        func.parameters()
            .iter()
            .map(|param| format!(
                "{}: {}",
                param.pattern.name_ident().0.contents,
                param.typ.to_string().replace("plain::", "")
            ))
            .collect::<Vec<_>>()
            .join(", "),
        if aztec_visibility == "Private" { "private" } else { "public" },
        func.parameters()
            .iter()
            .map(|param| param.pattern.name_ident().0.contents.clone())
            .collect::<Vec<_>>()
            .join(", "),
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
            target_contract: dep::aztec::protocol_types::address::AztecAddress,
            {1}
        }}

        impl {0}Interface {{
            fn new<T>(
                context: T,
                target_contract: dep::aztec::protocol_types::address::AztecAddress
            ) -> Self where T: dep::aztec::context::Context {{
                Self {{ 
                    target_contract, 
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
