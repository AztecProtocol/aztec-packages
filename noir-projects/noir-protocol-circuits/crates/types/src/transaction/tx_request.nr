use crate::{
    abis::function_data::FunctionData,
    address::AztecAddress,
    constants::{GENERATOR_INDEX__TX_REQUEST, TX_REQUEST_LENGTH},
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize, ToField},
    transaction::tx_context::TxContext,
    utils::reader::Reader,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct TxRequest {
    pub origin: AztecAddress,
    pub args_hash: Field,
    pub tx_context: TxContext,
    pub function_data: FunctionData,
}

impl Empty for TxRequest {
    fn empty() -> Self {
        TxRequest {
            origin: AztecAddress::empty(),
            args_hash: 0,
            tx_context: TxContext::empty(),
            function_data: FunctionData::empty(),
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
            function_data::FunctionData, function_selector::FunctionSelector, gas::Gas,
            gas_fees::GasFees, gas_settings::GasSettings,
        },
        address::AztecAddress,
        traits::{Deserialize, Empty, FromField, Hash, Serialize},
        transaction::{tx_context::TxContext, tx_request::TxRequest},
    };

    #[test]
    fn serialization_of_empty() {
        let request = TxRequest::empty();
        let serialized = request.serialize();
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
            origin: AztecAddress::from_field(1),
            args_hash: 3,
            tx_context: TxContext { chain_id: 0, version: 0, gas_settings },
            function_data: FunctionData {
                selector: FunctionSelector::from_u32(2),
                is_private: true,
            },
        };
        // Value from tx_request.test.ts "compute hash" test
        let test_data_tx_request_hash =
            0x2d265ee0e3b9d206873a66527485afa3c6ebbfbaf451811666c9558a9f6e3d46;
        assert(tx_request.hash() == test_data_tx_request_hash);
    }
}
