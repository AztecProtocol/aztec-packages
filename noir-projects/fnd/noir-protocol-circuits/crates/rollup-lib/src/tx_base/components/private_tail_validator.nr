// A private tail could be for either rollup (PrivateToRollupKernelCircuitPublicInputs) or public (PrivateToPublicKernelCircuitPublicInputs).
// It's not straightforward to define a single function or component that validates both structs. Instead, this file
// provides functions that can be called individually on the attributes common to both. All functions should be called
// from both `PrivateTxBaseInputsValidator` and `PublicTxBaseInputValidator`.
use types::{
    abis::{
        block_constant_data::BlockConstantData, global_variables::GlobalVariables,
        log_hash::LogHash, tx_constant_data::TxConstantData,
    },
    constants::{
        ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_PROCESSABLE_L2_GAS,
    },
    hash::compute_contract_class_log_hash,
    merkle_tree::{check_membership, MembershipWitness},
    side_effect::Scoped,
    traits::Hash,
    utils::arrays::array_padded_with,
};

/// Validate some of the tx constants that were propagated from private-land (from the private_tail's public inputs)
/// against the corresponding items of this circuit's block constants.
/// - For private-only txs, the block constants are provided via private inputs.
/// - For public-inclusive txs, some values are copied over from the AVM proof's public inputs. This function
///   checks that the relevant values in `private_tail` match those from the AVM.
pub fn validate_tx_constant_data(
    tx_constants: TxConstantData,
    block_constants: BlockConstantData, // where applicable, these constants have been copied-over from the avm's public inputs.
    anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
) {
    // Values from `tx_constants` to be checked in this function:
    let tx_anchor_block_header = tx_constants.anchor_block_header;
    let tx_chain_id = tx_constants.tx_context.chain_id;
    let tx_version = tx_constants.tx_context.version;
    let tx_gas_settings = tx_constants.tx_context.gas_settings;
    let tx_vk_tree_root = tx_constants.vk_tree_root;
    let tx_protocol_contracts_hash = tx_constants.protocol_contracts_hash;

    // Values from `block_constants` to be checked against those from `tx_constants`.
    // (When executing this fn as part of the public tx base, we comment when an item has been copied-over
    // from the avm's public inputs).
    let block_last_archive_root = block_constants.last_archive.root;
    let block_chain_id = block_constants.global_variables.chain_id; // from avm
    let block_version = block_constants.global_variables.version; // from avm
    let block_gas_fees = block_constants.global_variables.gas_fees; // from avm
    let block_vk_tree_root = block_constants.vk_tree_root;
    let block_protocol_contracts_hash = block_constants.protocol_contracts_hash;

    // Perform a membership check to ensure that the anchor block header used during tx execution exists within the
    // archive tree.
    // The leaf value is the block header hash.
    let archive_leaf_value = tx_anchor_block_header.hash();
    // The leaf index is the block number. This is enforced in the block root rollup when inserting the new block header
    // hash into the archive tree.
    let archive_leaf_index = tx_anchor_block_header.global_variables.block_number;
    // Note: The last archive will be validated against the previous block's new archive in block merge or checkpoint
    // root rollup. For the first block in a checkpoint, its last archive is committed in the checkpoint header and
    // validated on L1 when the checkpoint is proposed.
    assert(
        check_membership(
            archive_leaf_value,
            MembershipWitness {
                leaf_index: archive_leaf_index as Field,
                sibling_path: anchor_block_archive_sibling_path,
            },
            block_last_archive_root,
        ),
        "Membership check failed: anchor block header hash not found in archive tree",
    );

    assert_eq(tx_chain_id, block_chain_id, "Mismatched chain_id between kernel and rollup");

    assert_eq(tx_version, block_version, "Mismatched version between kernel and rollup");

    // This assertion is not strictly necessary for public tx base, since the value in `block_constants` is copied over
    // from `tx_constants`. However, using this single function for both private and public tx bases is cleaner.
    assert_eq(
        tx_vk_tree_root,
        block_vk_tree_root,
        "Mismatched vk_tree_root between kernel and rollup",
    );

    // This assertion is not strictly necessary for public tx base, since the value in `block_constants` is copied over
    // from `tx_constants`. However, using this single function for both private and public tx bases is cleaner.
    assert_eq(
        tx_protocol_contracts_hash,
        block_protocol_contracts_hash,
        "Mismatched protocol_contracts_hash between kernel and rollup",
    );

    // Ensure that the `max_fees_per_gas` specified by the tx is greater than or equal to the `gas_fees` for the block.
    // Note that for private-only txs, the gas against the limit is checked in the private-kernel-tail,
    // since it doesn't have public execution.
    assert(
        tx_gas_settings.max_fees_per_gas.fee_per_da_gas >= block_gas_fees.fee_per_da_gas,
        "da gas is higher than the maximum specified by the tx",
    );
    assert(
        tx_gas_settings.max_fees_per_gas.fee_per_l2_gas >= block_gas_fees.fee_per_l2_gas,
        "l2 gas is higher than the maximum specified by the tx",
    );

    // Ensure that the l2 gas limit is within the max processable l2 gas.
    // TODO: This should be moved to the private kernels once they are not used for gas estimation anymore.
    assert(
        tx_gas_settings.gas_limits.l2_gas <= MAX_PROCESSABLE_L2_GAS,
        "l2 gas limit exceeds max processable l2 gas",
    );
}

/// Validate that the `contract_class_log_fields` provided via private inputs match the `contract_class_log_hashes`
/// committed in the private kernels. The log fields are the data that will be added to the blobs.
pub fn validate_contract_class_logs(
    contract_class_log_hashes: [Scoped<LogHash>; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
) {
    for i in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
        let log_hash = contract_class_log_hashes[i];
        let log_fields = contract_class_log_fields[i];

        // Validate hash.
        let expected_hash = if log_hash.inner.length == 0 {
            0
        } else {
            compute_contract_class_log_hash(log_fields)
        };
        assert_eq(log_hash.inner.value, expected_hash, "Mismatched contract class log hash");

        // Validate length.
        // Ensure that all fields after the actual length are zero.
        // Otherwise, only the truncated length would be emitted via blobs, while the hash is computed over all
        // `CONTRACT_CLASS_LOG_SIZE_IN_FIELDS` fields.
        // This mismatch would make it impossible to verify the contract class later, because the correct hash could no
        // longer be recomputed from the emitted blob data.
        // Note: The length is also validated to be <= `CONTRACT_CLASS_LOG_SIZE_IN_FIELDS` in the private kernel.
        assert(
            array_padded_with(log_fields, log_hash.inner.length, 0),
            "Incorrect contract class log length",
        );
    }
}

/// Validate the `expiration_timestamp` of the tx against the block timestamp.
pub fn validate_expiration_timestamp(
    expiration_timestamp: u64,
    global_variables_of_block_being_built: GlobalVariables,
) {
    // Skip validation when building block 1, since the genesis block header has a zero timestamp.
    // Without this skip, no txs could be included in block 1, because `expiration_timestamp` must be at most
    // `MAX_TX_LIFETIME` from the anchor block's timestamp. This means that any tx anchored to the
    // genesis block would almost certainly have an `expiration_timestamp` earlier than the first block's timestamp,
    // making them impossible to be included.
    //
    // Normally, `expiration_timestamp` may change when calling an updatable contract, and this check ensures that the
    // tx does not call an outdated contract that has already been upgraded. However, since no updatable contracts exist
    // in the genesis block, skipping this check here is safe.
    let is_building_block_1 = global_variables_of_block_being_built.block_number == 1;
    let block_timestamp = global_variables_of_block_being_built.timestamp;
    if !is_building_block_1 {
        assert(
            expiration_timestamp >= block_timestamp,
            "tx expiration_timestamp is smaller than block timestamp",
        );
    }
}
