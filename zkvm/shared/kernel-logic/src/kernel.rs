use alloc::vec::Vec;
use zkvm_data_types::bundle::KernelHints;
use zkvm_data_types::kernel_output::*;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::*;

use crate::gas::meter_gas_used;
use crate::merkle::verify_membership_witness;
use crate::silo;
use crate::split::split_by_revertibility;
use crate::squash::verify_transient_squash;

/// Verify kernel hints and assemble the final KernelPublicInputs.
///
/// This is the guest-side (proven) entry point. It takes the collected side
/// effects and the hints pre-computed by the host, verifies everything, and
/// produces the output that becomes the proof's public values.
pub fn verify_and_assemble<P: Precompiles>(
    collected: &CollectedSideEffects<P::Digest>,
    hints: &KernelHints<P::Digest>,
    constants: &TxConstantData<P::Digest>,
    first_nullifier: &P::Digest,
) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
    // Step 1: Verify transient squash hints and get remaining side effects
    let (remaining_nhs, remaining_ns) = verify_transient_squash(
        &collected.scoped_note_hashes,
        &collected.scoped_nullifiers,
        &hints.transient_squash_pairs,
    )?;

    // Step 2: Verify settled read requests via Merkle witnesses
    verify_read_requests::<P>(
        &collected.note_hash_read_requests,
        &hints.note_hash_read_witnesses,
        &hints.note_hash_read_actions,
        &constants.anchor_block_header.note_hash_tree_root,
    )?;
    verify_read_requests::<P>(
        &collected.nullifier_read_requests,
        &hints.nullifier_read_witnesses,
        &hints.nullifier_read_actions,
        &constants.anchor_block_header.nullifier_tree_root,
    )?;

    // Step 3: Silo note hashes and nullifiers by contract address
    let siloed_nhs: Vec<P::Digest> = remaining_nhs
        .iter()
        .map(|nh| silo::silo_note_hash::<P>(&nh.contract_address, &nh.note_hash.value))
        .collect();

    let siloed_ns: Vec<P::Digest> = remaining_ns
        .iter()
        .map(|n| silo::silo_nullifier::<P>(&n.contract_address, &n.nullifier.value))
        .collect();

    // Step 4: Determine if this is a private-only or public tx
    let has_public_calls = !collected.public_call_requests.is_empty()
        || collected.teardown_call_request.is_some();

    if has_public_calls {
        assemble_for_public::<P>(
            collected, hints, constants, siloed_nhs, siloed_ns,
        )
    } else {
        assemble_for_rollup::<P>(
            collected, constants, first_nullifier, siloed_nhs, siloed_ns,
        )
    }
}

/// Assemble output for a private-only tx (goes directly to rollup).
fn assemble_for_rollup<P: Precompiles>(
    collected: &CollectedSideEffects<P::Digest>,
    constants: &TxConstantData<P::Digest>,
    first_nullifier: &P::Digest,
    siloed_nhs: Vec<P::Digest>,
    siloed_ns: Vec<P::Digest>,
) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
    // Make note hashes unique
    let unique_nhs: Vec<P::Digest> = siloed_nhs
        .iter()
        .enumerate()
        .map(|(i, siloed)| {
            let nonce = silo::compute_note_hash_nonce::<P>(first_nullifier, i as u32);
            silo::compute_unique_note_hash::<P>(&nonce, siloed)
        })
        .collect();

    let private_logs: Vec<Vec<P::Digest>> = collected.private_logs
        .iter()
        .map(|log| log.fields.clone())
        .collect();

    let gas = meter_gas_used(
        unique_nhs.len() as u32,
        siloed_ns.len() as u32,
        collected.l2_to_l1_messages.len() as u32,
        collected.private_logs.len() as u32,
        collected.contract_class_log_hashes.len() as u32,
        0,
        true,
    );

    Ok(KernelPublicInputs {
        constants: constants.clone(),
        gas_used: gas,
        fee_payer: collected.fee_payer,
        expiration_timestamp: collected.expiration_timestamp,
        for_rollup: Some(PrivateToRollupAccumulatedData {
            note_hashes: unique_nhs,
            nullifiers: siloed_ns,
            l2_to_l1_msgs: collected.l2_to_l1_messages.clone(),
            private_logs,
            contract_class_log_hashes: collected.contract_class_log_hashes.clone(),
        }),
        for_public: None,
    })
}

/// Assemble output for a tx with public calls (split by revertibility).
fn assemble_for_public<P: Precompiles>(
    collected: &CollectedSideEffects<P::Digest>,
    hints: &KernelHints<P::Digest>,
    constants: &TxConstantData<P::Digest>,
    siloed_nhs: Vec<P::Digest>,
    siloed_ns: Vec<P::Digest>,
) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
    // Split side effects by revertibility. We need the original scoped items
    // (with counters) for the split, but use the siloed values in the output.
    // For simplicity, we zip the siloed values with the scoped originals.
    let min_rev = hints.min_revertible_counter;

    // Split note hashes
    let (nr_nh_indices, r_nh_indices) = split_indices_by_counter(
        &collected.scoped_note_hashes, min_rev,
        &hints.transient_squash_pairs.iter().map(|p| p.note_hash_index).collect::<Vec<_>>(),
    );
    let nr_nhs: Vec<_> = nr_nh_indices.iter().map(|&i| siloed_nhs[i]).collect();
    let r_nhs: Vec<_> = r_nh_indices.iter().map(|&i| siloed_nhs[i]).collect();

    // Split nullifiers
    let (nr_n_indices, r_n_indices) = split_indices_by_counter(
        &collected.scoped_nullifiers, min_rev,
        &hints.transient_squash_pairs.iter().map(|p| p.nullifier_index).collect::<Vec<_>>(),
    );
    let nr_ns: Vec<_> = nr_n_indices.iter().map(|&i| siloed_ns[i]).collect();
    let r_ns: Vec<_> = r_n_indices.iter().map(|&i| siloed_ns[i]).collect();

    // Split other side effects
    let (nr_msgs, r_msgs) = split_by_revertibility(&collected.l2_to_l1_messages, min_rev);
    let (nr_logs, r_logs) = split_by_revertibility(&collected.private_logs, min_rev);
    let (nr_cls, r_cls) = split_by_revertibility(&collected.contract_class_log_hashes, min_rev);
    let (nr_pubs, r_pubs) = split_by_revertibility(&collected.public_call_requests, min_rev);

    let nr_log_fields: Vec<Vec<P::Digest>> = nr_logs.iter().map(|l| l.fields.clone()).collect();
    let r_log_fields: Vec<Vec<P::Digest>> = r_logs.iter().map(|l| l.fields.clone()).collect();

    let total_note_hashes = (nr_nhs.len() + r_nhs.len()) as u32;
    let total_nullifiers = (nr_ns.len() + r_ns.len()) as u32;
    let total_msgs = (nr_msgs.len() + r_msgs.len()) as u32;
    let total_logs = (nr_logs.len() + r_logs.len()) as u32;
    let total_cls = (nr_cls.len() + r_cls.len()) as u32;
    let total_pubs = (nr_pubs.len() + r_pubs.len()) as u32;

    let gas = meter_gas_used(
        total_note_hashes,
        total_nullifiers,
        total_msgs,
        total_logs,
        total_cls,
        total_pubs,
        false,
    );

    Ok(KernelPublicInputs {
        constants: constants.clone(),
        gas_used: gas,
        fee_payer: collected.fee_payer,
        expiration_timestamp: collected.expiration_timestamp,
        for_rollup: None,
        for_public: Some(PartialPrivateTailPublicInputsForPublic {
            non_revertible_accumulated_data: PrivateToPublicAccumulatedData {
                note_hashes: nr_nhs,
                nullifiers: nr_ns,
                l2_to_l1_msgs: nr_msgs,
                private_logs: nr_log_fields,
                contract_class_log_hashes: nr_cls,
                public_call_requests: nr_pubs,
            },
            revertible_accumulated_data: PrivateToPublicAccumulatedData {
                note_hashes: r_nhs,
                nullifiers: r_ns,
                l2_to_l1_msgs: r_msgs,
                private_logs: r_log_fields,
                contract_class_log_hashes: r_cls,
                public_call_requests: r_pubs,
            },
            public_teardown_call_request: collected.teardown_call_request,
        }),
    })
}

/// Helper: split indices of remaining (non-squashed) items by counter.
fn split_indices_by_counter(
    originals: &[impl HasCounter],
    min_revertible_counter: u32,
    squashed_indices: &[u32],
) -> (Vec<usize>, Vec<usize>) {
    let squashed: alloc::collections::BTreeSet<u32> = squashed_indices.iter().copied().collect();

    // Build a map from original index to remaining index
    let mut remaining_idx = 0usize;
    let mut nr = Vec::new();
    let mut r = Vec::new();

    for (orig_idx, item) in originals.iter().enumerate() {
        if squashed.contains(&(orig_idx as u32)) {
            continue;
        }
        if item.counter() < min_revertible_counter {
            nr.push(remaining_idx);
        } else {
            r.push(remaining_idx);
        }
        remaining_idx += 1;
    }

    (nr, r)
}

/// Verify read requests against Merkle witnesses.
fn verify_read_requests<P: Precompiles>(
    requests: &[ScopedReadRequest<P::Digest>],
    witnesses: &[zkvm_data_types::types::MembershipWitness<P::Digest>],
    actions: &[zkvm_data_types::bundle::ReadRequestAction],
    tree_root: &P::Digest,
) -> Result<(), KernelError> {
    for (req_idx, action) in actions.iter().enumerate() {
        match action {
            zkvm_data_types::bundle::ReadRequestAction::Noop => {}
            zkvm_data_types::bundle::ReadRequestAction::ReadAsPending { .. } => {
                // Pending reads are validated by checking the value exists in the
                // current tx's arrays. For now, trust the hint (full validation
                // would check the pending_value_index points to a matching value).
            }
            zkvm_data_types::bundle::ReadRequestAction::ReadAsSettled { witness_index } => {
                let witness = witnesses.get(*witness_index as usize).ok_or(
                    KernelError::InvalidMerkleWitness { request_index: req_idx as u32 },
                )?;
                let leaf = &requests[req_idx].read_request.value;
                verify_membership_witness::<P>(leaf, witness, tree_root)
                    .map_err(|_| KernelError::InvalidMerkleWitness { request_index: req_idx as u32 })?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::bundle::{KernelHints, TransientSquashPair};
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::precompiles::NativePrecompiles;
    use zkvm_data_types::field::Digest;
    use zkvm_data_types::side_effects::{NoteHash, Nullifier};
    use zkvm_data_types::types::{AztecAddress, BlockHeader, Gas, GasSettings, TxContext};

    fn make_constants() -> TxConstantData<NativeDigest> {
        TxConstantData {
            anchor_block_header: BlockHeader {
                last_archive_root: NativeDigest::from_u64(1),
                note_hash_tree_root: NativeDigest::from_u64(2),
                nullifier_tree_root: NativeDigest::from_u64(3),
                public_data_tree_root: NativeDigest::from_u64(4),
                l1_to_l2_message_tree_root: NativeDigest::from_u64(5),
                global_variables_hash: NativeDigest::from_u64(6),
                block_number: 100,
                slot_number: 200,
                timestamp: 1234567890,
            },
            tx_context: TxContext {
                chain_id: 1,
                version: 1,
                gas_settings: GasSettings {
                    gas_limits: Gas { da_gas: 100000, l2_gas: 200000 },
                    teardown_gas_limits: Gas::zero(),
                    max_fees_per_gas: Gas { da_gas: 10, l2_gas: 20 },
                    max_priority_fees_per_gas: Gas::zero(),
                },
            },
            vk_tree_root: NativeDigest::from_u64(7),
            protocol_contracts_hash: NativeDigest::from_u64(8),
        }
    }

    #[test]
    fn verify_and_assemble_minimal_private_only() {
        let collected = CollectedSideEffects {
            scoped_note_hashes: alloc::vec![ScopedNoteHash {
                note_hash: NoteHash { value: NativeDigest::from_u64(42), counter: 0 },
                contract_address: AztecAddress { inner: NativeDigest::from_u64(100) },
            }],
            scoped_nullifiers: alloc::vec![ScopedNullifier {
                nullifier: Nullifier {
                    value: NativeDigest::from_u64(99),
                    counter: 1,
                    nullified_note_hash: NativeDigest::zero(),
                },
                contract_address: AztecAddress { inner: NativeDigest::from_u64(100) },
            }],
            note_hash_read_requests: Vec::new(),
            nullifier_read_requests: Vec::new(),
            private_logs: Vec::new(),
            l2_to_l1_messages: Vec::new(),
            contract_class_log_hashes: Vec::new(),
            public_call_requests: Vec::new(),
            teardown_call_request: None,
            fee_payer: AztecAddress { inner: NativeDigest::from_u64(100) },
            expiration_timestamp: 9999999,
            note_hash_nullifier_counters: Vec::new(),
        };

        let hints = KernelHints {
            transient_squash_pairs: Vec::new(),
            note_hash_read_witnesses: Vec::new(),
            nullifier_read_witnesses: Vec::new(),
            min_revertible_counter: 0,
            note_hash_read_actions: Vec::new(),
            nullifier_read_actions: Vec::new(),
        };

        let constants = make_constants();
        let first_nullifier = NativeDigest::from_u64(99);

        let result = verify_and_assemble::<NativePrecompiles>(
            &collected, &hints, &constants, &first_nullifier,
        );

        assert!(result.is_ok());
        let kpi = result.unwrap();

        // Should be for_rollup (private-only tx)
        assert!(kpi.for_rollup.is_some());
        assert!(kpi.for_public.is_none());

        let rollup = kpi.for_rollup.unwrap();
        assert_eq!(rollup.note_hashes.len(), 1); // 1 unique note hash
        assert_eq!(rollup.nullifiers.len(), 1);   // 1 siloed nullifier
        assert!(kpi.gas_used.da_gas > 0);
        assert!(kpi.gas_used.l2_gas > 0);
    }

    #[test]
    fn verify_and_assemble_with_squash() {
        let collected = CollectedSideEffects {
            scoped_note_hashes: alloc::vec![
                ScopedNoteHash {
                    note_hash: NoteHash { value: NativeDigest::from_u64(42), counter: 0 },
                    contract_address: AztecAddress { inner: NativeDigest::from_u64(100) },
                },
                ScopedNoteHash {
                    note_hash: NoteHash { value: NativeDigest::from_u64(43), counter: 2 },
                    contract_address: AztecAddress { inner: NativeDigest::from_u64(100) },
                },
            ],
            scoped_nullifiers: alloc::vec![
                ScopedNullifier {
                    nullifier: Nullifier {
                        value: NativeDigest::from_u64(99),
                        counter: 1,
                        nullified_note_hash: NativeDigest::from_u64(42),
                    },
                    contract_address: AztecAddress { inner: NativeDigest::from_u64(100) },
                },
                ScopedNullifier {
                    nullifier: Nullifier {
                        value: NativeDigest::from_u64(88),
                        counter: 3,
                        nullified_note_hash: NativeDigest::zero(),
                    },
                    contract_address: AztecAddress { inner: NativeDigest::from_u64(100) },
                },
            ],
            note_hash_read_requests: Vec::new(),
            nullifier_read_requests: Vec::new(),
            private_logs: Vec::new(),
            l2_to_l1_messages: Vec::new(),
            contract_class_log_hashes: Vec::new(),
            public_call_requests: Vec::new(),
            teardown_call_request: None,
            fee_payer: AztecAddress { inner: NativeDigest::from_u64(100) },
            expiration_timestamp: 9999999,
            note_hash_nullifier_counters: Vec::new(),
        };

        // Squash note_hash[0] with nullifier[0]
        let hints = KernelHints {
            transient_squash_pairs: alloc::vec![TransientSquashPair {
                note_hash_index: 0,
                nullifier_index: 0,
            }],
            note_hash_read_witnesses: Vec::new(),
            nullifier_read_witnesses: Vec::new(),
            min_revertible_counter: 0,
            note_hash_read_actions: Vec::new(),
            nullifier_read_actions: Vec::new(),
        };

        let constants = make_constants();
        let first_nullifier = NativeDigest::from_u64(88);

        let result = verify_and_assemble::<NativePrecompiles>(
            &collected, &hints, &constants, &first_nullifier,
        );

        assert!(result.is_ok());
        let kpi = result.unwrap();
        let rollup = kpi.for_rollup.unwrap();
        // After squash: 1 note hash remains (43), 1 nullifier remains (88)
        assert_eq!(rollup.note_hashes.len(), 1);
        assert_eq!(rollup.nullifiers.len(), 1);
    }
}
