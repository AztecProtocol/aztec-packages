/// Generates serialization code for a list of parameters and the total length of the serialized array
///
/// # Parameters
/// - `params`: A list of (name, type) tuples to serialize
/// - `use_self_prefix`: If true, parameters are accessed as `self.$param_name` (for struct members).
///                      If false, parameters are accessed directly as `$param_name` (for function parameters).
///
/// # Returns
/// A tuple containing:
/// - Quoted code that serializes the parameters into an array named `serialized_params`
/// - Quoted code that evaluates to the total length of the serialized array
/// - Quoted code containing the name of the serialized array
pub comptime fn derive_serialization_quotes(
    params: [(Quoted, Type)],
    use_self_prefix: bool,
) -> (Quoted, Quoted, Quoted) {
    let prefix_quote = if use_self_prefix {
        quote { self. }
    } else {
        quote {}
    };

    let params_len_quote = get_params_len_quote(params);
    let serialized_params_name = quote { serialized_params };

    let body = if params.len() == 0 {
        quote {
            let $serialized_params_name: [Field; 0] = [];
        }
    } else if params.len() == 1 {
        // When we have only a single parameter on the input, we can enhance performance by directly returning
        // the serialized member, bypassing the need for loop-based array construction. While this optimization yields
        // significant benefits in Brillig where the loops are expected to not be optimized, it is not relevant in ACIR
        // where the loops are expected to be optimized away.

        let param_name = params[0].0;
        quote {
            let $serialized_params_name = $crate::traits::Serialize::serialize($prefix_quote$param_name);
        }
    } else {
        // For multiple struct members, generate serialization code that:
        // 1. Serializes each member
        // 2. Copies the serialized fields into the serialize array at the correct offset
        // 3. Updates the offset for the next member
        let serialization_of_struct_members = params
            .map(|(param_name, param_type): (Quoted, Type)| {
                quote {
                let serialized_member = $crate::traits::Serialize::serialize($prefix_quote$param_name);
                let serialized_member_len = <$param_type as $crate::traits::Serialize>::N;
                for i in 0..serialized_member_len {
                    $serialized_params_name[i + offset] = serialized_member[i];
                }
                offset += serialized_member_len;
            }
            })
            .join(quote {});

        quote {
            let mut $serialized_params_name = [0; $params_len_quote];
            let mut offset = 0;

            $serialization_of_struct_members
        }
    };

    (body, params_len_quote, serialized_params_name)
}

/// Generates a quoted expression that computes the total serialized length of function parameters.
///
/// # Parameters
/// * `params` - An array of tuples where each tuple contains a quoted parameter name and its Type. The type needs
///              to implement the Serialize trait.
///
/// # Returns
/// A quoted expression that evaluates to:
/// * `0` if there are no parameters
/// * `(<type1 as Serialize>::N + <type2 as Serialize>::N + ...)` for one or more parameters
pub comptime fn get_params_len_quote(params: [(Quoted, Type)]) -> Quoted {
    if params.len() == 0 {
        quote { 0 }
    } else {
        let params_quote_without_parentheses = params
            .map(|(_, param_type): (Quoted, Type)| {
                quote {
                    <$param_type as $crate::traits::Serialize>::N
                }
            })
            .join(quote {+});
        quote { ($params_quote_without_parentheses) }
    }
}
