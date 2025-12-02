use crate::{
    context::{PrivateContext, UtilityContext},
    keys::getters::{get_nsk_app, get_public_keys},
    note::{
        lifecycle::create_note,
        note_emission::NoteEmission,
        note_getter::{get_note, view_note},
        note_interface::{NoteHash, NoteType},
    },
    oracle::notes::check_nullifier_exists,
    state_vars::storage::HasStorageSlot,
};

use protocol_types::{
    address::AztecAddress,
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Packable},
};

/// PrivateImmutable
///
/// PrivateImmutable is a private state variable type for values that are set once
/// and remain permanently unchanged.
///
/// You can declare a state variable of type PrivateImmutable within your contract's
/// #[storage] struct:
///
/// E.g.:
/// `your_variable: PrivateImmutable<YourNote, Context>`
///
/// The values of a PrivateImmutable are stored in the Aztec's private state and hence
/// are represented as notes. While any number of notes can be created within
/// a PrivateImmutable, at any moment, only one note exists per "owner."
/// To interact with a specific owner's note, call `PrivateImmutable::at(owner)`, which
/// returns an OwnedPrivateImmutable handle for that owner.
///
/// The OwnedPrivateImmutable type facilitates: inserting the permanent note during
/// initialization, and reading that note.
///
/// The methods of PrivateImmutable are:
/// - `initialize`
/// - `get_note`
/// (see the methods' own doc comments for more info).
///
/// ## Example.
///
/// A contract's configuration parameters can be represented as a PrivateImmutable.
/// Once set during contract deployment or initial setup, these parameters remain
/// constant for the lifetime of the contract. To ensure there is only one configuration
/// per contract you would consider valid only one view of the PrivateImmutable
/// (most likely the view constructed with the contract's address).
/// TODO(F-187): Update this ^
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
}

// Private storage slots are not really 'slots' but rather a value in the note hash preimage, so there is no notion of a
// value spilling over multiple slots. For this reason PrivateImmutable (and all other private state variables) needs
// just one slot to be reserved, regardless of what it stores.
impl<T, Context> HasStorageSlot<1> for PrivateImmutable<T, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> PrivateImmutable<Note, Context> {
    /// Initializes a new PrivateImmutable state variable.
    ///
    /// This function is usually automatically called within the #[storage] macro.
    /// You typically don't need to call this directly when writing smart contracts.
    ///
    /// # Arguments
    ///
    /// * `context` - One of `PrivateContext`/`PublicContext`/`UtilityContext`. The
    ///               Context determines which methods of this struct will be made
    ///               available to the calling smart contract function.
    /// * `storage_slot` - A unique identifier for this state variable within the
    ///                    contract. The permanent note for this PrivateImmutable
    ///                    state variable will have this `storage_slot`.
    ///                    Usually, the #[storage] macro will determine an
    ///                    appropriate storage_slot automatically. A smart contract
    ///                    dev shouldn't have to worry about this, as it's managed
    ///                    behind the scenes.
    ///
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }

    /// Returns an OwnedPrivateImmutable scoped to the given `owner`'s note.
    pub fn at(self, owner: AztecAddress) -> OwnedPrivateImmutable<Note, Context> {
        OwnedPrivateImmutable::new(self.context, owner, self.storage_slot)
    }
}

/// A view of a note in a PrivateImmutable belonging to a specific `owner`.
/// Obtained by calling `PrivateImmutable::at(owner)`.
pub struct OwnedPrivateImmutable<Note, Context> {
    context: Context,
    owner: AztecAddress,
    storage_slot: Field,
}

impl<Note, Context> OwnedPrivateImmutable<Note, Context> {
    fn new(context: Context, owner: AztecAddress, storage_slot: Field) -> Self {
        Self { context, owner, storage_slot }
    }

    /// Computes the initialization nullifier using the provided secret.
    fn compute_initialization_nullifier(self, secret: Field) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot, secret],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> OwnedPrivateImmutable<Note, &mut PrivateContext> {
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

    /// Initializes an OwnedPrivateImmutable state variable instance with a permanent note.
    ///
    /// This function inserts the single, permanent note for this state variable. It can
    /// only be called once per OwnedPrivateImmutable. Subsequent calls will fail because
    /// the initialization nullifier will already exist.
    ///
    /// Unlike OwnedPrivateMutable, this note will never be nullified or replaced through
    /// the state variable interface - it persists for the lifetime of the state variable.
    ///
    /// # Arguments
    ///
    /// * `note` - The permanent note to store in this PrivateImmutable. This note
    ///            contains the unchanging value of the state variable.
    ///
    /// # Returns
    ///
    /// * `NoteEmission<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///                          You can call `.emit()` on it to encrypt and log
    ///                          the note, or `.discard()` to skip emission.
    ///                          See NoteEmission for more details.
    ///
    /// # Advanced
    ///
    /// This function performs the following operations:
    /// - Creates and emits an initialization nullifier to mark this storage slot
    ///   as initialized. This prevents double-initialization.
    /// - Inserts the provided note into the protocol's Note Hash Tree.
    /// - Returns a NoteEmission type that allows the caller to decide how to encrypt
    ///   and deliver the note to its intended recipient.
    ///
    pub fn initialize(self, note: Note) -> NoteEmission<Note>
    where
        Note: NoteType + NoteHash + Packable,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents
        // the value from being initialized again as a nullifier can be included only once.
        let nullifier = self.get_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.owner, self.storage_slot, note)
    }

    /// Reads the permanent note of an OwnedPrivateImmutable state variable instance.
    ///
    /// If this OwnedPrivateImmutable state variable has not yet been initialized,
    /// no note will exist: the call will fail and the transaction will not
    /// be provable.
    ///
    /// # Returns
    ///
    /// * `Note` - The permanent note stored in this OwnedPrivateImmutable.
    ///
    /// # Advanced
    ///
    /// This function performs the following operations:
    /// - Retrieves the note from the PXE via an oracle call
    /// - Validates that the note exists and belongs to this contract address and
    ///   storage slot by pushing a read request to the context
    /// - Returns the note content directly without nullification
    ///
    /// Since the note is immutable, there's no risk of reading stale data or
    /// race conditions - the note never changes after initialization.
    ///
    pub fn get_note(self) -> Note
    where
        Note: NoteType + NoteHash + Packable,
    {
        let storage_slot = self.storage_slot;
        let retrieved_note = get_note(self.context, self.owner, storage_slot).0;

        // Because the notes obtained from OwnedPrivateImmutable are not meant to be nullified and get_note(...) function
        // has already constrained the note (by pushing a read request to the context), we can return just the note
        // and skip the additional data in RetrievedNote.
        retrieved_note.note
    }
}

impl<Note> OwnedPrivateImmutable<Note, UtilityContext>
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

    /// Checks whether this OwnedPrivateImmutable has been initialized.
    ///
    /// # Returns
    ///
    /// * `bool` - `true` if the OwnedPrivateImmutable has been initialized (the initialization
    ///            nullifier exists), `false` otherwise.
    ///
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.get_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    /// Returns the permanent note in this OwnedPrivateImmutable without consuming it.
    ///
    /// This function is only available in a UtilityContext (unconstrained environment)
    /// and is typically used for offchain queries, view functions, or testing.
    ///
    /// Unlike the constrained `get_note()`, this function does not push read requests
    /// or perform validation. It simply reads the note from the PXE's database.
    ///
    /// # Returns
    ///
    /// * `Note` - The permanent note stored in this OwnedPrivateImmutable.
    ///
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        view_note(self.owner, self.storage_slot).note
    }
}
