use crate::macros::utils::{fn_has_noinitcheck, module_has_initializer, module_has_storage};

pub(crate) comptime fn generate_utility_external(f: FunctionDefinition) -> Quoted {
    let module_has_initializer = module_has_initializer(f.module());

    // Initialize Storage if module has storage
    let storage_init = if module_has_storage(f.module()) {
        quote {
            let storage = Storage::init(context);
        }
    } else {
        // Contract does not have Storage defined, so we set storage to the unit type `()`. ContractSelfUtility
        // requires a
        // storage struct in its constructor. Using an Option type would lead to worse developer experience and higher
        // constraint counts so we use the unit type `()` instead.
        quote {
            let storage = ();
        }
    };

    // Create utility context
    let contract_self_creation = quote {
        #[allow(unused_variables)]
        let mut self = {
            let context = aztec::context::UtilityContext::new();
            $storage_init
            aztec::contract_self::ContractSelfUtility::new(context, storage)
        };
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
