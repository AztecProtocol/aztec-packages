//! Transaction-level execution context with inline kernel processing.
//!
//! This replaces the batched collect→kernel pipeline. Side effects are
//! processed at the time they're emitted, matching barretenberg's VM2
//! architecture. See `shared/kernel-logic/INLINE_VS_BATCHED.md` for
//! the full analysis and benchmark comparison.
//!
//! Key operations:
//! - `emit_note_hash`: silos immediately (1 Poseidon2), adds to pending
//! - `emit_nullifier_for_note_hash`: inline squash (removes matching pending note hash)
//! - `verify_note_hash_read`: 42 Poseidon2 compress (Merkle leaf-to-root)
//! - `finalize`: uniquifies pending note hashes, assembles KernelPublicInputs
//!
//! Merkle witnesses are HOST-PROVIDED HINTS (not built inside the VM).
//! The guest only hashes from leaf to root — 42 compress calls per read.

use alloc::vec::Vec;
use zkvm_data_types::constants;
use zkvm_data_types::domain_separator;
use zkvm_data_types::field::Digest;
use zkvm_data_types::kernel_output::*;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::*;
use zkvm_data_types::types::{AztecAddress, BlockHeader, Gas, MembershipWitness};

/// Transaction-level execution context with inline kernel processing.
///
/// This replaces the batched collect→kernel pipeline. Kernel operations
/// (siloing, read verification, squashing, gas metering) happen inline
/// at the time each side effect is emitted.
///
/// Matches VM2's architecture: side effects are processed at opcode time,
/// not in a separate kernel pass.
pub struct TxExecutionContext<P: Precompiles> {
    // Transaction constants
    anchor_block_header: BlockHeader<P::Digest>,
    first_nullifier: P::Digest,
    tx_constants: TxConstantData<P::Digest>,

    // Monotonic counter across all function calls
    side_effect_counter: u32,
    note_hash_index: u32,

    // Accumulated OUTPUT (already siloed/uniquified)
    siloed_note_hashes: Vec<P::Digest>,
    siloed_nullifiers: Vec<P::Digest>,
    l2_to_l1_messages: Vec<ScopedL2ToL1Message<P::Digest>>,
    private_logs: Vec<Vec<P::Digest>>,
    contract_class_log_hashes: Vec<ScopedLogHash<P::Digest>>,
    public_call_requests: Vec<PublicCallRequest<P::Digest>>,

    // Un-squashed note hashes: kept here until a matching nullifier removes them.
    // Each entry: (siloed_note_hash, original_value, contract_address, counter).
    pending_note_hashes: Vec<PendingNoteHash<P::Digest>>,

    // Gas accumulator
    gas_used: Gas,

    // Tx-level
    fee_payer: AztecAddress<P::Digest>,
    expiration_timestamp: u64,
    teardown_call_request: Option<PublicCallRequest<P::Digest>>,

    // Defensive check: track unmatched nullifier-for-note-hash references
    unmatched_nullifier_refs: Vec<P::Digest>,
}

struct PendingNoteHash<D: Digest> {
    siloed: D,
    original_value: D,
    contract_address: AztecAddress<D>,
    counter: u32,
}

impl<P: Precompiles> TxExecutionContext<P> {
    pub fn new(
        tx_constants: TxConstantData<P::Digest>,
        first_nullifier: P::Digest,
    ) -> Self {
        let anchor = tx_constants.anchor_block_header.clone();

        // The first nullifier (protocol nullifier) is always siloed and added
        let siloed_first = P::poseidon2_hash_with_separator(
            &[AztecAddress::zero().inner, first_nullifier],
            domain_separator::SILOED_NULLIFIER,
        );

        Self {
            anchor_block_header: anchor,
            first_nullifier,
            tx_constants,
            side_effect_counter: 0,
            note_hash_index: 0,
            siloed_note_hashes: Vec::new(),
            siloed_nullifiers: alloc::vec![siloed_first],
            l2_to_l1_messages: Vec::new(),
            private_logs: Vec::new(),
            contract_class_log_hashes: Vec::new(),
            public_call_requests: Vec::new(),
            pending_note_hashes: Vec::new(),
            gas_used: Gas::zero(),
            fee_payer: AztecAddress::zero(),
            expiration_timestamp: u64::MAX,
            teardown_call_request: None,
            unmatched_nullifier_refs: Vec::new(),
        }
    }

    pub fn next_counter(&mut self) -> u32 {
        let c = self.side_effect_counter;
        self.side_effect_counter += 1;
        c
    }

    // --- Inline kernel operations ---

    /// Emit a note hash: silo immediately, add to pending (for potential squash).
    pub fn emit_note_hash(
        &mut self,
        value: P::Digest,
        contract_address: AztecAddress<P::Digest>,
    ) {
        let _counter = self.next_counter();

        // Silo by contract address (1 Poseidon2)
        let siloed = P::poseidon2_hash_with_separator(
            &[contract_address.inner, value],
            domain_separator::SILOED_NOTE_HASH,
        );

        // Add to pending (not yet in final output — may be squashed)
        self.pending_note_hashes.push(PendingNoteHash {
            siloed,
            original_value: value,
            contract_address,
            counter: _counter,
        });

        // Meter gas
        self.gas_used.da_gas += constants::DA_GAS_PER_FIELD;
        self.gas_used.l2_gas += constants::L2_GAS_PER_NOTE_HASH;
    }

    /// Emit a standalone nullifier (not linked to a note hash): silo immediately.
    pub fn emit_nullifier(
        &mut self,
        value: P::Digest,
        contract_address: AztecAddress<P::Digest>,
    ) {
        let _counter = self.next_counter();

        let siloed = P::poseidon2_hash_with_separator(
            &[contract_address.inner, value],
            domain_separator::SILOED_NULLIFIER,
        );

        self.siloed_nullifiers.push(siloed);
        self.gas_used.da_gas += constants::DA_GAS_PER_FIELD;
        self.gas_used.l2_gas += constants::L2_GAS_PER_NULLIFIER;
    }

    /// Emit a nullifier that references a specific note hash (inline squash).
    ///
    /// If the referenced note hash is in pending_note_hashes, BOTH are removed
    /// (squashed). If not found, the nullifier is added normally and the
    /// reference is tracked for a defensive check at finalization.
    pub fn emit_nullifier_for_note_hash(
        &mut self,
        value: P::Digest,
        note_hash_value: P::Digest,
        contract_address: AztecAddress<P::Digest>,
    ) {
        let _counter = self.next_counter();

        // Try to find and remove the matching note hash from pending
        let found = self.pending_note_hashes.iter().position(|ph| {
            ph.original_value == note_hash_value && ph.contract_address == contract_address
        });

        if let Some(idx) = found {
            // Squash: remove the pending note hash, skip adding the nullifier.
            // Both cancel out — neither appears in the final output.
            let removed = self.pending_note_hashes.remove(idx);
            // Reverse the gas that was charged for the note hash
            self.gas_used.da_gas = self.gas_used.da_gas.saturating_sub(constants::DA_GAS_PER_FIELD);
            self.gas_used.l2_gas = self.gas_used.l2_gas.saturating_sub(constants::L2_GAS_PER_NOTE_HASH);
            // Don't charge gas for the nullifier either (both squashed)
        } else {
            // Note hash not found in pending — either it's from a previous tx
            // (settled in the tree) or it hasn't been emitted yet (error).
            // Add the nullifier normally and track the reference.
            let siloed = P::poseidon2_hash_with_separator(
                &[contract_address.inner, value],
                domain_separator::SILOED_NULLIFIER,
            );
            self.siloed_nullifiers.push(siloed);
            self.gas_used.da_gas += constants::DA_GAS_PER_FIELD;
            self.gas_used.l2_gas += constants::L2_GAS_PER_NULLIFIER;
            self.unmatched_nullifier_refs.push(note_hash_value);
        }
    }

    /// Verify a note hash read request against the Merkle tree (inline).
    /// This is the expensive operation: 42 × Poseidon2 compress.
    pub fn verify_note_hash_read(
        &mut self,
        value: P::Digest,
        witness: &MembershipWitness<P::Digest>,
    ) -> Result<(), KernelError> {
        let _counter = self.next_counter();
        zkvm_kernel_logic::merkle::verify_membership_witness::<P>(
            &value,
            witness,
            &self.anchor_block_header.note_hash_tree_root,
        )
    }

    /// Verify a nullifier read request against the Merkle tree (inline).
    pub fn verify_nullifier_read(
        &mut self,
        value: P::Digest,
        witness: &MembershipWitness<P::Digest>,
    ) -> Result<(), KernelError> {
        let _counter = self.next_counter();
        zkvm_kernel_logic::merkle::verify_membership_witness::<P>(
            &value,
            witness,
            &self.anchor_block_header.nullifier_tree_root,
        )
    }

    pub fn emit_l2_to_l1_message(&mut self, msg: ScopedL2ToL1Message<P::Digest>) {
        let _counter = self.next_counter();
        self.l2_to_l1_messages.push(msg);
        self.gas_used.da_gas += constants::DA_GAS_PER_FIELD;
        self.gas_used.l2_gas += constants::L2_GAS_PER_L2_TO_L1_MSG;
    }

    pub fn emit_private_log(&mut self, fields: Vec<P::Digest>) {
        let _counter = self.next_counter();
        self.private_logs.push(fields);
        self.gas_used.l2_gas += constants::L2_GAS_PER_PRIVATE_LOG;
    }

    pub fn enqueue_public_call(&mut self, req: PublicCallRequest<P::Digest>) {
        let _counter = self.next_counter();
        self.public_call_requests.push(req);
    }

    pub fn set_fee_payer(&mut self, address: AztecAddress<P::Digest>) {
        self.fee_payer = address;
    }

    pub fn set_expiration_timestamp(&mut self, ts: u64) {
        if ts < self.expiration_timestamp {
            self.expiration_timestamp = ts;
        }
    }

    // --- Finalization ---

    /// Finalize: move pending note hashes to output (uniquify), add overhead gas,
    /// and assemble KernelPublicInputs.
    pub fn finalize(mut self) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
        // Uniquify remaining (non-squashed) pending note hashes
        for ph in &self.pending_note_hashes {
            let nonce = P::poseidon2_hash_with_separator(
                &[self.first_nullifier, P::Digest::from_bytes32(&{
                    let mut b = [0u8; 32];
                    b[..4].copy_from_slice(&self.note_hash_index.to_le_bytes());
                    b
                })],
                domain_separator::NOTE_HASH_NONCE,
            );
            let unique = P::poseidon2_hash_with_separator(
                &[nonce, ph.siloed],
                domain_separator::UNIQUE_NOTE_HASH,
            );
            self.siloed_note_hashes.push(unique);
            self.note_hash_index += 1;
        }

        // Add gas overhead
        let is_private_only = self.public_call_requests.is_empty()
            && self.teardown_call_request.is_none();
        if is_private_only {
            self.gas_used.l2_gas += constants::PRIVATE_TX_L2_GAS_OVERHEAD;
        } else {
            self.gas_used.l2_gas += constants::PUBLIC_TX_L2_GAS_OVERHEAD;
        }
        self.gas_used.da_gas += constants::TX_DA_GAS_OVERHEAD;

        // Defensive check: warn if there are unmatched nullifier references
        // (This means a nullifier referenced a note_hash that was never emitted
        // in this tx — it should have been a settled read instead)
        // For now, just allow it (the nullifier was added to output already).

        if is_private_only {
            Ok(KernelPublicInputs {
                constants: self.tx_constants,
                gas_used: self.gas_used,
                fee_payer: self.fee_payer,
                expiration_timestamp: self.expiration_timestamp,
                for_rollup: Some(PrivateToRollupAccumulatedData {
                    note_hashes: self.siloed_note_hashes,
                    nullifiers: self.siloed_nullifiers,
                    l2_to_l1_msgs: self.l2_to_l1_messages,
                    private_logs: self.private_logs,
                    contract_class_log_hashes: self.contract_class_log_hashes,
                }),
                for_public: None,
            })
        } else {
            // TODO: split by revertibility for public txs
            Ok(KernelPublicInputs {
                constants: self.tx_constants,
                gas_used: self.gas_used,
                fee_payer: self.fee_payer,
                expiration_timestamp: self.expiration_timestamp,
                for_rollup: None,
                for_public: Some(PartialPrivateTailPublicInputsForPublic {
                    non_revertible_accumulated_data: PrivateToPublicAccumulatedData {
                        note_hashes: Vec::new(),
                        nullifiers: Vec::new(),
                        l2_to_l1_msgs: Vec::new(),
                        private_logs: Vec::new(),
                        contract_class_log_hashes: Vec::new(),
                        public_call_requests: Vec::new(),
                    },
                    revertible_accumulated_data: PrivateToPublicAccumulatedData {
                        note_hashes: self.siloed_note_hashes,
                        nullifiers: self.siloed_nullifiers,
                        l2_to_l1_msgs: self.l2_to_l1_messages,
                        private_logs: self.private_logs,
                        contract_class_log_hashes: self.contract_class_log_hashes,
                        public_call_requests: self.public_call_requests,
                    },
                    public_teardown_call_request: self.teardown_call_request,
                }),
            })
        }
    }
}
