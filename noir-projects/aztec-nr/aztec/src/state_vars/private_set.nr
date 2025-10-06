use crate::context::{PrivateContext, UtilityContext};
use crate::note::{
    constants::MAX_NOTES_PER_PAGE,
    lifecycle::{create_note, destroy_note_unsafe},
    note_emission::NoteEmission,
    note_getter::{get_notes, view_notes},
    note_getter_options::NoteGetterOptions,
    note_interface::{NoteHash, NoteType},
    note_viewer_options::NoteViewerOptions,
    utils::compute_note_hash_for_read_request,
};
use crate::note::retrieved_note::RetrievedNote;
use crate::state_vars::storage::HasStorageSlot;
use dep::protocol_types::{
    abis::read_request::ReadRequest, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    traits::Packable,
};

mod test;

/// # PrivateSet
///
/// PrivateSet is a private state variable type, which enables you to read, mutate,
/// and write private state within the #[private] functions of your smart contract.
///
/// You can declare a state variable of type PrivateSet within your contract's
/// #[storage] struct:
///
/// E.g.:
/// `your_variable: PrivateSet<YourNote, Context>`
/// or:
/// `your_mapping: Map<Field, PrivateSet<YourNote, Context>>`
///
/// The PrivateSet type operates over notes, by facilitating: the insertion
/// of new notes, the reading of existing notes, and the nullification of existing
/// notes.
///
/// The methods of PrivateSet are:
/// - `insert`
/// - `pop_notes`
/// - `get_notes`
/// - `remove`
/// (see the methods' own doc comments for more info).
///
/// The "current value" of a PrivateSet state variable is represented as a
/// _collection_ (or "Set") of multiple notes.
///
/// > More exactly, the 'current value' is the collection of all
/// > _not-yet-nullified_ notes in the set.
///
///
/// ## Example.
///
/// A user's token balance can be represented as a PrivateSet of multiple notes,
/// where the note type contains a value.
/// The "current value" of the user's token balance (the PrivateSet state variable)
/// can be interpreted as the summation of the values contained within all
/// not-yet-nullified notes (aka "current notes") in the PrivateSet.
///
/// This is similar to a physical wallet containing five $10 notes: the owner's
/// wallet balance is the sum of all those $10 notes: $50.
/// To spend $2, they can get one $10 note, nullify it, and insert one $8 note as
/// change. Their new wallet balance will then be interpreted as the new summation: $48.
///
/// The interpretation doesn't always have to be a "summation of values". When
/// `get_notes` is called, PrivateSet does not attempt to interpret the notes at all;
/// it's up to the custom code of the smart contract to make an interpretation.
///
/// For example: a set of notes could instead represent a moving average; or a modal
/// value; or some other single statistic. Or the set of notes might not be
/// collapsible into a single statistic: it could be a disjoint collection of NFTs
/// which are housed under the same "storage slot".
///
/// It's worth noting that a user can prove existence of _at least_ some subset
/// of notes in a PrivateSet, but they cannot prove existence of _all_ notes
/// in a PrivateSet.
/// The physical wallet is a good example: a user can prove that there are five
/// $10 notes in their wallet by furnishing those notes. But because we cannot
/// _see_ the entirety of their wallet, they might have many more notes that
/// they're choosing to not showing us.
///
/// ## When to choose PrivateSet vs PrivateMutable:
///
/// - If you want _someone else_ (other than the owner of the private state) to be
///   able to make edits (insert notes).
/// - If you don't want to leak the storage_slot being initialized (see the
///   PrivateMutable file).
/// - If you find yourself needing to re-initialize a PrivateMutable (see that file).
///
/// The 'current' value of a _PrivateMutable_ state variable is only ever represented
/// by _one_ note at a time. To mutate the current value of a PrivateMutable, the
/// current note always gets nullified, and a new, replacement note gets inserted.
/// So if nullification is always required to mutate a PrivateMutable, that means
/// only the 'owner' of a given PrivateMutable state variable can ever mutate it.
/// For some use cases, this can be too limiting: A key feature of some smart contract
/// functions is that _multiple people_ are able to mutate a particular state
/// variable.
///
/// PrivateSet enables "other people" (other than the owner of the private state) to
/// mutate the 'current' value, with some limitations:
/// The 'owner' is still the only person with the ability to `remove` notes from the
/// the set.
/// "Other people" can `insert` notes into the set.
///
/// It's important to notice that the "owner" of a state variable is an abstract
/// concept which will differ depending on the rules of a smart contract. When we
/// talk about the "owner" in the context of these aztec-nr files, we tend to mean
/// "the person who has the ability to nullify the state variable's notes".
/// Notice that the state variable abstractions of aztec-nr do not know what an
/// "owner" is: they delegate responsibility of understanding who the "owner" of a
/// note is to the note itself, via a `compute_nullifier` call.
///
///
/// ## Privacy
///
/// The methods of a PrivateSet are only executable in a PrivateContext, and are
/// designed to not leak anything about _which_ state variable was read/modified/
/// inserted, to the outside world.
///
/// The design of the Note does impact the privacy of the state variable: the note
/// will need to contain a `randomness` field so that, when hashed, the contents of
/// the note are private.
/// > Note: we decided to explicitly require `randomness` in a note definition,
/// > because we anticipated use cases where notes might also be used to store
/// > certain _public_ state. We might roll-back that decision, so that users don't
/// > need to worry about handling their own randomness when defining custom notes.
///
/// The design of the note's custom `compute_nullifier` method will also impact the
/// privacy of the note at the time it is nullified. (Note: all Notes must implement
/// `compute_nullifier` to be compatible with PrivateSet). See the docs.
///
///
/// # Struct Fields:
///
/// * context - The execution context (PrivateContext or UtilityContext).
/// * storage_slot -  All notes that "belong" to a given PrivateSet state variable
///                   are augmented with a common `storage_slot` field, as a way of
///   identifying which set they belong to. (Management of `storage_slot` is handled
///   within the innards of the PrivateSet impl, so you shouldn't need to think about
///   this any further).
///
///
/// # Generic Parameters:
///
/// * `Note` - Many notes of this type will collectively form the PrivateSet at the
///            given storage_slot.
/// * `Context` - The execution context (PrivateContext or UtilityContext).
///
/// docs:start:struct
pub struct PrivateSet<Note, Context> {
    pub context: Context,
    pub storage_slot: Field,
}

impl<T, Context> HasStorageSlot<1> for PrivateSet<T, Context> {
    // Private storage slots are not really 'slots' but rather a value in the note
    // hash preimage, so there is no notion of a value spilling over multiple slots.
    // For this reason, PrivateSet (and all other private state variables) needs
    // just one slot to be reserved, regardless of what it stores.
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> PrivateSet<Note, Context> {
    /// Initializes a new PrivateSet state variable.
    ///
    /// This function is usually automatically called within the #[storage] macro.
    /// You typically don't need to call this directly when writing smart contracts.
    ///
    ///
    /// # Arguments
    ///
    /// * `context` - One of `PrivateContext`/`PublicContext`/`UtilityContext`. The
    ///               Context determines which methods of this struct will be made
    ///               available to the calling smart contract function.
    /// * `storage_slot` - A unique identifier for this state variable within the
    ///                    contract. All notes that "belong" to a given PrivateSet
    ///                    state variable are augmented with a common `storage_slot`
    ///                    field, as a way of identifying which set they belong to.
    ///                    Usually, the #[storage] macro will determine an appropriate
    ///                    storage_slot automatically. A smart contract dev shouldn't
    ///                    have to worry about this, as it's managed behind the scenes.
    ///
    /// docs:start:new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PrivateSet { context, storage_slot }
    }
}

impl<Note> PrivateSet<Note, &mut PrivateContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Inserts a new `note` into the PrivateSet.
    ///
    /// # Arguments
    ///
    /// - `note` - A newly-created note that you would like to insert into this
    ///            PrivateSet.
    ///
    /// # Returns
    ///
    /// - NoteEmission<Note> - A type-safe wrapper which makes it clear to the
    ///                        smart contract dev that they now have a choice: they
    ///   need to decide whether they would like to send the contents of the newly-
    ///   created note to someone, or not. If they would like to, they have some
    ///   further choices:
    ///   - What kind of log to use? (Private log, or offchain log).
    ///   - What kind of encryption scheme to use? (Currently only AES128 is supported)
    ///   - Whether to _constrain_ delivery of the note, or not.
    ///   At the moment, aztec-nr provides limited options.
    ///   You can call `.emit()` on the returned type to encrypt and log the note, or
    ///   `.discard()` to skip emission.
    ///   See NoteEmission for more details.
    ///   > Note: We're planning a _significant_ refactor of this syntax, to make the
    ///     syntax of how to encrypt and deliver notes much clearer, and to make the
    ///     default options much clearer to developers. We will also be enabling
    ///     easier ways to customize your own note encryption options.
    ///
    /// # Advanced:
    ///
    /// Ultimately, this function inserts the `note` into the protocol's Note Hash
    /// Tree.
    /// Behind the scenes, we do the following:
    /// - Augment the note with the `storage_slot` of this PrivateSet, to
    ///   convey which set it belongs to.
    /// - Augment the note with a `note_type_id`, so that it can be correctly filed-
    ///   away when it is eventually discovered, decrypted, and processed by its
    ///   intended recipient.
    ///   (The note_type_id is usually allocated by the #[note] macro).
    /// - Provide the contents of the (augmented) note to the PXE, so that it can
    ///   store all notes created by the user executing this function.
    ///   - The note is also kept in the PXE's memory during execution, in case this
    ///     newly-created note gets _read_ in some later execution frame of this
    ///     transaction. In such a case, we feed hints to the kernel to squash:
    ///     the so-called "transient note", its note log (if applicable), and the
    ///     nullifier that gets created by the reading function.
    /// - Hash the (augmented) note into a single Field, via the note's own
    ///   `compute_note_hash` method.
    /// - Push the `note_hash` to the PrivateContext. From here, the protocol's
    ///   kernel circuits will take over and insert the note_hash into the protocol's
    ///   "note hash tree".
    ///   - Before insertion, the protocol will:
    ///     - "Silo" the `note_hash` with the `contract_address` of the calling
    ///       function, to yield a `siloed_note_hash`. This prevents state collisions
    ///       between different smart contracts.
    ///     - Ensure uniqueness of the `siloed_note_hash`, to prevent Faerie-Gold
    ///       attacks, by hashing the `siloed_note_hash` with a unique value, to
    ///       yield a `unique_siloed_note_hash` (see the protocol spec for more).
    ///
    /// docs:start:insert
    pub fn insert(self, note: Note) -> NoteEmission<Note>
    where
        Note: Packable,
    {
        create_note(self.context, self.storage_slot, note)
    }

    /// Pops a collection of "current" notes (i.e. not-yet-nullified notes) which
    /// belong to this PrivateSet.
    ///
    /// "Pop" indicates that, conceptually, the returned notes will get _permanently
    /// removed_ (nullified) from the PrivateSet by this method.
    ///
    /// The act of nullifying convinces us that the returned notes are indeed
    /// "current" (because if they can be nullified, it means they haven't been
    /// nullified already, because a note can only be nullified once).
    ///
    /// This means that -- whilst the returned notes should be considered "current"
    /// within the currently-executing execution frame of the tx -- they will be not
    /// be considered "current" by any _later_ execution frame of this tx (or any
    /// future tx).
    ///
    /// Notes will be selected from the PXE's database, via an oracle call, according
    /// to the filtering `options` provided.
    ///
    /// # Arguments
    ///
    /// - `options` - See NoteGetterOptions. Enables the caller to specify the
    ///               properties of the notes that must be returned by the oracle
    ///               call to the PXE.
    ///               The NoteGetterOptions are designed to contain functions which
    ///               _constrain_ that the returned notes do indeed adhere to the
    ///               specified options. Those functions are executed _within_ this
    ///               `pop_notes` call.
    ///
    /// # Returns
    ///
    /// - BoundedVec<Note, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>
    ///   - A vector of "current" notes, that have been constrained to satisfy the
    ///     retrieval criteria specified by the given `options`.
    ///
    /// # Generic Parameters
    ///
    /// * `PreprocessorArgs` - See `NoteGetterOptions`.
    /// * `FilterArgs` - See `NoteGetterOptions`.
    /// * `M` - The length of the note (in Fields), when packed by the Packable trait.
    ///
    /// # Advanced:
    ///
    /// Reads the notes:
    ///
    /// - Gets notes from the PXE, via an oracle call, according to the filtering
    ///   `options` provided.
    /// - Constrains that the returned notes do indeed adhere to the `options`.
    ///   (Note: the `options` contain _constrained_ functions that get invoked
    ///   _within_ this function).
    /// - Asserts that the notes do indeed belong to this calling function's
    ///   `contract_address`, and to this PrivateSet's `storage_slot`.
    /// - Computes the note_hash for each note, using the `storage_slot` and
    ///   `contract_address` of this PrivateSet instance.
    /// - Asserts that the note_hash does indeed exist:
    ///   - For settled notes: makes a request to the kernel to perform a merkle
    ///     membership check against the historical Note Hashes Tree that this tx
    ///     is referencing.
    ///   - For transient notes: makes a request to the kernel to ensure that the
    ///     note was indeed emitted by some earlier execution frame of this tx.
    ///
    /// Nullifies the notes:
    ///
    /// - Computes the nullifier for each note.
    ///   - (The nullifier computation differs depending on whether the note is
    ///     settled or transient).
    /// - Pushes the nullifiers to the PrivateContext. From here, the protocol's
    ///   kernel circuits will take over and insert the nullifiers into the
    ///   protocol's "nullifier tree".
    ///   - Before insertion, the protocol will:
    ///     - "Silo" each `nullifier` with the `contract_address` of the calling
    ///       function, to yield a `siloed_nullifier`. This prevents nullifier
    ///       collisions between different smart contracts.
    ///     - Ensure that each `siloed_nullifier` does not already exist in the
    ///       nullifier tree. The nullifier tree is an indexed merkle tree, which
    ///       supports efficient non-membership proofs.
    ///
    pub fn pop_notes<PreprocessorArgs, FilterArgs, let M: u32>(
        self,
        options: NoteGetterOptions<Note, M, PreprocessorArgs, FilterArgs>,
    ) -> BoundedVec<Note, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>
    where
        Note: Packable<N = M>,
    {
        let (retrieved_notes, note_hashes) = get_notes(self.context, self.storage_slot, options);
        // We iterate in a range 0..options.limit instead of 0..notes.len() because options.limit is known at compile
        // time and hence will result in fewer constraints when set to a lower value than
        // MAX_NOTE_HASH_READ_REQUESTS_PER_CALL.
        for i in 0..options.limit {
            if i < retrieved_notes.len() {
                let retrieved_note = retrieved_notes.get_unchecked(i);
                let note_hash = note_hashes.get_unchecked(i);
                // We immediately destroy the note without doing any of the read request checks `remove` typically
                // performs because we know that the `get_notes` call has already placed those constraints.
                destroy_note_unsafe(self.context, retrieved_note, note_hash);
            }
        }

        // Since the notes were already destroyed, we no longer need the additional data in RetrievedNote and can
        // discard it.
        retrieved_notes.map(|retrieved_note| retrieved_note.note)
    }

    /// Permanently removes (conceptually) the given note from this PrivateSet,
    /// by nullifying it.
    ///
    /// Note that if you obtained the note via `get_notes` it's much better to use
    /// `pop_notes`, as `pop_notes` results in significantly fewer constraints,
    /// due to avoiding an extra hash and read request check.
    ///
    /// # Arguments
    ///
    /// - `retrieved_note` - A note which -- earlier in the calling function's
    ///                      execution -- has been retrieved from the PXE.
    ///                      The `retrieved_note` is constrained to have been read
    ///                      from the i
    ///
    /// # Returns
    ///
    /// - NoteEmission<Note> - A type-safe wrapper which makes it clear to the
    ///                        smart contract dev that they now have a choice: they
    ///   need to decide whether they would like to send the contents of the newly-
    ///   created note to someone, or not. If they would like to, they have some
    ///   further choices:
    ///   - What kind of log to use? (Private log, or offchain log).
    ///   - What kind of encryption scheme to use? (Currently only AES128 is supported)
    ///   - Whether to _constrain_ delivery of the note, or not.
    ///   At the moment, aztec-nr provides limited options.
    ///   See NoteEmission for further details.
    ///   > Note: We're planning a _significant_ refactor of this syntax, to make the
    ///     syntax of how to encrypt and deliver notes much clearer, and to make the
    ///     default options much clearer to developers. We will also be enabling
    ///     easier ways to customize your own note encryption options.
    ///
    pub fn remove(self, retrieved_note: RetrievedNote<Note>) {
        let note_hash = compute_note_hash_for_read_request(retrieved_note, self.storage_slot);
        let has_been_read =
            self.context.note_hash_read_requests.any(|r: ReadRequest| r.value == note_hash);
        assert(has_been_read, "Can only remove a note that has been read from the set.");

        destroy_note_unsafe(self.context, retrieved_note, note_hash);
    }

    /// Returns a collection of which belong to this PrivateSet.
    ///
    /// DANGER: the returned notes do not get nullified within this `get_notes`
    /// function, and so they cannot necessarily be considered "current" notes.
    /// I.e. you might be reading notes that have already been nullified. It is
    /// this which distinguishes `get_notes` from `pop_notes`.
    ///
    /// Note that if you later on remove the note it's much better to use
    /// `pop_notes` as `pop_notes` results in significantly fewer constrains
    /// due to avoiding 1 read request check.
    /// If you need for your app to see the notes before it can decide which to
    /// nullify (which ideally would not be the case, and you'd be able to rely
    /// on the filter and preprocessor to do this), then you have no resort but
    /// to call `get_notes` and then `remove`.
    ///
    /// Notes will be selected from the PXE's database, via an oracle call, according
    /// to the filtering `options` provided.
    ///
    /// # Arguments
    ///
    /// - `options` - See NoteGetterOptions. Enables the caller to specify the
    ///               properties of the notes that must be returned by the oracle
    ///               call to the PXE.
    ///               The NoteGetterOptions are designed to contain functions which
    ///               _constrain_ that the returned notes do indeed adhere to the
    ///               specified options. Those functions are executed _within_ this
    ///               `pop_notes` call.
    ///
    /// # Returns
    ///
    /// - BoundedVec<Note, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>
    ///   - A vector of "current" notes, that have been constrained to satisfy the
    ///     retrieval criteria specified by the given `options`.
    ///
    /// # Generic Parameters
    ///
    /// * `PreprocessorArgs` - See `NoteGetterOptions`.
    /// * `FilterArgs` - See `NoteGetterOptions`.
    /// * `M` - The length of the note (in Fields), when packed by the Packable trait.
    ///
    /// # Advanced:
    ///
    /// Reads the notes:
    ///
    /// - Gets notes from the PXE, via an oracle call, according to the filtering
    ///   `options` provided.
    /// - Constrains that the returned notes do indeed adhere to the `options`.
    ///   (Note: the `options` contain _constrained_ functions that get invoked
    ///   _within_ this function).
    /// - Asserts that the notes do indeed belong to this calling function's
    ///   `contract_address`, and to this PrivateSet's `storage_slot`.
    /// - Computes the note_hash for each note, using the `storage_slot` and
    ///   `contract_address` of this PrivateSet instance.
    /// - Asserts that the note_hash does indeed exist:
    ///   - For settled notes: makes a request to the kernel to perform a merkle
    ///     membership check against the historical Note Hashes Tree that this tx
    ///     is referencing.
    ///   - For transient notes: makes a request to the kernel to ensure that the
    ///     note was indeed emitted by some earlier execution frame of this tx.
    ///
    pub fn get_notes<PreprocessorArgs, FilterArgs, let M: u32>(
        self,
        options: NoteGetterOptions<Note, M, PreprocessorArgs, FilterArgs>,
    ) -> BoundedVec<RetrievedNote<Note>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>
    where
        Note: Packable<N = M>,
    {
        get_notes(self.context, self.storage_slot, options).0
    }
}

impl<Note> PrivateSet<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Returns a collection of notes which belong to this PrivateSet, according
    /// to the given selection `options`.
    ///
    /// Notice that this function is executable only within a UtilityContext, which
    /// is an unconstrained environment on the user's local device.
    ///
    /// # Arguments
    ///
    /// - `options` - See NoteGetterOptions. Enables the caller to specify the
    ///               properties of the notes that must be returned by the oracle
    ///               call to the PXE.
    ///
    /// docs:start:view_notes
    pub unconstrained fn view_notes(
        self,
        options: NoteViewerOptions<Note, <Note as Packable>::N>,
    ) -> BoundedVec<Note, MAX_NOTES_PER_PAGE>
    where
        Note: Packable,
    {
        view_notes(self.storage_slot, options)
    }
}
