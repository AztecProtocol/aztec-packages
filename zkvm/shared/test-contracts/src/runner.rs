use alloc::vec::Vec;
use zkvm_data_types::bundle::KernelHints;
use zkvm_data_types::field::Digest;
use zkvm_data_types::kernel_output::{KernelError, KernelPublicInputs, TxConstantData};
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::ExecutionResult;
use zkvm_data_types::types::{AztecAddress, BlockHeader, Gas, GasSettings, TxContext};

use zkvm_kernel_logic::collect::collect_side_effects;
use zkvm_kernel_logic::kernel::verify_and_assemble;
use zkvm_kernel_logic::squash::build_transient_squash_hints;

/// Workload identifier. Matches the WorkloadId enum in zkvm-benchmarks
/// but lives here so guest crates (no_std) can use it without depending
/// on the std-only benchmarks crate.
#[derive(Clone, Copy, Debug)]
#[repr(u8)]
pub enum Workload {
    Minimal = 0,
    TokenTransfer = 1,
    PrivateSwap = 2,
    Heavy = 3,
    KernelHeavy = 4,
}

impl Workload {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Workload::Minimal,
            1 => Workload::TokenTransfer,
            2 => Workload::PrivateSwap,
            3 => Workload::Heavy,
            4 => Workload::KernelHeavy,
            _ => Workload::Minimal,
        }
    }
}

/// Create an ExecutionResult for a given workload.
/// Generic over P: Precompiles — computes real hashes.
pub fn create_workload<P: Precompiles>(workload: Workload) -> ExecutionResult<P::Digest> {
    let account = AztecAddress { inner: P::Digest::from_bytes32(&{
        let mut b = [0u8; 32]; b[0] = 1; b
    })};
    let sender = AztecAddress { inner: P::Digest::from_bytes32(&{
        let mut b = [0u8; 32]; b[0] = 2; b
    })};

    match workload {
        Workload::Minimal => {
            crate::minimal::minimal::<P>(
                account, sender,
                P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 10; b }),
                P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 11; b }),
                P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 12; b }),
                P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 13; b }),
            )
        }
        Workload::TokenTransfer => {
            let token = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 3; b
            })};
            let fpc = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 4; b
            })};
            let recipient = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 5; b
            })};
            let params = crate::token_transfer::TransferParams::default_test_values();
            crate::token_transfer::token_transfer_with_fpc::<P>(
                account, token, fpc, sender, recipient, &params,
            )
        }
        Workload::PrivateSwap => {
            let token0 = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 3; b
            })};
            let token1 = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 4; b
            })};
            let amm = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 5; b
            })};
            let fpc = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 6; b
            })};
            let fee_token = AztecAddress { inner: P::Digest::from_bytes32(&{
                let mut b = [0u8; 32]; b[0] = 7; b
            })};
            let params = crate::private_swap::SwapParams::default_test_values();
            crate::private_swap::private_swap_with_fpc::<P>(
                account, token0, token1, amm, fpc, fee_token, &params,
            )
        }
        Workload::Heavy => {
            crate::heavy::heavy::<P>(
                account, sender,
                P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 42; b }),
            )
        }
        Workload::KernelHeavy => {
            crate::kernel_heavy::kernel_heavy::<P>(
                account, sender,
                P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 42; b }),
            )
        }
    }
}

/// Run a workload end-to-end: create execution result, collect side effects,
/// build kernel hints, verify and assemble kernel public inputs.
///
/// This is the function each guest binary calls. It encapsulates all shared
/// logic so that guest code is just I/O glue.
pub fn run_workload_end_to_end<P: Precompiles>(
    workload: Workload,
) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
    let exec_result = create_workload::<P>(workload);
    let collected = collect_side_effects(&exec_result);

    let squash_hints = build_transient_squash_hints(
        &collected.scoped_note_hashes,
        &collected.scoped_nullifiers,
        &collected.note_hash_nullifier_counters,
    );

    // Generate Merkle witnesses for read requests.
    // All witnesses share a single tree root (as in the real protocol).
    // Each read = 42-deep Merkle proof = 42 × Poseidon2 compress calls.
    let mut constants = default_constants::<P::Digest>();

    let (nh_witnesses, nh_read_actions) = if !collected.note_hash_read_requests.is_empty() {
        let leaves: Vec<P::Digest> = collected.note_hash_read_requests
            .iter()
            .map(|r| r.read_request.value)
            .collect();
        let (witnesses, root) = crate::merkle_fixtures::generate_read_witnesses::<P>(&leaves);
        constants.anchor_block_header.note_hash_tree_root = root;
        let actions = (0..witnesses.len() as u32)
            .map(|i| zkvm_data_types::bundle::ReadRequestAction::ReadAsSettled { witness_index: i })
            .collect();
        (witnesses, actions)
    } else {
        (Vec::new(), Vec::new())
    };

    let (null_witnesses, null_read_actions) = if !collected.nullifier_read_requests.is_empty() {
        let leaves: Vec<P::Digest> = collected.nullifier_read_requests
            .iter()
            .map(|r| r.read_request.value)
            .collect();
        let (witnesses, root) = crate::merkle_fixtures::generate_read_witnesses::<P>(&leaves);
        constants.anchor_block_header.nullifier_tree_root = root;
        let actions = (0..witnesses.len() as u32)
            .map(|i| zkvm_data_types::bundle::ReadRequestAction::ReadAsSettled { witness_index: i })
            .collect();
        (witnesses, actions)
    } else {
        (Vec::new(), Vec::new())
    };

    let hints = KernelHints {
        transient_squash_pairs: squash_hints,
        note_hash_read_witnesses: nh_witnesses,
        nullifier_read_witnesses: null_witnesses,
        min_revertible_counter: 0,
        note_hash_read_actions: nh_read_actions,
        nullifier_read_actions: null_read_actions,
    };

    let first_nullifier = collected
        .scoped_nullifiers
        .first()
        .map(|n| n.nullifier.value)
        .unwrap_or_else(P::Digest::zero);

    verify_and_assemble::<P>(&collected, &hints, &constants, &first_nullifier)
}

/// Default TxConstantData for testing.
pub fn default_constants<D: Digest>() -> TxConstantData<D> {
    let make = |tag: u8| -> D {
        let mut b = [0u8; 32]; b[0] = tag; b[1] = 0xFF;
        D::from_bytes32(&b)
    };
    TxConstantData {
        anchor_block_header: BlockHeader {
            last_archive_root: make(1),
            note_hash_tree_root: make(2),
            nullifier_tree_root: make(3),
            public_data_tree_root: make(4),
            l1_to_l2_message_tree_root: make(5),
            global_variables_hash: make(6),
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
        vk_tree_root: make(7),
        protocol_contracts_hash: make(8),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::precompiles::NativePrecompiles;

    #[test]
    fn run_all_workloads_end_to_end() {
        for workload in [
            Workload::Minimal,
            Workload::TokenTransfer,
            Workload::PrivateSwap,
            Workload::Heavy,
            Workload::KernelHeavy,
        ] {
            let result = run_workload_end_to_end::<NativePrecompiles>(workload);
            assert!(result.is_ok(), "workload {:?} failed: {:?}", workload, result.err());
            let kpi = result.unwrap();
            assert!(kpi.gas_used.l2_gas > 0, "workload {:?} should have nonzero gas", workload);
        }
    }
}
