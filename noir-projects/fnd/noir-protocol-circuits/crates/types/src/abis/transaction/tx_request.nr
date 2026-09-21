use crate::{
    abis::{function_data::FunctionData, transaction::tx_context::TxContext},
    address::AztecAddress,
    constants::{DOM_SEP__PROTOCOL_NULLIFIER, DOM_SEP__TX_REQUEST, NULL_MSG_SENDER_CONTRACT_ADDRESS},
    hash::{compute_siloed_nullifier, poseidon2_hash_with_separator},
    traits::{Deserialize, Empty, Hash, Serialize, ToField},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct TxRequest {
    // The contract from which the transaction originates. This is the contract address of the first function call in
    // the transaction.
    pub origin: AztecAddress,
    // The hash of the arguments for the first function call in the transaction.
    pub args_hash: Field,
    // The execution context of the transaction, including chain ID, rollup contract version, and gas settings.
    pub tx_context: TxContext,
    // The data of the first function call in the transaction.
    pub function_data: FunctionData,
    // The transaction's nonce: a fresh random field drawn by the wallet. Together with `origin`, `chain_id` and
    // `version` it is the whole preimage of the protocol nullifier (`compute_protocol_nullifier_value`), so it is what
    // keeps that nullifier unpredictable and unique. Only the kernel and the wallet ever see it; app circuits are
    // shown the (siloed) protocol nullifier instead. Must be non-zero.
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
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__TX_REQUEST)
    }
}

impl TxRequest {
    /// The unsiloed value of the protocol nullifier: the transaction's nonce commitment.
    ///
    /// The preimage is deliberately narrow. `origin` (the first call's contract), `chain_id` and `version` name the
    /// slot the nonce belongs to; `salt` is the nonce. Gas settings and the first call's arguments are left out so
    /// that a fee bump or a cancellation that reuses the salt produces the same nullifier and the two transactions are
    /// mutually exclusive. The proof is still pinned to the full request by `validate_against_tx_request`.
    pub fn compute_protocol_nullifier_value(self) -> Field {
        poseidon2_hash_with_separator(
            [self.origin.to_field(), self.tx_context.chain_id, self.tx_context.version, self.salt],
            DOM_SEP__PROTOCOL_NULLIFIER,
        )
    }

    /// The protocol nullifier as it is inserted into the nullifier tree: the value above siloed under
    /// `NULL_MSG_SENDER_CONTRACT_ADDRESS`, an address no contract can have. This is the value every private call
    /// receives in `PrivateCircuitPublicInputs.protocol_nullifier`.
    pub fn compute_protocol_nullifier(self) -> Field {
        compute_siloed_nullifier(
            NULL_MSG_SENDER_CONTRACT_ADDRESS,
            self.compute_protocol_nullifier_value(),
        )
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
            0x09c2372649f434fc01e3c010792c33b383bfff50f7e6ed7b6ba689d6d7b1f109;
        assert(tx_request.hash() == test_data_tx_request_hash);
    }

    #[test]
    fn compute_protocol_nullifier() {
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
        // Gas settings and the first call's args are not part of the preimage.
        let mut bumped = tx_request;
        bumped.tx_context.gas_settings = GasSettings::new(
            Gas::new(20, 20),
            Gas::new(10, 10),
            GasFees::new(40, 40),
            GasFees::new(30, 30),
        );
        bumped.args_hash = 34;
        assert_eq(tx_request.compute_protocol_nullifier(), bumped.compute_protocol_nullifier());
        // The salt, the origin, the chain id and the version are.
        let mut other_salt = tx_request;
        other_salt.salt = 790;
        assert(tx_request.compute_protocol_nullifier() != other_salt.compute_protocol_nullifier());
        let mut other_origin = tx_request;
        other_origin.origin = AztecAddress::from_field(1123);
        assert(
            tx_request.compute_protocol_nullifier() != other_origin.compute_protocol_nullifier(),
        );
        // Values from tx_request.test.ts "compute protocol nullifier" test
        let test_data_value = 0x274bc3bf8d36c9c8628a471d930d1d833dd5072df6fe108390f04f7d88418051;
        let test_data_siloed = 0x032db509ef1efc8cdefdab5e059061d52e1b04aaccc04404f87d0bef7d0021e1;
        assert_eq(tx_request.compute_protocol_nullifier_value(), test_data_value);
        assert_eq(tx_request.compute_protocol_nullifier(), test_data_siloed);
    }
}
