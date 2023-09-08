mod util;
mod auth_oracle;

contract SchnorrAuthWitnessAccount {
    use dep::std::{
        hash::pedersen_with_separator,
        option::Option,
    };

    use dep::aztec::{
        entrypoint::EntrypointPayload,
        constants_gen::GENERATOR_INDEX__SIGNATURE_PAYLOAD,
        oracle::compute_selector::compute_selector,
        context::{
            PrivateContext, 
            PublicContext
        },
        state_vars::{
            map::Map,
            public_state::PublicState,
        },
        types::type_serialisation::{
            field_serialisation::{
                FieldSerialisationMethods, 
                FIELD_SERIALISED_LEN,
            }
        }
    };

    use crate::util::recover_address;
    use crate::auth_oracle::get_auth_witness;

    struct Storage {
        approved_action: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
    }

    impl Storage {
        fn init(
            private_context: Option<&mut PrivateContext>,
            public_context: Option<&mut PublicContext>,
        ) -> pub Self {
            Storage {
                approved_action: Map::new(
                private_context,
                public_context,
                1,
                |private_context, public_context, slot| {
                    PublicState::new(
                        private_context,
                        public_context,
                        slot,
                        FieldSerialisationMethods,
                    )
                },
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn entrypoint(
        payload: pub EntrypointPayload,
    ) {
        let message_hash: Field = pedersen_with_separator(
          payload.serialize(), 
          GENERATOR_INDEX__SIGNATURE_PAYLOAD
        )[0];
        assert(_inner_is_valid(message_hash, context.this_address()));
        payload.execute_calls(&mut context);
    }

    #[aztec(private)]
    fn is_valid(
        message_hash: Field
    ) -> Field {
        if (_inner_is_valid(message_hash, context.this_address())){
            0xe86ab4ff
        } else {
            0
        }
    }

    #[aztec(public)]
    fn is_valid_public(
        message_hash: Field,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let value = storage.approved_action.at(message_hash).read();
        if (value == 1){
            0xe86ab4ff
        } else {
            0
        }
    }

    #[aztec(private)]
    fn set_is_valid_storage(
        message_hash: Field,
        value: Field,
    ) {
        assert((value == 0) | (value == 1), "value must be a boolean");
        assert(context.msg_sender() == context.this_address(), "only the owner can set the storage");
        // assert(_inner_is_valid(message_hash, context.this_address()), "only the owner can set the storage");

        let selector = compute_selector("_set_is_valid_storage(Field,Field)");
        let _void = context.call_public_function(context.this_address(), selector, [message_hash, value]);
    }

    #[aztec(public)]
    internal fn _set_is_valid_storage(
        message_hash: Field,
        value: Field,
    ) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        storage.approved_action.at(message_hash).write(value);
    }

    fn _inner_is_valid(
        message_hash: Field,
        address: Field,
    ) -> pub bool{
        let witness = get_auth_witness(message_hash);
        assert(recover_address(message_hash, witness) == address);
        true
    }
}