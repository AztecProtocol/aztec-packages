use aztec::macros::aztec;

/// A contract that manages public authentication witnesses (authwits) on the Aztec network.
///
/// In Aztec, private authwits are verified by account contracts directly (via oracles on the user's device). Public
/// authwits, however, require this onchain registry because local oracles cannot be used for global execution. Users
/// pre-approve actions by storing `message_hash -> true` mappings via `set_authorized`, and consumer contracts verify
/// and atomically revoke these approvals via `consume`.
///
/// The `message_hash` includes the consumer address, chain ID, and protocol version, preventing cross-chain and
/// cross-contract replay. Each approval can only be consumed once. Users can also enable `reject_all` as an emergency
/// kill switch to invalidate all outstanding approvals at once.
///
/// Note that there is no expiration time enforced on the approved actions in this contract as this can be achieved by
/// including an expiration timestamp in the `message` (`message_hash` preimage) and having the consumer contract
/// constrain that value.
#[aztec]
pub contract AuthRegistry {
    use aztec::{
        authwit::auth::{assert_current_call_valid_authwit, compute_authwit_message_hash, IS_VALID_SELECTOR},
        macros::{functions::{external, only_self, view}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::{Map, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        /// Per-address flag that, when true, causes all `consume` calls for that address to revert. Provides an
        /// emergency "mass revocation" mechanism. Does not delete existing approvals - if later set back to false,
        /// unconsumed approvals become consumable again.
        reject_all: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        /// Per-user, per-message authorization status. `approved_actions[user][message_hash]` is set to true by
        /// `set_authorized` and atomically revoked by `consume` to prevent replay.
        approved_actions: Map<AztecAddress, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
    }

    /// Approves or revokes a `message_hash` for the `msg_sender`.
    #[external("public")]
    fn set_authorized(message_hash: Field, authorize: bool) {
        self.storage.approved_actions.at(self.msg_sender()).at(message_hash).write(authorize);
    }

    /// Enables or disables mass rejection of all authwits for `msg_sender`. When enabled, all `consume` calls for the
    /// `msg_sender` will revert regardless of individual approvals.
    #[external("public")]
    fn set_reject_all(reject: bool) {
        self.storage.reject_all.at(self.msg_sender()).write(reject);
    }

    /// Consumes (verifies and atomically revokes) an authorization on behalf of `on_behalf_of`.
    ///
    /// Called by consumer contracts (e.g. Token) to verify a user has authorized an action. Reverts if `reject_all`
    /// is set for `msg_sender`.
    ///
    /// Returns `IS_VALID_SELECTOR` (0x47dacd73) on success instead of a boolean. This follows the EIP-1271 pattern:
    /// a failed or malformed call would return the default zero value, which is indistinguishable from `false`. By
    /// requiring a specific magic value, the caller can reliably distinguish a successful validation from a failed
    /// call. The function also reverts on failure as a first line of defense, making the magic return value a
    /// defense-in-depth measure against subtle integration bugs on the caller side.
    #[external("public")]
    fn consume(on_behalf_of: AztecAddress, inner_hash: Field) -> Field {
        assert_eq(false, self.storage.reject_all.at(on_behalf_of).read(), "rejecting all");

        let message_hash = compute_authwit_message_hash(
            self.msg_sender(),
            self.context.chain_id(),
            self.context.version(),
            inner_hash,
        );

        let authorized = self.storage.approved_actions.at(on_behalf_of).at(message_hash).read();

        assert_eq(true, authorized, "unauthorized");

        self.storage.approved_actions.at(on_behalf_of).at(message_hash).write(false);

        IS_VALID_SELECTOR
    }

    /// Updates a public authwit for `approver` using a private authwit
    ///
    /// Useful for the case where you want someone else to insert a public authwit for you. For example, if Alice
    /// (`approver` in this scenario) wants Bob to insert an authwit in public, such that they can execute a trade,
    /// Alice can create a private authwit, and Bob can call this function with it.
    #[external("private")]
    fn set_authorized_private(approver: AztecAddress, message_hash: Field, authorize: bool) {
        assert_current_call_valid_authwit::<3>(self.context, approver);
        self.enqueue_self._set_authorized(approver, message_hash, authorize);
    }

    /// A function that writes an authorization entry for an arbitrary `approver`. Only callable by this contract
    /// itself (`#[only_self]`), ensuring it is only reachable through the validated `set_authorized_private` flow.
    #[external("public")]
    #[only_self]
    fn _set_authorized(approver: AztecAddress, message_hash: Field, authorize: bool) {
        self.storage.approved_actions.at(approver).at(message_hash).write(authorize);
    }

    /// Returns whether `on_behalf_of` has enabled the `reject_all` flag.
    #[external("public")]
    #[view]
    fn is_reject_all(on_behalf_of: AztecAddress) -> bool {
        self.storage.reject_all.at(on_behalf_of).read()
    }

    /// Returns whether a specific `message_hash` is currently consumable for `on_behalf_of`.
    #[external("public")]
    #[view]
    fn is_consumable(on_behalf_of: AztecAddress, message_hash: Field) -> bool {
        !self.storage.reject_all.at(on_behalf_of).read()
            & self.storage.approved_actions.at(on_behalf_of).at(message_hash).read()
    }

    /// Utility version of `is_consumable`
    #[external("utility")]
    unconstrained fn utility_is_consumable(on_behalf_of: AztecAddress, message_hash: Field) -> bool {
        !self.storage.reject_all.at(on_behalf_of).read()
            & self.storage.approved_actions.at(on_behalf_of).at(message_hash).read()
    }
}
