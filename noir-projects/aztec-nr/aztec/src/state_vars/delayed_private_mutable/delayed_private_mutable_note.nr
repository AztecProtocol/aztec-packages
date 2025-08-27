use dep::protocol_types::{
    constants::{GENERATOR_INDEX__NOTE_HASH, GENERATOR_INDEX__NOTE_NULLIFIER},
    delayed_public_mutable::DelayedPublicMutableValues,
    hash::poseidon2_hash_with_separator,
    traits::Packable,
};

use crate::{
    context::PrivateContext,
    macros::notes::MAX_NOTE_TYPES,
    note::{
        note_getter_options::PropertySelector,
        note_interface::{NoteHash, NoteProperties, NoteType},
    },
};

#[derive(Eq)]
pub struct DelayedPrivateMutableNote<Note, let INITIAL_DELAY: u64> {
    pub delayed_mutable_values: DelayedPublicMutableValues<Note, INITIAL_DELAY>,
}

impl<Note, let INITIAL_DELAY: u64> NoteHash for DelayedPrivateMutableNote<Note, INITIAL_DELAY>
where
    Note: NoteHash,
{
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        // There are two natural approaches we could take here:
        // 1. Call the Note's compute_note_hash method;
        // 2. Ignore the Note's compute_note_hash method, and instead pack the
        //    note into fields, and hash it ourselves.
        // I've opted for option 1, in a mad attempt to preserve "partial note"
        // functionality.
        //
        // There is some redundant hashing of a storage slot within these nested
        // compute_note_hash calls, but the opportunity to forward the
        // responsibility is too good to pass up, for now.
        //
        // Let's define a partial delayed-private-mutable-note to be a _pair_ of
        // fields:
        //
        // partial = [ h(storage_slot, complete(svc.pre), ...sdc.pack()), partial(svc.post) ]
        //
        // The partial note is missing:
        // - a new timestamp of change,
        // - and the "incomplete" part of `svc.post`
        //   (according to whatever notion of "partial" our Note implements).
        //
        // A function can then "complete" our "partial" DPMNote by:
        // - first completing the svc.post note (according to its partial note
        //   calculation rules);
        // - then completing this DPMNote according to this rule:
        //
        // complete = h(
        //     partial[0],
        //     complete(partial[1]),
        //     svc.timestamp_of_change
        // )
        //
        // complete = h(
        //     h(storage_slot, complete(svc.pre), ...sdc.pack()),
        //     complete(partial(svc.post)),
        //     svc.timestamp_of_change
        // )

        let svc = self.delayed_mutable_values.svc;
        let sdc = self.delayed_mutable_values.sdc;

        let complete_pre_note_hash = svc.get_pre().compute_note_hash(storage_slot);
        let complete_post_note_hash = svc.get_post().compute_note_hash(storage_slot);

        let sdc_packed = sdc.pack();
        // This gives us confidence that accessing index 0 is sufficient:
        std::static_assert(
            sdc_packed.len() == 1,
            "The packing computation for sdc must have been changed",
        );

        // We include the `storage_slot` here (possibly redundantly), because we
        // don't know whether the `pre` and `post` note_hash computations will
        // actually make use of it, and we _need_ it to be bound to this
        // note_hash, so that the nullifier computation of this note is secure.
        let partial_0 = poseidon2_hash_with_separator(
            [storage_slot, complete_pre_note_hash, sdc_packed[0]],
            GENERATOR_INDEX__NOTE_HASH,
        );

        let complete = poseidon2_hash_with_separator(
            [partial_0, complete_post_note_hash, svc.get_timestamp_of_change() as Field],
            GENERATOR_INDEX__NOTE_HASH,
        );

        complete
    }

    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        // Recall: the `note_hash_for_nullify` parameter of this method is an
        // optimisation to avoid having to re-compute the note_hash.
        // We want to adopt the underlying `pre` and `post` notes'
        // `compute_nullifier` functions, because this DPMNote is intended to be
        // just a wrapper, and so it doesn't know any concept of "ownership"; it
        // presumes the underlying notes will take care of inferring ownership
        // from their note contents.
        //
        // So let's try to adopt the underlying notes' `compute_nullifier`
        // functions.
        // In fact, we'll only call the `post` note's `compute_nullifier`, in
        // case ownership has changed between the `pre` and `post` notes (as
        // then the `post` owner would not be able to compute the nullifier for
        // `pre`). So only the owner of the `post` note can nullify this DPMNote
        // in order to schedule subsequent delayed state updates. This means if
        // the owner of `pre` (after having created the `post` note) wanted to
        // change their mind and schedule a change to a different `post` note,
        // they wouldn't be able to, unless they also own the `post` note.
        //
        // But there's another problem: in order to nullify the `post` note, we
        // would need its note_hash. But we don't have access to the `post`
        // note_hash within the body of this function: we only have the
        // DPMNote's note_hash.
        //
        // You might wonder: Since we have access to the post note through
        // `self.delayed_mutable_values.svc.post`, why can't we compute its
        // `note_hash` within this function?
        // It's because notes don't know their own `storage_slot` (which is a
        // parameter to a note's `compute_note_hash` computation), and this
        // `compute_nullifier` interface doesn't enable us to pass the
        // `storage_slot` in as an arg.
        //
        // I see two choices:
        //
        // 1. Pass in the `post` note's note_hash into this function as the
        //    `note_hash_for_nullify` argument (instead of the DPMNote's).
        //    - Use that note_hash to compute the `post` note's nullifier;
        //    - Access the other data in the DPMNote (`self`) and hash it all up
        //      with the post note's nullifier, to get a frankensteinian
        //      nullifier that can only be computed by the `post` note's "owner",
        //      but which binds _all_ of the DPMNote's data.
        //    There would be some redundant hashing, since we've probably already
        //    hashed the contents of `self` elsewhere when we retrieved the note.
        //    This abuses the `compute_nullifier` interface of this DPMNote, in
        //    the sense that we're not passing-in `self`'s note_hash, but that
        //    of `post` instead.
        //    A clear question is: is this safe? I don't know yet...
        //
        // 2. Pass this DPMNote's note_hash (i.e. the note hash of `self`,
        //    as is conventional) as the `note_hash_for_nullify` argument.
        //    Pass that (technically-incompatible) note_hash to into the the
        //    `post` note's `compute_nullifier` method, and use the resulting
        //    nullifier as the nullifier of this `self` note.
        //    (Remember: the reason we leverage the `post` note's
        //    `compute_nullifier` method (instead of writing a dedicated
        //    implementation for this DPMNote) is because the `post` note (of
        //    type `Note`) will have some app-specific understanding of "note
        //    ownership", and so will know whether/how to inject a nullifier
        //    secret key, if applicable).
        //    So we end up with this Frankensteinian nullifier, which is
        //    computed from `self`'s `note_hash_for_nullify`, but using the
        //    `compute_nullifier` methodology of the `post` note.
        //    A clear question is: is this safe? I don't know yet...
        //
        // I need to write out the options in pseudocode:
        //
        // Option 1:
        // Input: self, post.note_hash_for_nullify
        //
        // let post_nullifier = self.delayed_mutable_values.svc.get_post().compute_nullifier(context, post.note_hash_for_nullify);
        // let nullifier = h(self.to_fields(), post_nullifier);
        //
        // Option 2:
        // Input: self, self.note_hash_for_nullify
        //
        // let compute_nullifier_fn = self.delayed_mutable_values.svc.get_post().compute_nullifier;
        // let nullifier = h(self.note_hash_for_nullify, compute_nullifier_fn(self.note_hash_for_nullify));
        //
        // I'm going with option 2, because it'll be easier to get working,
        // since the nature of the args to this function will be consistent with
        // all other calls to this function in this repo.
        //
        // We'll compute the nullifier as:
        //
        // h(note_hash_for_nullify, post.compute_nullifier(note_hash_for_nullify))
        //
        // Including the nullifier with the methodology of the `post` note
        // enables deterministic randomness to be added to the nullifier
        // (depending on the particular Note impl we're dealing with) --
        // commonly the owner's nullifier secret key -- in order to hide from
        // the world which note is being nullified.
        // We don't know for sure whether the `post.compute_nullifier()` call
        // will actually _make use_ of note_hash_for_nullify in its computation,
        // so we also hash that value into the mix, to ensure the entire
        // contents of `self` _and_ the `storage_slot` are bound to this
        // nullifier.
        // Using the note hash of `self` as the `note_hash_for_nullify` ensures
        // we bind this nullifier to all of the content of this note.

        let svc = self.delayed_mutable_values.svc;

        let frankensteinian_nullifier = poseidon2_hash_with_separator(
            [
                note_hash_for_nullify,
                svc.get_post().compute_nullifier(context, note_hash_for_nullify),
            ],
            GENERATOR_INDEX__NOTE_NULLIFIER,
        );

        frankensteinian_nullifier
    }

    unconstrained fn compute_nullifier_unconstrained(self, note_hash_for_nullify: Field) -> Field {
        let svc = self.delayed_mutable_values.svc;

        let frankensteinian_nullifier = poseidon2_hash_with_separator(
            [
                note_hash_for_nullify,
                svc.get_post().compute_nullifier_unconstrained(note_hash_for_nullify),
            ],
            GENERATOR_INDEX__NOTE_NULLIFIER,
        );

        frankensteinian_nullifier
    }
}

// Manually implementing all note traits, because the macros can't cope with
// a note with generics (like DelayedPrivateMutableNote has).

impl<Note, let INITIAL_DELAY: u64> NoteType for DelayedPrivateMutableNote<Note, INITIAL_DELAY>
where
    Note: NoteType,
{
    fn get_id() -> Field {
        MAX_NOTE_TYPES as Field // Chosen to avoid collisions with actual notes' derived note ids.
    }
}

struct DelayedPrivateMutableNoteProperties {
    delayed_mutable_values: PropertySelector,
}

impl<Note, let INITIAL_DELAY: u64> NoteProperties<DelayedPrivateMutableNoteProperties> for DelayedPrivateMutableNote<Note, INITIAL_DELAY>
where
    Note: Packable,
{
    fn properties() -> DelayedPrivateMutableNoteProperties {
        DelayedPrivateMutableNoteProperties {
            delayed_mutable_values: PropertySelector {
                index: 0,
                offset: 0,
                length: <DelayedPrivateMutableNote<Note, INITIAL_DELAY> as Packable>::N as u8 * 32,
            },
        }
    }
}

impl<Note, let INITIAL_DELAY: u64, let N: u32> Packable for DelayedPrivateMutableNote<Note, INITIAL_DELAY>
where
    Note: Packable,
{
    let N: u32 = 2 * <Note as Packable>::N + 1;

    fn pack(self) -> [Field; Self::N] {
        self.delayed_mutable_values.pack()
    }

    fn unpack(fields: [Field; Self::N]) -> Self {
        Self { delayed_mutable_values: DelayedPublicMutableValues::unpack(fields) }
    }
}
