contract NewKeyRegistry {
    use dep::authwit::auth::assert_current_call_valid_authwit_public;

    use dep::aztec::{
        keys::{PublicKeys, stored_keys::StoredKeys}, state_vars::{PublicMutable, Map},
        protocol_types::{point::Point, address::{AztecAddress, PartialAddress}}
    };

    #[aztec(storage)]
    struct Storage {
		current_keys: Map<AztecAddress, PublicMutable<StoredKeys>>,
    }

    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            // std::static_assert(1 == KEY_REGISTRY_STORAGE_SLOT, "unexpected key registry storage slot");
            Storage {
                current_keys: Map::new(context, 1, |context, slot| { PublicMutable::new(context, slot) })
            }
        }
    }

    #[aztec(public)]
    fn register_initial_keys(address: AztecAddress, partial_address: PartialAddress, keys: PublicKeys) {
        let computed_address = AztecAddress::compute(keys.hash(), partial_address);
        assert(computed_address.eq(address), "Computed address does not match supplied address");


        storage.current_keys.at(address).write(StoredKeys::new(keys));
    }

    #[aztec(public)]
    fn rotate_npk_m(address: AztecAddress, new_npk_m: Point, nonce: Field) {
        if (!address.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, address);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

		let user_keys = storage.current_keys.at(address);

		let mut current_keys = user_keys.read().public_keys;
		current_keys.npk_m = new_npk_m;

        user_keys.write(StoredKeys::new(current_keys));
    }
}
