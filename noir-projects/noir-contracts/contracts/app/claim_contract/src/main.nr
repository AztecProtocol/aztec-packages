use dep::aztec::macros::aztec;

#[aztec]
pub contract Claim {
    // docs:start:history_import
    use dep::aztec::history::note_inclusion::ProveNoteInclusion;
    // docs:end:history_import
    use dep::aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        note::{
            note_interface::NoteHash, retrieved_note::RetrievedNote,
            utils::compute_note_hash_for_nullification,
        },
        protocol_types::address::AztecAddress,
        state_vars::PublicImmutable,
    };
    use dep::uint_note::uint_note::UintNote;
    use token::Token;

    // TODO: This can be optimized by storing the addresses in Config struct in 1 PublicImmutable (less merkle proofs).
    #[storage]
    struct Storage<Context> {
        // Address of a contract based on whose notes we distribute the rewards
        target_contract: PublicImmutable<AztecAddress, Context>,
        // Token to be distributed as a reward when claiming
        reward_token: PublicImmutable<AztecAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(target_contract: AztecAddress, reward_token: AztecAddress) {
        self.storage.target_contract.initialize(target_contract);
        self.storage.reward_token.initialize(reward_token);
    }

    #[external("private")]
    fn claim(proof_retrieved_note: RetrievedNote<UintNote>, recipient: AztecAddress) {
        // 1) Check that the note corresponds to the target contract
        let target_address = self.storage.target_contract.read();
        assert(
            target_address == proof_retrieved_note.contract_address,
            "Note does not correspond to the target contract",
        );

        // 2) Check that the note is owned by the msg_sender
        assert(
            proof_retrieved_note.owner == self.msg_sender(),
            "Note is not owned by the msg_sender",
        );

        // Given that there is only 1 state variable in the Crowdfunding contract we don't need to constrain the storage
        // slot of the note as there is no risk of claiming with a note that is not a donation note.

        // 3) Prove that the note hash exists in the note hash tree
        // docs:start:prove_note_inclusion
        let header = self.context.get_anchor_block_header();
        header.prove_note_inclusion(proof_retrieved_note);
        // docs:end:prove_note_inclusion

        // 4) Compute and emit a nullifier which is unique to the note and this contract to ensure the reward can be
        // claimed only once with the given note.
        // Note: Only the owner of the npk_m will be able to produce the nsk_app and compute this nullifier.
        // The nullifier is unique to the note and THIS contract because the protocol siloes all nullifiers with
        // the address of a contract it was emitted from.
        // TODO(#7775): manually computing the hash and passing it to compute_nullifier func is not great as note could
        // handle it on its own or we could make prove_note_inclusion return note_hash_for_nullification.
        let note_hash_for_nullification = compute_note_hash_for_nullification(proof_retrieved_note);
        let nullifier = proof_retrieved_note.note.compute_nullifier(
            self.context,
            proof_retrieved_note.owner,
            note_hash_for_nullification,
        );
        self.context.push_nullifier(nullifier);

        // 5) Finally we mint the reward token to the sender of the transaction
        self.enqueue(Token::at(self.storage.reward_token.read()).mint_to_public(
            recipient,
            proof_retrieved_note.note.value,
        ));
    }
}
