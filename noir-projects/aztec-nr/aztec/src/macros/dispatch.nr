use crate::macros::internals_functions_generation::external_functions_registry::get_public_functions;
use crate::protocol::meta::utils::get_params_len_quote;
use crate::utils::cmap::CHashMap;
use super::utils::compute_fn_selector;
use std::meta::{ctstring::AsCtString, unquote};

/// Returns an `fn public_dispatch(...)` function for the given module that's assumed to be an Aztec contract.
///
/// `injected_fn_names` is a list of function names for auto-generated dispatch cases. Each name is
/// used to compute a no-arg selector and check for collisions with contract functions. The generated
/// dispatch case calls the function (which must already exist in the module) and returns.
pub comptime fn generate_public_dispatch(m: Module, injected_fn_names: [Quoted]) -> Quoted {
    let contract_functions = get_public_functions(m);

    let seen_selectors = &mut CHashMap::<Field, Quoted>::new();

    let mut dispatch_cases: [Quoted] = contract_functions.map(|function: FunctionDefinition| {
        let fn_name = function.name();
        let call_name = f"__aztec_nr_internals__{fn_name}".quoted_contents();
        generate_dispatch_case(
            compute_fn_selector(function),
            fn_name,
            call_name,
            function.parameters(),
            function.return_type(),
            seen_selectors,
        )
    });

    let injected_cases: [Quoted] = injected_fn_names.map(|fn_name: Quoted| {
        generate_dispatch_case(
            compute_no_arg_selector(fn_name),
            fn_name,
            fn_name,
            @[],
            get_type::<()>(),
            seen_selectors,
        )
    });

    dispatch_cases = dispatch_cases.append(injected_cases);

    if dispatch_cases.len() == 0 {
        quote {}
    } else {
        dispatch_cases = dispatch_cases.push_back(quote { panic(f"Unknown selector {selector}") });
        let dispatch = dispatch_cases.join(quote {  });

        quote {
            // We mark this as public because our whole system depends on public functions having this attribute.
            #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
            pub unconstrained fn public_dispatch(selector: Field) {
                $dispatch
            }
        }
    }
}

comptime fn compute_no_arg_selector(fn_name: Quoted) -> Field {
    let signature = f"{fn_name}()".as_ctstring();
    let computation_quote = quote {
        crate::protocol::traits::ToField::to_field(crate::protocol::abis::function_selector::FunctionSelector::from_signature($signature))
    };
    unquote!(computation_quote)
}

/// Generates a single dispatch case: an `if` block that matches on the selector, deserializes
/// calldata into arguments, calls the target function, and returns the result.
comptime fn generate_dispatch_case(
    selector: Field,
    display_name: Quoted,
    call_name: Quoted,
    parameters: [(Quoted, Type)],
    return_type: Type,
    seen_selectors: &mut CHashMap<Field, Quoted>,
) -> Quoted {
    let unit = get_type::<()>();

    // Since function selectors are computed as the first 4 bytes of the hash of the function signature, it's
    // possible to have collisions. With the following check, we ensure it doesn't happen within the same contract.
    let existing_fn = seen_selectors.get(selector);
    if existing_fn.is_some() {
        let existing_fn = existing_fn.unwrap();
        panic(
            f"Public function selector collision detected between functions '{display_name}' and '{existing_fn}'",
        );
    }
    seen_selectors.insert(selector, display_name);

    let params_len_quote = get_params_len_quote(parameters);

    let initial_read = if parameters.len() == 0 {
        quote {}
    } else {
        // The initial calldata_copy offset is 1 to skip the Field selector. The expected calldata is the
        // serialization of
        // - FunctionSelector: the selector of the function intended to dispatch
        // - Parameters: the parameters of the function intended to dispatch
        // That is, exactly what is expected for a call to the target function, but with a selector added
        // at the beginning.
        quote {
            let input_calldata: [Field; $params_len_quote] = aztec::oracle::avm::calldata_copy(1, $params_len_quote);
            let mut reader = aztec::protocol::utils::reader::Reader::new(input_calldata);
        }
    };

    let parameter_index: &mut u32 = &mut 0;
    let reads = parameters.map(|param: (Quoted, Type)| {
        let parameter_index_value = *parameter_index;
        let param_name = f"arg{parameter_index_value}".quoted_contents();
        let param_type = param.1;
        let read = quote {
            let $param_name: $param_type = aztec::protocol::traits::Deserialize::stream_deserialize(&mut reader);
        };
        *parameter_index += 1;
        quote { $read }
    });
    let read = reads.join(quote { });

    let mut args = @[];
    for parameter_index in 0..parameters.len() {
        let param_name = f"arg{parameter_index}".quoted_contents();
        args = args.push_back(quote { $param_name });
    }

    let args = args.join(quote { , });
    let call = quote { $call_name($args) };

    let return_code = if return_type == unit {
        quote {
            $call;
            // Force early return.
            aztec::oracle::avm::avm_return([]);
        }
    } else {
        quote {
            let return_value = aztec::protocol::traits::Serialize::serialize($call);
            aztec::oracle::avm::avm_return(return_value.as_vector());
        }
    };

    quote {
        if selector == $selector {
            $initial_read
            $read
            $return_code
        }
    }
}

comptime fn get_type<T>() -> Type {
    let t: T = std::mem::zeroed();
    std::meta::type_of(t)
}
