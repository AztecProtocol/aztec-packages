// docs:start:empty-contract
mod config;

use dep::aztec::macros::aztec;

#[aztec]
pub contract Crowdfunding {
    // docs:end:empty-contract
    // docs:start:all-deps
    use crate::config::Config;
    use dep::aztec::{
        event::event_interface::emit_event_in_public_log,
        macros::{
            events::event,
            functions::{initializer, internal, private, public},
            storage::storage,
        },
        messages::logs::note::encode_and_encrypt_note,
        protocol_types::address::AztecAddress,
        state_vars::{PrivateSet, PublicImmutable},
        utils::comparison::Comparator,
    };
    use dep::uint_note::uint_note::UintNote;
    use router::utils::privately_check_timestamp;
    use token::Token;
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
        let donor = context.msg_sender();
        Token::at(config.donation_token)
            .transfer_in_private(donor, context.this_address(), amount, 0)
            .call(&mut context);
        // docs:end:do-transfer

        // 3) Create a value note for the donor so that he can later on claim a rewards token in the Claim
        // contract by proving that the hash of this note exists in the note hash tree.
        let note = UintNote::new(amount, donor);

        storage.donation_receipts.insert(note).emit(encode_and_encrypt_note(
            &mut context,
            donor,
            donor,
        ));
    }
    // docs:end:donate

    // docs:start:operator-withdrawals
    // Withdraws balance to the operator. Requires that msg_sender() is the operator.
    #[private]
    fn withdraw(amount: u128) {
        let config = storage.config.read();
        let operator_address = config.operator;

        // 1) Check that msg_sender() is the operator
        assert(context.msg_sender() == operator_address, "Not an operator");

        // 2) Transfer the donation tokens from this contract to the operator
        Token::at(config.donation_token).transfer(operator_address, amount).call(&mut context);
        // 3) Emit a public event so that anyone can audit how much the operator has withdrawn
        Crowdfunding::at(context.this_address())
            ._publish_donation_receipts(amount, operator_address)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _publish_donation_receipts(amount: u128, to: AztecAddress) {
        emit_event_in_public_log(WithdrawalProcessed { amount, who: to }, &mut context);
    }
    // docs:end:operator-withdrawals
}
