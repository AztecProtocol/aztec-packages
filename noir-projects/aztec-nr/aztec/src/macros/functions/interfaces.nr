use std::{meta::type_of, collections::umap::UHashMap, hash::{BuildHasherDefault, poseidon2::Poseidon2Hasher}};

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

pub(crate) comptime fn register_stub(m: Module, stub: Quoted) {
    let current_stubs = STUBS.get(m);
    let stubs_to_insert = if current_stubs.is_some() {
        current_stubs.unwrap().push_back(stub)
    } else {
        &[stub]
    };
    STUBS.insert(m, stubs_to_insert);
}
