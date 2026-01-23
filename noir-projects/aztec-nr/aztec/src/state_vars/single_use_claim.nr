use dep::protocol_types::{
    address::AztecAddress, constants::DOM_SEP__NOTE_HASH, hash::poseidon2_hash_with_separator,
    traits::Hash,
};

use crate::{
    context::{PrivateContext, UtilityContext},
    keys::getters::{get_nsk_app, get_public_keys},
    nullifier::utils::compute_nullifier_existence_request,
    oracle::nullifiers::check_nullifier_exists,
    state_vars::owned_state_variable::OwnedStateVariable,
};

mod test;

/// A private state variable type that represents a right each user can exercise at most once.
///
/// Because it is _owned_, you must wrap a [SingleUseClaim] inside an [crate::state_vars::owned::Owned] state variable
/// when using it in storage.
///
/// ## Example
///
/// The right to vote at most once can be implemented using [SingleUseClaim] as a primitive.
///
/// ```noir
/// #[derive(Serialize, Deserialize)]
/// struct ElectionId { id: Field }
///
/// #[storage]
/// struct Storage<Context> {
///     // election => candidate => number of votes
///     tally: Map<ElectionId, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
///     // track right to vote at most once per election
///     vote_claims: Map<ElectionId, Owned<SingleUseClaim<Context>, Context>, Context>,
/// }
///
/// #[external("private")]
/// fn cast_vote(election_id: ElectionId, candidate: Field) {
///     let voter = self.msg_sender();
///
///     // `claim` will only succeed if `voter` hasn't already claimed for this `election_id` before.
///     self.storage.vote_claims.at(election_id).at(voter).claim();
///
///     // Now that we checked that the voter is entitled to vote,
///     // we can enqueue the corresponding public effect
///     self.enqueue_self.add_to_tally_public(election_id, candidate);
/// }
/// ```
///
/// For more details on what _owned_ means, see the documentation for the [OwnedStateVariable] trait.
///
/// ## Cost
///
/// Exercising a claim (via the [SingleUseClaim::claim] function) emits one nullifier.
///
/// ## Privacy considerations
///
/// The [SingleUseClaim::claim] function emits a public nullifier per owner: it's fully private,
/// hidden behind the owner's app-siloed nullifier secret key (aka `nsk`).
///
/// Public effects you emit alongside a claim (e.g. a  public function call to update a tally)
/// may still let observers infer who likely exercised the claim, so consider that when designing flows.
/// ```
pub struct SingleUseClaim<Context> {
    context: Context,
    storage_slot: Field,
    owner: AztecAddress,
}

impl<Context> OwnedStateVariable<Context> for SingleUseClaim<Context> {
    fn new(context: Context, storage_slot: Field, owner: AztecAddress) -> Self {
        Self { context, storage_slot, owner }
    }
}

impl<Context> SingleUseClaim<Context> {
    /// Computes the nullifier that will be created when the single use claim is claimed
    /// by the owner (denoted by the app-siloed nullifier secret key `owner_nsk_app`).
    ///
    /// This function is primarily used internally by functions [SingleUseClaim::claim], [SingleUseClaim::assert_claimed] and
    /// [SingleUseClaim::has_claimed] to coherently write and read state.
    fn compute_nullifier(self, owner_nsk_app: Field) -> Field {
        // TODO(F-180): make sure we follow the nullifier convention
        poseidon2_hash_with_separator([owner_nsk_app, self.storage_slot], DOM_SEP__NOTE_HASH)
    }
}

impl SingleUseClaim<&mut PrivateContext> {
    /// Records the fact that the owner in scope has claimed this single use claim.
    ///
    /// This function succeeds at most once for a given `owner`. Any subsequent calls with same owner are
    /// guaranteed to fail.
    ///
    /// Note that, by itself, calling this function doesn't do anything other than prevent it being called again
    /// with the same owner. Its invocation is typically accompanied by other contract actions, e.g. minting tokens,
    /// casting a vote, etc.
    ///
    /// ## Advanced
    ///
    /// The implementation of this function emits a nullifier derived from
    /// the `owner`'s nullifier secret key and the storage slot of the underlying state variable.
    pub fn claim(self) {
        let owner_nsk_app = self.context.request_nsk_app(get_public_keys(self.owner).npk_m.hash());
        self.context.push_nullifier(self.compute_nullifier(owner_nsk_app));
    }

    /// Asserts that the owner has already claimed this single use claim
    /// (i.e. that [SingleUseClaim::claim] has been called).
    ///
    /// ## Advanced
    ///
    /// This function generates a kernel nullifier read request, so it can even assert the existence of
    /// pending claims, i.e. when [SingleUseClaim::claim] was called in the same transaction as
    /// [SingleUseClaim::assert_claimed].
    pub fn assert_claimed(self) {
        let owner_nsk_app = self.context.request_nsk_app(get_public_keys(self.owner).npk_m.hash());
        let nullifier = self.compute_nullifier(owner_nsk_app);

        // Safety: `check_nullifier_exists` is an unconstrained function - we can constrain a true value
        // by providing an inclusion proof of the nullifier, but cannot constrain a false value since
        // a non-inclusion proof would only be valid if done in public.
        // We use this check to be able to test this function works properly on synthetic envs
        // like TXE, but we still need to use `push_nullifier_read_request` to ensure this
        // existence check is also performed by the kernel.
        let has_been_claimed = unsafe { check_nullifier_exists(nullifier) };
        assert(has_been_claimed, "cannot prove claim exists");

        let nullifier_existence_request =
            compute_nullifier_existence_request(nullifier, self.context.this_address());
        self.context.assert_nullifier_exists(nullifier_existence_request)
    }
}

impl SingleUseClaim<UtilityContext> {
    /// Returns whether an owner has claimed this single use claim.
    pub unconstrained fn has_claimed(self) -> bool {
        let owner_nsk_app = get_nsk_app(get_public_keys(self.owner).npk_m.hash());
        check_nullifier_exists(self.compute_nullifier(owner_nsk_app))
    }
}
