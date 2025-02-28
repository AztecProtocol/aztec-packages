use crate::{
    abis::{log::Log, log_hash::ScopedLogHash},
    address::AztecAddress,
    constants::CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS,
    hash::{poseidon2_hash_subarray_variable, silo_contract_class_log},
    traits::{Empty, is_empty},
    utils::arrays::validate_trailing_zeroes,
};

pub struct ContractClassLog {
    pub log: Log<CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS>,
    pub contract_address: AztecAddress,
}

impl Empty for ContractClassLog {
    fn empty() -> Self {
        ContractClassLog { log: Log::empty(), contract_address: AztecAddress::empty() }
    }
}

pub fn validate_and_silo_contract_class_log(
    log: ContractClassLog,
    log_hash: ScopedLogHash,
) -> ContractClassLog {
    // Validate address
    assert_eq(
        log_hash.contract_address,
        log.contract_address,
        "mismatched contract class log address",
    );
    // Validate length
    let length = validate_trailing_zeroes(log.log.fields);
    assert_eq(log_hash.log_hash.length, length, "mismatched contract class log length");
    // Validate hash
    if length == 0 {
        assert(is_empty(log_hash), "mismatched contract class log hash");
    } else {
        let hashed_log = poseidon2_hash_subarray_variable(log.log.fields, length);
        assert_eq(log_hash.log_hash.value, hashed_log, "mismatched contract class log hash");
    }

    // Silo log
    silo_contract_class_log(log)
}
