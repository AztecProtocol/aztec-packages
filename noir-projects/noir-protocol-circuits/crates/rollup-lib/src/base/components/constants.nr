use crate::base::components::{
    archive::perform_archive_membership_check, fees::validate_max_fees_per_gas,
};
use types::{
    abis::{block_constant_data::BlockConstantData, tx_constant_data::TxConstantData},
    constants::ARCHIVE_HEIGHT,
    merkle_tree::MembershipWitness,
};

pub(crate) fn validate_tx_constant_data(
    tx_constants: TxConstantData,
    block_constants: BlockConstantData,
    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
) {
    // Perform membership check that the historical header used during the tx execution exists within the archive tree.
    perform_archive_membership_check(
        block_constants.last_archive.root,
        archive_root_membership_witness,
        tx_constants.historical_header,
    );

    validate_max_fees_per_gas(
        tx_constants.tx_context.gas_settings.max_fees_per_gas,
        block_constants.global_variables.gas_fees,
    );

    assert(
        tx_constants.tx_context.chain_id == block_constants.global_variables.chain_id,
        "kernel chain_id does not match the rollup chain_id",
    );
    assert(
        tx_constants.tx_context.version == block_constants.global_variables.version,
        "kernel version does not match the rollup version",
    );

    // The following two assertions are not needed for public base.
    // The values in block_constants are copied over from tx_constants.
    // But it's cleaner to use one function and check all properties for both public and private base.
    assert(
        tx_constants.vk_tree_root == block_constants.vk_tree_root,
        "kernel vk_tree_root does not match the rollup vk_tree_root",
    );
    assert(
        tx_constants.protocol_contract_tree_root == block_constants.protocol_contract_tree_root,
        "kernel protocol_contract_tree_root does not match the rollup protocol_contract_tree_root",
    );
}
