use std::meta::type_of;

pub(crate) comptime fn create_fn_abi_export(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let mut parameters =
        f.parameters().map(|(name, typ): (Quoted, Type)| quote { pub $name: $typ }).join(quote {,});

    let parameters_struct_name = f"{name}_parameters".quoted_contents();
    let parameters = quote {
        pub struct $parameters_struct_name {
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
        pub struct $abi_struct_name {
            parameters: $parameters_struct_name,
            $return_type
        }
    };
    result
}
