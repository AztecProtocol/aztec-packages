// docs:start:empty-contract
use dep::aztec::macros::aztec;

#[aztec]
contract Crowdfunding {
    // docs:end:empty-contract

    // docs:start:all-deps
    use dep::aztec::{
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        macros::{
            events::event,
            functions::{initializer, internal, private, public},
            storage::storage,
        },
        prelude::{AztecAddress, PrivateSet, PublicImmutable},
        protocol_types::traits::Serialize,
        unencrypted_logs::unencrypted_event_emission::encode_event,
        utils::comparison::Comparator,
    };
    use std::meta::derive;
    // docs:start:import_valuenote
    use dep::value_note::value_note::ValueNote;
    // docs:end:import_valuenote
    use router::utils::privately_check_timestamp;
    use token::Token;
    // docs:end:all-deps

    #[derive(Serialize)]
    #[event]
    struct WithdrawalProcessed {
        who: AztecAddress,
        amount: U128,
    }

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        // Token used for donations (e.g. DAI)
        donation_token: PublicImmutable<AztecAddress, Context>,
        // Crowdfunding campaign operator
        operator: PublicImmutable<AztecAddress, Context>,
        // End of the crowdfunding campaign after which no more donations are accepted
        deadline: PublicImmutable<u64, Context>,
        // Notes emitted to donors when they donate (can be used as proof to obtain rewards, eg in Claim contracts)
        donation_receipts: PrivateSet<ValueNote, Context>,
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
        storage.donation_token.initialize(donation_token);
        storage.operator.initialize(operator);
        storage.deadline.initialize(deadline);
    }
    // docs:end:init

    // docs:start:donate
    #[private]
    fn donate(amount: U128) {
        // 1) Check that the deadline has not passed --> we do that via the router contract to conceal which contract
        // is performing the check.
        // docs:start:call-check-deadline
        let deadline = storage.deadline.read();
        privately_check_timestamp(Comparator.LT, deadline, &mut context);
        // docs:end:call-check-deadline
        // docs:start:do-transfer
        // 2) Transfer the donation tokens from donor to this contract
        let donor = context.msg_sender();
        Token::at(storage.donation_token.read())
            .transfer_in_private(donor, context.this_address(), amount, 0)
            .call(&mut context);
        // docs:end:do-transfer
        // 3) Create a value note for the donor so that he can later on claim a rewards token in the Claim
        // contract by proving that the hash of this note exists in the note hash tree.
        // docs:start:valuenote_new
        // TODO(benesjan): Instead of ValueNote use UintNote to avoid the conversion to a Field below.
        let mut note = ValueNote::new(amount.to_field(), donor);

        // docs:end:valuenote_new
        storage.donation_receipts.insert(&mut note).emit(encode_and_encrypt_note(
            &mut context,
            donor,
            donor,
        ));
    }
    // docs:end:donate

    // docs:start:operator-withdrawals
    // Withdraws balance to the operator. Requires that msg_sender() is the operator.
    #[private]
    fn withdraw(amount: U128) {
        // 1) Check that msg_sender() is the operator
        let operator_address = storage.operator.read();
        assert(context.msg_sender() == operator_address, "Not an operator");

        // 2) Transfer the donation tokens from this contract to the operator
        Token::at(storage.donation_token.read()).transfer(operator_address, amount).call(
            &mut context,
        );
        // 3) Emit a public event so that anyone can audit how much the operator has withdrawn
        Crowdfunding::at(context.this_address())
            ._publish_donation_receipts(amount, operator_address)
            .enqueue(&mut context);
    }
    // docs:end:operator-withdrawals

    #[public]
    #[internal]
    fn _publish_donation_receipts(amount: U128, to: AztecAddress) {
        WithdrawalProcessed { amount, who: to }.emit(encode_event(&mut context));
    }
}
