use dep::protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
    delayed_public_mutable::{
        DelayedPublicMutableValues, ScheduledDelayChange, ScheduledValueChange,
    },
    hash::poseidon2_hash_with_separator,
    traits::{Empty, Packable},
};

use crate::{
    context::{PrivateContext, UtilityContext},
    history::nullifier_non_inclusion::ProveNullifierNonInclusion,
    note::{
        lifecycle::{create_note, destroy_note_unsafe},
        note_emission::NoteEmission,
        note_getter::{get_note, view_notes},
        note_interface::{NoteHash, NoteType},
        note_viewer_options::NoteViewerOptions,
        retrieved_note::RetrievedNote,
        utils::compute_note_hash_for_nullify_from_read_request,
    },
    state_vars::storage::HasStorageSlot,
};

pub(crate) mod delayed_private_mutable_note;
mod test;

use delayed_private_mutable_note::DelayedPrivateMutableNote;

pub struct DelayedPrivateMutable<Note, let INITIAL_DELAY: u64, Context> {
    context: Context,
    storage_slot: Field,
}

// This will make the Aztec macros require that T implements the Packable and Eq traits, and allocate `M` storage
// slots to this state variable.
impl<Note, let INITIAL_DELAY: u64, Context, let M: u32> HasStorageSlot<1> for DelayedPrivateMutable<Note, INITIAL_DELAY, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

// DelayedPublicMutable<T> stores a value of type T that is:
//  - publicly known (i.e. unencrypted)
//  - mutable in public
//  - readable in private with no contention (i.e. multiple parties can all read the same value without blocking one
//    another nor needing to coordinate)
// This is famously a hard problem to solve. DelayedPublicMutable makes it work by introducing a delay to public mutation:
// the value is not changed immediately but rather a value change is scheduled to happen in the future after some delay
// measured in seconds. Reads in private are only valid as long as they are included in a block with a timestamp not
// too far into the future, so that they can guarantee the value will not have possibly changed by then (because of the
// delay). The delay for changing a value is initially equal to INITIAL_DELAY, but can be changed by calling
// `schedule_delay_change`.
impl<Note, let INITIAL_DELAY: u64, Context> DelayedPrivateMutable<Note, INITIAL_DELAY, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        Self { context, storage_slot }
    }

    // The following computation is leaky, in that it doesn't hide the storage slot that has been initialized, nor does it hide the contract address of this contract.
    // When this initialization nullifier is emitted, an observer could do a dictionary or rainbow attack to learn the preimage of this nullifier to deduce the storage slot and contract address.
    // For some applications, leaking the details that a particular state variable of a particular contract has been initialized will be unacceptable.
    // Under such circumstances, such application developers might wish to _not_ use this state variable type.
    // This is especially dangerous for initial assignment to elements of a `Map<AztecAddress, PrivateMutable>` type (for example), because the storage slot often also identifies an actor. e.g.
    // the initial assignment to `my_map.at(msg.sender)` will leak: `msg.sender`, the fact that an element of `my_map` was assigned-to for the first time, and the contract_address.
    // Note: subsequent nullification of this state variable, via the `replace` method will not be leaky, if the `compute_nullifier()` method of the underlying note is designed to ensure privacy.
    // For example, if the `compute_nullifier()` method injects the secret key of a note owner into the computed nullifier's preimage.
    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

// WRITE

impl<Note, let INITIAL_DELAY: u64> DelayedPrivateMutable<Note, INITIAL_DELAY, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    /// Schedules a change to the new_value at the earliest possible time, given the current
    /// delay of this state.
    /// TODO: make this configurable to an optional later time (an earlier time is not allowed).
    /// https://github.com/AztecProtocol/aztec-packages/issues/5501
    /// Notes are assumed to be Note::empty() before the initialization takes effect,
    /// so do not infer meaning from an empty note, other than "it has not yet been initialized".
    pub fn schedule_initialization(
        self,
        note: Note,
    ) -> NoteEmission<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>
    where
        Note: Empty + Packable,
    {
        // TODO: make this configurable
        // https://github.com/AztecProtocol/aztec-packages/issues/5501
        let timestamp_of_change = self.context.include_by_timestamp + INITIAL_DELAY;

        let mut svc = ScheduledValueChange::<Note>::empty();

        svc.schedule_change_in_private(
            note,
            self.context.get_anchor_timestamp(),
            self.context.include_by_timestamp,
            INITIAL_DELAY,
            timestamp_of_change,
        );

        // We wrap the note in a DelayedPrivateMutableNote:
        let wrapped_note = DelayedPrivateMutableNote {
            delayed_mutable_values: DelayedPublicMutableValues::<Note, INITIAL_DELAY> {
                svc,
                // An empty sdc is interpreted as `INITIAL_DELAY`
                sdc: ScheduledDelayChange::<INITIAL_DELAY>::empty(),
            },
        };

        // Nullify the storage slot.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.storage_slot, wrapped_note)
    }

    pub fn schedule_replacement(
        self,
        new_note: Note,
    ) -> NoteEmission<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>
    where
        Note: Packable,
    {
        let old_wrapped_note = self.get_and_nullify_wrapped_note();

        let mut svc = old_wrapped_note.delayed_mutable_values.svc;
        let sdc = old_wrapped_note.delayed_mutable_values.sdc;

        let anchor_timestamp = self.context.get_anchor_timestamp();

        let time_until_delay_horizon = sdc.get_effective_minimum_delay_at(anchor_timestamp);

        // TODO: make this configurable:
        let include_by_timestamp = self.context.include_by_timestamp;
        // TODO: make this configurable
        // https://github.com/AztecProtocol/aztec-packages/issues/5501
        let timestamp_of_change = include_by_timestamp + time_until_delay_horizon;

        svc.schedule_change_in_private(
            new_note,
            anchor_timestamp,
            include_by_timestamp,
            time_until_delay_horizon,
            timestamp_of_change,
        );

        // We wrap the note in a DelayedPrivateMutableNote:
        let wrapped_note = DelayedPrivateMutableNote {
            delayed_mutable_values: DelayedPublicMutableValues::<Note, INITIAL_DELAY> { svc, sdc },
        };

        // Add replacement note.
        create_note(self.context, self.storage_slot, wrapped_note)
    }

    pub fn schedule_delay_change(
        self,
        new_delay: u64,
    ) -> NoteEmission<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>
    where
        Note: Packable,
    {
        let old_wrapped_note = self.get_and_nullify_wrapped_note();

        let svc = old_wrapped_note.delayed_mutable_values.svc;
        let mut sdc = old_wrapped_note.delayed_mutable_values.sdc;

        let anchor_timestamp = self.context.get_anchor_timestamp();

        let include_by_timestamp = self.context.include_by_timestamp;

        sdc.schedule_change_in_private(new_delay, anchor_timestamp, include_by_timestamp);

        // We wrap the note in a DelayedPrivateMutableNote:
        let wrapped_note = DelayedPrivateMutableNote {
            delayed_mutable_values: DelayedPublicMutableValues::<Note, INITIAL_DELAY> { svc, sdc },
        };

        // Add replacement note.
        create_note(self.context, self.storage_slot, wrapped_note)
    }

    fn get_and_nullify_wrapped_note(self) -> DelayedPrivateMutableNote<Note, INITIAL_DELAY>
    where
        Note: Packable,
    {
        let (retrieved_wrapped_note, retrieved_wrapped_note_hash_for_read_request): (RetrievedNote<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>, Field) =
            get_note(self.context, self.storage_slot);

        // Nullify previous note.
        destroy_note_unsafe(
            self.context,
            retrieved_wrapped_note,
            retrieved_wrapped_note_hash_for_read_request,
        );

        retrieved_wrapped_note.note
    }
}

// READ
// Note: all reads mutate the `include_by_timestamp` of the `context`, to ensure the read expires before the value can change.

impl<Note, let INITIAL_DELAY: u64> DelayedPrivateMutable<Note, INITIAL_DELAY, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    pub fn get_current_note(self) -> Note
    where
        Note: Packable,
    {
        let svc = self.get_delayed_mutable_values_at_anchor_block().svc;
        let anchor_timestamp = self.context.get_block_header().global_variables.timestamp;

        svc.get_current_at(anchor_timestamp)
    }

    pub fn get_current_delay(self) -> u64
    where
        Note: Packable,
    {
        let sdc = self.get_delayed_mutable_values_at_anchor_block().sdc;
        let anchor_timestamp = self.context.get_block_header().global_variables.timestamp;

        sdc.get_current_at(anchor_timestamp)
    }

    pub fn get_scheduled_note(self) -> (Note, u64)
    where
        Note: Packable,
    {
        let svc = self.get_delayed_mutable_values_at_anchor_block().svc;

        svc.get_scheduled()
    }

    pub fn get_scheduled_delay(self) -> (u64, u64)
    where
        Note: Packable,
    {
        let sdc = self.get_delayed_mutable_values_at_anchor_block().sdc;

        sdc.get_scheduled()
    }

    fn get_delayed_mutable_values_at_anchor_block(
        self,
    ) -> DelayedPublicMutableValues<Note, INITIAL_DELAY>
    where
        Note: Packable,
    {
        let old_wrapped_note = self.get_wrapped_note_at_anchor_block();

        let svc = old_wrapped_note.delayed_mutable_values.svc;
        let sdc = old_wrapped_note.delayed_mutable_values.sdc;

        // TODO: consider consolidating common functionality between the delayed public and private mutables. Everything below in this function is exactly the same as DelayedPrivateMutable's get_current_value.

        let anchor_timestamp = self.context.get_anchor_timestamp();

        let effective_minimum_delay = sdc.get_effective_minimum_delay_at(anchor_timestamp);
        let time_horizon = svc.get_time_horizon_at(anchor_timestamp, effective_minimum_delay);

        // We prevent this transaction from being included in any timestamp after the time horizon, ensuring that the
        // historical value matches the current one, since it can only change after the horizon.
        self.context.set_include_by_timestamp(time_horizon);

        old_wrapped_note.delayed_mutable_values
    }

    fn get_wrapped_note_at_anchor_block(self) -> DelayedPrivateMutableNote<Note, INITIAL_DELAY>
    where
        Note: Packable,
    {
        // We want to get the "current" note, from the perspective of the anchor_timestamp of this tx.
        // To check whether a note is current, we'd ordinarily have to publicly leak its nullifier, as a way of
        // demonstrating that it hasn't already been nullified.
        // But since we've designed this state variable to have a _delay_, we have a window of time where if
        // the nullifier doesn't yet exist in the anchor header, we have a guarantee that the "current value"
        // of the note won't change for some time.
        // So we do that:
        // We read the note from the anchor header.
        // We assert that the note's nullifier does not exist in that anchor header.
        // We proceed with reading the "current value" of the note, as at the anchor header,
        // and we `set_include_by_timestamp` so that the tx expires before the note that we've read could
        // possibly be changed.
        let (retrieved_note, retrieved_note_hash_for_read_request): (RetrievedNote<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>, Field) =
            get_note(self.context, self.storage_slot);

        let note_hash_for_nullify = compute_note_hash_for_nullify_from_read_request(
            retrieved_note,
            retrieved_note_hash_for_read_request,
        );
        let nullifier = retrieved_note.note.compute_nullifier(self.context, note_hash_for_nullify);

        let anchor_header = self.context.get_block_header();

        anchor_header.prove_nullifier_non_inclusion(nullifier);

        // No need to nullify the note with DelayedPrivateMutable; that's the whole point.

        retrieved_note.note
    }
}

impl<Note, let INITIAL_DELAY: u64> DelayedPrivateMutable<Note, INITIAL_DELAY, UtilityContext>
where
    Note: NoteType,
{
    pub unconstrained fn view_current_note(self) -> Note
    where
        Note: Eq + Packable,
    {
        let mut options = NoteViewerOptions::new();
        let wrapped_note: DelayedPrivateMutableNote<Note, INITIAL_DELAY> =
            view_notes(self.storage_slot, options.set_limit(1)).get(0);

        let svc = wrapped_note.delayed_mutable_values.svc;
        let current_timestamp = self.context.timestamp();

        svc.get_current_at(current_timestamp)
    }
}
