mod config;
mod order;

use aztec::macros::aztec;

/// ## Overview
/// This contract demonstrates how to implement an **Orderbook** that maintains **public state**
/// while still achieving **identity privacy**. However, it does **not provide function privacy**:
/// - Anyone can observe **what actions** were performed.
/// - All amounts involved are visible, but **who** performed the action remains private.
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
/// - All operations will be fully executed in **public** without needing intermediate checks.
///
/// ### 2. Public Functions:
/// No **reentrancy guard** is required for public functions because:
/// - All public functions are marked as **internal** with a **single callsite** - from a private function.
/// - Public functions **cannot call private functions**, eliminating the risk of reentering into them from private.
/// - Since public functions are internal-only, **external contracts cannot access them**, ensuring no external
///   contract can trigger a reentrant call. This eliminates the following attack vector:
///   `Orderbook.private_fn --> Orderbook.public_fn --> ExternalContract.fn --> Orderbook.public_fn`.
#[aztec]
pub contract Orderbook {
    use crate::{config::Config, order::Order};
    use aztec::{
        event::event_interface::emit_event_in_public_log,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility},
            storage::storage,
        },
        oracle::notes::check_nullifier_exists,
        protocol_types::{address::AztecAddress, traits::{FromField, ToField}},
        state_vars::{Map, PublicImmutable},
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

        // Prepare a partial note that will get completed once the order is fulfilled. Note that only the Orderbook
        // contract can complete the partial note.
        let maker_partial_note =
            Token::at(ask_token).prepare_private_balance_increase(maker, maker).call(&mut context);

        // We use the partial note's as the order ID. Because partial notes emit a nullifier when created they are
        // unique, and so this guarantees that our order IDs are also unique without having to keep track of past
        // ones.
        let order_id = maker_partial_note.to_field();

        // Store the order in public storage and emit an event.
        Orderbook::at(context.this_address())._create_order(order_id, order).enqueue(&mut context);

        order_id
    }

    #[public]
    #[internal]
    fn _create_order(order_id: Field, order: Order) {
        // Note that PublicImmutable can be initialized only once so this is a secondary check that the order is
        // unique.
        storage.orders.at(order_id).initialize(order);

        emit_event_in_public_log(OrderCreated { order_id }, &mut context);
    }

    /// Privately fulfills an existing order in the orderbook
    /// The taker provides the order ID they want to fulfill
    #[private]
    fn fulfill_order(order_id: Field, authwit_nonce: Field) {
        let config = storage.config.read();
        let order = storage.orders.at(order_id).read();
        let taker = context.msg_sender();

        // Determine which tokens are being exchanged based on bid_token_is_zero flag
        let (bid_token, ask_token) = config.get_tokens(order.bid_token_is_zero);

        // The `order_id` is a serialized form of the maker's partial note.
        let maker_partial_note = PartialUintNote::from_field(order_id);

        // Transfer the ask_amount from taker directly to the maker's partial note.
        Token::at(ask_token)
            .finalize_transfer_to_private_from_private(
                taker,
                maker_partial_note,
                order.ask_amount,
                authwit_nonce,
            )
            .call(&mut context);

        // Prepare partial note for taker to receive bid_token
        let taker_partial_note =
            Token::at(bid_token).prepare_private_balance_increase(taker, taker).call(&mut context);

        // Nullify the order such that it cannot be fulfilled again. We emit a nullifier instead of deleting the order
        // from public storage because we get no refund for resetting public storage to zero and just emitting
        // a nullifier is cheaper (1 Field in DA instead of multiple Fields for the order). We use the `order_id`
        // itself as the nullifier because this contract does not work with notes and hence there is no risk of
        // colliding with a real note nullifier.
        context.push_nullifier(order_id);

        // Enqueue the fulfillment to finalize both partial notes
        Orderbook::at(context.this_address())
            ._fulfill_order(order_id, taker_partial_note, bid_token, order.bid_amount)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _fulfill_order(
        order_id: Field,
        taker_partial_note: PartialUintNote,
        bid_token: AztecAddress,
        bid_amount: u128,
    ) {
        // Finalize transfer of bid_amount of bid_token to taker
        Token::at(bid_token).finalize_transfer_to_private(bid_amount, taker_partial_note).call(
            &mut context,
        );

        emit_event_in_public_log(OrderFulfilled { order_id }, &mut context);
    }

    /// Returns the order and whether it has been fulfilled.
    #[utility]
    unconstrained fn get_order(order_id: Field) -> pub (Order, bool) {
        let order = storage.orders.at(order_id).read();
        let is_fulfilled = check_nullifier_exists(order_id);

        (order, is_fulfilled)
    }
}
