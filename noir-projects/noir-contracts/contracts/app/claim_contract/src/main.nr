use aztec::macros::aztec;

#[aztec]
pub contract Claim {
    // docs:start:history_import
    use aztec::history::note::assert_note_existed_by;
    // docs:end:history_import
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        note::{HintedNote, utils::compute_confirmed_note_hash_for_nullification},
        protocol::{address::AztecAddress, traits::Packable},
        state_vars::{Map, Owned, PublicImmutable, SingleUseClaim},
    };
    use token::Token;
    use uint_note::UintNote;

    #[derive(Eq, Packable)]
    struct ClaimConfig {
        // Address of a contract based on whose notes we distribute the rewards
        target_contract: AztecAddress,
        // Token to be distributed as a reward when claiming
        reward_token: AztecAddress,
    }

    #[storage]
    struct Storage {
        config: PublicImmutable<ClaimConfig>,
        // Maps a note hash to owner-specific single-use claims, preventing double-claiming of rewards.
        note_hash_claims: Map<Field, Owned<SingleUseClaim>>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(target_contract: AztecAddress, reward_token: AztecAddress) {
        self.storage.config.initialize(ClaimConfig { target_contract, reward_token });
    }

    #[external("private")]
    fn claim(hinted_note: HintedNote<UintNote>, recipient: AztecAddress) {
        // 1) Prove that the note exists
        // docs:start:prove_note_inclusion
        let header = self.context.get_anchor_block_header();
        let confirmed_note = assert_note_existed_by(header, hinted_note);
        // docs:end:prove_note_inclusion

        let config = self.storage.config.read();

        // 2) Check that the note corresponds to the target contract
        assert(
            config.target_contract == confirmed_note.contract_address,
            "Note does not correspond to the target contract",
        );

        // 3) Check that the note is owned by the msg_sender
        assert(confirmed_note.owner == self.msg_sender(), "Note is not owned by the msg_sender");

        // Given that there is only 1 state variable in the Crowdfunding contract we don't need to constrain the storage
        // slot of the note as there is no risk of claiming with a note that is not a donation note.

        // 4) Consume the claim of this note, ensuring the reward can be claimed only once with the given note. Each
        // claim being tied to its owner results in unlinkability of the claim's nullifier and the underlying note
        // hash via the owner's nullifier hiding key (`nhk`).
        //
        // Note: we're using the note's hash as the claim identifier, as it serves as a unique identifier (because we
        // know the note is settled, and hence its note hash unique). This is not the same thing as nullifying the note
        // however, which can only be done from the contract that emitted the note. From the point of view of the
        // Crowdfunding contract, the note is still active.
        let note_hash_for_nullification = compute_confirmed_note_hash_for_nullification(confirmed_note);
        self.storage.note_hash_claims.at(note_hash_for_nullification).at(confirmed_note.owner).claim();

        // 5) Finally we mint the reward token to the requested recipient
        self.enqueue(Token::at(config.reward_token).mint_to_public(recipient, confirmed_note.note.value));
    }
}
