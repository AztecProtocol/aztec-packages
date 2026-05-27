use crate::macros::internals_functions_generation::external_functions_registry::get_public_functions;
use crate::protocol::meta::utils::get_params_len_quote;
use crate::utils::cmap::CHashMap;
use super::functions::initialization_utils::EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME;
use super::utils::compute_fn_selector;
use std::panic;

/// Minimum number of public functions that must share a parameter-type signature before we extract a shared
/// unpack helper. See [compute_unpack_prelude] for the rationale behind the chosen value.
global EXTRACTION_THRESHOLD: u32 = 4;

/// Generates a `public_dispatch` function for an Aztec contract module `m`.
///
/// The generated function dispatches public calls based on selector to the appropriate contract function. If
/// `generate_emit_public_init_nullifier` is true, it also handles dispatch to the macro-generated
/// `__emit_public_init_nullifier` function.
///
/// Alongside `public_dispatch`, this also emits one `__aztec_nr_internals__unpack_arguments_<N>` helper per
/// parameter-type signature shared by enough public functions; see [compute_unpack_prelude] for the extraction
/// criterion.
pub comptime fn generate_public_dispatch(m: Module, generate_emit_public_init_nullifier: bool) -> Quoted {
    let functions = get_public_functions(m);

    let unit = get_type::<()>();

    // Count how many public functions share each parameter-type signature, so we can decide which signatures are
    // worth extracting into helpers.
    let signature_counts = &mut CHashMap::<Quoted, u32>::new();
    for function in functions {
        let parameters = function.parameters();
        if parameters.len() != 0 {
            let key = signature_key(parameters);
            let prior = signature_counts.get(key).unwrap_or(0);
            signature_counts.insert(key, prior + 1);
        }
    }

    let seen_selectors = &mut CHashMap::<Field, Quoted>::new();
    let signature_to_helper_idx = &mut CHashMap::<Quoted, u32>::new();
    // The helper function definitions, in the order they were created.
    let unpack_helpers: &mut [Quoted] = &mut @[];

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

        let (unpack_prelude, call_args) = compute_unpack_prelude(
            parameters,
            signature_counts,
            signature_to_helper_idx,
            unpack_helpers,
        );

        // We call a function whose name is prefixed with `__aztec_nr_internals__`. This is necessary because the
        // original function is intentionally made uncallable, preventing direct invocation within the contract.
        // Instead, a new function with the same name, but prefixed by `__aztec_nr_internals__`, has been generated to
        // be called here. For more details see the `process_functions` function.
        let name = f"__aztec_nr_internals__{fn_name}".quoted_contents();
        let call = quote { $name($call_args) };

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
                $unpack_prelude
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

        let helpers = (*unpack_helpers).join(quote {  });

        let body = quote {
            $helpers

            // We mark this as public because our whole system depends on public functions having this attribute.
            #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
            pub unconstrained fn public_dispatch(selector: Field) {
                $dispatch
            }
        };

        body
    }
}

/// Canonical Quoted representation of a parameter list's types, used as the deduplication key for unpack helpers.
comptime fn signature_key(parameters: [(Quoted, Type)]) -> Quoted {
    parameters
        .map(|param: (Quoted, Type)| {
            let param_type = param.1;
            quote { $param_type }
        })
        .join(quote { , })
}

/// Builds the dispatch-arm prelude for a public function and the comma-separated arg list to pass through to the call.
///
/// If the function's signature reaches `EXTRACTION_THRESHOLD`, the prelude reuses (or creates) a shared
/// `__aztec_nr_internals__unpack_arguments_<N>` helper. Otherwise the calldata read is inlined, matching the
/// pre-extraction shape; this avoids paying the helper-call overhead on signatures that would not benefit from the
/// shared body.
///
/// The real break-even depends on the size of the inlined boilerplate at each call site (which scales with the
/// parameter types' `stream_deserialize` cost), not just the share count: a signature with one `Field` arg inlines
/// to a few opcodes per site, while a signature like `(AztecAddress, U128, PartialUintNote)` inlines into many. For
/// now we approximate that with a single share-count threshold, which is the simplest knob that keeps the macro
/// readable. If we ever want to be more precise we can size each helper against its per-site savings.
comptime fn compute_unpack_prelude(
    parameters: [(Quoted, Type)],
    signature_counts: &mut CHashMap<Quoted, u32>,
    signature_to_helper_idx: &mut CHashMap<Quoted, u32>,
    unpack_helpers: &mut [Quoted],
) -> (Quoted, Quoted) {
    if parameters.len() == 0 {
        (quote {}, quote {})
    } else {
        let sig_key = signature_key(parameters);
        let count = signature_counts.get(sig_key).unwrap_or(0);
        let shared = count >= EXTRACTION_THRESHOLD;

        let mut arg_names: [Quoted] = @[];
        for parameter_index in 0..parameters.len() {
            let arg_name = f"arg{parameter_index}".quoted_contents();
            arg_names = arg_names.push_back(arg_name);
        }
        let args = arg_names.join(quote { , });

        let prelude = if shared {
            let existing_idx = signature_to_helper_idx.get(sig_key);
            let helper_idx = if existing_idx.is_some() {
                existing_idx.unwrap()
            } else {
                let new_idx = (*unpack_helpers).len();
                signature_to_helper_idx.insert(sig_key, new_idx);
                let helper_def = build_unpack_helper(new_idx, parameters);
                *unpack_helpers = (*unpack_helpers).push_back(helper_def);
                new_idx
            };
            let helper_name = f"__aztec_nr_internals__unpack_arguments_{helper_idx}".quoted_contents();
            if parameters.len() == 1 {
                quote { let arg0 = $helper_name(); }
            } else {
                quote { let ($args) = $helper_name(); }
            }
        } else {
            inline_unpack(parameters)
        };

        (prelude, args)
    }
}

/// Inlined calldata read + per-parameter `stream_deserialize` for signatures that are not worth extracting.
comptime fn inline_unpack(parameters: [(Quoted, Type)]) -> Quoted {
    let params_len_quote = get_params_len_quote(parameters);
    let initial_read = quote {
        let input_calldata: [Field; $params_len_quote] = aztec::oracle::avm::calldata_copy(1, $params_len_quote);
        let mut reader = aztec::protocol::utils::reader::Reader::new(input_calldata);
    };

    let mut read_quotes: [Quoted] = @[];
    for parameter_index in 0..parameters.len() {
        let arg_name = f"arg{parameter_index}".quoted_contents();
        let param_type = parameters[parameter_index].1;
        read_quotes = read_quotes.push_back(
            quote {
                let $arg_name: $param_type = aztec::protocol::traits::Deserialize::stream_deserialize(&mut reader);
            },
        );
    }
    let reads = read_quotes.join(quote { });

    quote {
        $initial_read
        $reads
    }
}

/// Emits the `#[inline_never]` helper that reads calldata for one specific parameter-type signature.
///
/// Returns a single value when there is only one parameter, and a tuple when there are several. Marked
/// `#[inline_never]` (and therefore `unconstrained`) so each entry point can call into the same compiled body.
comptime fn build_unpack_helper(idx: u32, parameters: [(Quoted, Type)]) -> Quoted {
    let helper_name = f"__aztec_nr_internals__unpack_arguments_{idx}".quoted_contents();
    let params_len_quote = get_params_len_quote(parameters);

    // The initial calldata_copy offset is 1 to skip the Field selector. The expected calldata is the serialization
    // of:
    // - FunctionSelector: the selector of the function intended to dispatch
    // - Parameters: the parameters of the function intended to dispatch
    // That is, exactly what is expected for a call to the target function, but with a selector added at the
    // beginning.
    let initial_read = quote {
        let input_calldata: [Field; $params_len_quote] = aztec::oracle::avm::calldata_copy(1, $params_len_quote);
        let mut reader = aztec::protocol::utils::reader::Reader::new(input_calldata);
    };

    let mut read_quotes: [Quoted] = @[];
    let mut arg_quotes: [Quoted] = @[];
    let mut type_quotes: [Quoted] = @[];
    for parameter_index in 0..parameters.len() {
        let arg_name = f"arg{parameter_index}".quoted_contents();
        let param_type = parameters[parameter_index].1;
        read_quotes = read_quotes.push_back(
            quote {
                let $arg_name: $param_type = aztec::protocol::traits::Deserialize::stream_deserialize(&mut reader);
            },
        );
        arg_quotes = arg_quotes.push_back(arg_name);
        type_quotes = type_quotes.push_back(quote { $param_type });
    }
    let reads = read_quotes.join(quote { });
    let return_args = arg_quotes.join(quote { , });

    if parameters.len() == 1 {
        let only_type = parameters[0].1;
        quote {
            #[inline_never]
            #[contract_library_method]
            unconstrained fn $helper_name() -> $only_type {
                $initial_read
                $reads
                arg0
            }
        }
    } else {
        let return_types = type_quotes.join(quote { , });
        quote {
            #[inline_never]
            #[contract_library_method]
            unconstrained fn $helper_name() -> ($return_types) {
                $initial_read
                $reads
                ($return_args)
            }
        }
    }
}

comptime fn get_type<T>() -> Type {
    let t: T = std::mem::zeroed();
    std::meta::type_of(t)
}
