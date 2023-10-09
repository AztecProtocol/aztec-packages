use crate::constants;
use crate::contrakt::deployment_data::ContractDeploymentData;

struct TxContext {
    is_fee_payment_tx : bool,
    is_rebate_payment_tx : bool,
    is_contract_deployment_tx : bool,

    contract_deployment_data : ContractDeploymentData,

    chain_id : Field,
    version : Field,
}


impl TxContext {
    // TODO(Hash): Hash(is_fee_payment_tx, is_rebate_payment_tx, is_contract_deployment_tx,contract_deployment_data, chain_id, version)
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::TX_CONTEXT;
        0
    }
}