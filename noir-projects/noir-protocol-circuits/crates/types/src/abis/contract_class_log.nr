use crate::{
    abis::{log::Log, log_hash::ScopedLogHash},
    constants::CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
    hash::{poseidon2_hash, silo_contract_class_log},
    traits::is_empty,
    utils::arrays::validate_trailing_zeroes,
};

// TODO(MW): add new constant for this - the below is just the largest combination atm
pub type ContractClassLog = Log<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>;

pub fn validate_and_silo_contract_class_log(
    log: ContractClassLog,
    log_hash: ScopedLogHash,
) -> ContractClassLog {
    // Validate length
    let length = validate_trailing_zeroes(log.fields);
    assert_eq(log_hash.log_hash.length, length, "mismatched contract class log length");
    if length == 0 {
        assert(is_empty(log_hash), "mismatched contract class log hash");
    } else {
        // Validate hash
        let hashed_log = poseidon2_hash(log.fields);
        assert_eq(log_hash.log_hash.value, hashed_log, "mismatched contract class log hash");
    }

    // Silo log
    silo_contract_class_log(log, log_hash.contract_address)
}

