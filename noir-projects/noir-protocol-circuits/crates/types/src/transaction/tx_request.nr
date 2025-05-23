use crate::{
    abis::function_data::FunctionData,
    address::AztecAddress,
    constants::{GENERATOR_INDEX__TX_REQUEST, TX_REQUEST_LENGTH},
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize, ToField},
    transaction::tx_context::TxContext,
    utils::reader::Reader,
};

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

impl Eq for TxRequest {
    fn eq(self, other: Self) -> bool {
        (self.origin == other.origin)
            & (self.args_hash == other.args_hash)
            & (self.tx_context == other.tx_context)
            & (self.function_data == other.function_data)
            & (self.salt == other.salt)
    }
}

impl Hash for TxRequest {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__TX_REQUEST)
    }
}

impl Serialize<TX_REQUEST_LENGTH> for TxRequest {
    fn serialize(self) -> [Field; TX_REQUEST_LENGTH] {
        // TODO(#4390): This should accept a reader ^ to avoid copying data.
        let mut fields: BoundedVec<Field, TX_REQUEST_LENGTH> = BoundedVec::new();

        fields.push(self.origin.to_field());
        fields.extend_from_array(self.function_data.serialize());
        fields.push(self.args_hash);
        fields.extend_from_array(self.tx_context.serialize());
        fields.push(self.salt);

        assert_eq(fields.len(), TX_REQUEST_LENGTH);

        fields.storage()
    }
}

impl Deserialize<TX_REQUEST_LENGTH> for TxRequest {
    fn deserialize(serialized: [Field; TX_REQUEST_LENGTH]) -> Self {
        let mut reader = Reader::new(serialized);

        let request = Self {
            origin: reader.read_struct(AztecAddress::deserialize),
            args_hash: reader.read(),
            tx_context: reader.read_struct(TxContext::deserialize),
            function_data: reader.read_struct(FunctionData::deserialize),
            salt: reader.read(),
        };

        reader.finish();
        request
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
            0x2117491eec1cf18b6deb0520a7dfa44de357998d671f87bfcf080d347d217f02;
        assert(tx_request.hash() == test_data_tx_request_hash);
    }
}
