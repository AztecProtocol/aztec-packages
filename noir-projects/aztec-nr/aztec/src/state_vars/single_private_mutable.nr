use crate::{
    context::{PrivateContext, UtilityContext},
    keys::getters::{get_nsk_app, get_public_keys},
    note::{
        lifecycle::{create_note, destroy_note_unsafe},
        note_getter::{get_note, view_note},
        note_interface::{NoteHash, NoteType},
        note_message::NoteMessage,
    },
    oracle::notes::check_nullifier_exists,
    state_vars::state_variable::StateVariable,
};

use protocol_types::{
    address::AztecAddress,
    constants::GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
    hash::poseidon2_hash_with_separator,
    traits::{Hash, Packable},
};

mod test;

/// A state variable that holds a single private value that can be changed (unlike
/// [crate::state_vars::private_mutable::PrivateMutable], which holds one private value _per account_ - hence
/// the name 'single').
///
/// Because this private value has no semantic owner, it is up to the application to determine which accounts will
/// learn of its existence via [crate::note::note_message::NoteMessage::deliver_to].
///
/// # Usage
/// Unlike [crate::state_vars::private_immutable::PrivateImmutable] which is "owned" (requiring wrapping in an
/// [crate::state_vars::owned::Owned] state variable), SinglePrivateMutable is used directly in storage:
///
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     your_variable: SinglePrivateMutable<YourNote, Context>,
/// }
/// ```
///
/// Reading from a SinglePrivateMutable nullifies the current note, which restricts the use of this state variable to
/// situations where race conditions are not a concern. This is commonly the case when dealing with admin-only
/// functions.
///    Given that this state variable works with private state it makes sense to use it only when we need the value
/// to be known by a single individual or a closed set of parties.
///
/// # Examples
///
/// ## Account contract with signing key rotation
///
/// An account contract's signing key can be modeled as a SinglePrivateMutable<PublicKeyNote>. The "current value" of
/// this state variable holds the active signing key. When the account owner wishes to update the signing key, they
/// invoke the `replace` function, providing a new public key note as input.
///
/// ## Private Token
///
/// A private token's admin and total supply can be stored in two single private mutable state variables:
/// ```noir
/// #[storage]
/// struct Storage<Context> {
///     admin: SinglePrivateMutable<AddressNote, Context>,
///     total_supply: SinglePrivateMutable<UintNote, Context>,
///     balances: Owned<BalanceSet<Context>, Context>,
/// }
/// ```
///
/// When the mint or burn functions are invoked, we check that the message sender corresponds to the current value of
/// the admin state variable. Then we update the total supply and balances. The resulting note message can then be
/// delivered to an account whose encryption keys are known to a closed set of parties. With this approach, only
/// the admin can modify the total supply of the token, but anyone with the relevant encryption keys can audit it.
///
///
/// # Requirements
///
/// The contract that holds this state variable must have keys associated with it. This is because the initialization
/// nullifier includes the contract's nullifying secret key (nsk) in its preimage. This is expected to not ever be a
/// problem because the contracts that use SinglePrivateMutable generally have keys associated with them (account
/// contracts or escrow contracts).
///
/// # Warning
///
/// The methods of this state variable that replace the underlying note return a [NoteMessage] that allows you to
/// decide what method of note message delivery to use. Keep in mind that unless the caller of the relevant function is
/// incentivized to deliver the note you should use constrained delivery or you are at a risk of a malicious actor
/// bricking the contract.
pub struct SinglePrivateMutable<Note, Context> {
    context: Context,
    storage_slot: Field,
}

impl<Note, Context> StateVariable<1, Context> for SinglePrivateMutable<Note, Context> {
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<Note, Context> SinglePrivateMutable<Note, Context> {
    /// Computes the initialization nullifier using the provided secret.
    fn compute_initialization_nullifier(self, secret: Field) -> Field {
        poseidon2_hash_with_separator(
            [self.storage_slot, secret],
            GENERATOR_INDEX__INITIALIZATION_NULLIFIER,
        )
    }
}

impl<Note> SinglePrivateMutable<Note, &mut PrivateContext>
where
    Note: NoteType + NoteHash,
{
    /// Computes the nullifier that will be created when this SinglePrivateMutable is first initialized.
    ///
    /// This function is primarily used internally by the `initialize` and `initialize_or_replace` methods, but may also
    /// be useful for contracts that need to check if a SinglePrivateMutable has been initialized.
    fn get_initialization_nullifier(self) -> Field {
        let contract_address = self.context.this_address();
        let contract_npk_m = get_public_keys(contract_address).npk_m;
        let contract_npk_m_hash = contract_npk_m.hash();
        let secret = self.context.request_nsk_app(contract_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Initializes a SinglePrivateMutable state variable instance with its first `note` and returns a [NoteMessage]
    /// that allows you to decide what method of note message delivery to use for the new note.
    ///
    /// This function can only be called once per SinglePrivateMutable. Subsequent calls will fail because the
    /// initialization nullifier will already exist.
    pub fn initialize(self, note: Note, owner: AztecAddress) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        // Nullify the storage slot.
        let nullifier = self.get_initialization_nullifier();
        self.context.push_nullifier(nullifier);

        create_note(self.context, owner, self.storage_slot, note)
    }

    /// Reads the current note of a SinglePrivateMutable state variable, nullifies it, and inserts a new note for
    /// `new_owner` produced by the provided function `f`.
    ///
    /// This function returns a [NoteMessage] that allows you to decide what method of note message delivery to use for
    /// the new note.
    ///
    /// This function implements a "read-and-replace" pattern for updating private state in Aztec. It first retrieves
    /// the current note, then nullifies it (marking it as spent), and finally inserts a `new_note` produced by the
    /// user-provided function `f`. The function `f` takes the current note and returns a new note that will replace the
    /// current note and become the "current value".
    ///
    /// This function can only be called after the SinglePrivateMutable has been initialized. If called on an
    /// uninitialized SinglePrivateMutable, it will fail because there is no current note to replace. If you don't know
    /// if the state variable has been initialized already, you can use `initialize_or_replace` to handle both cases.
    ///
    /// The nullification of the previous note ensures that it cannot be used again, maintaining the invariant that a
    /// SinglePrivateMutable has exactly one current note.
    pub fn replace<Env>(
        self,
        f: fn[Env](Note) -> Note,
        new_owner: AztecAddress,
    ) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        let (prev_retrieved_note, note_hash_read) =
            get_note(self.context, Option::none(), self.storage_slot);

        // Nullify previous note.
        destroy_note_unsafe(self.context, prev_retrieved_note, note_hash_read);

        let new_note = f(prev_retrieved_note.note);

        // Add replacement note.
        create_note(self.context, new_owner, self.storage_slot, new_note)
    }

    /// Initializes the SinglePrivateMutable if it's uninitialized, or replaces the current note using a transform
    /// function `f` while the new note is owned by `new_owner`. The function `f` takes an `Option` with the current
    /// `Note` and returns the `Note` to insert. The `Option` is `none` if the state variable was not initialized.
    ///
    /// This function returns a [NoteMessage] that allows you to decide what method of note message delivery to use
    /// for the new note.
    pub fn initialize_or_replace<Env>(
        self,
        f: fn[Env](Option<Note>) -> Note,
        new_owner: AztecAddress,
    ) -> NoteMessage<Note>
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

        let emission_new_note = if !is_initialized {
            self.initialize(f(Option::none()), new_owner).get_new_note()
        } else {
            self.replace(|note| f(Option::some(note)), new_owner).get_new_note()
        };

        NoteMessage::new(emission_new_note, self.context)
    }

    /// Reads the current note of a SinglePrivateMutable state variable instance. The read is performed by nullifying
    /// the current note and inserting a new note with the same value. By nullifying the current note, we ensure that
    /// we're reading the latest note.
    ///
    /// This function returns a [NoteMessage] that allows you to decide what method of note message delivery to use
    /// for the new note.
    pub fn get_note(self) -> NoteMessage<Note>
    where
        Note: Packable,
    {
        let mut (retrieved_note, note_hash_read) =
            get_note(self.context, Option::none(), self.storage_slot);

        destroy_note_unsafe(self.context, retrieved_note, note_hash_read);

        create_note(
            self.context,
            retrieved_note.owner,
            self.storage_slot,
            retrieved_note.note,
        )
    }
}

impl<Note> SinglePrivateMutable<Note, UtilityContext>
where
    Note: NoteType + NoteHash + Eq,
{
    /// Computes the nullifier that will be created when this SinglePrivateMutable is first initialized.
    unconstrained fn get_initialization_nullifier(self) -> Field {
        let contract_address = self.context.this_address();
        let contract_npk_m = get_public_keys(contract_address).npk_m;
        let contract_npk_m_hash = contract_npk_m.hash();
        let secret = get_nsk_app(contract_npk_m_hash);
        self.compute_initialization_nullifier(secret)
    }

    /// Returns whether this SinglePrivateImmutable has been initialized.
    pub unconstrained fn is_initialized(self) -> bool {
        let nullifier = self.get_initialization_nullifier();
        check_nullifier_exists(nullifier)
    }

    /// Returns the current note in this SinglePrivateMutable.
    pub unconstrained fn view_note(self) -> Note
    where
        Note: Packable,
    {
        // The note owner is set to none rather than msg_sender(), which means that anyone with access to this note in
        // the PXE can read it.
        view_note(Option::none(), self.storage_slot).note
    }
}
