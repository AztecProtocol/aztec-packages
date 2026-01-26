use crate::{
    context::{PrivateContext, UtilityContext},
    keys::getters::{get_nsk_app, get_public_keys},
    note::{
        lifecycle::{create_note, destroy_note},
        note_getter::{get_note, view_note},
        note_interface::{NoteHash, NoteType},
        NoteMessage,
    },
    oracle::nullifiers::check_nullifier_exists,
    state_vars::OwnedStateVariable,
};

use protocol_types::{
    address::AztecAddress,
    constants::DOM_SEP__INITIALIZATION_NULLIFIER,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Packable},
};

mod test;

/// Per-account mutable private state.
///
/// PrivateMutable is an owned state variable type that represents a private value that can be changed. Because it is
/// "owned," you must wrap a PrivateMutable inside an Owned state variable when storing it:
///
/// E.g.:
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     your_variable: Owned<PrivateMutable<YourNote, Context>, Context>,
/// }
/// ```
///
/// For more details on what "owned" means, see the documentation for the [OwnedStateVariable] trait.
///
/// A PrivateMutable state variable is initialized by inserting a very first note. Subsequently, the PrivateMutable can
/// make changes to the state variable's value by nullifying the current note and inserting a replacement note.
///
/// ## Example
///
/// A user's account nonce can be represented as a PrivateMutable<NonceNote>. The "current value" of the user's nonce is
/// the value contained within the single not-yet-nullified note in the user's view of the PrivateMutable.
///
/// When the nonce needs to be incremented, the current note gets nullified and a new note with the incremented nonce
/// gets inserted. The new note then becomes the "current value" of the PrivateMutable state variable.
///
/// This is similar to how `uint256 nonce` would work in Solidity: there's always exactly one current value, and
/// updating it overwrites the previous value.
///
/// ## When to choose PrivateMutable vs PrivateSet:
///
/// - Use PrivateMutable when you want exactly one note to represent the state variable's current value, similar to
///   regular variables in Solidity.
/// - Use PrivateMutable when you want only the 'owner' of the private state to be able to make changes to it.
/// - Use PrivateSet when you want multiple notes to collectively represent the state variable's current value (like a
///   collection of token balance notes).
/// - Use PrivateSet when you want to allow "other people" (beyond the owner) to insert notes into the state variable.
///
/// Only the 'owner' of the given PrivateMutable state variable can mutate it, because every mutation requires
/// nullifying the current note, and only the owner knows both the note's content and the secret necessary to compute
/// its nullifier.
///
/// ## Privacy
///
/// The methods of a PrivateMutable are only executable in a PrivateContext, and are designed to not leak anything about
/// _which_ state variable was read/modified/initialized, to the outside world.
///
/// # Generic Parameters:
///
/// * `Note` - A single note of this type will represent the PrivateMutable's current value at the given storage_slot.
/// * `Context` - The execution context (PrivateContext or UtilityContext).
///
pub struct PrivateMutable<Note, Context> {
    context: Context,
    storage_slot: Field,
    owner: AztecAddress,
}

impl<Note, Context> OwnedStateVariable<Context> for PrivateMutable<Note, Context> {
    fn new(context: Context, storage_slot: Field, owner: AztecAddress) -> Self {
        Self { context, storage_slot, owner }
    }
}

impl<Note, Context> PrivateMutable<Note, Context> {
    /// Computes the initialization nullifier using the provided secret.
    fn compute_initialization_nullifier(self, secret: Field) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot, secret],
            DOM_SEP__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> PrivateMutable<Note, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    /// Computes the nullifier that will be created when this PrivateMutable is first initialized.
    ///
    /// This function is primarily used internally by the `initialize` and `initialize_or_replace` methods, but may also
    /// be useful for contracts that need to check if a PrivateMutable has been initialized.
    ///
    fn get_initialization_nullifier(self) -> Field {
        let owner_npk_m = get_public_keys(self.owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = self.context.request_nsk_app(owner_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Initializes a PrivateMutable state variable instance with its first `note`.
    ///
    /// This function creates the very first note for this state variable. It can
    /// only be called once per PrivateMutable. Subsequent calls will fail because
    /// the initialization nullifier will already exist.
    ///
    /// This is conceptually similar to setting an initial value for a variable in
    /// Ethereum smart contracts under a user's address in a mapping, except that in Aztec
    /// the "value" is represented as a private note.
    ///
    /// ## Arguments
    ///
    /// * `note` - The initial note to store in this PrivateMutable. This note
    ///            becomes the "current value" of the state variable.
    ///
    /// ## Returns
    ///
    /// * `NoteMessage<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///   You can call `.deliver()` on it to encrypt and deliver the note. See NoteMessage for more details.
    ///
    /// ## Advanced
    ///
    /// This function performs the following operations:
    /// - Creates and emits an initialization nullifier to mark this storage slot
    ///   as initialized. This prevents double-initialization.
    /// - Inserts the provided note into the protocol's Note Hash Tree.
    /// - Returns a NoteMessage type that allows the caller to decide how to encrypt
    ///   and deliver the note to its intended recipient.
    ///
    /// The initialization nullifier is deterministically computed from the storage
    /// slot and can leak privacy information (see `compute_initialization_nullifier`
    /// documentation).
    pub fn initialize(self, note: Note) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        // Nullify the storage slot.
        let nullifier = self.get_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.owner, self.storage_slot, note)
    }

    /// Reads the current note of a PrivateMutable state variable, nullifies it,
    /// and inserts a new note produced by a user-provided function.
    ///
    /// This function implements a "read-and-replace" pattern for updating private state
    /// in Aztec. It first retrieves the current note, then nullifies it (marking it as spent),
    /// and finally inserts a `new_note` produced by the user-provided function `f`.
    ///
    /// This function can only be called after the PrivateMutable has been initialized.
    /// If called on an uninitialized PrivateMutable, it will fail because there is
    /// no current note to replace. If you don't know if the state variable has been
    /// initialized already, you can use `initialize_or_replace` to handle both cases.
    ///
    /// ## Arguments
    ///
    /// * `f` - A function that takes the current `Note` and returns a new `Note` that
    ///         will replace it and become the "current value".
    ///
    /// ## Returns
    ///
    /// * `NoteMessage<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///                          You can call `.deliver()` on it to encrypt and log
    ///                          the note.
    ///                          See NoteMessage documentation for more details.
    ///
    /// ## Advanced
    ///
    /// This function performs the following operations:
    /// - Retrieves the current note from the PXE via an oracle call
    /// - Validates that the current note exists and belongs to this storage slot
    /// - Computes the nullifier for the current note and pushes it to the context
    /// - Calls the user-provided function `f` to produce a new note
    /// - Inserts the resulting `new_note` into the Note Hash Tree using 'create_note'
    /// - Returns a NoteMessage type for the `new_note`, that allows the caller to
    ///   decide how to encrypt and deliver this note to its intended recipient.
    ///
    /// The nullification of the previous note ensures that it cannot be used again,
    /// maintaining the invariant that a PrivateMutable has exactly one current note.
    ///
    pub fn replace<Env>(self, f: fn[Env](Note) -> Note) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        let prev_confirmed_note =
            get_note(self.context, Option::some(self.owner), self.storage_slot);

        // Nullify previous note.
        destroy_note(self.context, prev_confirmed_note);

        let new_note = f(prev_confirmed_note.note);

        // Add replacement note.
        create_note(self.context, self.owner, self.storage_slot, new_note)
    }

    /// Initializes the PrivateMutable if it's uninitialized, or replaces the current note
    /// using a transform function.
    ///
    /// If uninitialized, `init_note` is used to initialize. If already initialized, the `transform_fn`
    /// is passed to `replace`, which retrieves the current note, nullifies it, and inserts the transformed note.
    ///
    /// ## Arguments
    ///
    /// * `f` - A function that takes an `Option` with the current `Note` and returns the `Note` to insert. This allows
    ///         you to transform the current note before it is reinserted. The `Option` is `none` if the state variable
    ///         was not initialized.
    ///
    ///
    /// ## Returns
    ///
    /// * `NoteMessage<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///                          You can call `.deliver()` on it to encrypt and log
    ///                          the note.
    ///                          See NoteMessage documentation for more details.
    ///
    pub fn initialize_or_replace<Env>(self, f: fn[Env](Option<Note>) -> Note) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        // Safety: `check_nullifier_exists` is an unconstrained function - we can constrain a true value
        // by providing an inclusion proof of the nullifier, but cannot constrain a false value since
        // a non-inclusion proof would only be valid if done in public.
        // Ultimately, this is not an issue given that we'll either:
        //  - initialize the state variable, which would fail if it was already initialized due to the duplicate
        //    nullifier, or
        //  - replace the current value, which would fail if it was not initialized since we wouldn't be able
        //    to produce an inclusion proof for the current note
        // This means that an honest oracle will assist the prover to produce a valid proof, while a malicious
        // oracle (i.e. one that returns an incorrect value for is_initialized) will simply fail to produce
        // a proof.
        let is_initialized = unsafe { check_nullifier_exists(self.get_initialization_nullifier()) };

        // We call `initialize` or `replace` depending on initialization. However, these functions return a
        // `NewNoteMessage`, which we cannot return from if-else branches as it contains a mutable reference to the
        // context (which are forbidden to have in ifs).
        // We therefore return the `NewNote`s inside the `NewNoteMessage`s and create a `NewNoteMessage` outside the
        // if-else.
        let new_note = if !is_initialized {
            self.initialize(f(Option::none())).new_note
        } else {
            self.replace(|note| f(Option::some(note))).new_note
        };

        NoteMessage::new(new_note, self.context)
    }

    /// Reads the current note of a PrivateMutable state variable instance.
    ///
    /// This function retrieves the current note, but with an important caveat: reading
    /// a "current" note requires nullifying it to ensure that it is indeed current,
    /// and that it and hasn't been nullified by some earlier transaction.
    /// Having nullified the note, we then need to re-insert a new note with equal
    /// value, so that this value remains available for future functions to read it
    /// as "current".
    ///
    /// This is different from reading variables in Ethereum, where reading doesn't
    /// modify the state. In Aztec's private state model, reading a "current" note
    /// "consumes" it and creates a new note of equal value but with fresh
    /// randomness.
    ///
    /// The returned note has the same content as the original but is actually the
    /// newly-created note.
    ///
    /// ## Returns
    ///
    /// * `NoteMessage<Note>` - A type-safe wrapper containing the newly-created note.
    ///                          You still need to decide whether to encrypt and send
    ///                          the note to someone. You can call `.deliver()` on it to
    ///                          encrypt and log the note. See NoteMessage
    ///                          documentation for more details.
    ///
    /// ## Advanced
    ///
    /// This function performs the "nullify-and-recreate" pattern:
    /// - Retrieves the current note from the PXE via an oracle call
    /// - Validates that the note exists and belongs to this contract address and
    ///   storage slot
    /// - Nullifies the current note to ensure that it is indeed current
    /// - Creates a new note with identical content but with fresh randomness
    /// - Returns a NoteMessage for the new note
    ///
    /// This pattern ensures that:
    /// - You're always reading the most up-to-date note
    /// - Concurrent transactions can't create race conditions
    /// - The note remains available for future reads (via the fresh copy)
    ///
    /// The kernel will inject a unique nonce into the newly-created note, which means
    /// the new note will have a different nullifier, allowing it to be consumed in
    /// the future.
    ///
    /// docs:start:get_note
    pub fn get_note(self) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        let confirmed_note = get_note(self.context, Option::some(self.owner), self.storage_slot);

        // Nullify current note to make sure it's reading the latest note.
        destroy_note(self.context, confirmed_note);

        // Add the same note again.
        // Because a nonce is added to every note in the kernel, its nullifier will be different.
        create_note(
            self.context,
            self.owner,
            self.storage_slot,
            confirmed_note.note,
        )
    }
}

impl<Note> PrivateMutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Computes the nullifier that will be created when this PrivateMutable is first initialized.
    unconstrained fn get_initialization_nullifier(self) -> Field {
        let owner_npk_m = get_public_keys(self.owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Checks whether this PrivateMutable has been initialized.
    ///
    /// Notice that this function is executable only within a UtilityContext, which
    /// is an unconstrained environment on the user's local device.
    ///
    /// ## Returns
    ///
    /// * `bool` - `true` if the PrivateMutable has been initialized (the initialization
    ///            nullifier exists), `false` otherwise.
    ///
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.get_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    /// Returns the current note in this PrivateMutable without consuming it.
    ///
    /// This function is only available in a UtilityContext (unconstrained environment)
    /// and is typically used for offchain queries, view functions, or testing.
    ///
    /// Unlike `get_note()`, this function does NOT nullify and recreate the note.
    /// It simply reads the current note from the PXE's database without modifying
    /// the state. This makes it suitable for read-only operations.
    ///
    /// ## Returns
    ///
    /// * `Note` - The current note stored in this PrivateMutable.
    ///
    /// docs:start:view_note
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        view_note(Option::some(self.owner), self.storage_slot).note
    }
}
