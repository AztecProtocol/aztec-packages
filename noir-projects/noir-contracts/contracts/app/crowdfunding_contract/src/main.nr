mod config;

use aztec::macros::aztec;

#[aztec]
pub contract Crowdfunding {
    use crate::config::Config;
    use aztec::{
        event::event_emission::emit_event_in_public,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Map, PrivateSet, PublicImmutable, storage::HasStorageSlot},
        utils::{array, comparison::Comparator},
    };
    use aztec::note::{
        constants::MAX_NOTES_PER_PAGE, note_getter_options::NoteStatus,
        retrieved_note::RetrievedNote,
    };
    use router::utils::privately_check_timestamp;
    use token::Token;
    use uint_note::uint_note::UintNote;

    #[event]
    struct WithdrawalProcessed {
        who: AztecAddress,
        amount: u128,
    }
    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        // Notes emitted to donors when they donate (can be used as proof to obtain rewards, eg in Claim contracts)
        donation_receipts: Map<AztecAddress, PrivateSet<UintNote, Context>, Context>,
    }
    // docs:end:storage

    // TODO(#8367): Ensure deadline is quantized to improve privacy set.
    #[public]
    #[initializer]
    // this-will-error:init-header-error
    fn init(donation_token: AztecAddress, operator: AztecAddress, deadline: u64) {
        storage.config.initialize(Config { donation_token, operator, deadline });
    }

    #[private]
    fn donate(amount: u128) {
        let config = storage.config.read();

        // 1) Check that the deadline has not passed --> we do that via the router contract to conceal which contract
        // is performing the check.
        // docs:start:call-check-deadline
        privately_check_timestamp(Comparator.LT, config.deadline, &mut context);
        // docs:end:call-check-deadline

        // 2) Transfer the donation tokens from donor to this contract
        let donor = context.msg_sender();
        Token::at(config.donation_token)
            .transfer_in_private(donor, context.this_address(), amount, 0)
            .call(&mut context);

        // 3) Create a value note for the donor so that he can later on claim a rewards token in the Claim
        // contract by proving that the hash of this note exists in the note hash tree.
        let note = UintNote::new(amount, donor);

        // We don't constrain encryption because the donor is sending the note to himself. And hence by performing
        // encryption incorrectly would harm himself only.
        storage.donation_receipts.at(donor).insert(note).emit(
            &mut context,
            donor,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );
    }

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
        emit_event_in_public(WithdrawalProcessed { amount, who: to }, &mut context);
    }

    #[utility]
    unconstrained fn get_donation_notes(
        donor: AztecAddress,
        page_index: u32,
    ) -> BoundedVec<RetrievedNote<UintNote>, MAX_NOTES_PER_PAGE> {
        let storage_slot = storage.donation_receipts.at(donor).get_storage_slot();

        // We bypass Aztec.nr's higher-level abstractions here to access the metadata available only in RetrievedNote
        // type that is not returned by view_notes function. We on the other hand need this metadata because we will
        // be proving the note existence in the Claim contract.
        let opt_notes = aztec::oracle::notes::get_notes(
            storage_slot,
            0,
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            MAX_NOTES_PER_PAGE,
            page_index * MAX_NOTES_PER_PAGE,
            NoteStatus.ACTIVE,
        );

        array::collapse(opt_notes)
    }
}
