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
    constants::{
        AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH, AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        MAX_ENQUEUED_CALLS_PER_TX,
    },
    proof::{avm_proof::AvmProof, traits::Verifiable, vk_data::VkData},
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

use std::hash::{poseidon2, poseidon2_permutation};

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

impl Eq for AvmCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.global_variables == other.global_variables)
            & (self.start_tree_snapshots == other.start_tree_snapshots)
            & (self.start_gas_used == other.start_gas_used)
            & (self.gas_settings == other.gas_settings)
            & (self.fee_payer == other.fee_payer)
            & (self.public_setup_call_requests == other.public_setup_call_requests)
            & (self.public_app_logic_call_requests == other.public_app_logic_call_requests)
            & (self.public_teardown_call_request == other.public_teardown_call_request)
            & (
                self.previous_non_revertible_accumulated_data_array_lengths
                    == other.previous_non_revertible_accumulated_data_array_lengths
            )
            & (
                self.previous_revertible_accumulated_data_array_lengths
                    == other.previous_revertible_accumulated_data_array_lengths
            )
            & (
                self.previous_non_revertible_accumulated_data
                    == other.previous_non_revertible_accumulated_data
            )
            & (
                self.previous_revertible_accumulated_data
                    == other.previous_revertible_accumulated_data
            )
            & (self.end_tree_snapshots == other.end_tree_snapshots)
            & (self.end_gas_used == other.end_gas_used)
            & (self.accumulated_data == other.accumulated_data)
            & (self.transaction_fee == other.transaction_fee)
            & (self.reverted == other.reverted)
    }
}

impl Serialize<AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for AvmCircuitPublicInputs {
    fn serialize(self) -> [Field; AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.global_variables.serialize());
        fields.extend_from_array(self.start_tree_snapshots.serialize());
        fields.extend_from_array(self.start_gas_used.serialize());
        fields.extend_from_array(self.gas_settings.serialize());
        fields.push(self.fee_payer.to_field());
        for i in 0..self.public_setup_call_requests.len() {
            fields.extend_from_array(self.public_setup_call_requests[i].serialize());
        }
        for i in 0..self.public_app_logic_call_requests.len() {
            fields.extend_from_array(self.public_app_logic_call_requests[i].serialize());
        }
        fields.extend_from_array(self.public_teardown_call_request.serialize());
        fields.extend_from_array(self
            .previous_non_revertible_accumulated_data_array_lengths
            .serialize());
        fields.extend_from_array(self.previous_revertible_accumulated_data_array_lengths.serialize());
        fields.extend_from_array(self.previous_non_revertible_accumulated_data.serialize());
        fields.extend_from_array(self.previous_revertible_accumulated_data.serialize());
        fields.extend_from_array(self.end_tree_snapshots.serialize());
        fields.extend_from_array(self.end_gas_used.serialize());
        fields.extend_from_array(self.accumulated_data.serialize());
        fields.push(self.transaction_fee);
        fields.push(self.reverted as Field);

        assert_eq(fields.len(), AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage()
    }
}

impl Deserialize<AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for AvmCircuitPublicInputs {
    fn deserialize(fields: [Field; AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> AvmCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = AvmCircuitPublicInputs {
            global_variables: reader.read_struct(GlobalVariables::deserialize),
            start_tree_snapshots: reader.read_struct(TreeSnapshots::deserialize),
            start_gas_used: reader.read_struct(Gas::deserialize),
            gas_settings: reader.read_struct(GasSettings::deserialize),
            fee_payer: AztecAddress::from_field(reader.read()),
            public_setup_call_requests: reader.read_struct_array(
                PublicCallRequest::deserialize,
                [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            ),
            public_app_logic_call_requests: reader.read_struct_array(
                PublicCallRequest::deserialize,
                [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            ),
            public_teardown_call_request: reader.read_struct(PublicCallRequest::deserialize),
            previous_non_revertible_accumulated_data_array_lengths: reader.read_struct(
                PrivateToAvmAccumulatedDataArrayLengths::deserialize,
            ),
            previous_revertible_accumulated_data_array_lengths: reader.read_struct(
                PrivateToAvmAccumulatedDataArrayLengths::deserialize,
            ),
            previous_non_revertible_accumulated_data: reader.read_struct(
                PrivateToAvmAccumulatedData::deserialize,
            ),
            previous_revertible_accumulated_data: reader.read_struct(
                PrivateToAvmAccumulatedData::deserialize,
            ),
            end_tree_snapshots: reader.read_struct(TreeSnapshots::deserialize),
            end_gas_used: reader.read_struct(Gas::deserialize),
            accumulated_data: reader.read_struct(AvmAccumulatedData::deserialize),
            transaction_fee: reader.read(),
            reverted: reader.read() as bool,
        };
        reader.finish();
        item
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
pub global DUMMY_AVM_VERIFIER_NUM_COLUMNS: u32 = 2200;

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
        for i in 0..DUMMY_AVM_VERIFIER_NUM_ITERATIONS {
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

#[test]
fn serialization_of_empty_avm_circuit_public_inputs() {
    let item = AvmCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = AvmCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}

