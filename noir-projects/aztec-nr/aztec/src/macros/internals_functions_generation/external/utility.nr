use crate::macros::{
    internals_functions_generation::external::helpers::create_message_discovery_call,
    utils::module_has_storage,
};

pub(crate) comptime fn generate_utility_external(f: FunctionDefinition) -> Quoted {
    // Initialize Storage if module has storage
    let storage_init = if module_has_storage(f.module()) {
        quote {
            let storage = Storage::init(context);
        }
    } else {
        // Contract does not have Storage defined, so we set storage to the unit type `()`. ContractSelf requires a
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
            let context = dep::aztec::context::utility_context::UtilityContext::new();
            $storage_init
            aztec::contract_self::ContractSelf::new_utility(context, storage)
        };
    };

    // All utility functions perform message discovery, since they may need to access private notes that would be
    // found during this process or they may be used to sync private events from TypeScript
    // (`sync_private_state` function gets invoked by PXE::getPrivateEvents function).
    let message_discovery_call = create_message_discovery_call();

    // A quote to be injected at the beginning of the function body.
    let to_prepend = quote {
        dep::aztec::oracle::version::assert_compatible_oracle_version();
        $contract_self_creation
        $message_discovery_call
    };

    let original_function_name = f.name();
    let fn_name = f"__aztec_nr_internals__{original_function_name}".quoted_contents();
    let body = f.body();
    let params = f
        .parameters()
        .map(|(param_name, param_type)| quote { $param_name: $param_type })
        .join(quote {, });
    let return_type = f.return_type();

    quote {
        #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
        unconstrained fn $fn_name($params) -> pub $return_type {
            $to_prepend
            $body
        }
    }
}
