use zkvm_data_types::constants::*;
use zkvm_data_types::types::Gas;

/// Meter gas usage for a set of accumulated side effects.
///
/// Ported from contract_function_simulator.ts:819-860.
pub fn meter_gas_used(
    num_note_hashes: u32,
    num_nullifiers: u32,
    num_l2_to_l1_msgs: u32,
    num_private_logs: u32,
    num_contract_class_logs: u32,
    num_public_calls: u32,
    is_private_only: bool,
) -> Gas {
    // DA gas: each side effect field costs DA_GAS_PER_FIELD
    let da_gas = num_note_hashes * DA_GAS_PER_FIELD
        + num_nullifiers * DA_GAS_PER_FIELD
        + num_l2_to_l1_msgs * DA_GAS_PER_FIELD
        + TX_DA_GAS_OVERHEAD;

    // L2 gas: per-item costs plus overhead
    let mut l2_gas = num_note_hashes * L2_GAS_PER_NOTE_HASH
        + num_nullifiers * L2_GAS_PER_NULLIFIER
        + num_l2_to_l1_msgs * L2_GAS_PER_L2_TO_L1_MSG
        + num_private_logs * L2_GAS_PER_PRIVATE_LOG
        + num_contract_class_logs * L2_GAS_PER_CONTRACT_CLASS_LOG;

    // Overhead depends on whether the tx has public calls
    if is_private_only {
        l2_gas += PRIVATE_TX_L2_GAS_OVERHEAD;
    } else {
        l2_gas += PUBLIC_TX_L2_GAS_OVERHEAD;
        // Each public call has a fixed AVM startup cost
        l2_gas += num_public_calls * FIXED_AVM_STARTUP_L2_GAS;
    }

    Gas { da_gas, l2_gas }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gas_private_only_tx() {
        let gas = meter_gas_used(1, 1, 0, 0, 0, 0, true);
        let expected_da = 1 * DA_GAS_PER_FIELD + 1 * DA_GAS_PER_FIELD + TX_DA_GAS_OVERHEAD;
        let expected_l2 = 1 * L2_GAS_PER_NOTE_HASH + 1 * L2_GAS_PER_NULLIFIER + PRIVATE_TX_L2_GAS_OVERHEAD;
        assert_eq!(gas.da_gas, expected_da);
        assert_eq!(gas.l2_gas, expected_l2);
    }

    #[test]
    fn gas_public_tx() {
        let gas = meter_gas_used(2, 2, 0, 1, 0, 1, false);
        assert!(gas.l2_gas > PUBLIC_TX_L2_GAS_OVERHEAD);
    }
}
