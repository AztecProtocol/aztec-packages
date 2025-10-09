use dep::protocol_types::{
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::Packable,
};

use crate::context::{PrivateContext, UtilityContext};
use crate::note::{
    lifecycle::{create_note, destroy_note_unsafe},
    note_emission::NoteEmission,
    note_getter::{get_note, view_note},
    note_interface::{NoteHash, NoteType},
};
use crate::note::retrieved_note::RetrievedNote;
use crate::oracle::notes::check_nullifier_exists;
use crate::state_vars::storage::HasStorageSlot;

mod test;

/// # PrivateMutable
///
/// PrivateMutable is a private state variable type, which enables you to read, mutate,
/// and write private state within the #[private] functions of your smart contract.
///
/// You can declare a state variable of type PrivateMutable within your contract's
/// #[storage] struct:
///
/// E.g.:
/// `your_variable: PrivateMutable<YourNote, Context>`
/// or:
/// `your_mapping: Map<Field, PrivateMutable<YourNote, Context>>`
///
/// The 'current' value of a PrivateMutable state variable is represented as a
/// _single_ note at any given time.
///
/// > More exactly, the 'current value' is the most recently inserted note that
/// > has not yet been nullified.
///
/// This is conceptually similar to how a regular variable works in Ethereum:
/// the state variable has exactly one value at any point in time. However, the
/// underlying implementation differs significantly because of Aztec's private
/// state model.
///
/// The PrivateMutable type operates over notes. A PrivateMutable state variable is
/// initialized by inserting a very first note. Subsequently, the PrivateMutable
/// can make changes to the state variable's value by nullifying the current note
/// and inserting a replacement note.
///
/// The methods of PrivateMutable are:
/// - `initialize`
/// - `replace`
/// - `initialize_or_replace`
/// - `get_note`
/// (see the methods' own doc comments for more info).
///
/// ## Example
///
/// A user's account nonce can be represented as a PrivateMutable<NonceNote>.
/// The "current value" of the user's nonce is the value contained within the
/// single not-yet-nullified note in this PrivateMutable.
///
/// When the nonce needs to be incremented, the current note gets nullified
/// and a new note with the incremented nonce gets inserted. The new note then
/// becomes the "current value" of the PrivateMutable state variable.
///
/// This is similar to how `uint256 nonce` would work in Solidity: there's always
/// exactly one current value, and updating it overwrites the previous value.
///
/// ## When to choose PrivateMutable vs PrivateSet:
///
/// - Use PrivateMutable when you want exactly one note to represent the state
///   variable's current value, similar to regular variables in Ethereum.
/// - Use PrivateMutable when you want only the 'owner' of the private state to
///   be able to make changes to it.
/// - Use PrivateSet when you want multiple notes to collectively represent the
///   state variable's current value (like a collection of token balance notes).
/// - Use PrivateSet when you want to allow "other people" (beyond the owner) to
///   insert notes into the state variable.
///
/// Only the 'owner' of a PrivateMutable state variable can mutate it, because
/// every mutation requires nullifying the current note, and only the owner who
/// knows the note's content can compute its nullifier.
///
/// ## Privacy
///
/// The methods of a PrivateMutable are only executable in a PrivateContext, and are
/// designed to not leak anything about _which_ state variable was read/modified/
/// initialized, to the outside world.
///
/// However, there is one important privacy consideration: the `initialize` method
/// creates an "initialization nullifier" that can leak information about which
/// storage slot was initialized. See the `initialize` method documentation for
/// more details, and for a concrete example.
///
/// The design of the Note impacts the privacy of the state variable: the note
/// should contain a `randomness` field so that, when hashed, the contents are
/// private. The note's `compute_nullifier` method will also impact privacy when
/// the note is nullified.
///
/// # Generic Parameters:
///
/// * `Note` - A single note of this type will represent the PrivateMutable's
///            current value at the given storage_slot.
/// * `Context` - The execution context (PrivateContext or UtilityContext).
///
/// docs:start:struct
pub struct PrivateMutable<Note, Context> {
    context: Context,
    storage_slot: Field,
}

// Private storage slots are not really 'slots' but rather a value in the note hash preimage, so there is no notion of a
// value spilling over multiple slots. For this reason PrivateMutable (and all other private state variables) needs just
// one slot to be reserved, regardless of what it stores.
impl<T, Context> HasStorageSlot<1> for PrivateMutable<T, Context> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> PrivateMutable<Note, Context> {
    /// Initializes a new PrivateMutable state variable.
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
    ///                    contract. Every replacement note for this PrivateMutable
    ///                    state variable will have the same `storage_slot`.
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

    /// Computes the nullifier that will be created when this PrivateMutable is first
    /// initialized.
    ///
    /// This function is primarily used internally by the `initialize` and
    /// `initialize_or_replace` methods, but may also be useful for contracts that
    /// need to check if a PrivateMutable has been initialized.
    ///
    /// ## Returns
    ///
    /// * `Field` - The nullifier that will be emitted when this PrivateMutable is
    ///             first initialized.
    ///
    /// ## Advanced
    ///
    /// The computation uses the Poseidon2 hash function with a specific generator
    /// index to hash the storage slot, creating a deterministic nullifier based on
    /// the storage location.
    ///
    /// Note: Subsequent nullifications via the `replace` method will NOT be leaky
    /// if the underlying note's `compute_nullifier()` method is designed to ensure privacy
    /// (e.g., by incorporating the note owner's nullifier secret key into the nullifier preimage).
    ///
    pub fn compute_initialization_nullifier(self) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> PrivateMutable<Note, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    /// Initializes a PrivateMutable state variable instance with its first note.
    ///
    /// This function creates the very first note for this state variable. It can
    /// only be called once per PrivateMutable. Subsequent calls will fail because
    /// the initialization nullifier will already exist.
    ///
    /// This is conceptually similar to setting an initial value for a variable in
    /// Ethereum smart contracts, except that in Aztec the "value" is represented
    /// as a private note.
    ///
    /// ## IMPORTANT PRIVACY CONSIDERATION
    ///
    /// This computation is leaky and can compromise privacy under certain
    /// circumstances.
    ///
    /// When the initialization nullifier is emitted during this call, an observer
    /// could perform a dictionary or rainbow attack to learn the storage slot and
    /// contract address.
    ///
    /// For applications where revealing that a particular state variable has been
    /// initialized is unacceptable, developers should consider alternative approaches
    /// or avoid using PrivateMutable.
    ///
    /// This is especially dangerous for initial assignments to elements of a
    /// `Map<AztecAddress, PrivateMutable>`, because the storage slot often identifies
    /// a specific user. For example, `my_map.at(msg.sender).initialize(note)` will
    /// leak:
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
    ///            becomes the "current value" of the state variable.
    ///
    /// ## Returns
    ///
    /// * `NoteEmission<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///   You can call `.emit()` on it to encrypt and log the note, or `.discard()`
    ///   to skip emission. See NoteEmission for more details.
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
    pub fn initialize(self, note: Note) -> NoteEmission<Note>
    where
        Note: Packable,
    {
        // Nullify the storage slot.
        let nullifier = self.compute_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, self.storage_slot, note)
    }

    /// Reads the current note of a PrivateMutable state variable, nullifies it,
    /// and inserts a new note produced by a user-provided function.
    ///
    /// This function implements a "read-and-replace" pattern for updating private state
    /// in Aztec. It first retrieves the current note, then nullifies it (marking it as spent),
    /// and finally inserts a `new_note` produced by the user-provided function `f`.
    ///
    /// This is conceptually similar to updating a variable in Ethereum smart contracts,
    /// except that in Aztec we achieve this by consuming the old note and creating a
    /// new one.
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
    /// * `NoteEmission<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///                          You can call `.emit()` on it to encrypt and log
    ///                          the note, or `.discard()` to skip emission.
    ///                          See NoteEmission documentation for more details.
    ///
    /// ## Advanced
    ///
    /// This function performs the following operations:
    /// - Retrieves the current note from the PXE via an oracle call
    /// - Validates that the current note exists and belongs to this storage slot
    /// - Computes the nullifier for the current note and pushes it to the context
    /// - Calls the user-provided function `f` to produce a new note
    /// - Inserts the resulting `new_note` into the Note Hash Tree using 'create_note'
    /// - Returns a NoteEmission type for the `new_note`, that allows the caller to
    ///   decide how to encrypt and deliver this note to its intended recipient.
    ///
    /// The nullification of the previous note ensures that it cannot be used again,
    /// maintaining the invariant that a PrivateMutable has exactly one current note.
    ///
    pub fn replace<Env>(self, f: fn[Env](Note) -> Note) -> NoteEmission<Note>
    where
        Note: Packable,
    {
        let (prev_retrieved_note, note_hash_for_read_request): (RetrievedNote<Note>, Field) =
            get_note(self.context, self.storage_slot);

        // Nullify previous note.
        destroy_note_unsafe(
            self.context,
            prev_retrieved_note,
            note_hash_for_read_request,
        );

        let new_note = f(prev_retrieved_note.note);

        // Add replacement note.
        create_note(self.context, self.storage_slot, new_note)
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
    /// * `NoteEmission<Note>` - A type-safe wrapper that requires you to decide
    ///                          whether to encrypt and send the note to someone.
    ///                          You can call `.emit()` on it to encrypt and log
    ///                          the note, or `.discard()` to skip emission.
    ///                          See NoteEmission documentation for more details.
    ///
    pub fn initialize_or_replace<Env>(self, f: fn[Env](Option<Note>) -> Note) -> NoteEmission<Note>
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
        let is_initialized =
            unsafe { check_nullifier_exists(self.compute_initialization_nullifier()) };

        if !is_initialized {
            self.initialize(f(Option::none()))
        } else {
            self.replace(|note| f(Option::some(note)))
        }
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
    /// * `NoteEmission<Note>` - A type-safe wrapper containing the newly-created note.
    ///                          You still need to decide whether to encrypt and send
    ///                          the note to someone. You can call `.emit()` on it to
    ///                          encrypt and log the note, or `.discard()` to skip
    ///                          emission. See NoteEmission documentation for more details.
    ///
    /// ## Advanced
    ///
    /// This function performs the "nullify-and-recreate" pattern:
    /// - Retrieves the current note from the PXE via an oracle call
    /// - Validates that the note exists and belongs to this contract address and
    ///   storage slot
    /// - Nullifies the current note to ensure that it is indeed current
    /// - Creates a new note with identical content but with fresh randomness
    /// - Returns a NoteEmission for the new note
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
    pub fn get_note(self) -> NoteEmission<Note>
    where
        Note: Packable,
    {
        let mut (retrieved_note, note_hash_for_read_request) =
            get_note(self.context, self.storage_slot);

        // Nullify current note to make sure it's reading the latest note.
        destroy_note_unsafe(self.context, retrieved_note, note_hash_for_read_request);

        // Add the same note again.
        // Because a nonce is added to every note in the kernel, its nullifier will be different.
        create_note(self.context, self.storage_slot, retrieved_note.note)
    }
}

impl<Note> PrivateMutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
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
        let nullifier = self.compute_initialization_nullifier();
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
    /// This is conceptually similar to view functions in Ethereum that don't modify
    /// state.
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
        view_note(self.storage_slot).note
    }
}
