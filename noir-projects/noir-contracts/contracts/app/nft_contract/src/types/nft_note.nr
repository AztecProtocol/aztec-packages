use dep::aztec::{
    context::{PrivateContext, PublicContext},
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::custom_note,
    messages::logs::note,
    note::note_interface::{NoteHash, NoteType},
    oracle::random::random,
    protocol_types::{
        address::AztecAddress,
        constants::{
            GENERATOR_INDEX__NOTE_HASH, GENERATOR_INDEX__NOTE_NULLIFIER,
            GENERATOR_INDEX__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        },
        hash::poseidon2_hash_with_separator,
        traits::{Deserialize, Hash, Packable, Serialize, ToField},
    },
};

// NFTNote supports partial notes, i.e. the ability to create an incomplete note in private, hiding certain values (the
// owner, storage slot and randomness), and then completing the note in public with the ones missing (the token id).
// Partial notes are being actively developed and are not currently fully supported via macros, and so we rely on the
// #[custom_note] macro to implement it manually, resulting in some boilerplate. This is expected to be unnecessary once
// macro support is expanded.

// docs:start:nft_note
/// A private note representing a token id associated to an account.
#[custom_note]
#[derive(Eq, Serialize)]
pub struct NFTNote {
    // The ordering of these fields is important given that it must:
    //   a) match that of NFTPartialNotePrivateContent, and
    //   b) have the public field at the end
    // Correct ordering is checked by the tests in this module.

    /// The owner of the note, i.e. the account whose nullifier secret key is required to compute the nullifier.
    owner: AztecAddress,
    /// Random value, protects against note hash preimage attacks.
    randomness: Field,
    /// The ID of the token represented by this note.
    token_id: Field,
}
// docs:end:nft_note

impl NoteHash for NFTNote {
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        // Partial notes can be implemented by having the note hash be either the result of multiscalar multiplication
        // (MSM), or two rounds of poseidon. MSM results in more constraints and is only required when multiple variants
        // of partial notes are supported. Because NFTNote has just one variant (where the token id is public), we use
        // poseidon instead.

        // We must compute the same note hash as would be produced by a partial note created and completed with the same
        // values, so that notes all behave the same way regardless of how they were created. To achieve this, we
        // perform both steps of the partial note computation.

        // First we create the partial note from a commitment to the private content (including storage slot).
        let private_content =
            NFTPartialNotePrivateContent { owner: self.owner, randomness: self.randomness };
        let partial_note =
            PartialNFTNote { commitment: private_content.compute_partial_commitment(storage_slot) };

        // Then compute the completion note hash. In a real partial note this step would be performed in public.
        partial_note.compute_complete_note_hash(self.token_id)
    }

    // The nullifiers are nothing special - this is just the canonical implementation that would be injected by the
    // #[note] macro.

    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        let owner_npk_m = get_public_keys(self.owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(self, note_hash_for_nullify: Field) -> Field {
        let owner_npk_m = get_public_keys(self.owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER,
        )
    }
}

impl NFTNote {
    pub fn new(token_id: Field, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { token_id, owner, randomness }
    }

    pub fn get_token_id(self) -> Field {
        self.token_id
    }

    /// Creates a partial note that will hide the owner and storage slot but not the token id, since the note will be
    /// later completed in public. This is a powerful technique for scenarios in which the token id cannot be known in
    /// private (e.g. because it depends on some public state, such as a DEX).
    ///
    /// This function inserts a partial note validity commitment into the nullifier tree to be later on able to verify
    /// that the partial note and completer are legitimate. See function docs of `compute_validity_commitment` for more
    /// details.
    ///
    /// Each partial note should only be used once, since otherwise multiple notes would be linked together and known to
    /// belong to the same owner.
    ///
    /// As part of the partial note creation process, a log will be sent to `recipient` from `sender` so that they can
    /// discover the note. `recipient` will typically be the same as `owner`.
    pub fn partial(
        owner: AztecAddress,
        storage_slot: Field,
        context: &mut PrivateContext,
        recipient: AztecAddress,
        completer: AztecAddress,
    ) -> PartialNFTNote {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };

        // We create a commitment to the private data, which we then use to construct the log we send to the recipient.
        let commitment = NFTPartialNotePrivateContent { owner, randomness }
            .compute_partial_commitment(storage_slot);

        // Our partial note log encoding scheme includes a field with the tag of the public completion log, and we use
        // the commitment as the tag. This is good for multiple reasons:
        //  - the commitment is uniquely tied to this partial note
        //  - the commitment is already public information, so we're not revealing anything else
        //  - we don't need to create any additional information, private or public, for the tag
        //  - other contracts cannot impersonate us and emit logs with the same tag due to public log siloing
        let private_log_content = PrivateNFTPartialNotePrivateLogContent {
            owner,
            randomness,
            public_log_tag: commitment,
        };

        let encrypted_log =
            note::compute_partial_note_log(private_log_content, storage_slot, recipient);
        // Regardless of the original content size, the log is padded with random bytes up to
        // `PRIVATE_LOG_SIZE_IN_FIELDS` to prevent leaking information about the actual size.
        let length = encrypted_log.len();
        context.emit_private_log(encrypted_log, length);

        let partial_note = PartialNFTNote { commitment };

        // Now we compute the validity commitment and push it to the nullifier tree. It can be safely pushed to
        // the nullifier tree since it uses its own separator, making collisions with actual note nullifiers
        // practically impossible.
        let validity_commitment = partial_note.compute_validity_commitment(completer);
        context.push_nullifier(validity_commitment);

        partial_note
    }
}

/// The private content of a partial NFTNote, i.e. the fields that will remain private. All other note fields will be
/// made public.
#[derive(Packable)]
struct NFTPartialNotePrivateContent {
    // The ordering of these fields is important given that it must match that of NFTNote.
    // Correct ordering is checked by the tests in this module.
    owner: AztecAddress,
    randomness: Field,
}

impl NFTPartialNotePrivateContent {
    fn compute_partial_commitment(self, storage_slot: Field) -> Field {
        // Here we commit to all private values, including the storage slot.
        poseidon2_hash_with_separator(
            self.pack().concat([storage_slot]),
            GENERATOR_INDEX__NOTE_HASH,
        )
    }
}

#[derive(Packable)]
struct PrivateNFTPartialNotePrivateLogContent {
    // The ordering of these fields is important given that it must:
    //   a) match that of NFTNote, and
    //   b) have the public log tag at the beginning
    // Correct ordering is checked by the tests in this module.
    public_log_tag: Field,
    owner: AztecAddress,
    randomness: Field,
}

impl NoteType for PrivateNFTPartialNotePrivateLogContent {
    fn get_id() -> Field {
        NFTNote::get_id()
    }
}

/// A partial instance of a NFTNote. This value represents a private commitment to the owner, randomness and storage
/// slot, but the token id field has not yet been set. A partial note can be completed in public with the `complete`
/// function (revealing the token id to the public), resulting in a NFTNote that can be used like any other one (except
/// of course that its token id is known).
#[derive(Packable, Serialize, Deserialize)]
pub struct PartialNFTNote {
    commitment: Field,
}

impl PartialNFTNote {
    /// Completes the partial note, creating a new note that can be used like any other NFTNote.
    pub fn complete(self, context: &mut PublicContext, completer: AztecAddress, token_id: Field) {
        // A note with a value of zero is valid, but we cannot currently complete a partial note with such a value
        // because this will result in the completion log having its last field set to 0. Public logs currently do not
        // track their length, and so trailing zeros are simply trimmed. This results in the completion log missing its
        // last field (the value), and note discovery failing.
        // TODO(#11636): remove this
        assert(token_id != 0, "Cannot complete a PartialNFTNote with a value of 0");

        // We verify that the partial note we're completing is valid (i.e. completer is correct, it uses the correct
        // state variable's storage slot, and it is internally consistent).
        let validity_commitment = self.compute_validity_commitment(completer);
        assert(
            context.nullifier_exists(validity_commitment, context.this_address()),
            "Invalid partial note or completer",
        );

        // We need to do two things:
        //  - emit a public log containing the public fields (the token id). The contract will later find it by
        //  searching for the expected tag (which is simply the partial note commitment).
        //  - insert the completion note hash (i.e. the hash of the note) into the note hash tree. This is typically
        //  only done in private to hide the preimage of the hash that is inserted, but completed partial notes are
        //  inserted in public as the public values are provided and the note hash computed.
        context.emit_public_log(self.compute_note_completion_log(token_id));
        context.push_note_hash(self.compute_complete_note_hash(token_id));
    }

    /// Computes a validity commitment for this partial note. The commitment cryptographically binds the note's private
    /// data with the designated completer address. When the note is later completed in public execution, we can load
    /// this commitment from the nullifier tree and verify that both the partial note (e.g. that the storage slot
    /// corresponds to the correct owner, and that we're using the correct state variable) and completer are
    /// legitimate.
    pub fn compute_validity_commitment(self, completer: AztecAddress) -> Field {
        poseidon2_hash_with_separator(
            [self.commitment, completer.to_field()],
            GENERATOR_INDEX__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        )
    }

    fn compute_note_completion_log(self, token_id: Field) -> [Field; 2] {
        // The first field of this log must be the tag that the recipient of the partial note private field logs
        // expects, which is equal to the partial note commitment.
        [self.commitment, token_id]
    }

    fn compute_complete_note_hash(self, token_id: Field) -> Field {
        // Here we finalize the note hash by including the (public) token id into the partial note commitment. Note that
        // we use the same generator index as we used for the first round of poseidon - this is not an issue.
        poseidon2_hash_with_separator([self.commitment, token_id], GENERATOR_INDEX__NOTE_HASH)
    }
}

mod test {
    use super::{
        NFTNote, NFTPartialNotePrivateContent, PartialNFTNote,
        PrivateNFTPartialNotePrivateLogContent,
    };
    use dep::aztec::{
        note::note_interface::NoteHash,
        protocol_types::{address::AztecAddress, traits::{FromField, Packable}},
        utils::array::subarray,
    };

    global token_id: Field = 17;
    global randomness: Field = 42;
    global owner: AztecAddress = AztecAddress::from_field(50);
    global storage_slot: Field = 13;

    #[test]
    fn note_hash_matches_completed_partial_note_hash() {
        // Tests that a NFTNote has the same note hash as a PartialNFTNote created and then completed with the same
        // private values. This requires for the same hash function to be used in both flows, with the fields in the
        // same order.

        let note = NFTNote { token_id, randomness, owner };
        let note_hash = note.compute_note_hash(storage_slot);

        let partial_note_private_content = NFTPartialNotePrivateContent { owner, randomness };

        let partial_note = PartialNFTNote {
            commitment: partial_note_private_content.compute_partial_commitment(storage_slot),
        };
        let completed_partial_note_hash = partial_note.compute_complete_note_hash(token_id);

        assert_eq(note_hash, completed_partial_note_hash);
    }

    #[test]
    fn unpack_from_partial_note_encoding() {
        // Tests that the packed representation of a regular NFTNote can be reconstructed given the partial note
        // private fields log and the public completion log, ensuring the recipient will be able to compute the
        // completed note as if it were a regular NFTNote.

        let note = NFTNote { token_id, randomness, owner };

        let partial_note_private_content = NFTPartialNotePrivateContent { owner, randomness };
        let commitment = partial_note_private_content.compute_partial_commitment(storage_slot);

        let private_log_content = PrivateNFTPartialNotePrivateLogContent {
            owner,
            randomness,
            public_log_tag: commitment,
        };
        let partial_note = PartialNFTNote { commitment };

        // The first field of the partial note private content is the public completion log tag, so it should match the
        // first field of the public log.
        assert_eq(
            private_log_content.pack()[0],
            partial_note.compute_note_completion_log(token_id)[0],
        );

        // Then we extract all fields except the first of both logs (i.e. the public log tag), and combine them to
        // produce the note's packed representation. This requires that the members of the intermediate structs are in
        // the same order as in NFTNote.
        let private_log_without_public_tag: [_; 2] = subarray(private_log_content.pack(), 1);
        let public_log_without_tag: [_; 1] =
            subarray(partial_note.compute_note_completion_log(token_id), 1);

        assert_eq(private_log_without_public_tag.concat(public_log_without_tag), note.pack());
    }
}
