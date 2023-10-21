mod interfaces;
mod util;

contract Gitcoin {
    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        oracle::{context::get_portal_address},
        state_vars::{map::Map, public_state::PublicState},
        types::address::{AztecAddress, EthereumAddress},
        types::type_serialization::bool_serialization::{
            BoolSerializationMethods, BOOL_SERIALIZED_LEN,
        },
        types::type_serialization::field_serialization::{
            FieldSerializationMethods, FIELD_SERIALIZED_LEN,
        },
        selector::compute_selector,
    };

    use dep::authwit::auth::{IS_VALID_SELECTOR, assert_current_call_valid_authwit_public, compute_authwit_message_hash};
    
    use crate::interfaces::{Token, TokenBridge};
    use crate::util::compute_content_hash;

    struct Storage {
        // like with account contracts, stores the approval message on a slot and tracks if they are active
        approved_action: Map<PublicState<bool, BOOL_SERIALIZED_LEN>>,
        // tracks the nonce used to create the approval message for burning funds
        // gets incremented each time after use to prevent replay attacks
        nonce_for_burn_approval: PublicState<Field, FIELD_SERIALIZED_LEN>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                approved_action: Map::new(
                    context,
                    1,
                    |context, slot| {
                        PublicState::new(context, slot, BoolSerializationMethods)
                    },
                ),
                nonce_for_burn_approval: PublicState::new(context, 2, FieldSerializationMethods),
            }
        }
    }
    
    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn donate(
        pool_id: Field,
        to: EthereumAddress,
        amount: Field,
        asset: AztecAddress, // should be immutable
        asset_bridge: AztecAddress, // should be immutable
        nonce_for_unshield_approval: Field,
    ) -> bool {
        Token::at(asset.address).unshield(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount,
            nonce_for_unshield_approval,
        );

        let _void = context.call_public_function(
            context.this_address(), 
            compute_selector("_donate((Field),(Field),Field)"), 
            [asset.address, asset_bridge.address, amount],
        );

        context.message_portal(compute_content_hash(
            pool_id,
            to,
            amount,
            EthereumAddress::new(0),
        ));

        true
    }

    #[aztec(public)]
    fn is_valid_public(message_hash: Field) -> Field {
        let value = storage.approved_action.at(message_hash).read();
        if (value){
            IS_VALID_SELECTOR
        } else {
            0
        }
    }

    #[aztec(public)]
    internal fn _donate(
        asset: AztecAddress,
        asset_bridge: AztecAddress,
        amount: Field,
    ) {
        let portal_address = EthereumAddress::new(context.this_portal_address());
        assert(portal_address.address != 0, "Portal address is not set");

        let nonce_for_burn_approval = storage.nonce_for_burn_approval.read();
        let selector = compute_selector("burn_public((Field),Field,Field)");
        let message_hash = compute_authwit_message_hash(asset_bridge, asset, selector, [context.this_address(), amount, nonce_for_burn_approval]);
        storage.approved_action.at(message_hash).write(true);

        // increment nonce_for_burn_approval so it won't be used again
        storage.nonce_for_burn_approval.write(nonce_for_burn_approval + 1);

        TokenBridge::at(asset_bridge.address).exit_to_l1_public(
            context,
            portal_address,
            amount,
            portal_address,
            nonce_for_burn_approval,
        );
    }
}