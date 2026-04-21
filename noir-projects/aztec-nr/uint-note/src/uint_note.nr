use aztec::{
    context::{NullifierExistenceRequest, PrivateContext, PublicContext},
    keys::getters::{get_nhk_app, get_public_keys, try_get_public_keys},
    macros::notes::custom_note,
    messages::{
        logs::partial_note::encode_partial_note_private_message,
        message_delivery::{do_private_message_delivery, MessageDelivery},
    },
    note::{note_interface::{NoteHash, NoteType}, utils::compute_note_nullifier},
    oracle::random::random,
    protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__NOTE_COMPLETION_LOG_TAG, DOM_SEP__NOTE_HASH, DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT},
        hash::{compute_log_tag, compute_siloed_nullifier, poseidon2_hash_with_separator},
        traits::{Deserialize, FromField, Hash, Packable, Serialize, ToField},
    },
};

// UintNote supports partial notes, i.e. the ability to create an incomplete note in private, hiding certain values
// (the owner and randomness), and then completing the note in public with the ones missing (the storage slot and
// amount). Partial notes are being actively developed and are not currently fully supported via macros, and so we
// rely on the #[custom_note] macro to implement it manually, resulting in some boilerplate. This is expected to be
// unnecessary once macro support is expanded.

/// A private note representing a numeric value associated to an account (e.g. a token balance).
// docs:start:uint_note_def
#[derive(Deserialize, Eq, Serialize, Packable)]
#[custom_note]
pub struct UintNote {
    /// The number stored in the note.
    pub value: u128,
}
// docs:end:uint_note_def

impl NoteHash for UintNote {
    // docs:start:compute_note_hash
    fn compute_note_hash(self, owner: AztecAddress, storage_slot: Field, randomness: Field) -> Field {
        // Partial notes can be implemented by having the note hash be either the result of multiscalar multiplication
        // (MSM), or two rounds of poseidon. MSM results in more constraints and is only required when multiple
        // variants of partial notes are supported. Because UintNote has just one variant (where the value is public),
        // we use poseidon instead.

        // We must compute the same note hash as would be produced by a partial note created and completed with the
        // same values, so that notes all behave the same way regardless of how they were created. To achieve this, we
        // perform both steps of the partial note computation.

        // First we create the partial note from a commitment to the private content.
        let partial_note = PartialUintNote { commitment: compute_partial_commitment(owner, randomness) };

        // Then compute the completion note hash. In a real partial note this step would be performed in public.
        partial_note.compute_complete_note_hash(storage_slot, self.value)
    }
    // docs:end:compute_note_hash

    // The nullifiers are nothing special - this is just the canonical implementation that would be injected by the
    // #[note] macro.

    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        owner: AztecAddress,
        note_hash_for_nullification: Field,
    ) -> Field {
        let owner_npk_m = get_public_keys(owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = context.request_nhk_app(owner_npk_m_hash);
        compute_note_nullifier(note_hash_for_nullification, [secret])
    }

    unconstrained fn compute_nullifier_unconstrained(
        self,
        owner: AztecAddress,
        note_hash_for_nullification: Field,
    ) -> Option<Field> {
        try_get_public_keys(owner).map(|public_keys| {
            let owner_npk_m = public_keys.npk_m;
            let owner_npk_m_hash = owner_npk_m.hash();
            let secret = get_nhk_app(owner_npk_m_hash);
            compute_note_nullifier(note_hash_for_nullification, [secret])
        })
    }
}

impl UintNote {
    /// Creates a partial note that will hide the owner but not the value or storage slot, since the note will be
    /// later completed in public. This is a powerful technique for scenarios in which the value cannot be known in
    /// private (e.g. because it depends on some public state, such as a DEX).
    ///
    /// This function inserts a partial note validity commitment into the nullifier tree to be later on able to verify
    /// that the partial note and completer are legitimate. See function docs of `compute_validity_commitment` for more
    /// details.
    ///
    /// Each partial note should only be used once, since otherwise multiple notes would be linked together and known
    /// to belong to the same owner.
    ///
    /// As part of the partial note creation process, a log will be sent to `recipient` so that they can discover the
    /// note. `recipient` will typically be the same as `owner`.
    pub fn partial(
        owner: AztecAddress,
        context: &mut PrivateContext,
        recipient: AztecAddress,
        completer: AztecAddress,
    ) -> PartialUintNote {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so
        // a malicious sender could use non-random values to make the note less private. But they already know the full
        // note pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
        // therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };

        // We create a commitment to the private data, which we then use to construct the log we send to the recipient.
        let commitment = compute_partial_commitment(owner, randomness);

        // Our partial note log encoding scheme includes a field with the tag of the public completion log, and we use
        // the commitment as the tag. This is good for multiple reasons:
        //  - the commitment is uniquely tied to this partial note
        //  - the commitment is already public information, so we're not revealing anything else
        //  - we don't need to create any additional information, private or public, for the tag
        //  - other contracts cannot impersonate us and emit logs with the same tag due to public log siloing
        let private_log_content = UintPartialNotePrivateLogContent {};

        do_private_message_delivery(
            context,
            || encode_partial_note_private_message(private_log_content, owner, randomness, commitment),
            Option::none(),
            recipient,
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        let partial_note = PartialUintNote { commitment };

        // Now we compute the validity commitment and push it to the nullifier tree. It can be safely pushed to the
        // nullifier tree since it uses its own separator, making collisions with actual note nullifiers practically
        // impossible.
        let validity_commitment = partial_note.compute_validity_commitment(completer);
        context.push_nullifier(validity_commitment);

        partial_note
    }
}

/// Computes a commitment to the private content of a partial UintNote, i.e. the fields that will remain private. All
/// other note fields will be made public.
// docs:start:compute_partial_commitment
fn compute_partial_commitment(owner: AztecAddress, randomness: Field) -> Field {
    poseidon2_hash_with_separator([owner.to_field(), randomness], DOM_SEP__NOTE_HASH)
}
// docs:end:compute_partial_commitment

#[derive(Packable)]
// This note does not have any non-metadata (i.e. storage slot, owner, randomness) private content, as the only field
// (value) will be public in the partial note.
struct UintPartialNotePrivateLogContent {}

impl NoteType for UintPartialNotePrivateLogContent {
    fn get_id() -> Field {
        UintNote::get_id()
    }
}

/// A partial instance of a UintNote. This value represents a private commitment to the owner and randomness, but the
/// storage slot and value fields have not yet been set. A partial note can be completed in public with the `complete`
/// function (revealing the storage slot and value to the public), resulting in a UintNote that can be used like any
/// other one (except of course that its value is known).
// docs:start:partial_uint_note_def
#[derive(Packable, Serialize, Deserialize, Eq)]
pub struct PartialUintNote {
    commitment: Field,
}
// docs:end:partial_uint_note_def

impl PartialUintNote {
    /// Completes the partial note, creating a new note that can be used like any other UintNote.
    pub fn complete(self, context: PublicContext, completer: AztecAddress, storage_slot: Field, value: u128) {
        // A note with a value of zero is valid, but we cannot currently complete a partial note with such a value
        // because this will result in the completion log having its last field set to 0. Public logs currently do not
        // track their length, and so trailing zeros are simply trimmed. This results in the completion log missing its
        // last field (the value), and note discovery failing. TODO(#11636): remove this
        assert(value != 0, "Cannot complete a PartialUintNote with a value of 0");

        // We verify that the partial note we're completing is valid (i.e. completer is correct, it uses the correct
        // state variable's storage slot, and it is internally consistent).
        let validity_commitment = self.compute_validity_commitment(completer);
        // Safety: we're using the existence of the nullifier as proof of the contract having validated the partial
        // note's preimage, which is safe.
        assert(
            context.nullifier_exists_unsafe(validity_commitment, context.this_address()),
            "Invalid partial note or completer",
        );

        // We need to do two things:
        //  - emit a public log containing the public fields (the storage slot and value). The contract will later find
        // it by searching for the domain-separated commitment as the tag.
        //  - insert the completion note hash (i.e. the hash of the note) into the note hash tree. This is typically
        // only done in private to hide the preimage of the hash that is inserted, but completed partial notes are
        // inserted in public as the public values are provided and the note hash computed.
        let log_tag = compute_log_tag(self.commitment, DOM_SEP__NOTE_COMPLETION_LOG_TAG);
        context.emit_public_log_unsafe(log_tag, [storage_slot, value.to_field()]);
        context.push_note_hash(self.compute_complete_note_hash(storage_slot, value));
    }

    /// Completes the partial note, creating a new note that can be used like any other UintNote. Same as `complete`
    /// function but works from private context.
    pub fn complete_from_private(
        self,
        context: &mut PrivateContext,
        completer: AztecAddress,
        storage_slot: Field,
        value: u128,
    ) {
        // We verify that the partial note we're completing is valid (i.e. completer is correct, it uses the correct
        // state variable's storage slot, and it is internally consistent).
        let validity_commitment = self.compute_validity_commitment(completer);

        let siloed_validity_commitment = compute_siloed_nullifier(context.this_address(), validity_commitment);
        // Note that this means we don't support scenarios in which the validity commitment was created in the same
        // transaction.
        context.assert_nullifier_exists(NullifierExistenceRequest::for_settled(siloed_validity_commitment));

        // We need to do two things:
        //  - emit an unencrypted log containing the public fields (the storage slot and value) via the private log
        // channel. The contract will later find it by searching for the domain-separated commitment as the tag.
        //  - insert the completion note hash (i.e. the hash of the note) into the note hash tree. This is typically
        // only done in private to hide the preimage of the hash that is inserted, but completed partial notes are
        // inserted in public as the public values are provided and the note hash computed.
        let log_tag = compute_log_tag(self.commitment, DOM_SEP__NOTE_COMPLETION_LOG_TAG);
        let payload = BoundedVec::from_array([storage_slot, value.to_field()]);
        context.emit_private_log_vec_unsafe(log_tag, payload);
        context.push_note_hash(self.compute_complete_note_hash(storage_slot, value));
    }

    /// Computes a validity commitment for this partial note. The commitment cryptographically binds the note's private
    /// data with the designated completer address. When the note is later completed in public execution, we can load
    /// this commitment from the nullifier tree and verify that both the partial note (e.g. that the storage slot
    /// corresponds to the correct owner, and that we're using the correct state variable) and completer are
    /// legitimate.
    pub fn compute_validity_commitment(self, completer: AztecAddress) -> Field {
        poseidon2_hash_with_separator(
            [self.commitment, completer.to_field()],
            DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        )
    }

    // docs:start:compute_complete_note_hash
    fn compute_complete_note_hash(self, storage_slot: Field, value: u128) -> Field {
        // Here we finalize the note hash by including the (public) storage slot and value into the partial note
        // commitment. Note that we use the same separator as we used for the first round of poseidon - this is not
        // an issue.
        poseidon2_hash_with_separator(
            [self.commitment, storage_slot, value.to_field()],
            DOM_SEP__NOTE_HASH,
        )
    }
    // docs:end:compute_complete_note_hash
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
    use super::{compute_partial_commitment, PartialUintNote, UintNote};
    use aztec::{note::note_interface::NoteHash, protocol::{address::AztecAddress, traits::FromField}};

    global value: u128 = 17;
    global randomness: Field = 42;
    global owner: AztecAddress = AztecAddress::from_field(50);
    global storage_slot: Field = 13;

    #[test]
    fn note_hash_matches_completed_partial_note_hash() {
        // Tests that a UintNote has the same note hash as a PartialUintNote created and then completed with the same
        // private values. This requires for the same hash function to be used in both flows, with the fields in the
        // same order.
        let note = UintNote { value };
        let note_hash = note.compute_note_hash(owner, storage_slot, randomness);

        let partial_note = PartialUintNote { commitment: compute_partial_commitment(owner, randomness) };
        let completed_partial_note_hash = partial_note.compute_complete_note_hash(storage_slot, value);

        assert_eq(note_hash, completed_partial_note_hash);
    }
}
