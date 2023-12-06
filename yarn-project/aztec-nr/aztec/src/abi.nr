use dep::protocol_types::{
    abis::{
        block_header::BlockHeader,
        contrakt::ContractDeploymentData,
    },
    constants::{
        RETURN_VALUES_LENGTH,
        MAX_READ_REQUESTS_PER_CALL,
        MAX_PENDING_READ_REQUESTS_PER_CALL,
        MAX_NEW_COMMITMENTS_PER_CALL,
        MAX_NEW_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
        MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
        NUM_FIELDS_PER_SHA256,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
        MAX_PUBLIC_DATA_READS_PER_CALL,
        GENERATOR_INDEX__FUNCTION_ARGS,
        BLOCK_HEADER_LENGTH,
        CONTRACT_DEPLOYMENT_DATA_LENGTH,
        CALL_CONTEXT_LENGTH,
        PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        PRIVATE_CIRCUIT_PUBLIC_INPUTS_HASH_INPUT_LENGTH,
        CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH,
        CONTRACT_STORAGE_READ_LENGTH,
        PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        PUBLIC_CIRCUIT_PUBLIC_INPUTS_HASH_INPUT_LENGTH,
        GENERATOR_INDEX__BLOCK_HASH,
        GENERATOR_INDEX__PUBLIC_CIRCUIT_PUBLIC_INPUTS,
        GENERATOR_INDEX__FUNCTION_DATA,
        GENERATOR_INDEX__PUBLIC_DATA_READ,
        GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST,
        GENERATOR_INDEX__CALL_CONTEXT,
        GENERATOR_INDEX__PRIVATE_CIRCUIT_PUBLIC_INPUTS,
        GENERATOR_INDEX__CONTRACT_DEPLOYMENT_DATA,
    },
    hash::{
        hash_args,
        pedersen_hash,
    },
};

use crate::types::vec::BoundedVec;
use crate::types::point::Point;

// docs:start:private-global-variables
struct PrivateGlobalVariables {
    chain_id: Field,
    version: Field,
}
// docs:end:private-global-variables

impl PrivateGlobalVariables {
    fn serialize(self) -> [Field; 2] {
        [self.chain_id, self.version]
    }
}

// docs:start:public-global-variables
struct PublicGlobalVariables {
    chain_id: Field,
    version: Field,
    block_number: Field,
    timestamp: Field,
}
// docs:end:public-global-variables

impl PublicGlobalVariables {
    fn serialize(self) -> [Field; 4] {
        [self.chain_id, self.version, self.block_number, self.timestamp]
    }
}

// PrivateContextInputs are expected to be provided to each private function
// docs:start:private-context-inputs
struct PrivateContextInputs {
    call_context : CallContext,
    block_header: BlockHeader,
    contract_deployment_data: ContractDeploymentData,
    private_global_variables: PrivateGlobalVariables,
}
// docs:end:private-context-inputs

// PublicContextInputs are expected to be provided to each public function
// docs:start:public-context-inputs
struct PublicContextInputs {
    call_context: CallContext,
    block_header: BlockHeader,

    public_global_variables: PublicGlobalVariables,
}
// docs:end:public-context-inputs

struct ContractStorageRead {
    storage_slot: Field,
    value: Field,
}

impl ContractStorageRead {
    pub fn serialize(self) -> [Field; CONTRACT_STORAGE_READ_LENGTH] {
        [self.storage_slot, self.value]
    }

    pub fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__PUBLIC_DATA_READ)
    }

    pub fn empty() -> Self {
        Self { storage_slot: 0, value: 0 }
    }
}

struct ContractStorageUpdateRequest {
    storage_slot: Field,
    old_value: Field,
    new_value: Field,
}

impl ContractStorageUpdateRequest {
    pub fn serialize(self) -> [Field; CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH] {
        [self.storage_slot, self.old_value, self.new_value]
    }

    pub fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST)
    }

    pub fn empty() -> Self {
        Self { storage_slot: 0, old_value: 0, new_value: 0 }
    }
}

struct Hasher {
    fields: [Field],
}

impl Hasher {
    pub fn new()-> Self {
        Self { fields: [] }
    }

    pub fn add(&mut self, field: Field) {
        self.fields = self.fields.push_back(field);
    }

    pub fn add_multiple<N>(&mut self, fields: [Field; N]) {
        for i in 0..N {
            self.fields = self.fields.push_back(fields[i]);
        }
    }

    pub fn hash(self) -> Field {
        hash_args(self.fields)
    }
}
