// docs:start:empty-contract
mod config;

use aztec::macros::aztec;

#[aztec]
pub contract Crowdfunding {
    // docs:end:empty-contract
    // docs:start:all-deps
    use crate::config::Config;
    use aztec::{
        macros::{
            events::event,
            functions::{initializer, internal, private, public},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{PrivateSet, PublicImmutable},
        utils::comparison::Comparator,
    };
    use router::utils::privately_check_timestamp;
    use token::Token;
    use uint_note::uint_note::UintNote;
    // docs:end:all-deps

    // docs:start:withdrawal-processed-event
    #[event]
    struct WithdrawalProcessed {
        who: AztecAddress,
        amount: u128,
    }
    // docs:end:withdrawal-processed-event
    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        // Notes emitted to donors when they donate (can be used as proof to obtain rewards, eg in Claim contracts)
        donation_receipts: PrivateSet<UintNote, Context>,
    }
    // docs:end:storage

    // TODO(#8367): Ensure deadline is quantized to improve privacy set.
    // docs:start:init
    // docs:start:init-header
    // docs:start:init-header-error
    #[public]
    #[initializer]
    // this-will-error:init-header-error
    fn init(donation_token: AztecAddress, operator: AztecAddress, deadline: u64) {
        // docs:end:init-header
        // docs:end:init-header-error
        storage.config.initialize(Config { donation_token, operator, deadline });
    }
    // docs:end:init

    // docs:start:donate
    #[private]
    fn donate(amount: u128) {
        let config = storage.config.read();

        // 1) Check that the deadline has not passed --> we do that via the router contract to conceal which contract
        // is performing the check.
        // docs:start:call-check-deadline
        privately_check_timestamp(Comparator.LT, config.deadline, &mut context);
        // docs:end:call-check-deadline

        // docs:start:do-transfer
        // 2) Transfer the donation tokens from donor to this contract
        let donor = self.msg_sender();
        self.call(Token::at(config.donation_token).transfer_in_private(
            donor,
            self.address(),
            amount,
            0,
        ));
        // docs:end:do-transfer

        // 3) Create a value note for the donor so that he can later on claim a rewards token in the Claim
        // contract by proving that the hash of this note exists in the note hash tree.
        let note = UintNote::new(amount, donor);

        storage.donation_receipts.insert(note).emit(
            &mut context,
            donor,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }
    // docs:end:donate

    // docs:start:operator-withdrawals
    // Withdraws balance to the operator. Requires that msg_sender() is the operator.
    #[private]
    fn withdraw(amount: u128) {
        let config = storage.config.read();
        let operator_address = config.operator;

        // 1) Check that msg_sender() is the operator
        assert(self.msg_sender() == operator_address, "Not an operator");

        // 2) Transfer the donation tokens from this contract to the operator
        self.call(Token::at(config.donation_token).transfer(operator_address, amount));
        // 3) Emit a public event so that anyone can audit how much the operator has withdrawn
        Crowdfunding::at(self.address())
            ._publish_donation_receipts(amount, operator_address)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _publish_donation_receipts(amount: u128, to: AztecAddress) {
        self.emit_event(WithdrawalProcessed { amount, who: to });
    }
    // docs:end:operator-withdrawals
}
