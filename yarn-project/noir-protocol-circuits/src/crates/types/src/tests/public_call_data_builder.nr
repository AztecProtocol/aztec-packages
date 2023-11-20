use crate::{
    abis::{
        call_context::CallContext,
        call_stack_item::PublicCallStackItem,
        function_data::FunctionData,
        public_call_data::PublicCallData,
        public_circuit_public_inputs::PublicCircuitPublicInputs,
    },
    address::{Address, EthAddress},
    contrakt::{
        storage_read::StorageRead,
        storage_update_request::StorageUpdateRequest,
    },
    mocked::Proof,
    tests::{
        fixtures,
        public_circuit_public_inputs_builder::PublicCircuitPublicInputsBuilder,
    },
    utils::bounded_vec::BoundedVec,
};
use dep::aztec::constants_gen::{
    MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
    MAX_PUBLIC_DATA_READS_PER_CALL,
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
    NUM_FIELDS_PER_SHA256,
};

struct PublicCallDataBuilder {
    contract_address: Address,
    public_inputs: PublicCircuitPublicInputsBuilder,
    is_execution_request: bool,
    function_data: FunctionData,
    proof: Proof,
    portal_contract_address: EthAddress,
    bytecode_hash: Field,
}

impl PublicCallDataBuilder {
    pub fn new() -> Self {
        let contract_data = fixtures::contracts::default_contract;
        let contract_address = contract_data.address;
        let portal_contract_address = contract_data.portal_contract_address;

        let contract_function = fixtures::contract_functions::default_public_function;
        let function_data = contract_function.data;

        let mut public_inputs = PublicCircuitPublicInputsBuilder::new();

        public_inputs.call_context = CallContext {
            msg_sender: fixtures::contracts::parent_contract.address,
            storage_contract_address: contract_address,
            portal_contract_address,
            function_selector: function_data.selector,
            is_delegate_call: false,
            is_static_call: false,
            is_contract_deployment: false,
        };
        
        PublicCallDataBuilder {
            contract_address,
            public_inputs,
            is_execution_request: false,
            function_data,
            proof: Proof {},
            portal_contract_address,
            bytecode_hash: contract_function.acir_hash,
        }
    }

    pub fn is_delegate_call(&mut self) -> Self {
        self.public_inputs.call_context.is_delegate_call = true;
        self.public_inputs.call_context.storage_contract_address = fixtures::contracts::parent_contract.address;
        self.public_inputs.call_context.portal_contract_address = fixtures::contracts::parent_contract.portal_contract_address;
        self.public_inputs.call_context.msg_sender = fixtures::MSG_SENDER;
        *self
    }

    pub fn is_internal_call(&mut self) -> Self {
        self.function_data.is_internal = true;
        self.public_inputs.call_context.msg_sender = self.contract_address;
        let contract_function = fixtures::contract_functions::default_internal_public_function;
        self.function_data = contract_function.data;
        self.bytecode_hash = contract_function.acir_hash;
        *self
    }

    pub fn append_public_call_stack_hashes(&mut self, num_items: Field) {
        let value_offset = self.public_inputs.public_call_stack_hashes.len();
        for i in 0..MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL {
            if i as u64 < num_items as u64 {
                // The default hash is its index + 7788.
                self.public_inputs.public_call_stack_hashes.push(value_offset + 7788);
            }
        }
    }

    pub fn append_read_requests(&mut self, num_reads: Field) {
        let value_offset = self.public_inputs.contract_storage_reads.len();
        for i in 0..MAX_PUBLIC_DATA_READS_PER_CALL {
            if i as u64 < num_reads as u64 {
                let read_request = StorageRead {
                    // The default storage slot is its index + 1.
                    storage_slot: value_offset + i + 1,
                    // The default value is its index + 999.
                    current_value: value_offset + i + 999,
                };
                self.public_inputs.contract_storage_reads.push(read_request);
            }
        }
    }

    pub fn append_empty_read_requests(&mut self, num_reads: Field) {
        for i in 0..MAX_PUBLIC_DATA_READS_PER_CALL {
            if i as u64 < num_reads as u64 {
                self.public_inputs.contract_storage_reads.push(StorageRead::empty());
            }
        }
    }

    pub fn append_update_requests(&mut self, num_updates: Field) {
        let value_offset = self.public_inputs.contract_storage_update_requests.len();
        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL {
            if i as u64 < num_updates as u64 {
                let update_request = StorageUpdateRequest {
                    // The default storage slot is its index + 1.
                    storage_slot: value_offset + i + 1,
                    // The default value is its index + 567.
                    old_value: value_offset + i + 567,
                    // The default value is its index + 890.
                    new_value: value_offset + i + 890,
                };
                self.public_inputs.contract_storage_update_requests.push(update_request);
            }
        }
    }

    pub fn append_empty_update_requests(&mut self, num_updates: Field) {
        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL {
            if i as u64 < num_updates as u64 {
                self.public_inputs.contract_storage_update_requests.push(StorageUpdateRequest::empty());
            }
        }
    }

    pub fn set_unencrypted_logs(&mut self, hash: [Field; NUM_FIELDS_PER_SHA256], preimages_length: Field) {
        self.public_inputs.unencrypted_logs_hash = hash;
        self.public_inputs.unencrypted_log_preimages_length = preimages_length;
    }

    pub fn finish(self) -> PublicCallData {
        PublicCallData {
            call_stack_item: PublicCallStackItem {
                contract_address: self.contract_address,
                function_data: self.function_data,
                is_execution_request: self.is_execution_request,
                public_inputs: self.public_inputs.finish(),
            },
            proof: self.proof,
            portal_contract_address: self.portal_contract_address,
            bytecode_hash: self.bytecode_hash,
        }
    }
}