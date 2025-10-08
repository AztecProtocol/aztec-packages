use dep::aztec::macros::aztec;

#[aztec]
pub contract Claim {
    use dep::aztec::{
        history::note_inclusion::ProveNoteInclusion,
        macros::{functions::{initializer, private, public}, storage::storage},
        note::{
            note_interface::NoteHash, retrieved_note::RetrievedNote,
            utils::compute_note_hash_for_nullification,
        },
        protocol_types::{address::AztecAddress, storage::map::derive_storage_slot_in_map},
        state_vars::PublicImmutable,
    };
    use dep::uint_note::uint_note::UintNote;
    use crowdfunding::Crowdfunding;
    use token::Token;

    // TODO: This can be optimized by storing the addresses in Config struct in 1 PublicImmutable (less merkle proofs).
    #[storage]
    struct Storage<Context> {
        // Address of a contract based on whose notes we distribute the rewards
        target_contract: PublicImmutable<AztecAddress, Context>,
        // Token to be distributed as a reward when claiming
        reward_token: PublicImmutable<AztecAddress, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(target_contract: AztecAddress, reward_token: AztecAddress) {
        storage.target_contract.initialize(target_contract);
        storage.reward_token.initialize(reward_token);
    }

    #[private]
    fn claim(proof_retrieved_note: RetrievedNote<UintNote>, recipient: AztecAddress) {
        // 1) Check that the note corresponds to the target contract and belongs to the sender
        let target_address = storage.target_contract.read();
        let owner = proof_retrieved_note.note.get_owner();
        assert(
            target_address == proof_retrieved_note.contract_address,
            "Note does not correspond to the target contract",
        );
        assert_eq(owner, context.msg_sender(), "Note does not belong to the sender");

        // 2) Prove that the note hash exists in the note hash tree
        // Note: The note has been inserted into the donation_receipts set in a map under the owner address in
        // the Crowdfunding contract.
        let note_storage_slot = derive_storage_slot_in_map(
            Crowdfunding::storage_layout().donation_receipts.slot,
            owner,
        );
        let header = context.get_anchor_block_header();
        header.prove_note_inclusion(proof_retrieved_note, note_storage_slot);

        // 3) Compute and emit a nullifier which is unique to the note and this contract to ensure the reward can be
        // claimed only once with the given note.
        // Note: Only the owner of the npk_m will be able to produce the nsk_app and compute this nullifier.
        // The nullifier is unique to the note and THIS contract because the protocol siloes all nullifiers with
        // the address of a contract it was emitted from.
        // TODO(#7775): manually computing the hash and passing it to compute_nullifier func is not great as note could
        // handle it on its own or we could make prove_note_inclusion return note_hash_for_nullification.
        let note_hash_for_nullification =
            compute_note_hash_for_nullification(proof_retrieved_note, note_storage_slot);
        let nullifier =
            proof_retrieved_note.note.compute_nullifier(&mut context, note_hash_for_nullification);
        context.push_nullifier(nullifier);

        // 4) Finally we mint the reward token to the sender of the transaction
        Token::at(storage.reward_token.read())
            .mint_to_public(recipient, proof_retrieved_note.note.get_value())
            .enqueue(&mut context);
    }
}
