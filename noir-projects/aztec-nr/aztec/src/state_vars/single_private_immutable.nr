use crate::{
    context::{PrivateContext, UtilityContext},
    keys::getters::{get_nhk_app, get_public_keys},
    note::{
        lifecycle::create_note,
        note_getter::{get_note, view_note},
        note_interface::{NoteHash, NoteType},
        NoteMessage,
    },
    oracle::nullifiers::check_nullifier_exists,
    state_vars::StateVariable,
};

use crate::protocol::{
    constants::DOM_SEP__INITIALIZATION_NULLIFIER,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Packable},
};

mod test;

/// Contract-wide immutable private state.
///
/// A state variable that holds a single private value that is set once and remains unchanged forever (unlike
/// [`crate::state_vars::private_immutable::PrivateImmutable`], which holds one private value _per account_ - hence the
/// name 'single').
///
/// Because this private value has no semantic owner, it is up to the application to determine which accounts will
/// learn of its existence via [`crate::note::note_message::NoteMessage::deliver_to`].
///
/// # Usage
///
/// Unlike [`crate::state_vars::private_immutable::PrivateImmutable`] which is "owned" (requiring wrapping in an
/// [`crate::state_vars::owned::Owned`] state variable), SinglePrivateImmutable is used directly in storage:
///
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     your_variable: SinglePrivateImmutable<YourNote, Context>,
/// }
/// ```
///
/// # Example
///
/// A contract's configuration parameters can be represented as a SinglePrivateImmutable. Once set during contract
/// deployment or initial setup, these parameters remain constant for the lifetime of the contract. For example, an
/// account contract's signing public key is typically stored using SinglePrivateImmutable. Note that the configuration
/// would be visible only to the parties to which the [`NoteMessage`] returned from the `initialize(...)` function is
/// delivered.
///
/// # Requirements
///
/// The contract that holds this state variable must have keys associated with it. This is because the initialization
/// nullifier includes the contract's nullifier hiding key (nhk) in its preimage and because the contract is set as
/// the owner of the underlying note. This is expected to not ever be a problem because the contracts that use
/// SinglePrivateImmutable generally have keys associated with them (account contracts or escrow contracts).
pub struct SinglePrivateImmutable<Note, Context> {
    context: Context,
    storage_slot: Field,
}

impl<Note, Context> StateVariable<1, Context> for SinglePrivateImmutable<Note, Context> {
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> SinglePrivateImmutable<Note, Context> {
    /// Computes the initialization nullifier using the provided secret.
    fn compute_initialization_nullifier(self, secret: Field) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot, secret],
            DOM_SEP__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> SinglePrivateImmutable<Note, &mut PrivateContext> {
    /// Computes the nullifier that will be created when this SinglePrivateImmutable is first initialized.
    ///
    /// This function is primarily used internally by the `initialize` method, but may also be useful for contracts
    /// that need to check if a SinglePrivateImmutable has been initialized.
    fn get_initialization_nullifier(self) -> Field {
        let contract_address = self.context.this_address();
        let contract_npk_m = get_public_keys(contract_address).npk_m;
        let contract_npk_m_hash = contract_npk_m.hash();
        let secret = self.context.request_nhk_app(contract_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Initializes a SinglePrivateImmutable state variable instance with a permanent `note` and returns a
    /// [`NoteMessage`] that allows you to decide what method of note message delivery to use.
    ///
    /// This function inserts the single, permanent note for this state variable. It can only be called once per
    /// SinglePrivateImmutable. Subsequent calls will fail because the initialization nullifier will already exist.
    pub fn initialize(self, note: Note) -> NoteMessage<Note>
    where
        Note: NoteType + NoteHash + Packable,
    {
        let nullifier = self.get_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        // The note owner is set to the contract's address. Strictly speaking, specifying a note owner is not required
        // here, as this note is never intended to be nullified. However, we must provide an owner because Aztec.nr
        // does not currently support notes without an owner, or with a zero-address owner; attempting to use a zero
        // address as the owner will result in an error during note message processing.
        //
        // This error should never happen in practice because SinglePrivateImmutable is typically used in contracts
        // that require keys to function properly. Specifically, this state variable is commonly used in account
        // contracts and escrow contracts, both of which are deployed with public keys. This is a general pattern:
        // contracts that use SinglePrivateImmutable need public keys because users need to add these keys to their PXE
        // to be able to load the configuration stored in the SinglePrivateImmutable.
        //
        // Anyway, this could be avoided by allowing of storing of states in nullifiers as is tracked by
        // https://linear.app/aztec-labs/issue/F-217/allow-storing-state-in-nullifiers
        let note_owner = self.context.this_address();
        create_note(self.context, note_owner, self.storage_slot, note)
    }

    /// Reads the permanent note of a SinglePrivateImmutable state variable instance.
    ///
    /// If this SinglePrivateImmutable state variable has not yet been initialized, no note will exist: the call will
    /// fail and the transaction will not be provable.
    ///
    /// Since the note is immutable, there's no risk of reading stale data or race conditions - the note never changes
    /// after initialization.
    ///
    pub fn get_note(self) -> Note
    where
        Note: NoteType + NoteHash + Packable,
    {
        // The note owner is set to none rather than msg_sender(), which means that anyone with access to this note in
        // the PXE can read it.
        let confirmed_note = get_note(self.context, Option::none(), self.storage_slot);

        // Because the notes obtained from SinglePrivateImmutable are not meant to be nullified and get_note(...)
        // function has already constrained the note (by pushing a read request to the context), we can return just the
        // note and skip the additional data in ConfirmedNote.
        confirmed_note.note
    }
}

impl<Note> SinglePrivateImmutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Computes the nullifier that will be created when this SinglePrivateImmutable is first initialized.
    unconstrained fn get_initialization_nullifier(self) -> Field {
        let contract_address = self.context.this_address();
        let contract_npk_m = get_public_keys(contract_address).npk_m;
        let contract_npk_m_hash = contract_npk_m.hash();
        let secret = get_nhk_app(contract_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Returns whether this SinglePrivateImmutable has been initialized.
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.get_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    /// Returns the permanent note in this SinglePrivateImmutable state variable instance.
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        // The note owner is set to none rather than msg_sender(), which means that anyone with access to this note in
        // the PXE can read it.
        view_note(Option::none(), self.storage_slot).note
    }
}
