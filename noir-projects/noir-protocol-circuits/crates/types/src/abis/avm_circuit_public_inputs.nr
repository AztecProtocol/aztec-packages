use crate::{
    abis::{
        accumulated_data::{
            avm_accumulated_data::AvmAccumulatedData,
            private_to_avm_accumulated_data::{
                PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedDataArrayLengths,
            },
        },
        gas_settings::GasSettings,
        global_variables::GlobalVariables,
        public_call_request::PublicCallRequest,
        tree_snapshots::TreeSnapshots,
    },
    constants::{AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH, MAX_ENQUEUED_CALLS_PER_TX},
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct AvmCircuitPublicInputs {
    ///////////////////////////////////
    // Inputs.
    global_variables: GlobalVariables,
    start_tree_snapshots: TreeSnapshots,
    gas_settings: GasSettings,
    public_setup_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
    public_app_logic_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
    public_teardown_call_request: PublicCallRequest,
    previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths,
    previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths,
    previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData,
    previous_revertible_accumulated_data: PrivateToAvmAccumulatedData,

    ///////////////////////////////////
    // Outputs.
    end_tree_snapshots: TreeSnapshots,
    accumulated_data: AvmAccumulatedData,
    transaction_fee: Field,
    reverted: bool,
}

impl Empty for AvmCircuitPublicInputs {
    fn empty() -> Self {
        AvmCircuitPublicInputs {
            global_variables: GlobalVariables::empty(),
            start_tree_snapshots: TreeSnapshots::empty(),
            gas_settings: GasSettings::empty(),
            public_setup_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_app_logic_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_teardown_call_request: PublicCallRequest::empty(),
            previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            previous_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            end_tree_snapshots: TreeSnapshots::empty(),
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
            & (self.gas_settings == other.gas_settings)
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
        fields.extend_from_array(self.gas_settings.serialize());
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
        fields.extend_from_array(self.accumulated_data.serialize());
        fields.push(self.transaction_fee);
        fields.push(self.reverted as Field);

        assert_eq(fields.len(), AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage
    }
}

impl Deserialize<AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for AvmCircuitPublicInputs {
    fn deserialize(fields: [Field; AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> AvmCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = AvmCircuitPublicInputs {
            global_variables: reader.read_struct(GlobalVariables::deserialize),
            start_tree_snapshots: reader.read_struct(TreeSnapshots::deserialize),
            gas_settings: reader.read_struct(GasSettings::deserialize),
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
            accumulated_data: reader.read_struct(AvmAccumulatedData::deserialize),
            transaction_fee: reader.read(),
            reverted: reader.read() as bool,
        };
        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty_avm_circuit_public_inputs() {
    let item = AvmCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = AvmCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
