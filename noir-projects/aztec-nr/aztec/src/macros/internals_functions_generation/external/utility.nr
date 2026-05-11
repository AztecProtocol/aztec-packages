use crate::macros::utils::{fn_has_noinitcheck, module_has_initializer, module_has_storage};

/// Emits a per-contract helper that builds the `self` value used by every utility external function.
///
/// Each utility external function calls this helper instead of inlining the construction, so the
/// `UtilityContext::new`/`Storage::init`/`CallSelfUtility`/`ContractSelfUtility::new` chain does not appear duplicated
/// in every utility function body. We let Noir's inliner decide whether to inline the helper at each call site rather
/// than forcing it via macro expansion.
///
/// Unlike the public counterpart, this helper takes no arguments because `UtilityContext::new` does not need calldata.
pub(crate) comptime fn generate_utility_self_creator(m: Module) -> Quoted {
    let (storage_type, storage_init) = if module_has_storage(m) {
        (quote { Storage<aztec::context::UtilityContext> }, quote { let storage = Storage::init(context); })
    } else {
        // Contract does not have Storage defined, so we set storage to the unit type `()`. ContractSelfUtility requires
        // a storage struct in its constructor. Using an Option type would lead to worse developer experience and higher
        // constraint counts so we use the unit type `()` instead.
        (quote { () }, quote { let storage = (); })
    };

    quote {
        #[contract_library_method]
        unconstrained fn __aztec_nr_internals__create_utility_self() -> aztec::contract_self::ContractSelfUtility<$storage_type, CallSelfUtility> {
            let context = aztec::context::UtilityContext::new();
            $storage_init
            let self_address = context.this_address();
            let call_self = CallSelfUtility { address: self_address };
            aztec::contract_self::ContractSelfUtility::new(context, storage, call_self)
        }
    }
}

pub(crate) comptime fn generate_utility_external(f: FunctionDefinition) -> Quoted {
    let module_has_initializer = module_has_initializer(f.module());

    let contract_self_creation = quote {
        #[allow(unused_variables)]
        let mut self = __aztec_nr_internals__create_utility_self();
    };

    // Initialization checks are not included in contracts that don't have initializers.
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) {
        quote {
            aztec::macros::functions::initialization_utils::assert_is_initialized_utility(
                self.context,
            );
        }
    } else {
        quote {}
    };

    // A quote to be injected at the beginning of the function body.
    let to_prepend = quote {
        aztec::oracle::version::assert_compatible_oracle_version();
        $contract_self_creation
        $init_check
    };

    let original_function_name = f.name();
    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();
    let body = f.body();
    let params = f.parameters().map(|(param_name, param_type)| quote { $param_name: $param_type }).join(quote {, });
    let return_type = f.return_type();

    quote {
        #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
        unconstrained fn $fn_name($params) -> pub $return_type {
            $to_prepend
            $body
        }
    }
}
