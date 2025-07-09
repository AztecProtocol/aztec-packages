mod config;
mod order_note;

use aztec::macros::aztec;

/// ## Overview
/// This contract demonstrates how to implement an **Orderbook** that keeps all of the information in private. Orders
/// are revealed only to a closed set of participants.
///
/// **Note:**
/// This is purely a demonstration implemented to test various features of Aztec.nr. The **Aztec team** does not
/// consider this the optimal design for building a DEX.
///
/// ## Reentrancy Guard Considerations
///
/// ### 1. Private Functions:
/// Reentrancy protection is typically necessary if entering an intermediate state that is only valid when
/// the action completes uninterrupted. This follows the **Checks-Effects-Interactions** pattern.
///
/// - In this contract, **private functions** do not introduce intermediate states.
///
/// ### 2. Public Functions:
/// No **reentrancy guard** is required for public functions because:
/// -
#[aztec]
pub contract ClosedSetOrderbook {
    use crate::{config::Config, order_note::OrderNote};
    use aztec::{
        macros::{functions::{initializer, private, public, utility}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
        note::{
            lifecycle::destroy_note_unsafe, note_getter::get_note, retrieved_note::RetrievedNote,
        },
        oracle::random::random,
        protocol_types::address::AztecAddress,
        state_vars::{HasStorageSlot, Map, PrivateImmutable, SharedMutable},
    };

    use token::Token;

    // Note that this value was copied over to e2e_closed_set_orderbook.test.ts. and needs to be kept in sync.
    global CHANGE_CONFIG_DELAY: u64 = 60 * 60 * 24;

    #[storage]
    struct Storage<Context> {
        config: SharedMutable<Config, CHANGE_CONFIG_DELAY, Context>,
        orders: Map<Field, PrivateImmutable<OrderNote, Context>, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(
        token0: AztecAddress,
        token1: AztecAddress,
        fee_collector: AztecAddress,
        fee: u16,
    ) {
        // TODO: Why don't we have a way to directly initialize SharedMutable when it's created? If this is done
        // in the constructor then it's safe as we cannot interact with an undeployed contract that has initializer.
        // Waiting for delay to pass here is quite annoying. Or are we unable to detect we are in a constructor? It
        // should be possible to do via nullifier non-inclusion and inclusion proofs.
        storage.config.schedule_value_change(Config::new(token0, token1, fee_collector, fee));
    }

    /// Privately creates a new order in the orderbook
    /// The maker specifies the tokens and amounts they want to trade
    #[private]
    fn create_order(
        bid_token: AztecAddress,
        ask_token: AztecAddress,
        bid_amount: u128,
        ask_amount: u128,
        authwit_nonce: Field,
    ) -> Field {
        let config = storage.config.get_current_value();
        let maker = context.msg_sender();

        // Transfer tokens from maker to the public balance of this contract.
        Token::at(bid_token)
            .transfer_in_private(maker, context.this_address(), bid_amount, authwit_nonce)
            .call(&mut context);

        // This contract is the "nullificator" of the order note meaning that this contract's nullifier key will be
        // used to compute the nullifier.
        let order_nullificator = context.this_address();
        // The viewer of the order note is also this contract as we use this contract's viewing key to encrypt
        // the note.
        let order_viewer = context.this_address();

        // The entity used to compute the tagging secret. We use this contract's address instead of maker address
        // such that potential takers don't need to add maker to their PXE when looking for orders.
        //
        // Note that when fulfilling the order takers will need to add maker to their PXE as they will need to send
        // them `ask_token` note.
        let order_note_sender = context.this_address();

        // Safety: If the order ID is not unique then the order will fail to be stored in PrivateImmutable due to
        // initialization nullifier collision.
        let order_id = unsafe { random() };

        // Create the order (this validates the input tokens and amounts).
        let order = OrderNote::new(
            order_id,
            config,
            order_nullificator,
            maker,
            bid_amount,
            ask_amount,
            bid_token,
            ask_token,
        );

        // Store the order in private storage and emit an event.
        storage.orders.at(order_id).initialize(order).emit(encode_and_encrypt_note(
            &mut context,
            order_viewer,
            order_note_sender,
        ));

        // Note that I don't emit an event here because all the possible takers will have access to the viewing key
        // (and the nullifier key) and hence will see when the order note is emitted.

        order_id
    }

    /// Privately fulfills an existing order in the orderbook
    /// The taker provides the order ID they want to fulfill
    #[private]
    fn fulfill_order(order_id: Field, authwit_nonce: Field) {
        let config = storage.config.get_current_value();
        let taker = context.msg_sender();

        // We get and nullify the order. We are working around PrivateImmutable here because the PrivateImmutable
        // getter does not allow us to then destroy the note. This is of course intentional as the note is supposed
        // to be immutable. But we want to nullify the note as it's valuable to communicate order fulfillment that way.
        // TODO: Rework this. An option is to not use any state variable and instead manually handle the notes.
        let order_note_storage_slot = storage.orders.at(order_id).get_storage_slot();
        let (order_retrieved_note, note_hash_for_read_request): (RetrievedNote<OrderNote>, Field) =
            get_note(&mut context, order_note_storage_slot);
        destroy_note_unsafe(
            &mut context,
            order_retrieved_note,
            note_hash_for_read_request,
        );

        let order = order_retrieved_note.note;

        // Determine which tokens are being exchanged based on bid_token_is_zero flag
        let (bid_token, ask_token) = config.get_tokens(order.bid_token_is_zero);

        // TODO: Transfer the fee denominated in bid_token to the fee collector here.

        // Transfer the ask_amount from taker directly to the maker
        Token::at(ask_token)
            .transfer_in_private(taker, order.maker, order.ask_amount, authwit_nonce)
            .call(&mut context);

        // Transfer the bid_amount from this contract's private balance to the taker
        // Note that we cannot use the hyper-optimized `Token::transfer` function here because we need constrained
        // delivery.
        Token::at(bid_token)
            .transfer_in_private(context.this_address(), taker, order.bid_amount, authwit_nonce)
            .call(&mut context);
    }

    #[utility]
    unconstrained fn get_config() -> pub Config {
        storage.config.get_current_value()
    }
}
