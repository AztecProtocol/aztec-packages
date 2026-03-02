use crate::macros::internals_functions_generation::external_functions_registry::get_public_functions;
use crate::protocol::meta::utils::get_params_len_quote;
use crate::utils::cmap::CHashMap;
use super::utils::{compute_fn_selector, compute_selector, get_type};

/// Returns an `fn public_dispatch(...)` function for the given module that's assumed to be an
/// Aztec contract.
///
/// `injected_fns` carries pre-computed selectors and dispatch cases for auto-generated functions
/// (built via `InjectedPublicFunction::new`).
pub(crate) comptime fn generate_public_dispatch(m: Module, injected_fns: [InjectedPublicFunction]) -> Quoted {
    let contract_functions = get_public_functions(m);

    let seen_selectors = &mut CHashMap::<Field, Quoted>::new();

    let mut dispatch_cases: [Quoted] = contract_functions.map(|function: FunctionDefinition| {
        let fn_name = function.name();
        let selector = compute_fn_selector(function);
        check_selector_collision(selector, fn_name, seen_selectors);
        let call_name = f"__aztec_nr_internals__{fn_name}".quoted_contents();
        generate_dispatch_case(
            selector,
            call_name,
            function.parameters(),
            function.return_type(),
        )
    });

    let injected_cases = injected_fns.map(|f: InjectedPublicFunction| {
        let sel = f.selector;
        let name = f.name;
        check_selector_collision(sel, name, seen_selectors);
        f.dispatch_case
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

/// Panics if `selector` already exists in `seen_selectors`, otherwise inserts it.
comptime fn check_selector_collision(selector: Field, name: Quoted, seen_selectors: &mut CHashMap<Field, Quoted>) {
    let existing = seen_selectors.get(selector);
    if existing.is_some() {
        let existing = existing.unwrap();
        panic(
            f"Public function selector collision detected between '{name}' and '{existing}'",
        );
    }
    seen_selectors.insert(selector, name);
}

/// Generates a single dispatch case: an `if` block that matches on the selector, deserializes
/// calldata into arguments, calls the target function, and returns the result.
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

/// Metadata for an auto-generated public function that needs a dispatch entry.
///
/// Pre-computes `selector` and `dispatch_case` at construction time so the struct only holds
/// scalar fields. This avoids Noir's "nested vectors not supported" limitation that would
/// occur if we stored `[(Quoted, Type)]` inside a `[InjectedPublicFunction]`.
pub(crate) struct InjectedPublicFunction {
    pub(crate) name: Quoted,
    pub(crate) selector: Field,
    pub(crate) body: Quoted,
    pub(crate) dispatch_case: Quoted,
}

impl InjectedPublicFunction {
    pub(crate) comptime fn new(name: Quoted, parameters: [(Quoted, Type)], return_type: Type, body: Quoted) -> Self {
        let selector = compute_selector(name, parameters);
        let dispatch_case = generate_dispatch_case(selector, name, parameters, return_type);
        Self { name, selector, body, dispatch_case }
    }
}
