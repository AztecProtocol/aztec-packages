use crate::{
    context::{PrivateContext, UtilityContext},
    keys::getters::{get_nsk_app, get_public_keys},
    note::{
        lifecycle::create_note,
        note_getter::{get_note, view_note},
        note_interface::{NoteHash, NoteType},
        note_message::NoteMessage,
    },
    oracle::notes::check_nullifier_exists,
    state_vars::owned_state_variable::OwnedStateVariable,
};

use protocol_types::{
    address::AztecAddress,
    constants::DOM_SEP__INITIALIZATION_NULLIFIER,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Packable},
};

/// PrivateImmutable is an owned state variable type that represents a private value that is set once and remains
/// unchanged forever. Because it is "owned," you must wrap a PrivateImmutable inside an Owned state variable when
/// storing it:
///
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     your_variable: Owned<PrivateImmutable<YourNote, Context>, Context>,
/// }
/// ```
///
/// For more details on what "owned" means, see the documentation for the [OwnedStateVariable] trait.
///
/// The value of a PrivateImmutable is stored in the Aztec's private state and hence is represented as a note.
///
/// The PrivateImmutable type facilitates: inserting the permanent note during initialization, and reading that note.
///
/// ## Example
///
/// A user's permanent configuration can be represented as a PrivateImmutable. For example, in a vesting contract, each
/// user's vesting parameters (start date, total amount, etc.) could be stored as a PrivateImmutable owned by that user.
/// Once initialized during registration, these parameters remain constant for that specific user, while different users
/// can have their own distinct parameters.
///
/// Note: For contract-wide configuration (one value for the entire contract), use SinglePrivateImmutable instead.
///
/// # Generic Parameters:
///
/// * `Note` - A single note of this type will represent the PrivateImmutable's
///            value at the given storage_slot.
/// * `Context` - The execution context (PrivateContext or UtilityContext).
///
pub struct PrivateImmutable<Note, Context> {
    context: Context,
    storage_slot: Field,
    owner: AztecAddress,
}

impl<Note, Context> OwnedStateVariable<Context> for PrivateImmutable<Note, Context> {
    fn new(context: Context, storage_slot: Field, owner: AztecAddress) -> Self {
        Self { context, storage_slot, owner }
    }
}

impl<Note, Context> PrivateImmutable<Note, Context> {
    /// Computes the initialization nullifier using the provided secret.
    fn compute_initialization_nullifier(self, secret: Field) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot, secret],
            DOM_SEP__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> PrivateImmutable<Note, &mut PrivateContext> {
    /// Computes the nullifier that will be created when this PrivateImmutable is first initialized.
    ///
    /// This function is primarily used internally by the `initialize` method, but may also be useful for contracts that
    /// need to check if a PrivateImmutable has been initialized.
    ///
    fn get_initialization_nullifier(self) -> Field {
        let owner_npk_m = get_public_keys(self.owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = self.context.request_nsk_app(owner_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Initializes a PrivateImmutable state variable instance with a permanent `note` and returns a
    /// [crate::note::note_message::NoteMessage] that allows you to decide what method of note message delivery to use.
    ///
    /// This function inserts the single, permanent note for this state variable. It can only be called once per
    /// PrivateImmutable. Subsequent calls will fail because the initialization nullifier will already exist.
    ///
    /// Unlike PrivateMutable, this note will never be nullified or replaced through the state variable interface
    /// - it persists for the lifetime of the state variable.
    pub fn initialize(self, note: Note) -> NoteMessage<Note>
    where
        Note: NoteType + NoteHash + Packable,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents
        // the value from being initialized again as a nullifier can be included only once.
        let nullifier = self.get_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.owner, self.storage_slot, note)
    }

    /// Reads the permanent note of a PrivateImmutable state variable instance.
    ///
    /// If this PrivateImmutable state variable has not yet been initialized, no note will exist: the call will fail and
    /// the transaction will not be provable.
    ///
    /// Since the note is immutable, there's no risk of reading stale data or race conditions - the note never changes
    /// after initialization.
    ///
    pub fn get_note(self) -> Note
    where
        Note: NoteType + NoteHash + Packable,
    {
        let storage_slot = self.storage_slot;
        let confirmed_note = get_note(self.context, Option::some(self.owner), storage_slot);

        // Because the notes obtained from PrivateImmutable are not meant to be nullified and get_note(...) function
        // has already constrained the note (by pushing a read request to the context), we can return just the note
        // and skip the additional data in HintedNote.
        confirmed_note.note
    }
}

impl<Note> PrivateImmutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Computes the nullifier that will be created when this PrivateImmutable is first initialized.
    unconstrained fn get_initialization_nullifier(self) -> Field {
        let owner_npk_m = get_public_keys(self.owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Returns whether this PrivateImmutable has been initialized.
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.get_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    /// Returns the permanent note in this PrivateImmutable without consuming it.
    ///
    /// This function is only available in a UtilityContext (unconstrained environment) and is typically used for
    /// offchain queries, view functions, or testing.
    ///
    /// Unlike the constrained `get_note()`, this function does not push read requests or perform validation. It simply
    /// reads the note from the PXE's database.
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        view_note(Option::some(self.owner), self.storage_slot).note
    }
}
