use crate::macros::internals_functions_generation::external_functions_registry::get_public_functions;
use crate::protocol::meta::utils::get_params_len_quote;
use crate::utils::cmap::CHashMap;
use super::functions::initialization_utils::EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME;
use super::utils::compute_fn_selector;
use std::panic;

/// Generates a `public_dispatch` function for an Aztec contract module `m`.
///
/// The generated function dispatches public calls based on selector to the appropriate contract function. If
/// `generate_emit_public_init_nullifier` is true, it also handles dispatch to the macro-generated
/// `__emit_public_init_nullifier` function.
pub comptime fn generate_public_dispatch(m: Module, generate_emit_public_init_nullifier: bool) -> Quoted {
    let functions = get_public_functions(m);

    let unit = get_type::<()>();

    let seen_selectors = &mut CHashMap::<Field, Quoted>::new();

    let mut ifs = functions.map(|function: FunctionDefinition| {
        let parameters = function.parameters();
        let return_type = function.return_type();

        let fn_name = function.name();
        let selector: Field = compute_fn_selector(fn_name, parameters);

        // Since function selectors are computed as the first 4 bytes of the hash of the function signature, it's
        // possible to have collisions. With the following check, we ensure it doesn't happen within the same contract.
        let existing_fn = seen_selectors.get(selector);
        if existing_fn.is_some() {
            let existing_fn = existing_fn.unwrap();
            panic(
                f"Public function selector collision detected between functions '{fn_name}' and '{existing_fn}'",
            );
        }
        seen_selectors.insert(selector, fn_name);

        let params_len_quote = get_params_len_quote(parameters);

        let initial_read = if parameters.len() == 0 {
            quote {}
        } else {
            // The initial calldata_copy offset is 1 to skip the Field selector The expected calldata is the
            // serialization of
            // - FunctionSelector: the selector of the function intended to dispatch
            // - Parameters: the parameters of the function intended to dispatch That is, exactly what is expected for
            // a call to the target function, but with a selector added at the beginning.
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

        // We call a function whose name is prefixed with `__aztec_nr_internals__`. This is necessary because the
        // original function is intentionally made uncallable, preventing direct invocation within the contract.
        // Instead, a new function with the same name, but prefixed by `__aztec_nr_internals__`, has been generated to
        // be called here. For more details see the `process_functions` function.
        let name = f"__aztec_nr_internals__{fn_name}".quoted_contents();
        let args = args.join(quote { , });
        let call = quote { $name($args) };

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

        let if_ = quote {
            if selector == $selector {
                $initial_read
                $read
                $return_code
            }
        };
        if_
    });

    // If we injected the auto-generated public function to emit the public initialization nullifier, then
    // we'll also need to handle its dispatch.
    if generate_emit_public_init_nullifier {
        let name = EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME;
        let init_nullifier_selector: Field = compute_fn_selector(name, @[]);

        ifs = ifs.push_back(
            quote {
            if selector == $init_nullifier_selector {
                $name();
                aztec::oracle::avm::avm_return([]);
            }
        },
        );
    }

    if ifs.len() == 0 {
        // No dispatch function if there are no public functions
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

comptime fn get_type<T>() -> Type {
    let t: T = std::mem::zeroed();
    std::meta::type_of(t)
}
