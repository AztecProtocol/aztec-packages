use dep::aztec::{
    context::{PrivateContext, PublicContext},
    history::nullifier_inclusion::ProveNullifierInclusion,
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::custom_note,
    messages::logs::note,
    note::note_interface::{NoteHash, NoteType},
    oracle::random::random,
    protocol_types::{
        address::AztecAddress,
        constants::{
            GENERATOR_INDEX__NOTE_HASH, GENERATOR_INDEX__NOTE_NULLIFIER,
            GENERATOR_INDEX__PARTIAL_NOTE_VALIDITY_COMMITMENT, PRIVATE_LOG_SIZE_IN_FIELDS,
        },
        hash::{compute_siloed_nullifier, poseidon2_hash_with_separator},
        traits::{Deserialize, FromField, Hash, Packable, Serialize, ToField},
    },
};

// UintNote supports partial notes, i.e. the ability to create an incomplete note in private, hiding certain values (the
// owner, storage slot and randomness), and then completing the note in public with the ones missing (the amount).
// Partial notes are being actively developed and are not currently fully supported via macros, and so we rely on the
// #[custom_note] macro to implement it manually, resulting in some boilerplate. This is expected to be unnecessary once
// macro support is expanded.

/// A private note representing a numeric value associated to an account (e.g. a token balance).
#[derive(Eq, Serialize, Packable)]
#[custom_note]
pub struct UintNote {
    // The ordering of these fields is important given that it must:
    //   a) match that of UintPartialNotePrivateContent, and
    //   b) have the public field at the end
    // Correct ordering is checked by the tests in this module.

    /// The owner of the note, i.e. the account whose nullifier secret key is required to compute the nullifier.
    owner: AztecAddress,
    /// Random value, protects against note hash preimage attacks.
    randomness: Field,
    /// The number stored in the note.
    value: u128,
}

impl NoteHash for UintNote {
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        // Partial notes can be implemented by having the note hash be either the result of multiscalar multiplication
        // (MSM), or two rounds of poseidon. MSM results in more constraints and is only required when multiple variants
        // of partial notes are supported. Because UintNote has just one variant (where the value is public), we use
        // poseidon instead.

        // We must compute the same note hash as would be produced by a partial note created and completed with the same
        // values, so that notes all behave the same way regardless of how they were created. To achieve this, we
        // perform both steps of the partial note computation.

        // First we create the partial note from a commitment to the private content (including storage slot).
        let private_content =
            UintPartialNotePrivateContent { owner: self.owner, randomness: self.randomness };
        let partial_note = PartialUintNote {
            commitment: private_content.compute_partial_commitment(storage_slot),
        };

        // Then compute the completion note hash. In a real partial note this step would be performed in public.
        partial_note.compute_complete_note_hash(self.value)
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

impl UintNote {
    pub fn new(value: u128, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { value, owner, randomness }
    }

    pub fn get_value(self) -> u128 {
        self.value
    }

    pub fn get_owner(self) -> AztecAddress {
        self.owner
    }

    /// Creates a partial note that will hide the owner and storage slot but not the value, since the note will be later
    /// completed in public. This is a powerful technique for scenarios in which the value cannot be known in private
    /// (e.g. because it depends on some public state, such as a DEX).
    ///
    /// This function inserts a partial note validity commitment into the nullifier tree to be later on able to verify
    /// that the partial note and completer are legitimate. See function docs of `compute_validity_commitment` for more
    /// details.
    ///
    /// Each partial note should only be used once, since otherwise multiple notes would be linked together and known to
    /// belong to the same owner.
    ///
    /// As part of the partial note creation process, a log will be sent to `recipient` so that they can discover the
    /// note. `recipient` will typically be the same as `owner`.
    pub fn partial(
        owner: AztecAddress,
        storage_slot: Field,
        context: &mut PrivateContext,
        recipient: AztecAddress,
        completer: AztecAddress,
    ) -> PartialUintNote {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };

        // We create a commitment to the private data, which we then use to construct the log we send to the recipient.
        let commitment = UintPartialNotePrivateContent { owner, randomness }
            .compute_partial_commitment(storage_slot);

        // Our partial note log encoding scheme includes a field with the tag of the public completion log, and we use
        // the commitment as the tag. This is good for multiple reasons:
        //  - the commitment is uniquely tied to this partial note
        //  - the commitment is already public information, so we're not revealing anything else
        //  - we don't need to create any additional information, private or public, for the tag
        //  - other contracts cannot impersonate us and emit logs with the same tag due to public log siloing
        let private_log_content = PrivateUintPartialNotePrivateLogContent {
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

        let partial_note = PartialUintNote { commitment };

        // Now we compute the validity commitment and push it to the nullifier tree. It can be safely pushed to
        // the nullifier tree since it uses its own separator, making collisions with actual note nullifiers
        // practically impossible.
        let validity_commitment = partial_note.compute_validity_commitment(completer);
        context.push_nullifier(validity_commitment);

        partial_note
    }
}

/// The private content of a partial UintNote, i.e. the fields that will remain private. All other note fields will be
/// made public.
#[derive(Packable)]
struct UintPartialNotePrivateContent {
    // The ordering of these fields is important given that it must match that of UintNote.
    // Correct ordering is checked by the tests in this module.
    owner: AztecAddress,
    randomness: Field,
}

impl UintPartialNotePrivateContent {
    fn compute_partial_commitment(self, storage_slot: Field) -> Field {
        // Here we commit to all private values, including the storage slot.
        poseidon2_hash_with_separator(
            self.pack().concat([storage_slot]),
            GENERATOR_INDEX__NOTE_HASH,
        )
    }
}

#[derive(Packable)]
struct PrivateUintPartialNotePrivateLogContent {
    // The ordering of these fields is important given that it must:
    //   a) match that of UintNote, and
    //   b) have the public log tag at the beginning
    // Correct ordering is checked by the tests in this module.
    public_log_tag: Field,
    owner: AztecAddress,
    randomness: Field,
}

impl NoteType for PrivateUintPartialNotePrivateLogContent {
    fn get_id() -> Field {
        UintNote::get_id()
    }
}

/// A partial instance of a UintNote. This value represents a private commitment to the owner, randomness and storage
/// slot, but the value field has not yet been set. A partial note can be completed in public with the `complete`
/// function (revealing the value to the public), resulting in a UintNote that can be used like any other one (except
/// of course that its value is known).
#[derive(Packable, Serialize, Deserialize, Eq)]
pub struct PartialUintNote {
    commitment: Field,
}

global NOTE_COMPLETION_LOG_LENGTH: u32 = 2;

impl PartialUintNote {
    /// Completes the partial note, creating a new note that can be used like any other UintNote.
    pub fn complete(self, context: &mut PublicContext, completer: AztecAddress, value: u128) {
        // A note with a value of zero is valid, but we cannot currently complete a partial note with such a value
        // because this will result in the completion log having its last field set to 0. Public logs currently do not
        // track their length, and so trailing zeros are simply trimmed. This results in the completion log missing its
        // last field (the value), and note discovery failing.
        // TODO(#11636): remove this
        assert(value != 0, "Cannot complete a PartialUintNote with a value of 0");

        // We verify that the partial note we're completing is valid (i.e. completer is correct, it uses the correct
        // state variable's storage slot, and it is internally consistent).
        let validity_commitment = self.compute_validity_commitment(completer);
        assert(
            context.nullifier_exists(validity_commitment, context.this_address()),
            "Invalid partial note or completer",
        );

        // We need to do two things:
        //  - emit a public log containing the public fields (the value). The contract will later find it by searching
        //  for the expected tag (which is simply the partial note commitment).
        //  - insert the completion note hash (i.e. the hash of the note) into the note hash tree. This is typically
        //  only done in private to hide the preimage of the hash that is inserted, but completed partial notes are
        //  inserted in public as the public values are provided and the note hash computed.
        context.emit_public_log(self.compute_note_completion_log(value));
        context.push_note_hash(self.compute_complete_note_hash(value));
    }

    /// Completes the partial note, creating a new note that can be used like any other UintNote. Same as `complete`
    /// function but works from private context.
    pub fn complete_from_private(
        self,
        context: &mut PrivateContext,
        completer: AztecAddress,
        value: u128,
    ) {
        // We verify that the partial note we're completing is valid (i.e. completer is correct, it uses the correct
        // state variable's storage slot, and it is internally consistent).
        let validity_commitment = self.compute_validity_commitment(completer);
        // `prove_nullifier_inclusion` function expects the nullifier to be siloed (hashed with the address of
        // the contract that emitted the nullifier) as it checks the value directly against the nullifier tree and all
        // the nullifiers in the tree are siloed by the protocol.
        let siloed_validity_commitment =
            compute_siloed_nullifier(context.this_address(), validity_commitment);
        context.get_block_header().prove_nullifier_inclusion(siloed_validity_commitment);

        // We need to do two things:
        //  - emit an unencrypted log containing the public fields (the value) via the private log channel. The
        //  contract will later find it by searching for the expected tag (which is simply the partial note
        //  commitment).
        //  - insert the completion note hash (i.e. the hash of the note) into the note hash tree. This is typically
        //  only done in private to hide the preimage of the hash that is inserted, but completed partial notes are
        //  inserted in public as the public values are provided and the note hash computed.
        context.emit_private_log(
            self.compute_note_completion_log_padded_for_private_log(value),
            NOTE_COMPLETION_LOG_LENGTH,
        );
        context.push_note_hash(self.compute_complete_note_hash(value));
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

    fn compute_note_completion_log(self, value: u128) -> [Field; NOTE_COMPLETION_LOG_LENGTH] {
        // The first field of this log must be the tag that the recipient of the partial note private field logs
        // expects, which is equal to the partial note commitment.
        [self.commitment, value.to_field()]
    }

    fn compute_note_completion_log_padded_for_private_log(
        self,
        value: u128,
    ) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS] {
        let note_completion_log = self.compute_note_completion_log(value);
        let padding = [0; PRIVATE_LOG_SIZE_IN_FIELDS - NOTE_COMPLETION_LOG_LENGTH];
        note_completion_log.concat(padding)
    }

    fn compute_complete_note_hash(self, value: u128) -> Field {
        // Here we finalize the note hash by including the (public) value into the partial note commitment. Note that we
        // use the same generator index as we used for the first round of poseidon - this is not an issue.
        poseidon2_hash_with_separator(
            [self.commitment, value.to_field()],
            GENERATOR_INDEX__NOTE_HASH,
        )
    }
}

impl ToField for PartialUintNote {
    fn to_field(self) -> Field {
        self.commitment
    }
}

impl FromField for PartialUintNote {
    fn from_field(field: Field) -> Self {
        Self { commitment: field }
    }
}

mod test {
    use super::{
        PartialUintNote, PrivateUintPartialNotePrivateLogContent, UintNote,
        UintPartialNotePrivateContent,
    };
    use dep::aztec::{
        note::note_interface::NoteHash,
        protocol_types::{address::AztecAddress, traits::{Deserialize, FromField, Packable}},
        utils::array::subarray,
    };

    global value: u128 = 17;
    global randomness: Field = 42;
    global owner: AztecAddress = AztecAddress::from_field(50);
    global storage_slot: Field = 13;

    #[test]
    fn note_hash_matches_completed_partial_note_hash() {
        // Tests that a UintNote has the same note hash as a PartialUintNote created and then completed with the same
        // private values. This requires for the same hash function to be used in both flows, with the fields in the
        // same order.

        let note = UintNote { value, randomness, owner };
        let note_hash = note.compute_note_hash(storage_slot);

        let partial_note_private_content = UintPartialNotePrivateContent { owner, randomness };

        let partial_note = PartialUintNote {
            commitment: partial_note_private_content.compute_partial_commitment(storage_slot),
        };
        let completed_partial_note_hash = partial_note.compute_complete_note_hash(value);

        assert_eq(note_hash, completed_partial_note_hash);
    }

    #[test]
    fn unpack_from_partial_note_encoding() {
        // Tests that the packed representation of a regular UintNote can be reconstructed given the partial note
        // private fields log and the public completion log, ensuring the recipient will be able to compute the
        // completed note as if it were a regular UintNote.

        let note = UintNote { value, randomness, owner };

        let partial_note_private_content = UintPartialNotePrivateContent { owner, randomness };
        let commitment = partial_note_private_content.compute_partial_commitment(storage_slot);

        let private_log_content = PrivateUintPartialNotePrivateLogContent {
            owner,
            randomness,
            public_log_tag: commitment,
        };
        // The following is a misuse of the `deserialize` function, but this is just a test and it's better than
        // letting devs manually construct it when they shouldn't be able to.
        let partial_note = PartialUintNote::deserialize([commitment]);

        // The first field of the partial note private content is the public completion log tag, so it should match the
        // first field of the public log.
        assert_eq(
            private_log_content.pack()[0],
            partial_note.compute_note_completion_log(value)[0],
        );

        // Then we extract all fields except the first of both logs (i.e. the public log tag), and combine them to
        // produce the note's packed representation. This requires that the members of the intermediate structs are in
        // the same order as in UintNote.
        let private_log_without_public_tag: [_; 2] = subarray(private_log_content.pack(), 1);
        let public_log_without_tag: [_; 1] =
            subarray(partial_note.compute_note_completion_log(value), 1);

        assert_eq(private_log_without_public_tag.concat(public_log_without_tag), note.pack());
    }
}
