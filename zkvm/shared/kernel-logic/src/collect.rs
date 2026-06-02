use alloc::vec::Vec;
use zkvm_data_types::field::Digest;
use zkvm_data_types::side_effects::*;
use zkvm_data_types::types::AztecAddress;

/// Walk the execution result tree depth-first and collect all side effects
/// into flat, scoped arrays. This is the first step of kernel processing.
///
/// Ported from contract_function_simulator.ts:454-531.
pub fn collect_side_effects<D: Digest>(
    root_result: &ExecutionResult<D>,
) -> CollectedSideEffects<D> {
    let mut collected = CollectedSideEffects {
        scoped_note_hashes: Vec::new(),
        scoped_nullifiers: Vec::new(),
        note_hash_read_requests: Vec::new(),
        nullifier_read_requests: Vec::new(),
        private_logs: Vec::new(),
        l2_to_l1_messages: Vec::new(),
        contract_class_log_hashes: Vec::new(),
        public_call_requests: Vec::new(),
        teardown_call_request: None,
        fee_payer: AztecAddress::zero(),
        expiration_timestamp: u64::MAX,
        note_hash_nullifier_counters: Vec::new(),
    };

    collect_from_result(&mut collected, root_result);
    collected
}

fn collect_from_result<D: Digest>(
    collected: &mut CollectedSideEffects<D>,
    result: &ExecutionResult<D>,
) {
    let contract_address = result.contract_address;

    // Collect note hashes, scoped by contract address
    for nh in &result.note_hashes {
        if !nh.value.is_zero() {
            collected.scoped_note_hashes.push(ScopedNoteHash {
                note_hash: *nh,
                contract_address,
            });
        }
    }

    // Collect nullifiers, scoped by contract address
    for n in &result.nullifiers {
        if !n.value.is_zero() {
            collected.scoped_nullifiers.push(ScopedNullifier {
                nullifier: *n,
                contract_address,
            });
        }
    }

    // Collect read requests
    for rr in &result.read_requests {
        if !rr.value.is_zero() {
            collected.note_hash_read_requests.push(ScopedReadRequest {
                read_request: *rr,
                contract_address,
            });
        }
    }
    for rr in &result.nullifier_read_requests {
        if !rr.value.is_zero() {
            collected.nullifier_read_requests.push(ScopedReadRequest {
                read_request: *rr,
                contract_address,
            });
        }
    }

    // Collect private logs
    for log in &result.private_logs {
        collected.private_logs.push(log.clone());
    }

    // Collect L2-to-L1 messages
    for msg in &result.l2_to_l1_messages {
        collected.l2_to_l1_messages.push(*msg);
    }

    // Collect contract class log hashes
    for log in &result.contract_class_log_hashes {
        collected.contract_class_log_hashes.push(*log);
    }

    // Collect public call requests
    for req in &result.public_call_requests {
        collected.public_call_requests.push(*req);
    }

    // Track teardown call request (at most one across all calls)
    if let Some(teardown) = &result.teardown_call_request {
        collected.teardown_call_request = Some(*teardown);
    }

    // Track fee payer
    if result.is_fee_payer {
        collected.fee_payer = contract_address;
    }

    // Track expiration timestamp (take minimum)
    if let Some(ts) = result.expiration_timestamp {
        if ts < collected.expiration_timestamp {
            collected.expiration_timestamp = ts;
        }
    }

    // Collect note_hash -> nullifier counter mappings
    for &(nh_counter, n_counter) in &result.note_hash_nullifier_counters {
        collected.note_hash_nullifier_counters.push((nh_counter, n_counter));
    }

    // Recurse into nested calls (depth-first)
    for nested in &result.nested_results {
        collect_from_result(collected, nested);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::types::FunctionSelector;

    fn make_result(
        contract_id: u64,
        note_hashes: &[(u64, u32)],
        nullifiers: &[(u64, u32)],
        nested: Vec<ExecutionResult<NativeDigest>>,
    ) -> ExecutionResult<NativeDigest> {
        ExecutionResult {
            contract_address: AztecAddress { inner: NativeDigest::from_u64(contract_id) },
            function_selector: FunctionSelector { inner: 1 },
            note_hashes: note_hashes
                .iter()
                .map(|&(v, c)| NoteHash { value: NativeDigest::from_u64(v), counter: c })
                .collect(),
            nullifiers: nullifiers
                .iter()
                .map(|&(v, c)| Nullifier {
                    value: NativeDigest::from_u64(v),
                    counter: c,
                    nullified_note_hash: NativeDigest::zero(),
                })
                .collect(),
            read_requests: Vec::new(),
            nullifier_read_requests: Vec::new(),
            private_logs: Vec::new(),
            l2_to_l1_messages: Vec::new(),
            contract_class_log_hashes: Vec::new(),
            public_call_requests: Vec::new(),
            teardown_call_request: None,
            is_fee_payer: false,
            expiration_timestamp: None,
            note_hash_nullifier_counters: Vec::new(),
            nested_results: nested,
        }
    }

    #[test]
    fn collect_flat_single_call() {
        let result = make_result(100, &[(1, 0), (2, 1)], &[(10, 2)], Vec::new());
        let collected = collect_side_effects(&result);
        assert_eq!(collected.scoped_note_hashes.len(), 2);
        assert_eq!(collected.scoped_nullifiers.len(), 1);
    }

    #[test]
    fn collect_nested_calls_depth_first() {
        let inner = make_result(200, &[(3, 2)], &[(30, 3)], Vec::new());
        let root = make_result(100, &[(1, 0), (2, 1)], &[(10, 4)], alloc::vec![inner]);
        let collected = collect_side_effects(&root);
        // Root: 2 note hashes + nested: 1 = 3 total
        assert_eq!(collected.scoped_note_hashes.len(), 3);
        // Root: 1 nullifier + nested: 1 = 2 total
        assert_eq!(collected.scoped_nullifiers.len(), 2);
        // Verify scoping: first two from contract 100, third from contract 200
        assert_eq!(collected.scoped_note_hashes[0].contract_address.inner, NativeDigest::from_u64(100));
        assert_eq!(collected.scoped_note_hashes[2].contract_address.inner, NativeDigest::from_u64(200));
    }

    #[test]
    fn collect_skips_zero_values() {
        let result = make_result(100, &[(0, 0), (1, 1)], &[(0, 2)], Vec::new());
        let collected = collect_side_effects(&result);
        assert_eq!(collected.scoped_note_hashes.len(), 1);
        assert_eq!(collected.scoped_nullifiers.len(), 0);
    }
}
