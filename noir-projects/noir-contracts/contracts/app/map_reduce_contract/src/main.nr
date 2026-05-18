use aztec::macros::aztec;

#[aztec]
pub contract MapReduce {
    use aztec::{
        macros::{
            events::event,
            functions::{external, initializer, only_self},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{
            constants::MAX_NOTES_PER_PAGE,
            note_getter_options::NoteGetterOptions,
            note_viewer_options::NoteViewerOptions,
        },
        protocol::address::AztecAddress,
        state_vars::{Map, Owned, PrivateSet, PublicImmutable},
    };
    use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_honk_proof};
    use field_note::FieldNote;

    global NUM_SUBMITTERS: u32 = 5;
    global NUM_SUBMISSIONS: u32 = 5;

    #[event]
    struct Published {
        result: Field,
    }

    #[storage]
    struct Storage<Context> {
        admin: PublicImmutable<AztecAddress, Context>,
        coordinator: PublicImmutable<AztecAddress, Context>,
        submitters: Map<AztecAddress, PublicImmutable<bool, Context>, Context>,
        submit_vk_hash: PublicImmutable<Field, Context>,
        publish_vk_hash: PublicImmutable<Field, Context>,
        submissions: Owned<PrivateSet<FieldNote, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(
        admin: AztecAddress,
        coordinator: AztecAddress,
        submitters: [AztecAddress; NUM_SUBMITTERS],
        submit_vk_hash: Field,
        publish_vk_hash: Field,
    ) {
        self.storage.admin.initialize(admin);
        self.storage.coordinator.initialize(coordinator);
        for i in 0..NUM_SUBMITTERS {
            self.storage.submitters.at(submitters[i]).initialize(true);
        }
        self.storage.submit_vk_hash.initialize(submit_vk_hash);
        self.storage.publish_vk_hash.initialize(publish_vk_hash);
    }

    #[external("private")]
    fn submit(
        verification_key: UltraHonkVerificationKey,
        proof: UltraHonkZKProof,
        result: Field,
    ) {
        let is_allowed = self.storage.submitters.at(self.msg_sender()).read();
        assert(is_allowed, "Sender is not an allowed submitter");

        let vk_hash = self.storage.submit_vk_hash.read();
        let public_inputs = [result];
        verify_honk_proof(verification_key, proof, public_inputs, vk_hash);

        let coordinator = self.storage.coordinator.read();

        let note = FieldNote { value: result };
        self.storage.submissions.at(coordinator).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("private")]
    fn publish(
        verification_key: UltraHonkVerificationKey,
        proof: UltraHonkZKProof,
        result: Field,
    ) {
        let coordinator = self.storage.coordinator.read();
        assert(self.msg_sender() == coordinator, "Only coordinator can publish");

        let notes = self.storage.submissions.at(coordinator).get_notes(
            NoteGetterOptions::new(),
        );

        assert(notes.len() == NUM_SUBMISSIONS, "Expected exactly 5 submissions");

        let mut publish_public_inputs = [0; NUM_SUBMISSIONS + 1];
        for i in 0..NUM_SUBMISSIONS {
            publish_public_inputs[i] = notes.get_unchecked(i).note.value;
        }
        publish_public_inputs[NUM_SUBMISSIONS] = result;

        let vk_hash = self.storage.publish_vk_hash.read();
        verify_honk_proof(verification_key, proof, publish_public_inputs, vk_hash);

        self.enqueue_self._emit_published(result);
    }

    #[external("public")]
    #[only_self]
    fn _emit_published(result: Field) {
        self.emit(Published { result });
    }

    #[external("utility")]
    unconstrained fn get_submissions(
        coordinator: AztecAddress,
    ) -> BoundedVec<FieldNote, MAX_NOTES_PER_PAGE> {
        self.storage.submissions.at(coordinator).view_notes(NoteViewerOptions::new())
    }
}
