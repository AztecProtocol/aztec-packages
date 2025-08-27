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

// DelayedPrivateMutable<Note, INITIAL_DELAY> is similar to PrivateMutable, but
// with a few important differences:
// - The "current note" can be read within a private function with no contention
//   (i.e. multiple parties can all read the same note without blocking one
//   another nor needing to coordinate).
// - Advanced: The "current note" can be read in private, without a nullifier
//   and replacement note being emitted each time.
//
// The way this works under the hood is very similar to DelayedPublicMutable:
// If the "owner" of a DelayedPrivateMutable state would like to "replace" the
// current note, they cannot replace it immediately; they must schedule a
// change. That scheduled change can only take place after a delay. This delay
// gives people an opportunity to read the note in a private function, safe in
// the knowledge that the note cannot change for some time.
//
// The delay is measured in seconds. Reads in private are only valid as long as
// they are included in a block with a timestamp not too far into the future,
// so that they can guarantee the value will not have possibly changed by then
// (because of the delay). The delay for changing a value is initially equal to
// INITIAL_DELAY, but can be changed by calling `schedule_delay_change`.
impl<Note, let INITIAL_DELAY: u64, Context> DelayedPrivateMutable<Note, INITIAL_DELAY, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        Self { context, storage_slot }
    }

    // The following computation is leaky, in that it doesn't hide the storage
    // slot that has been initialized, nor does it hide the contract address of
    // this contract.
    // When this initialization nullifier is emitted, an observer could do a
    // dictionary or rainbow attack to learn the preimage of this nullifier to
    // deduce the storage slot and contract address.
    // For some applications, leaking the details that a particular state
    // variable of a particular contract has been initialized will be
    // unacceptable.
    // Under such circumstances, such application developers might wish to _not_
    // use this state variable type.
    // This is especially dangerous for initial assignment to elements of a
    // `Map<AztecAddress, DelayedPrivateMutable>` type (for example), because
    // the storage slot often also identifies an actor. e.g. the initial
    // assignment to `my_map.at(msg.sender)` will leak: `msg.sender`, the fact
    // that an element of `my_map` was assigned-to for the first time, and the
    // contract_address.
    // Note: subsequent nullification of this state variable, via the `replace`
    // method will not be leaky, if the `compute_nullifier()` method of the
    // underlying note is designed to ensure privacy. For example, if the
    // `compute_nullifier()` method injects the secret key of a note owner into
    // the computed nullifier's preimage.
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
    /// Initializes a DelayedPrivateMutable state variable instance with its
    /// first note. Similar in nature to `PrivateMutable::initialize`.
    ///
    /// The note will not take effect (i.e. the note will not be available
    /// via `get_current_note`) until `INITIAL_DELAY` seconds after the
    /// `include_by_timestamp` of this tx.
    ///
    /// This function creates the very first note for this state variable. It
    /// can only be called once per DelayedPrivateMutable. Subsequent calls will
    /// fail because the initialization nullifier will already exist.
    ///
    /// This is conceptually similar to setting an initial value for a variable
    /// in Ethereum smart contracts, except that in Aztec the "value" is
    /// represented as a private note.
    ///
    /// Notes are assumed to be Note::empty() before the initialization takes
    /// effect, so do not infer meaning from an empty note, other than "it has
    /// not yet been initialized".
    ///
    /// ## IMPORTANT PRIVACY CONSIDERATION
    ///
    /// This computation is leaky and can compromise privacy under certain
    /// circumstances.
    ///
    /// When the initialization nullifier is emitted during this call, an
    /// observer could perform a dictionary or rainbow attack to learn the
    /// storage slot and contract address.
    ///
    /// For applications where revealing that a particular state variable has
    /// been initialized is unacceptable, developers should consider alternative
    /// approaches or avoid using DelayedPrivateMutable.
    ///
    /// This is especially dangerous for initial assignments to elements of a
    /// `Map<AztecAddress, PrivateMutable>`, because the storage slot often
    /// identifies a specific user. For example,
    /// `my_map.at(msg.sender).initialize(note)` will leak:
    /// - `msg.sender`;
    /// - the fact that this map element was assigned for the first time;
    /// - and the contract's address.
    ///
    /// See https://github.com/AztecProtocol/aztec-packages/issues/15568 for ideas to
    /// improve this privacy footgun in future.
    ///
    /// ## Arguments
    ///
    /// * `note` - The initial note to store in this PrivateMutable. This note
    ///            will become the "current note" of the state variable after
    ///            `INITIAL_DELAY` seconds.
    ///
    /// ## Returns
    ///
    /// * `NoteEmission<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>`
    ///      - A type-safe wrapper that requires you to decide whether to
    ///        encrypt and send the DelayedPrivateMutableNote to someone.
    ///        You can call `.emit()` on it to encrypt and log the note, or
    ///        `.discard()` to skip emission. See NoteEmission for more details.
    ///      - The DelayedPrivateMutableNote is a low-level wrapper around your
    ///        custom smart contract Note, which is used under the hood by this
    ///        DelayedPrivateMutable state variable type. An ordinary user won't
    ///        have to handle this type directly; they'll be able to extract
    ///        their custom notes via `get_current_note` or `get_scheduled_note`.
    ///
    /// ## Advanced
    ///
    /// This function performs the following operations:
    /// - Creates and emits an initialization nullifier to mark this storage slot
    ///   as initialized. This prevents double-initialization.
    /// - Inserts the provided note into the protocol's Note Hash Tree.
    /// - Returns a NoteEmission type that allows the caller to decide how to encrypt
    ///   and deliver the note to its intended recipient.
    ///
    /// The initialization nullifier is deterministically computed from the storage
    /// slot and can leak privacy information (see `compute_initialization_nullifier`
    /// documentation).
    ///
    /// TODO: make this configurable to an optional later time (an earlier time is not allowed).
    /// https://github.com/AztecProtocol/aztec-packages/issues/5501
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

    /// Replaces the current note of a DelayedPrivateMutable state variable with
    /// a new note. Similar in nature to `PrivateMutable::replace`.
    ///
    /// The replacement note will not take effect (i.e. the note will not be
    /// available via `self.get_current_note`) until `self.get_current_delay()`
    /// seconds after the `include_by_timestamp` of this tx.
    ///
    /// This function implements the typical "nullify-and-create" pattern for
    /// updating private state in Aztec. It first retrieves the current note,
    /// nullifies it, and then inserts a `new_note` with the updated data.
    ///
    /// This function can only be called after the DelayedPrivateMutable has been
    /// initialized. If called on an uninitialized DelayedPrivateMutable, it
    /// will fail because there is no current note to replace.
    ///
    /// ## Arguments
    ///
    /// * `new_note` - The new note that will replace the current note after
    ///                `self.get_current_delay()` seconds. This will become the
    ///                new "current value" of the PrivateMutable.
    ///
    /// ## Returns
    ///
    /// * `NoteEmission<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>`
    ///      - A type-safe wrapper that requires you to decide whether to
    ///        encrypt and send the DelayedPrivateMutableNote to someone.
    ///        You can call `.emit()` on it to encrypt and log the note, or
    ///        `.discard()` to skip emission. See NoteEmission for more details.
    ///      - The DelayedPrivateMutableNote is a low-level wrapper around your
    ///        custom smart contract Note, which is used under the hood by this
    ///        DelayedPrivateMutable state variable type. An ordinary user won't
    ///        have to handle this type directly; they'll be able to extract
    ///        their custom notes via `get_current_note` or `get_scheduled_note`.
    ///
    /// ## Advanced
    ///
    /// This function performs the following operations:
    /// - Retrieves the current DelayedPrivateMutable note from the PXE via an
    ///   oracle call. Notice: we actually operate on these so-called "wrapper
    ///   notes", rather than the underlying `Note` types themselves.
    /// - Validates that the current wrapper note exists and belongs to this
    ///   storage slot.
    /// - Computes the nullifier for the current wrapper note and pushes it to
    ///   the context.
    /// - Inserts the provided `new_note` into the `post` field of a new wrapper
    ///   note. Then inserts the new wrapper note into the Note Hash Tree.
    /// - Returns a NoteEmission type for the new wrapper note, that allows the
    ///   caller to decide how to encrypt and deliver this wrapper note to its
    ///   intended recipient.
    ///
    /// The nullification of the previous wrapper note ensures that it cannot
    /// be used again, maintaining the invariant that a DelayedPrivateMutable
    /// has exactly one current wrapper note.
    ///
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

        let time_until_delay_horizon = sdc.get_max_time_a_read_remains_valid(anchor_timestamp);

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

    /// Replaces the current delay of a DelayedPrivateMutable state variable
    /// with a new delay (measured in seconds).
    ///
    /// If the delay is an _increase_ to the current delay, it will take effect
    /// once the `include_by_timestamp` of this tx is reached. That is, any
    /// note replacements after that time will be delayed by `new_delay` seconds
    /// before they take effect.
    ///
    /// If the delay is a _decrease_ to the current delay, there will be a delay
    /// before the decreased delay takes effect, to ensure in-flight reads have
    /// time to complete under the 'old' delay. The logic here is quite complex
    /// -- see `scheduled_delay_change.nr` if interested.
    ///
    /// This function implements the typical "nullify-and-create" pattern for
    /// updating private state in Aztec. It first retrieves the current
    /// DelayedPrivateMutable ("wrapper") note, nullifies it, and then inserts a
    /// new wrapper note with the updated data.
    ///
    /// This function can only be called after the DelayedPrivateMutable has been
    /// initialized. If called on an uninitialized DelayedPrivateMutable, it
    /// will fail because there is no current wrapper note to replace.
    ///
    /// ## Arguments
    ///
    /// * `new_delay` - The new delay (in seconds) that will replace the current
    ///                 delay.
    ///
    /// ## Returns
    ///
    /// * `NoteEmission<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>`
    ///      - A type-safe wrapper that requires you to decide whether to
    ///        encrypt and send the DelayedPrivateMutableNote to someone.
    ///        You can call `.emit()` on it to encrypt and log the note, or
    ///        `.discard()` to skip emission. See NoteEmission for more details.
    ///      - The DelayedPrivateMutableNote is a low-level wrapper around your
    ///        custom smart contract Note, which is used under the hood by this
    ///        DelayedPrivateMutable state variable type. An ordinary user won't
    ///        have to handle this type directly; they'll be able to extract
    ///        their custom notes, and chosen delays through the methods of this
    ///        DelayedPrivateMutable state variable type.
    ///
    /// ## Advanced
    ///
    /// This function performs the following operations:
    /// - Retrieves the current DelayedPrivateMutable note from the PXE via an
    ///   oracle call. Notice: we actually operate on these so-called "wrapper
    ///   notes", rather than the underlying `Note` types themselves.
    /// - Validates that the current wrapper note exists and belongs to this
    ///   storage slot.
    /// - Computes the nullifier for the current wrapper note and pushes it to
    ///   the context.
    /// - Inserts the provided `new_note` into the `post` field of a new wrapper
    ///   note. Then inserts the new wrapper note into the Note Hash Tree.
    /// - Returns a NoteEmission type for the new wrapper note, that allows the
    ///   caller to decide how to encrypt and deliver this wrapper note to its
    ///   intended recipient.
    ///
    /// The nullification of the previous wrapper note ensures that it cannot
    /// be used again, maintaining the invariant that a DelayedPrivateMutable
    /// has exactly one current wrapper note.
    ///
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
// Note: all reads mutate the `include_by_timestamp` of the `context`, to ensure
// the read expires before the value can change.

impl<Note, let INITIAL_DELAY: u64> DelayedPrivateMutable<Note, INITIAL_DELAY, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    /// Gets the "current" note as at the anchor_timestamp of this tx.
    /// This 'read' operation will only be valid for a certain window of time.
    ///
    /// The exact amount of time will depend on:
    /// - The current delay of this DelayedPrivateMutable state variable (see
    ///   `get_current_delay`);
    /// - Whether a replacement note has been scheduled via
    ///   `schedule_replacement` (see `get_scheduled_note`);
    /// - Whether a delay change has been scheduled via `schedule_delay_change`
    ///   (see `get_scheduled_delay`).
    ///
    /// Essentially, the 'read' operation is only valid whilst we can be sure
    /// that no other txs could possibly mutate this state.
    ///
    /// The `include_by_timestamp` of this tx will be mutated by this function
    /// to a value at most as long as this validity window. This ensures that
    /// if too much time has passed since the read, the tx will not be valid.
    ///
    pub fn get_current_note(self) -> Note
    where
        Note: Packable,
    {
        let svc = self.get_delayed_mutable_values_at_anchor_block().svc;
        let anchor_timestamp = self.context.get_block_header().global_variables.timestamp;

        svc.get_current_at(anchor_timestamp)
    }

    /// Gets the "current" delay (in seconds) that has been set for this
    /// DelayedPrivateMutable instance, as at the anchor_timestamp of this tx.
    /// This 'read' operation will only be valid for a certain window of time.
    ///
    /// The exact amount of time will depend on:
    /// - The current delay of this DelayedPrivateMutable state variable (see
    ///   `get_current_delay`);
    /// - Whether a replacement note has been scheduled via
    ///   `schedule_replacement` (see `get_scheduled_note`);
    /// - Whether a delay change has been scheduled via `schedule_delay_change`
    ///   (see `get_scheduled_delay`).
    ///
    /// Essentially, the 'read' operation is only valid whilst we can be sure
    /// that no other txs could possibly mutate this state.
    ///
    /// The `include_by_timestamp` of this tx will be mutated by this function
    /// to a value at most as long as this validity window. This ensures that
    /// if too much time has passed since the read, the tx will not be valid.
    ///
    /// ## Returns
    ///
    /// * `u64` - current delay (in seconds) of this delayed_private_mutable,
    ///           as at the anchor timestamp of this tx.
    ///
    pub fn get_current_delay(self) -> u64
    where
        Note: Packable,
    {
        let sdc = self.get_delayed_mutable_values_at_anchor_block().sdc;
        let anchor_timestamp = self.context.get_block_header().global_variables.timestamp;

        sdc.get_current_at(anchor_timestamp)
    }

    /// ## Returns
    /// * `(Note, u64)` - the note that is scheduled to take effect next, and
    ///                   the timestamp at which it will take effect (in seconds).
    ///    If no new note has been scheduled, or if the scheduled note has
    ///    already taken effect, this will return the current note, and the
    ///    timestamp at which it took effect.
    pub fn get_scheduled_note(self) -> (Note, u64)
    where
        Note: Packable,
    {
        let svc = self.get_delayed_mutable_values_at_anchor_block().svc;

        svc.get_scheduled()
    }

    /// ## Returns
    /// * `(u64, u64)` - the delay (in seconds) that is scheduled to take effect
    ///                  next, as a replacement to the current delay, and the
    ///    timestamp at which it will take effect (in seconds), respectively.
    ///    If no new delay has been scheduled, or if the scheduled delay has
    ///    already taken effect, this will return the current delay, and the
    ///    timestamp at which it took effect, respectively.
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
        // We want to get the "current" wrapped note, from the perspective of
        // the anchor_timestamp of this tx.
        // To check whether a note is current, we'd ordinarily have to publicly
        // leak its nullifier, as a way of demonstrating that it hasn't already
        // been nullified. But since we've designed this state variable to have
        // a _delay_, we have a window of time where if the nullifier doesn't
        // yet exist in the anchor header, we have a guarantee that the
        // "current value" of the note won't change for some time.
        // So we do that:
        // - We read the wrapped note from the anchor header.
        // - We assert that the wrapped note's nullifier does not exist in that
        //   anchor header.
        // - We proceed with reading the "current value" of the note, as at the
        //   anchor header,
        // - and we `set_include_by_timestamp` so that the tx expires before the
        //   note that we've read could possibly be changed.
        let old_wrapped_note = self.get_wrapped_note_at_anchor_block();

        let svc = old_wrapped_note.delayed_mutable_values.svc;
        let sdc = old_wrapped_note.delayed_mutable_values.sdc;

        // TODO: consider consolidating common functionality between the delayed
        // public and private mutables. Everything below in this function is
        // exactly the same as DelayedPrivateMutable's get_current_value.

        let anchor_timestamp = self.context.get_anchor_timestamp();

        let max_time_a_read_remains_valid = sdc.get_max_time_a_read_remains_valid(anchor_timestamp);
        let time_horizon = svc.get_time_horizon_at(anchor_timestamp, max_time_a_read_remains_valid);

        // We prevent this transaction from being included in any timestamp after the time horizon, ensuring that the
        // historical value matches the current one, since it can only change after the horizon.
        self.context.set_include_by_timestamp(time_horizon);

        old_wrapped_note.delayed_mutable_values
    }

    fn get_wrapped_note_at_anchor_block(self) -> DelayedPrivateMutableNote<Note, INITIAL_DELAY>
    where
        Note: Packable,
    {
        let (retrieved_note, retrieved_note_hash_for_read_request): (RetrievedNote<DelayedPrivateMutableNote<Note, INITIAL_DELAY>>, Field) =
            get_note(self.context, self.storage_slot);

        let note_hash_for_nullify = compute_note_hash_for_nullify_from_read_request(
            retrieved_note,
            retrieved_note_hash_for_read_request,
        );
        let nullifier = retrieved_note.note.compute_nullifier(self.context, note_hash_for_nullify);

        let anchor_header = self.context.get_block_header();

        anchor_header.prove_nullifier_non_inclusion(nullifier);

        // No need to nullify the note with DelayedPrivateMutable; that's the
        // whole point.

        retrieved_note.note
    }
}

impl<Note, let INITIAL_DELAY: u64> DelayedPrivateMutable<Note, INITIAL_DELAY, UtilityContext>
where
    Note: NoteType,
{
    /// Gets the "current" note within a UtilityContext.
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
