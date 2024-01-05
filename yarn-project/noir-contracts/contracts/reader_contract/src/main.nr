contract Reader {
    use dep::std::option::Option;
    use dep::protocol_types::{
        address::{
            AztecAddress,
            EthAddress,
        },
        abis::function_selector::FunctionSelector,
    };
    use dep::protocol_types;
    use dep::aztec::log::emit_unencrypted_log;

    use dep::compressed_string::{FCS, FCSSerializationMethods};

    use dep::aztec::{
        context::Context,
        abi,
        abi::PrivateContextInputs,
        hash::pedersen_hash,
        context::PrivateContext,
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
        oracle::{
            get_public_key::get_public_key as get_public_key_oracle,
            context::get_portal_address,
            rand::rand
        },
        state_vars::immutable_singleton::ImmutableSingleton,
        log::emit_unencrypted_log_from_private,
        types::vec::BoundedVec,
    };

    struct Storage {}

    impl Storage {
        fn init(_context: Context) -> Self {
            Storage {}
        }
    }

    #[aztec(private)]

    fn constructor() {}

    #[aztec(public)]
    fn check_name(who: AztecAddress, what: str<31>) {
        let selector = FunctionSelector::from_signature("public_get_name()");
        let ret = context.call_public_function_no_args(who, selector);
        let name = FCS::from_field(ret[0]);
        let _what = FCS::from_string(what);
        assert(name.is_eq(_what));
    }

    #[aztec(public)]
    fn check_symbol(who: AztecAddress, what: str<31>) {
        let selector = FunctionSelector::from_signature("public_get_symbol()");
        let ret = context.call_public_function_no_args(who, selector);
        let symbol = FCS::from_field(ret[0]);
        let _what = FCS::from_string(what);
        assert(symbol.is_eq(_what));
    }

    #[aztec(public)]
    fn check_decimals(who: AztecAddress, what: u8) {
        let selector = FunctionSelector::from_signature("public_get_decimals()");
        let ret = context.call_public_function_no_args(who, selector);
        assert(ret[0] as u8 == what);
    }

    unconstrained fn compute_note_hash_and_nullifier(
        _contract_address: AztecAddress,
        _nonce: Field,
        _storage_slot: Field,
        _serialized_note: [Field; 1]
    ) -> pub [Field; 4] {
        [0x0d, 0x0e, 0x0a, 0x0d]
    }
}
