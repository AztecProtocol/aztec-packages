use crate::{
    abis::{
        accumulated_data::{
            avm_accumulated_data::AvmAccumulatedData,
            private_to_avm_accumulated_data::{
                PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedDataArrayLengths,
            },
        },
        gas::Gas,
        gas_settings::GasSettings,
        global_variables::GlobalVariables,
        public_call_request::PublicCallRequest,
        tree_snapshots::TreeSnapshots,
    },
    address::AztecAddress,
    constants::{AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, MAX_ENQUEUED_CALLS_PER_TX},
    proof::{avm_proof::AvmProof, traits::Verifiable, vk_data::VkData},
    traits::{Deserialize, Empty, Serialize},
};

use std::hash::{poseidon2, poseidon2_permutation};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmCircuitPublicInputs {
    ///////////////////////////////////
    // Inputs.
    pub global_variables: GlobalVariables,
    pub start_tree_snapshots: TreeSnapshots,
    pub start_gas_used: Gas,
    pub gas_settings: GasSettings,
    pub fee_payer: AztecAddress,
    pub public_setup_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
    pub public_app_logic_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
    pub public_teardown_call_request: PublicCallRequest,
    pub previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths,
    pub previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths,
    pub previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData,
    pub previous_revertible_accumulated_data: PrivateToAvmAccumulatedData,

    ///////////////////////////////////
    // Outputs.
    pub end_tree_snapshots: TreeSnapshots,
    pub end_gas_used: Gas,
    pub accumulated_data: AvmAccumulatedData,
    pub transaction_fee: Field,
    pub reverted: bool,
}

impl Empty for AvmCircuitPublicInputs {
    fn empty() -> Self {
        AvmCircuitPublicInputs {
            global_variables: GlobalVariables::empty(),
            start_tree_snapshots: TreeSnapshots::empty(),
            start_gas_used: Gas::empty(),
            gas_settings: GasSettings::empty(),
            fee_payer: AztecAddress::zero(),
            public_setup_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_app_logic_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_teardown_call_request: PublicCallRequest::empty(),
            previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            previous_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            end_tree_snapshots: TreeSnapshots::empty(),
            end_gas_used: Gas::empty(),
            accumulated_data: AvmAccumulatedData::empty(),
            transaction_fee: 0,
            reverted: false,
        }
    }
}

pub struct AvmProofData {
    pub public_inputs: AvmCircuitPublicInputs,
    pub proof: AvmProof,
    pub vk_data: VkData<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

// The number of columns for the AVM recursive verifier we want to fake, i.e., the resulting
// verify() routine below will create a similar number of gates as a real AVM recursive verifier
// with the number of columns set by this constant.
// NOTE: It was decided to reduce the number of gates of the fake recursive verifier to 5 millions
// as this would be the target for main net. Therefore, the number of columns was artificially adjusted
// to 550. Zac has some ideas on how to improve the gate counts for the AVM recursive verifier until then.
pub global DUMMY_AVM_VERIFIER_NUM_COLUMNS: u32 = 550;

// Current AVM recursive verifier has 9500 gates per column.
// Note that the addition of a single column in AVM recursive verifier incurs 8500 gates.
// (some additional costs are due to lookups, relations, ...).
// 78 gates per Poseidon permutation
// 9500/78 = 121.8
pub global DUMMY_AVM_VERIFIER_NUM_ITERATIONS: u32 = DUMMY_AVM_VERIFIER_NUM_COLUMNS * 122;

// Warning: This is a fake avm recursive verification whose sole goal is to reproduce a similar
// computational effort (number of gates) as the real recursive verifier.
// TODO(#8470): Replace with the real AVM recursive verifier
impl AvmProofData {
    pub fn fake_verify(self) {
        let mut input_hash = poseidon2::Poseidon2::hash(
            [self.public_inputs.transaction_fee, self.proof.fields[0], self.vk_data.vk.key[0]],
            3,
        );

        let mut result: [Field; 4] = [input_hash, 0, 0, 0];
        for _i in 0..DUMMY_AVM_VERIFIER_NUM_ITERATIONS {
            result = poseidon2_permutation(result, 4);
        }

        assert(!result[0].lt(1));
    }
}

impl Verifiable for AvmProofData {
    fn verify(self) {
        // TODO(#8470)
    }
}

mod test {
    use crate::{
        abis::avm_circuit_public_inputs::AvmCircuitPublicInputs,
        constants::AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_avm_circuit_public_inputs() {
        let item = AvmCircuitPublicInputs::empty();
        // We use the AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH] = item.serialize();
        let deserialized = AvmCircuitPublicInputs::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
