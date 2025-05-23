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
        event::event_interface::EventInterface,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility},
            storage::storage,
        },
        prelude::{AztecAddress, Map, PublicImmutable},
        protocol_types::traits::{Serialize, ToField},
        unencrypted_logs::unencrypted_event_emission::encode_event,
    };

    use token::Token;
    use uint_note::uint_note::PartialUintNote;

    // The event contains only the `order_id` as the order itself can be retrieved via the `get_order` function.
    #[derive(Serialize)]
    #[event]
    struct OrderCreated {
        order_id: PartialUintNote,
    }

    #[derive(Serialize)]
    #[event]
    struct OrderFulfilled {
        order_id: PartialUintNote,
    }

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        orders: Map<PartialUintNote, PublicImmutable<Order, Context>, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(token0: AztecAddress, token1: AztecAddress) {
        storage.config.initialize(Config { token0, token1 });
    }

    /// Privately creates a new order in the orderbook
    /// The maker specifies the tokens and amounts they want to trade
    #[private]
    fn create_order(
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in: u128,
        amount_out: u128,
        nonce: Field,
    ) {
        let config = storage.config.read();

        assert((token_in == config.token0) | (token_in == config.token1), "TOKEN_IN_IS_INVALID");
        assert((token_out == config.token0) | (token_out == config.token1), "TOKEN_OUT_IS_INVALID");
        assert(token_in != token_out, "SAME_TOKEN_TRADE");
        assert(amount_in > 0 as u128, "ZERO_AMOUNT_IN");
        assert(amount_out > 0 as u128, "ZERO_AMOUNT_OUT");

        let maker = context.msg_sender();

        // Transfer tokens from maker to the public balance of this contract
        Token::at(token_in)
            .transfer_to_public(maker, context.this_address(), amount_in, nonce)
            .call(&mut context);

        // Prepare a partial note that will get completed once the order is fulfilled.
        let maker_partial_note =
            Token::at(token_out).prepare_private_balance_increase(maker, maker).call(&mut context);

        // Create the order and store it in public storage
        let order = Order { amount_in, amount_out, zero_to_one: token_in == config.token0 };

        Orderbook::at(context.this_address())._create_order(maker_partial_note, order).enqueue(
            &mut context,
        );
    }

    #[public]
    #[internal]
    fn _create_order(order_id: PartialUintNote, order: Order) {
        // The partial note serves as a natural unique identifier for the order. While a maker could theoretically
        // create duplicate order IDs by manipulating the randomness, this would be self-defeating - only one order
        // with a given ID can be fulfilled, meaning any duplicates would result in the maker's tokens being
        // irretrievably locked in the public balance of this contract.
        storage.orders.at(order_id).initialize(order);

        OrderCreated { order_id }.emit(encode_event(&mut context));
    }

    /// Privately fulfills an existing order in the orderbook
    /// The taker provides the order ID they want to fulfill
    #[private]
    fn fulfill_order(order_id: PartialUintNote, nonce: Field) {
        let config = storage.config.read();
        let order = storage.orders.at(order_id).read();
        let taker = context.msg_sender();

        // Determine which tokens are being exchanged based on zero_to_one flag
        let (token_in, token_out) = if order.zero_to_one {
            (config.token0, config.token1)
        } else {
            (config.token1, config.token0)
        };

        // Transfer the amount_out from taker to the contract
        Token::at(token_out)
            .transfer_to_public(taker, context.this_address(), order.amount_out, nonce)
            .call(&mut context);

        // Prepare partial note for taker to receive token_in
        let taker_partial_note =
            Token::at(token_in).prepare_private_balance_increase(taker, taker).call(&mut context);

        // Nullify the order such that it cannot be fulfilled again. We emit a nullifier instead of deleting the order
        // from public storage because we get no refund for resetting public storage to zero and just emitting
        // a nullifier is cheaper (1 Field in DA instead of multiple Fields for the order). We use the `order_id`
        // itself as the nullifier because this contract does not work with notes and hence there is no risk of
        // colliding with a real note nullifier.
        //
        // It's worth noting that since nullifier information is public, a malicious actor could potentially frontrun
        // the taker's transaction. While this vulnerability exists in this simplified demonstration, a production
        // implementation would typically employ a privileged matchmaker service to securely pair makers and takers,
        // thereby ensuring order execution integrity.
        context.push_nullifier(order_id.to_field());

        // Enqueue the fulfillment to finalize both partial notes
        Orderbook::at(context.this_address())
            ._fulfill_order(
                order_id,
                taker_partial_note,
                token_in,
                token_out,
                order.amount_in,
                order.amount_out,
            )
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _fulfill_order(
        order_id: PartialUintNote, // maker partial note is used as `order_id`
        taker_partial_note: PartialUintNote,
        token_in: AztecAddress,
        token_out: AztecAddress,
        amount_in: u128,
        amount_out: u128,
    ) {
        // Finalize transfer of amount_out of token_out to maker
        Token::at(token_out).finalize_transfer_to_private(amount_out, order_id).call(&mut context);

        // Finalize transfer of of amount_in of token_in to taker
        Token::at(token_in).finalize_transfer_to_private(amount_in, taker_partial_note).call(
            &mut context,
        );

        OrderFulfilled { order_id }.emit(encode_event(&mut context));
    }

    #[utility]
    unconstrained fn get_order(order_id: PartialUintNote) -> pub Order {
        storage.orders.at(order_id).read()
    }
}
