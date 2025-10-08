use dep::protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::Packable,
};

use crate::context::{PrivateContext, UtilityContext};
use crate::note::{
    lifecycle::create_note,
    note_emission::NoteEmission,
    note_getter::{get_note, view_notes},
    note_interface::{NoteHash, NoteType},
    note_viewer_options::NoteViewerOptions,
};
use crate::oracle::notes::check_nullifier_exists;
use crate::state_vars::storage::HasStorageSlot;

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
/// The value is represented as a single note that persists for the lifetime of
/// the state variable. Once initialized, this note is never nullified or replaced
/// through the state variable interface - it can only be read.
///
/// The PrivateImmutable type facilitates: inserting the permanent note during
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
/// constant for the lifetime of the contract.
///
/// ## Privacy
///
/// PrivateImmutable has the same privacy properties as PrivateMutable (see
/// PrivateMutable documentation), including the same privacy considerations
/// regarding the initialization nullifier potentially leaking information about
/// which storage slot was initialized.
///
/// # Generic Parameters:
///
/// * `Note` - A single note of this type will represent the PrivateImmutable's
///            value at the given storage_slot.
/// * `Context` - The execution context (PrivateContext or UtilityContext).
///
/// docs:start:struct
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
    /// docs:start:new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }

    /// Computes the nullifier that will be created when this PrivateImmutable is
    /// initialized.
    ///
    /// This function is primarily used internally by the `initialize` method, but
    /// may also be useful for contracts that need to check if a PrivateImmutable
    /// has been initialized.
    ///
    /// **IMPORTANT PRIVACY CONSIDERATION:**
    /// This computation has the same privacy implications as PrivateMutable's
    /// initialization nullifier (see PrivateMutable documentation for detailed
    /// explanation). The initialization nullifier can leak information about which
    /// storage slot was initialized.
    ///
    /// See https://github.com/AztecProtocol/aztec-packages/issues/15568 for ideas to
    /// improve this privacy footgun in future.
    ///
    /// # Returns
    ///
    /// * `Field` - The nullifier that will be emitted when this PrivateImmutable is
    ///             initialized.
    ///
    /// # Advanced
    ///
    /// The computation uses the Poseidon2 hash function with a specific generator
    /// index to hash the storage slot, creating a deterministic nullifier based on
    /// the storage location.
    ///
    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> PrivateImmutable<Note, &mut PrivateContext> {
    /// Initializes a PrivateImmutable state variable instance with a permanent note.
    ///
    /// This function inserts the single, permanent note for this state variable. It can
    /// only be called once per PrivateImmutable. Subsequent calls will fail because
    /// the initialization nullifier will already exist.
    ///
    /// Unlike PrivateMutable, this note will never be nullified or replaced through
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
    /// The initialization nullifier is deterministically computed from the storage
    /// slot and can leak privacy information (see `compute_initialization_nullifier`
    /// documentation).
    ///
    /// docs:start:initialize
    pub fn initialize(self, note: Note) -> NoteEmission<Note>
    where
        Note: NoteType + NoteHash + Packable,
    {
        // We emit an initialization nullifier to indicate that the struct is initialized. This also prevents
        // the value from being initialized again as a nullifier can be included only once.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.storage_slot, note)
    }

    /// Reads the permanent note of a PrivateImmutable state variable instance.
    ///
    /// If this PrivateImmutable state variable has not yet been initialized,
    /// no note will exist: the call will fail and the transaction will not
    /// be provable.
    ///
    /// # Returns
    ///
    /// * `Note` - The permanent note stored in this PrivateImmutable.
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
    /// docs:start:get_note
    pub fn get_note(self) -> Note
    where
        Note: NoteType + NoteHash + Packable,
    {
        let storage_slot = self.storage_slot;
        let retrieved_note = get_note(self.context, storage_slot).0;

        // Because the notes obtained from PrivateImmutable are not meant to be nullified and get_note(...) function
        // has already constrained the note (by pushing a read request to the context), we can return just the note
        // and skip the additional data in RetrievedNote.
        retrieved_note.note
    }
}

impl<Note> PrivateImmutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Checks whether this PrivateImmutable has been initialized.
    ///
    /// # Returns
    ///
    /// * `bool` - `true` if the PrivateImmutable has been initialized (the initialization
    ///            nullifier exists), `false` otherwise.
    ///
    /// docs:start:is_initialized
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.compute_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    /// Returns the permanent note in this PrivateImmutable without consuming it.
    ///
    /// This function is only available in a UtilityContext (unconstrained environment)
    /// and is typically used for offchain queries, view functions, or testing.
    ///
    /// Unlike the constrained `get_note()`, this function does not push read requests
    /// or perform validation. It simply reads the note from the PXE's database.
    ///
    /// # Returns
    ///
    /// * `Note` - The permanent note stored in this PrivateImmutable.
    ///
    /// docs:start:view_note
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        let mut options = NoteViewerOptions::<Note, <Note as Packable>::N>::new();
        view_notes(self.storage_slot, options.set_limit(1)).get(0)
    }
}
