use crate::protocol::meta::utils::get_params_len_quote;
use crate::utils::cmap::CHashMap;
use super::utils::{compute_fn_selector, get_type};

/// Returns an `fn public_dispatch(...)` function for a list of dispatchable public functions.
pub(crate) comptime fn generate_public_dispatch(fns: [DispatchablePublicFunction]) -> Quoted {
    let seen_selectors = &mut CHashMap::<Field, Quoted>::new();

    let ifs: [Quoted] = fns.map(|f: DispatchablePublicFunction| {
        let name = f.name;
        let existing_fn = seen_selectors.get(f.selector);
        if existing_fn.is_some() {
            let existing_fn = existing_fn.unwrap();
            panic(
                f"Public function selector collision detected between functions '{name}' and '{existing_fn}'",
            );
        }
        seen_selectors.insert(f.selector, name);
        f.dispatch_case
    });

    if ifs.len() == 0 {
        quote {}
    } else {
        let ifs = ifs.push_back(quote { panic(f"Unknown selector {selector}") });
        let dispatch = ifs.join(quote {  });

        let body = quote {
            // We mark this as public because our whole system depends on public functions having this attribute.
            #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
            pub unconstrained fn public_dispatch(selector: Field) {
                $dispatch
            }
        };

        body
    }
}

/// Generates a single dispatch case: an `if` block that matches on the selector, deserializes calldata into
/// arguments, calls the target function, and returns the result.
comptime fn generate_dispatch_case(
    selector: Field,
    call_name: Quoted,
    parameters: [(Quoted, Type)],
    return_type: Type,
) -> Quoted {
    let unit = get_type::<()>();

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

/// Metadata for a public function that needs a dispatch entry.
///
/// Pre-computes `selector` and `dispatch_case` at construction time so the struct only holds scalar fields. This
/// avoids Noir's "nested vectors not supported" limitation that would occur if we stored `[(Quoted, Type)]` inside a
/// `[DispatchablePublicFunction]`.
pub(crate) struct DispatchablePublicFunction {
    pub(crate) name: Quoted,
    pub(crate) selector: Field,
    pub(crate) dispatch_case: Quoted,
}

impl DispatchablePublicFunction {
    /// Builds a dispatch entry from a user-defined public function.
    pub(crate) comptime fn from_fn(function: FunctionDefinition) -> Self {
        let parameters = function.parameters();
        let return_type = function.return_type();

        let fn_name = function.name();
        let selector = compute_fn_selector(fn_name, parameters);

        // We call a function whose name is prefixed with `__aztec_nr_internals__`. This is necessary because the
        // original function is intentionally made uncallable, preventing direct invocation within the contract.
        // Instead, a new function with the same name, but prefixed by `__aztec_nr_internals__`, has been generated
        // to be called here. For more details see the `process_functions` function.
        let call_target = f"__aztec_nr_internals__{fn_name}".quoted_contents();

        let dispatch_case = generate_dispatch_case(selector, call_target, parameters, return_type);

        DispatchablePublicFunction { name: fn_name, selector, dispatch_case }
    }

    /// Builds a dispatch entry for an injected public function (not derived from a `FunctionDefinition`).
    pub(crate) comptime fn new(name: Quoted, parameters: [(Quoted, Type)], return_type: Type) -> Self {
        let selector = compute_fn_selector(name, parameters);
        let dispatch_case = generate_dispatch_case(selector, name, parameters, return_type);
        DispatchablePublicFunction { name, selector, dispatch_case }
    }
}
