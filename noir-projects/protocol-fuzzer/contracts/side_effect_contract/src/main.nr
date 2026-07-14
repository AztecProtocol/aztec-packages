use aztec::macros::aztec;

/// Test contract for the protocol fuzzer's side-effect state machine.
///
/// In Aztec, "side effects" are the state-mutating outputs that a transaction
/// appends to the rollup: note hashes, nullifiers, log hashes, l2-to-l1
/// messages, etc. Each function in this contract triggers a different
/// combination of these side effects so the fuzzer can verify the protocol
/// handles them correctly end-to-end:
///
/// - Note hashes: `call_create_note`, `call_create_and_complete_partial_note`
/// - Nullifiers (from note destruction): `call_destroy_note`
/// - Raw nullifier emission: `emit_nullifier`
/// - Note read requests: `call_get_notes_many`, `test_note_inclusion`
/// - Unconstrained note queries: `call_view_notes_many`
/// - Archive inclusion proofs: `test_settled_nullifier_inclusion`
/// - L2->L1 messages: `send_l2_to_l1_message`
/// - Private log emissions: `emit_private_log`
/// - Key validation requests: `request_ovsk_app`
/// - Public teardown execution: `test_setting_teardown` / `dummy_public_call`
///
/// Uses `UintNote` with caller-chosen storage slots (no declared storage)
/// so the fuzzer can exercise multiple independent note sets.
/// Returns `[u128; 2]` from query functions, with 0 as the "no note" sentinel.
///
/// Some functions can also be called indirectly via the `Parent` contract
/// to exercise cross-contract call paths.
#[aztec]
pub contract SideEffect {
    use aztec::{
        hash::compute_siloed_nullifier,
        history::nullifier::assert_nullifier_existed_by,
        keys::getters::get_public_keys,
        macros::{
            functions::{external, initializer, noinitcheck},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{
            ConfirmedNote,
            constants::MAX_NOTES_PER_PAGE,
            lifecycle::{create_note, destroy_note},
            note_getter::{get_notes, view_notes},
            note_getter_options::{NoteGetterOptions, NoteStatus, PropertySelector, SortOrder},
            note_viewer_options::NoteViewerOptions,
        },
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            constants::PRIVATE_LOG_CIPHERTEXT_LEN,
            traits::Hash,
        },
    };

    global VALUE_SELECTOR: PropertySelector = PropertySelector { index: 0, offset: 0, length: 32 };

    use uint_note::{PartialUintNote, UintNote};

    #[storage]
    struct Storage<Context> {}

    #[initializer]
    #[external("private")]
    fn initialize() {}

    // Note: value must be non-zero because 0 is used as "no note found" sentinel
    // in call_view_notes_many / call_get_notes_many return values.
    #[external("private")]
    fn call_create_note(value: u128, owner: AztecAddress, storage_slot: Field) {
        assert(value != 0, "note value must be non-zero");
        let note = UintNote { value };
        create_note(self.context, owner, storage_slot, note).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    // Exercises the partial-note cross-phase flow: the private phase commits to
    // (owner, storage_slot, nonce) without the value and enqueues a public call
    // that fills in the value and finalizes the note hash. The fuzzer treats
    // this as model-equivalent to call_create_note.
    // Value must be non-zero (0 is the "no note found" sentinel).
    #[external("private")]
    fn call_create_and_complete_partial_note(
        owner: AztecAddress,
        storage_slot: Field,
        value: u128,
    ) {
        assert(value != 0, "note value must be non-zero");
        let partial_note = UintNote::partial(owner, self.context, owner, self.address);

        self.enqueue_self.call_complete_partial_note(partial_note, storage_slot, value);
    }

    // This function creates a nullifier for an existing note hash. If the linked
    // note hash doesn't exist, the kernel will throw.
    // TODO: Add a function that emits a nullifier linked to a note hash provided
    // as a parameter (rather than fetched via get_notes).
    #[external("private")]
    fn call_destroy_note(owner: AztecAddress, storage_slot: Field) {
        let options: NoteGetterOptions<UintNote, _, _, _> = NoteGetterOptions::new()
            .set_owner(owner)
            .sort(VALUE_SELECTOR, SortOrder.ASC);
        let confirmed_notes = get_notes(self.context, storage_slot, options);

        destroy_note(self.context, confirmed_notes.get(0));
    }

    // get_notes returns settled notes (proven via kernel read requests against
    // the note hash tree) and pending notes (emitted earlier in this tx).
    // Asserting len == 1 makes the tx fail on empty slots, so a successful
    // call proves a note exists -- but doesn't distinguish settled from pending.
    #[external("private")]
    fn test_note_inclusion(owner: AztecAddress, storage_slot: Field) {
        let options: NoteGetterOptions<UintNote, _, _, _> = NoteGetterOptions::new()
            .set_owner(owner)
            .set_limit(1)
            .sort(VALUE_SELECTOR, SortOrder.ASC);

        let confirmed_notes = get_notes(self.context, storage_slot, options);
        assert_eq(confirmed_notes.len(), 1);
    }

    // TODO: Sort by counter instead of value. Notes with the same value can be
    // returned in arbitrary order by the oracle, but counters are unique, giving
    // a deterministic ordering the fuzzer model can predict exactly.
    #[external("utility")]
    unconstrained fn call_view_notes_many(
        owner: AztecAddress,
        storage_slot: Field,
        active_or_nullified: bool,
        offset: u32,
    ) -> [u128; 2] {
        let mut options = NoteViewerOptions::new()
            .set_owner(owner)
            .set_offset(offset)
            .sort(VALUE_SELECTOR, SortOrder.ASC);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<UintNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        let v0 = if notes.len() > 0 { notes.get(0).value } else { 0 };
        let v1 = if notes.len() > 1 { notes.get(1).value } else { 0 };
        [v0, v1]
    }

    #[external("private")]
    fn call_get_notes_many(
        owner: AztecAddress,
        storage_slot: Field,
        active_or_nullified: bool,
        offset: u32,
    ) -> [u128; 2] {
        let mut options: NoteGetterOptions<UintNote, _, _, _> = NoteGetterOptions::new()
            .set_owner(owner)
            .set_offset(offset)
            .sort(VALUE_SELECTOR, SortOrder.ASC);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let confirmed_notes = get_notes(self.context, storage_slot, options);

        let v0 = if confirmed_notes.len() > 0 { confirmed_notes.get(0).note.value } else { 0 };
        let v1 = if confirmed_notes.len() > 1 { confirmed_notes.get(1).note.value } else { 0 };
        [v0, v1]
    }

    // Push a raw nullifier (not linked to any note hash). The kernel siloes it
    // with the contract address before inserting into the nullifier tree. If the
    // same value is emitted twice, the second tx fails (duplicate nullifier).
    #[external("private")]
    #[noinitcheck]
    fn emit_nullifier(nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
    }

    // Send a cross-chain L2->L1 message. The base rollup sha256-hashes
    // (l2Sender, rollupVersion, l1Recipient, chainId, content) and appends the
    // hash to TxEffect.l2ToL1Msgs; an L1 contract verifies it against the
    // rollup outbox.
    #[external("private")]
    #[noinitcheck]
    fn send_l2_to_l1_message(content: Field, recipient: EthAddress) {
        self.context.message_portal(recipient, content);
    }

    // Emit a private log with a plaintext tag. Uses `emit_private_log_unsafe`
    // (bypasses the usual ECDH tag derivation) so the fuzzer can predict the
    // siloed tag from (contractAddr, tag) and query the node for the log.
    // Body padded to PRIVATE_LOG_CIPHERTEXT_LEN; only the first field carries
    // data.
    #[external("private")]
    #[noinitcheck]
    fn emit_private_log(tag: Field, content: Field) {
        let log = [content].concat([0; PRIVATE_LOG_CIPHERTEXT_LEN - 1]);
        self.context.emit_private_log_unsafe(tag, log, 1);
    }

    // Request the app-scoped outgoing viewing secret key (ovsk_app): look up the
    // account's master outgoing viewing public key (ovpk_m), hash it, and ask the
    // kernel for the corresponding app-siloed secret. Exercises the kernel's key
    // validation request path.
    #[external("private")]
    #[noinitcheck]
    fn request_ovsk_app(account: AztecAddress) {
        let ovpk_m = get_public_keys(account).ovpk_m;
        let _ = self.context.request_ovsk_app(ovpk_m.hash());
    }

    // Schedule a public teardown function. Teardown is a special public call
    // that runs after app logic, even if app logic reverts. Useful for cleanup
    // (e.g. refunding gas). Here we schedule a no-op (`dummy_public_call`) to
    // exercise the kernel's teardown plumbing.
    #[external("private")]
    #[noinitcheck]
    fn test_setting_teardown() {
        self.context.set_public_teardown_function(
            self.address,
            comptime { FunctionSelector::from_signature("dummy_public_call()") },
            [],
            false,
        );
    }

    // No-op public function used as the teardown target by test_setting_teardown.
    #[external("public")]
    fn dummy_public_call() {}

    // Verify that a nullifier exists in the nullifier tree at the anchor block.
    // The nullifier must be siloed (hash of contract address + raw value) because
    // the tree stores siloed nullifiers. The anchor block header pins the proof
    // to a specific historical state, so this only works for nullifiers that were
    // already settled (not pending in the current tx).
    #[external("private")]
    fn test_settled_nullifier_inclusion(nullifier: Field) {
        let header = self.context.get_anchor_block_header();
        let siloed = compute_siloed_nullifier(self.address, nullifier);
        assert_nullifier_existed_by(header, siloed);
    }

    // Public counterpart of call_create_and_complete_partial_note -- fills in
    // the value and finalizes the note hash. See comment on that function.
    #[external("public")]
    fn call_complete_partial_note(partial_note: PartialUintNote, storage_slot: Field, value: u128) {
        partial_note.complete(self.context, self.address, storage_slot, value);
    }
}
