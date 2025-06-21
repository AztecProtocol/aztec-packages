mod config;
mod order;

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
    use crate::{config::Config, order::Order};
    use aztec::{
        event::event_interface::emit_event_in_public_log,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility},
            storage::storage,
        },
        oracle::notes::check_nullifier_exists,
        prelude::{AztecAddress, Map, PublicImmutable},
        protocol_types::traits::{FromField, ToField},
    };

    use token::Token;
    use uint_note::uint_note::PartialUintNote;

    // The event contains only the `order_id` as the order itself can be retrieved via the `get_order` function.
    #[event]
    struct OrderCreated {
        order_id: Field,
    }

    #[event]
    struct OrderFulfilled {
        order_id: Field,
    }

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        orders: Map<Field, PublicImmutable<Order, Context>, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress) {
        storage.config.initialize(Config::new(token0, token1));
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
        let config = storage.config.read();

        // Create the order (this validates the input tokens and amounts).
        let order = Order::new(config, bid_amount, ask_amount, bid_token, ask_token);

        let maker = context.msg_sender();

        // Transfer tokens from maker to the public balance of this contract.
        Token::at(bid_token)
            .transfer_to_public(maker, context.this_address(), bid_amount, authwit_nonce)
            .call(&mut context);

        // Prepare a partial note that will get completed once the order is fulfilled. Note that only the ClosedSetOrderbook
        // contract can complete the partial note.
        let maker_partial_note =
            Token::at(ask_token).prepare_private_balance_increase(maker, maker).call(&mut context);

        // We use the partial note's as the order ID. Because partial notes emit a nullifier when created they are
        // unique, and so this guarantees that our order IDs are also unique without having to keep track of past
        // ones.
        let order_id = maker_partial_note.to_field();

        // Store the order in public storage and emit an event.
        ClosedSetOrderbook::at(context.this_address())._create_order(order_id, order).enqueue(
            &mut context,
        );

        order_id
    }
}
