mod subscription_note;
mod dapp_payload;

use dep::aztec::macros::aztec;

#[aztec]
contract AppSubscription {
    use crate::{dapp_payload::DAppPayload, subscription_note::SubscriptionNote};

    use authwit::auth::assert_current_call_valid_authwit;
    use aztec::{
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        keys::getters::get_public_keys,
        macros::{functions::{initializer, private, public}, storage::storage},
        prelude::{AztecAddress, Map, PrivateMutable, PublicImmutable},
        protocol_types::constants::MAX_FIELD_VALUE,
        utils::comparison::Comparator,
    };
    use router::utils::privately_check_block_number;
    use token::Token;

    #[storage]
    struct Storage<Context> {
        target_address: PublicImmutable<AztecAddress, Context>,
        subscription_token_address: PublicImmutable<AztecAddress, Context>,
        subscription_recipient_address: PublicImmutable<AztecAddress, Context>,
        subscription_price: PublicImmutable<Field, Context>,
        subscriptions: Map<AztecAddress, PrivateMutable<SubscriptionNote, Context>, Context>,
        fee_juice_limit_per_tx: PublicImmutable<Field, Context>,
    }

    global SUBSCRIPTION_DURATION_IN_BLOCKS: Field = 5;
    global SUBSCRIPTION_TXS: Field = 5;

    #[private]
    fn entrypoint(payload: DAppPayload, user_address: AztecAddress) {
        // Default msg_sender for entrypoints is now Fr.max_value rather than 0 addr (see #7190 & #7404)
        assert(context.msg_sender().to_field() == MAX_FIELD_VALUE);
        assert_current_call_valid_authwit(&mut context, user_address);

        let mut note = storage.subscriptions.at(user_address).get_note().note;
        assert(note.remaining_txs as u64 > 0, "you're out of txs");

        note.remaining_txs -= 1;

        // We are emitting both the outgoing and the incoming logs to the subscriber here because passing a separate
        // outgoing_viewer arg to entrypoint function is impractical and the outgoing are not so valuable here.
        let keys = get_public_keys(user_address);
        storage.subscriptions.at(user_address).replace(&mut note).emit(encode_and_encrypt_note(
            &mut context,
            keys.ovpk_m,
            user_address,
            user_address,
        ));

        context.set_as_fee_payer();

        // TODO(palla/gas) Assert fee_juice_limit_per_tx is less than this tx gas_limit
        let _gas_limit = storage.fee_juice_limit_per_tx.read();

        context.end_setup();

        // We check that the note is not expired. We do that via the router contract to conceal which contract
        // is performing the check.
        privately_check_block_number(Comparator.LT, note.expiry_block_number, &mut context);

        payload.execute_calls(&mut context, storage.target_address.read());
    }

    #[public]
    #[initializer]
    fn constructor(
        target_address: AztecAddress,
        subscription_recipient_address: AztecAddress,
        subscription_token_address: AztecAddress,
        subscription_price: Field,
        fee_juice_limit_per_tx: Field,
    ) {
        storage.target_address.initialize(target_address);
        storage.subscription_token_address.initialize(subscription_token_address);
        storage.subscription_recipient_address.initialize(subscription_recipient_address);
        storage.subscription_price.initialize(subscription_price);
        storage.fee_juice_limit_per_tx.initialize(fee_juice_limit_per_tx);
    }

    #[private]
    fn subscribe(
        subscriber: AztecAddress,
        nonce: Field,
        expiry_block_number: Field,
        tx_count: Field,
    ) {
        assert(tx_count as u64 <= SUBSCRIPTION_TXS as u64);

        Token::at(storage.subscription_token_address.read())
            .transfer_in_private(
                context.msg_sender(),
                storage.subscription_recipient_address.read(),
                storage.subscription_price.read(),
                nonce,
            )
            .call(&mut context);

        // Assert that the `current_block_number > expiry_block_number - SUBSCRIPTION_DURATION_IN_BLOCKS`.
        // --> We do that via the router contract to conceal which contract is performing the check.
        privately_check_block_number(
            Comparator.GT,
            expiry_block_number - SUBSCRIPTION_DURATION_IN_BLOCKS,
            &mut context,
        );

        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;

        let mut subscription_note =
            SubscriptionNote::new(subscriber, expiry_block_number, tx_count);
        storage.subscriptions.at(subscriber).initialize_or_replace(&mut subscription_note).emit(
            encode_and_encrypt_note(
                &mut context,
                msg_sender_ovpk_m,
                subscriber,
                context.msg_sender(),
            ),
        );
    }

    unconstrained fn is_initialized(subscriber: AztecAddress) -> pub bool {
        storage.subscriptions.at(subscriber).is_initialized()
    }
}
