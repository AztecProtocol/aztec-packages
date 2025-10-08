use std::meta::type_of;

/// Creates ABI structs for a function to expose its interface.
///
/// # Important
/// This function needs to be run before transformations modifying the signature of the target function `f` are applied
/// (e.g. transform_private).
///
/// # Overview
/// This function takes a FunctionDefinition and generates two structs:
/// 1. A parameters struct containing all the function parameters
/// 2. An ABI struct containing the parameters struct and return type (if any)
///
/// ## Example
/// Given a function:
/// ```noir
/// fn increment(owner: AztecAddress) -> Field { ... }
/// ```
///
/// It generates:
/// ```noir
/// pub struct increment_parameters {
///     pub owner: AztecAddress
/// }
///
/// #[abi(functions)]
/// pub struct increment_abi {
///     parameters: increment_parameters,
///     return_type: Field
/// }
/// ```
///
/// ## The #[abi(functions)] Attribute
/// The `#[abi(functions)]` attribute marks this struct for inclusion in the contract ABI's `outputs.functions` array.
/// This array preserves the original function signatures, including parameters and return types, before any macro
/// transformations are applied. This preservation is crucial because macro processing alters the actual return type
/// of contract functions to `PrivateCircuitPublicInputs`, which differs from the developer's originally specified
/// return type. Our toolchain requires access to these original signatures.
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

    quote {
        $parameters

        #[abi(functions)]
        pub struct $abi_struct_name {
            parameters: $parameters_struct_name,
            $return_type
        }
    }
}
