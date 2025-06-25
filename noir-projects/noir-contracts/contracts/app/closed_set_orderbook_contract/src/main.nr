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
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility},
            storage::storage,
        },
        messages::logs::note::encode_and_encrypt_note,
        oracle::{notes::check_nullifier_exists, random::random},
        prelude::{AztecAddress, Map, PrivateImmutable, SharedMutable},
        protocol_types::traits::{FromField, ToField},
    };

    use token::Token;

    global CHANGE_CONFIG_DELAY_BLOCKS: u32 = 100;

    #[storage]
    struct Storage<Context> {
        config: SharedMutable<Config, CHANGE_CONFIG_DELAY_BLOCKS, Context>,
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
        // in the constructor then it's safe. Waiting for delay to pass here is quite annoying. Or are we unable
        // to detect we are in a constructor? It should be possible to do via nullifier non-inclusion and inclusion
        // proofs.
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
        //
        // TODO: If we constrained tagging could we use maker address here and drop maker field from the note itself?
        // This would save some DA costs.
        let order_note_sender = context.this_address();

        // Safety: If the order ID is not unique then the order will fail to be stored in PrivateImmutable due to
        // initialization nullifier collision.
        let order_id = unsafe { random() };

        // Create the order (this validates the input tokens and amounts).
        let order = OrderNote::new(
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
}
