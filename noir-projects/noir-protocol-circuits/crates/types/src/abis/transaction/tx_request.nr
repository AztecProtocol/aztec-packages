use crate::{
    abis::{function_data::FunctionData, transaction::tx_context::TxContext},
    address::AztecAddress,
    constants::GENERATOR_INDEX__TX_REQUEST,
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct TxRequest {
    pub origin: AztecAddress,
    pub args_hash: Field,
    pub tx_context: TxContext,
    pub function_data: FunctionData,
    pub salt: Field,
}

impl Empty for TxRequest {
    fn empty() -> Self {
        TxRequest {
            origin: AztecAddress::empty(),
            args_hash: 0,
            tx_context: TxContext::empty(),
            function_data: FunctionData::empty(),
            salt: 0,
        }
    }
}

impl Hash for TxRequest {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__TX_REQUEST)
    }
}

mod tests {
    use crate::{
        abis::{
            function_data::FunctionData,
            function_selector::FunctionSelector,
            gas::Gas,
            gas_fees::GasFees,
            gas_settings::GasSettings,
            transaction::{tx_context::TxContext, tx_request::TxRequest},
        },
        address::AztecAddress,
        constants::TX_REQUEST_LENGTH,
        traits::{Deserialize, Empty, FromField, Hash, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let request = TxRequest::empty();
        // We use the TX_REQUEST_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; TX_REQUEST_LENGTH] = request.serialize();
        let deserialized = TxRequest::deserialize(serialized);
        assert(request.eq(deserialized));
    }

    #[test]
    fn compute_hash() {
        let gas_settings = GasSettings::new(
            Gas::new(2, 2),
            Gas::new(1, 1),
            GasFees::new(4, 4),
            GasFees::new(3, 3),
        );
        let tx_request = TxRequest {
            origin: AztecAddress::from_field(1122),
            args_hash: 33,
            tx_context: TxContext { chain_id: 44, version: 55, gas_settings },
            function_data: FunctionData {
                selector: FunctionSelector::from_u32(66),
                is_private: true,
            },
            salt: 789,
        };
        // Value from tx_request.test.ts "compute hash" test
        let test_data_tx_request_hash =
            0x1ace39154192fe8eb9e5531033fb653cc11561fa8a0975bcd839e83391596300;
        assert(tx_request.hash() == test_data_tx_request_hash);
    }
}
