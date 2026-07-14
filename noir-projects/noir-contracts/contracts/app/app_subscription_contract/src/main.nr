mod config;
mod subscription_note;
mod dapp_payload;

use aztec::macros::aztec;

/// # AppSubscription Contract
///
/// A contract that acts as a gateway for users to access other smart contracts through a subscription-based model.
/// This contract implements a pay-per-use system where users pay a subscription fee to gain access to a target
/// contract for a limited number of transactions within a specified time period.
///
/// ## Architecture Overview
///
/// The AppSubscription contract serves as an intermediary between users and a target contract. It:
/// - Manages user subscriptions with transaction limits and expiration blocks
/// - Handles subscription payments in a specified token
/// - Provides an entrypoint that validates subscriptions before forwarding calls to the target contract
/// - Implements fee management and gas limit controls
///
/// ## Key Components
///
/// ### Storage
/// - `config`: Public immutable configuration containing contract addresses, subscription price, and gas limits
/// - `subscriptions`: Private map storing subscription notes for each user address
///
/// ### Core Functions
/// - `entrypoint()`: Main gateway function that validates subscriptions and forwards calls to target contract
/// - `subscribe()`: Allows users to purchase subscriptions with transaction limits and expiration
/// - `constructor()`: Initializes the contract with configuration parameters
/// - `is_initialized()`: Utility function to check if a user has an active subscription
///
/// ## Usage Pattern
///
/// 1. **Contract Deployment**: Deploy with target contract address, recipient address, token address, price, and gas
/// limits
/// 2. **User Subscription**: Users call `subscribe()` with payment and subscription parameters
/// 3. **DApp Interface**: Users interact with target contracts through `DefaultDappInterface`
/// 4. **Entrypoint Validation**: Each call goes through `entrypoint()` which validates subscription status
/// 5. **Call Forwarding**: Valid calls are forwarded to the target contract with proper fee handling

#[aztec]
pub contract AppSubscription {
    use crate::{config::Config, dapp_payload::DAppPayload, subscription_note::SubscriptionNote};

    use aztec::{
        authwit::auth::assert_current_call_valid_authwit,
        macros::{functions::{allow_phase_change, external, initializer}, storage::storage},
        messages::delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateMutable, PublicImmutable},
        utils::comparison::Comparator,
    };
    use aztec::public_checks::privately_check_block_number;
    use token::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        // docs:start:owned_private_mutable
        subscriptions: Owned<PrivateMutable<SubscriptionNote, Context>, Context>,
        // docs:end:owned_private_mutable
    }

    global SUBSCRIPTION_DURATION_IN_BLOCKS: u32 = 5;
    global SUBSCRIPTION_TXS: u32 = 5;

    #[external("private")]
    #[allow_phase_change]
    fn entrypoint(payload: DAppPayload, user_address: AztecAddress) {
        assert_current_call_valid_authwit::<2>(self.context, user_address);

        let user_expiry_block_number = &mut 0;
        // We use the user address as the sender for tags so the user's PXE can find the notes without
        // having to register this contract as a sender.
        self
            .storage
            .subscriptions
            .at(user_address)
            .replace(|note| {
                assert(note.remaining_txs > 0, "you're out of txs");
                *user_expiry_block_number = note.expiry_block_number;

                SubscriptionNote {
                    expiry_block_number: note.expiry_block_number,
                    remaining_txs: note.remaining_txs - 1,
                }
            })
            .deliver(MessageDelivery::onchain_constrained().with_sender(user_address));

        self.context.set_as_fee_payer();

        let config = self.storage.config.read();

        // TODO(palla/gas) Assert fee_juice_limit_per_tx is less than this tx gas_limit
        let _gas_limit = config.fee_juice_limit_per_tx;

        self.context.end_setup();

        // We check that the note is not expired. We do that via the public checks contract to conceal which contract
        // is performing the check.
        privately_check_block_number(Comparator.LT, *user_expiry_block_number, self.context);

        payload.execute_calls(self.context, config.target_address);
    }

    #[external("public")]
    #[initializer]
    fn constructor(
        target_address: AztecAddress,
        subscription_recipient_address: AztecAddress,
        subscription_token_address: AztecAddress,
        subscription_price: u128,
        fee_juice_limit_per_tx: Field,
    ) {
        self.storage.config.initialize(
            Config {
                target_address,
                subscription_recipient_address,
                subscription_token_address,
                subscription_price,
                fee_juice_limit_per_tx,
            },
        );
    }

    #[external("private")]
    fn subscribe(subscriber: AztecAddress, authwit_nonce: Field, expiry_block_number: u32, tx_count: u32) {
        assert(tx_count <= SUBSCRIPTION_TXS);

        let config = self.storage.config.read();

        self.call(Token::at(config.subscription_token_address).transfer_in_private(
            self.msg_sender(),
            config.subscription_recipient_address,
            config.subscription_price,
            authwit_nonce,
        ));

        // Assert that the `current_block_number > expiry_block_number - SUBSCRIPTION_DURATION_IN_BLOCKS`.
        // --> We do that via the public checks contract to conceal which contract is performing the check.
        privately_check_block_number(
            Comparator.GT,
            expiry_block_number - SUBSCRIPTION_DURATION_IN_BLOCKS,
            self.context,
        );
        // docs:start:owned_private_mutable_initialize
        self
            .storage
            .subscriptions
            .at(subscriber)
            .initialize_or_replace(|_| SubscriptionNote { expiry_block_number, remaining_txs: tx_count })
            .deliver(MessageDelivery::onchain_constrained());
        // docs:end:owned_private_mutable_initialize
    }

    // docs:start:owned_private_mutable_is_initialized
    #[external("utility")]
    unconstrained fn is_initialized(subscriber: AztecAddress) -> bool {
        self.storage.subscriptions.at(subscriber).is_initialized()
    }
    // docs:end:owned_private_mutable_is_initialized
}
