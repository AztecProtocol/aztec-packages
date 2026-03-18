mod compute_note_hash_and_nullifier;

use crate::macros::{
    calls_generation::{
        external_functions::{generate_external_function_calls, generate_external_function_self_calls_structs},
        internal_functions::generate_call_internal_struct,
    },
    dispatch::generate_public_dispatch,
    emit_public_init_nullifier::generate_emit_public_init_nullifier,
    internals_functions_generation::{create_fn_abi_exports, process_functions},
    storage::STORAGE_LAYOUT_NAME,
    utils::{is_fn_contract_library_method, is_fn_external, is_fn_internal, is_fn_test, module_has_storage},
};

use compute_note_hash_and_nullifier::generate_contract_library_methods_compute_note_hash_and_nullifier;

/// Marks a contract as an Aztec contract, generating the interfaces for its functions and notes, as well as injecting
/// the `sync_state` utility function.
///
/// Note: This is a module annotation, so the returned quote gets injected inside the module (contract) itself.
pub comptime fn aztec(m: Module) -> Quoted {
    // Functions that don't have #[external(...)], #[contract_library_method], or #[test] are not allowed in contracts.
    check_each_fn_macroified(m);

    // We generate new functions prefixed with `__aztec_nr_internals__` and we replace the original functions' bodies
    // with `static_assert(false, ...)` to prevent them from being called directly from within the contract.
    let functions = process_functions(m);

    // We generate structs and their implementations necessary for convenient functions calls.
    let interface = generate_contract_interface(m);
    let self_call_structs = generate_external_function_self_calls_structs(m);
    let call_internal_struct = generate_call_internal_struct(m);

    // We generate ABI exports for all the external functions in the contract.
    let fn_abi_exports = create_fn_abi_exports(m);

    // We generate `_compute_note_hash`, `_compute_note_nullifier` (and the deprecated
    // `_compute_note_hash_and_nullifier` wrapper), `sync_state` and `process_message` functions only if they are not
    // already implemented. If they are implemented we just insert empty quotes.
    let contract_library_method_compute_note_hash_and_nullifier = if !m.functions().any(|f| {
        // Note that we don't test for `_compute_note_hash` or `_compute_note_nullifier` in order to make this simpler
        // - users must either implement all three or none.
        // Down the line we'll remove this check and use `AztecConfig`.
        f.name() == quote { _compute_note_hash_and_nullifier }
    }) {
        generate_contract_library_methods_compute_note_hash_and_nullifier()
    } else {
        quote {}
    };
    let sync_state_fn_and_abi_export = if !m.functions().any(|f| f.name() == quote { sync_state }) {
        generate_sync_state()
    } else {
        quote {}
    };

    if m.functions().any(|f| f.name() == quote { offchain_receive }) {
        panic(
            "User-defined 'offchain_receive' is not allowed. The function is auto-injected by the #[aztec] macro. See https://docs.aztec.network/errors/7",
        );
    }
    let offchain_receive_fn_and_abi_export = generate_offchain_receive();

    let process_message_fn_and_abi_export = if !m.functions().any(|f| f.name() == quote { process_message }) {
        generate_process_message()
    } else {
        quote {}
    };
    let (has_public_init_nullifier_fn, emit_public_init_nullifier_fn_body) = generate_emit_public_init_nullifier(m);
    let public_dispatch = generate_public_dispatch(m, has_public_init_nullifier_fn);

    quote {
        $interface
        $self_call_structs
        $call_internal_struct
        $functions
        $fn_abi_exports
        $contract_library_method_compute_note_hash_and_nullifier
        $public_dispatch
        $sync_state_fn_and_abi_export
        $process_message_fn_and_abi_export
        $emit_public_init_nullifier_fn_body
        $offchain_receive_fn_and_abi_export
    }
}

comptime fn generate_contract_interface(m: Module) -> Quoted {
    let calls = generate_external_function_calls(m);

    let module_name = m.name();

    let has_storage_layout = module_has_storage(m) & STORAGE_LAYOUT_NAME.get(m).is_some();
    let storage_layout_getter = if has_storage_layout {
        let storage_layout_name = STORAGE_LAYOUT_NAME.get(m).unwrap();
        quote {
            pub fn storage_layout() -> StorageLayoutFields {
                $storage_layout_name.fields
            }
        }
    } else {
        quote {}
    };

    let library_storage_layout_getter = if has_storage_layout {
        quote {
            #[contract_library_method]
            $storage_layout_getter
        }
    } else {
        quote {}
    };

    quote {
        pub struct $module_name {
            pub target_contract: aztec::protocol::address::AztecAddress
        }

        impl $module_name {
            $calls

            pub fn at(
                addr: aztec::protocol::address::AztecAddress
            ) -> Self {
                Self { target_contract: addr }
            }

            pub fn interface() -> Self {
                Self { target_contract: aztec::protocol::address::AztecAddress::zero() }
            }

            $storage_layout_getter
        }

        #[contract_library_method]
        pub fn at(
            addr: aztec::protocol::address::AztecAddress
        ) -> $module_name {
            $module_name { target_contract: addr }
        }

        #[contract_library_method]
        pub fn interface() -> $module_name {
            $module_name { target_contract: aztec::protocol::address::AztecAddress::zero() }
        }

        $library_storage_layout_getter

    }
}

/// Generates the `sync_state` utility function that performs message discovery.
comptime fn generate_sync_state() -> Quoted {
    quote {
        pub struct sync_state_parameters {}

        #[abi(functions)]
        pub struct sync_state_abi {
            parameters: sync_state_parameters,
        }

        #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
        unconstrained fn sync_state() {
            let address = aztec::context::UtilityContext::new().this_address();
            aztec::messages::discovery::do_sync_state(
                address,
                _compute_note_hash,
                _compute_note_nullifier,
                Option::some(aztec::messages::processing::offchain::sync_inbox),
            );
        }
    }
}

comptime fn generate_process_message() -> Quoted {
    quote {
        pub struct process_message_parameters {
            pub message_ciphertext: BoundedVec<Field, aztec::messages::encoding::MESSAGE_CIPHERTEXT_LEN>,
            pub message_context: aztec::messages::processing::MessageContext,
        }

        #[abi(functions)]
        pub struct process_message_abi {
            parameters: process_message_parameters,
        }

        #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
        unconstrained fn process_message(
            message_ciphertext: BoundedVec<Field, aztec::messages::encoding::MESSAGE_CIPHERTEXT_LEN>,
            message_context: aztec::messages::processing::MessageContext,
        ) {
            let address = aztec::context::UtilityContext::new().this_address();

            aztec::messages::discovery::process_message::process_message_ciphertext(
                address,
                _compute_note_hash,
                _compute_note_nullifier,
                message_ciphertext,
                message_context,
            );

            // At this point, the note is pending validation and storage in the database. We must call
            // validate_and_store_enqueued_notes_and_events to complete that process.
            aztec::messages::processing::validate_and_store_enqueued_notes_and_events(address);
        }
    }
}

/// Generates an `offchain_receive` utility function that lets callers add messages to the offchain message inbox.
///
/// For more details, see `aztec::messages::processing::offchain::receive`.
comptime fn generate_offchain_receive() -> Quoted {
    quote {
        pub struct offchain_receive_parameters {
            pub messages: BoundedVec<
                aztec::messages::processing::offchain::OffchainMessage,
                aztec::messages::processing::offchain::MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL,
            >,
        }

        #[abi(functions)]
        pub struct offchain_receive_abi {
            parameters: offchain_receive_parameters,
        }

        /// Receives offchain messages into this contract's offchain inbox for subsequent processing.
        ///
        /// For more details, see `aztec::messages::processing::offchain::receive`.
        ///
        /// This function is automatically injected by the `#[aztec]` macro.
        #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
        unconstrained fn offchain_receive(
            messages: BoundedVec<
                aztec::messages::processing::offchain::OffchainMessage,
                aztec::messages::processing::offchain::MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL,
            >,
        ) {
            let address = aztec::context::UtilityContext::new().this_address();
            aztec::messages::processing::offchain::receive(address, messages);
        }
    }
}

/// Checks that all functions in the module have a context macro applied.
///
/// Non-macroified functions are not allowed in contracts. They must all be one of
/// [`external`](crate::macros::functions::external), [`internal`](crate::macros::functions::internal) or `test`.
comptime fn check_each_fn_macroified(m: Module) {
    for f in m.functions() {
        let name = f.name();
        if !is_fn_external(f) & !is_fn_contract_library_method(f) & !is_fn_internal(f) & !is_fn_test(f) {
            // We  don't suggest that #[contract_library_method] is allowed because we don't want to introduce another
            // concept
            panic(
                f"Function {name} must be marked as either #[external(...)], #[internal(...)], or #[test]",
            );
        }
    }
}
