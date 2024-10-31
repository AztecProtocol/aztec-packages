use crate::{
    abis::{
        accumulated_data::{
            CombinedAccumulatedData, PrivateAccumulatedData, PrivateAccumulatedDataBuilder,
            PublicAccumulatedData, PublicAccumulatedDataArrayLengths, PublicAccumulatedDataBuilder,
        },
        call_context::CallContext,
        combined_constant_data::CombinedConstantData,
        enqueued_call_data::{EnqueuedCallData, Proof},
        function_data::FunctionData,
        function_selector::FunctionSelector,
        gas::Gas,
        gas_settings::GasSettings,
        global_variables::GlobalVariables,
        kernel_circuit_public_inputs::{
            KernelCircuitPublicInputs, PrivateKernelCircuitPublicInputs,
            PublicKernelCircuitPublicInputs, VMCircuitPublicInputs,
        },
        log_hash::{EncryptedLogHash, LogHash, NoteLogHash, ScopedEncryptedLogHash, ScopedLogHash},
        max_block_number::MaxBlockNumber,
        note_hash::{NoteHash, ScopedNoteHash},
        nullifier::{Nullifier, ScopedNullifier},
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallData,
        private_kernel_data::PrivateKernelData,
        public_call_data::{Proof as PublicCallDataProof, PublicCallData},
        public_call_request::PublicCallRequest,
        public_circuit_public_inputs::PublicCircuitPublicInputs,
        public_data_read::PublicDataRead,
        public_data_update_request::PublicDataUpdateRequest,
        public_inner_call_request::PublicInnerCallRequest,
        public_kernel_data::PublicKernelData,
        read_request::{ReadRequest, ScopedReadRequest},
        tree_leaf_read_request::TreeLeafReadRequest,
        validation_requests::{
            KeyValidationRequest, KeyValidationRequestAndGenerator, PrivateValidationRequests,
            PublicValidationRequestArrayLengths, PublicValidationRequests, RollupValidationRequests,
            ScopedKeyValidationRequestAndGenerator,
        },
    },
    address::{AztecAddress, EthAddress, SaltedInitializationHash},
    constants::{
        FUNCTION_TREE_HEIGHT, MAX_ENCRYPTED_LOGS_PER_TX, MAX_FIELD_VALUE,
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, MAX_PUBLIC_DATA_READS_PER_CALL,
        MAX_PUBLIC_DATA_READS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX,
        PRIVATE_CALL_REQUEST_LENGTH, PROTOCOL_CONTRACT_TREE_HEIGHT, PUBLIC_CALL_REQUEST_LENGTH,
        VK_TREE_HEIGHT,
    },
    contrakt::{storage_read::StorageRead, storage_update_request::StorageUpdateRequest},
    hash::{
        compute_l2_to_l1_hash, compute_siloed_nullifier, compute_tx_logs_hash,
        mask_encrypted_log_hash, silo_note_hash, silo_unencrypted_log_hash,
    },
    header::Header,
    merkle_tree::{membership::MembershipWitness, MerkleTree},
    messaging::l2_to_l1_message::{L2ToL1Message, ScopedL2ToL1Message},
    partial_state_reference::PartialStateReference,
    point::Point,
    proof::{
        recursive_proof::NestedRecursiveProof,
        verification_key::{ClientIVCVerificationKey, HonkVerificationKey, VerificationKey},
    },
    public_keys::PublicKeys,
    tests::fixtures::{self, contract_functions::ContractFunction, contracts::ContractData},
    traits::Empty,
    transaction::{tx_context::TxContext, tx_request::TxRequest},
};

fn subarray<T, let N: u32, let M: u32>(arr: [T; N]) -> [T; M] {
    assert(N >= M, "cannot call subarray on a smaller array");
    let mut new_arr = [arr[0]; M];
    for i in 0..M {
        new_arr[i] = arr[i];
    }
    new_arr
}

fn vec_reverse<T, let N: u32>(vec: BoundedVec<T, N>) -> BoundedVec<T, N> {
    let mut reversed = BoundedVec::new();
    let len = vec.len();
    for i in 0..N {
        if i < len {
            reversed.push(vec.storage[len - i - 1]);
        }
    }
    reversed
}

pub struct FixtureBuilder {
    contract_address: AztecAddress,
    msg_sender: AztecAddress,
    is_static_call: bool,

    // Fees.
    is_fee_payer: bool,
    fee_payer: AztecAddress,
    public_teardown_call_request: PublicCallRequest,
    transaction_fee: Field,
    start_gas_left: Gas,
    end_gas_left: Gas,

    // Constant data.
    historical_header: Header,
    tx_context: TxContext,
    global_variables: GlobalVariables,

    // Accumulated data.
    note_hashes: BoundedVec<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    nullifiers: BoundedVec<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    l2_to_l1_msgs: BoundedVec<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX>,
    note_encrypted_logs_hashes: BoundedVec<NoteLogHash, MAX_NOTE_ENCRYPTED_LOGS_PER_TX>,
    encrypted_logs_hashes: BoundedVec<ScopedEncryptedLogHash, MAX_ENCRYPTED_LOGS_PER_TX>,
    unencrypted_logs_hashes: BoundedVec<ScopedLogHash, MAX_UNENCRYPTED_LOGS_PER_TX>,
    note_encrypted_logs_hash: Field,
    encrypted_logs_hash: Field,
    unencrypted_logs_hash: Field,
    note_encrypted_log_preimages_length: Field,
    encrypted_log_preimages_length: Field,
    unencrypted_log_preimages_length: Field,
    public_data_update_requests: BoundedVec<PublicDataUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
    contract_storage_update_requests: BoundedVec<StorageUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL>,
    private_call_requests: BoundedVec<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    public_call_requests: BoundedVec<PublicCallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    public_inner_call_requests: BoundedVec<PublicInnerCallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    gas_used: Gas,
    revert_code: u8,

    // Validation requests.
    max_block_number: MaxBlockNumber,
    note_hash_read_requests: BoundedVec<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    note_hash_tree_leaf_read_requests: BoundedVec<TreeLeafReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    nullifier_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    nullifier_non_existent_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX>,
    l1_to_l2_msg_read_requests: BoundedVec<TreeLeafReadRequest, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX>,
    scoped_key_validation_requests_and_generators: BoundedVec<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    public_data_reads: BoundedVec<PublicDataRead, MAX_PUBLIC_DATA_READS_PER_TX>,
    contract_storage_reads: BoundedVec<StorageRead, MAX_PUBLIC_DATA_READS_PER_CALL>,
    validation_requests_split_counter: Option<u32>,

    // Function.
    function_data: FunctionData,
    args_hash: Field,
    returns_hash: Field,

    // Private call.
    salted_initialization_hash: SaltedInitializationHash,
    public_keys: PublicKeys,
    contract_class_artifact_hash: Field,
    contract_class_public_bytecode_commitment: Field,
    function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,
    acir_hash: Field,

    // Public call.
    bytecode_hash: Field,
    prover_address: AztecAddress,

    // Proof.
    proof: NestedRecursiveProof,
    honk_vk: HonkVerificationKey,
    client_ivc_vk: ClientIVCVerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
    vk_tree_root: Field,

    // Protocol contracts.
    protocol_contract_tree_root: Field,
    protocol_contract_sibling_path: [Field; PROTOCOL_CONTRACT_TREE_HEIGHT],

    // Counters.
    min_revertible_side_effect_counter: u32,
    counter_start: u32,
    counter: u32,

    // States.
    start_state: PartialStateReference,

    // Mock data.
    value_offset: Field,
}

impl FixtureBuilder {
    pub fn new() -> Self {
        FixtureBuilder::new_from_counter(0)
    }

    pub fn new_from_counter(counter_start: u32) -> Self {
        let mut builder = FixtureBuilder::empty();

        builder.tx_context = TxContext {
            chain_id: fixtures::CHAIN_ID,
            version: fixtures::VERSION,
            gas_settings: GasSettings::empty(),
        };
        builder.msg_sender = fixtures::contracts::parent_contract.address;
        builder.counter_start = counter_start;
        builder.counter = counter_start + 1;

        let contract_data = fixtures::contracts::default_contract;
        let contract_function = fixtures::contract_functions::default_private_function;

        builder.use_contract(contract_data).use_function(contract_function)
    }

    pub fn as_parent_contract(&mut self) -> Self {
        self.contract_address = fixtures::contracts::parent_contract.address;
        self.msg_sender = fixtures::MSG_SENDER;
        *self
    }

    pub fn in_vk_tree(&mut self, vk_index: u32) -> Self {
        self.vk_index = vk_index;
        let vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH> =
            comptime { fixtures::vk_tree::get_vk_merkle_tree() };

        self.honk_vk = fixtures::vk_tree::generate_fake_honk_vk_for_index(vk_index);
        self.client_ivc_vk = fixtures::vk_tree::generate_fake_client_ivc_vk_for_index(vk_index);

        self.vk_path = vk_tree.get_sibling_path(vk_index);

        self.vk_tree_root = vk_tree.get_root();

        *self
    }

    pub fn set_protocol_contract_root(&mut self) {
        let tree = fixtures::protocol_contract_tree::get_protocol_contract_tree();
        self.protocol_contract_tree_root = tree.get_root();
    }

    pub fn use_protocol_contract(&mut self) -> Self {
        let contract_index = 1;

        let tree = fixtures::protocol_contract_tree::get_protocol_contract_tree();
        self.protocol_contract_tree_root = tree.get_root();
        self.protocol_contract_sibling_path = tree.get_sibling_path(contract_index);

        let contract_data = fixtures::contracts::get_protocol_contract(contract_index);
        let function_data =
            fixtures::contract_functions::get_protocol_contract_function(contract_index);

        let _ = self.use_contract(contract_data);
        self.contract_address = AztecAddress::from_field(contract_index as Field);

        self.use_function(function_data)
    }

    pub fn use_contract(&mut self, contract_data: ContractData) -> Self {
        self.contract_address = contract_data.address;
        self.salted_initialization_hash = contract_data.salted_initialization_hash;
        self.public_keys = contract_data.public_keys;
        self.contract_class_artifact_hash = contract_data.artifact_hash;
        self.contract_class_public_bytecode_commitment = contract_data.public_bytecode_commitment;

        *self
    }

    pub fn use_function(&mut self, function_data: ContractFunction) -> Self {
        self.function_data = function_data.data;
        self.function_leaf_membership_witness = function_data.membership_witness;
        self.acir_hash = function_data.acir_hash;
        *self
    }

    pub fn is_public_function(&mut self) -> Self {
        let contract_function = fixtures::contract_functions::default_public_function;
        self.function_data = contract_function.data;
        self.bytecode_hash = contract_function.acir_hash;
        *self
    }

    pub fn is_static_call(&mut self) -> Self {
        self.is_static_call = true;
        *self
    }

    pub fn is_first_call(&mut self) -> Self {
        self.msg_sender = AztecAddress::from_field(MAX_FIELD_VALUE);
        *self
    }

    pub fn to_constant_data(self) -> CombinedConstantData {
        CombinedConstantData {
            historical_header: self.historical_header,
            tx_context: self.tx_context,
            vk_tree_root: self.vk_tree_root,
            protocol_contract_tree_root: self.protocol_contract_tree_root,
            global_variables: self.global_variables,
        }
    }

    pub fn build_tx_request(self) -> TxRequest {
        TxRequest {
            origin: self.contract_address,
            args_hash: self.args_hash,
            tx_context: self.tx_context,
            function_data: self.function_data,
        }
    }

    pub fn build_call_context(self) -> CallContext {
        CallContext {
            msg_sender: self.msg_sender,
            contract_address: self.contract_address,
            function_selector: self.function_data.selector,
            is_static_call: self.is_static_call,
        }
    }

    pub fn build_private_call_request(self) -> PrivateCallRequest {
        PrivateCallRequest {
            call_context: self.build_call_context(),
            args_hash: self.args_hash,
            returns_hash: self.returns_hash,
            start_side_effect_counter: self.counter_start,
            end_side_effect_counter: self.counter,
        }
    }

    pub fn to_private_circuit_public_inputs(self) -> PrivateCircuitPublicInputs {
        PrivateCircuitPublicInputs {
            call_context: self.build_call_context(),
            args_hash: self.args_hash,
            returns_hash: self.returns_hash,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            is_fee_payer: self.is_fee_payer,
            max_block_number: self.max_block_number,
            note_hash_read_requests: subarray(self.note_hash_read_requests.storage.map(
                |r: ScopedReadRequest| r.read_request,
            )),
            nullifier_read_requests: subarray(self.nullifier_read_requests.storage.map(
                |r: ScopedReadRequest| r.read_request,
            )),
            key_validation_requests_and_generators: subarray(self
                .scoped_key_validation_requests_and_generators
                .storage
                .map(|r: ScopedKeyValidationRequestAndGenerator| r.request)),
            note_hashes: subarray(
                self.note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash),
            ),
            nullifiers: subarray(
                self.nullifiers.storage.map(|n: ScopedNullifier| n.nullifier),
            ),
            private_call_requests: subarray(self.private_call_requests.storage),
            public_call_requests: subarray(self.public_call_requests.storage),
            public_teardown_call_request: self.public_teardown_call_request,
            l2_to_l1_msgs: subarray(self.l2_to_l1_msgs.storage.map(|r: ScopedL2ToL1Message| {
                r.message
            })),
            start_side_effect_counter: self.counter_start,
            end_side_effect_counter: self.counter,
            note_encrypted_logs_hashes: subarray(self.note_encrypted_logs_hashes.storage),
            encrypted_logs_hashes: subarray(self.encrypted_logs_hashes.storage.map(
                |l: ScopedEncryptedLogHash| l.log_hash,
            )),
            unencrypted_logs_hashes: subarray(self.unencrypted_logs_hashes.storage.map(
                |l: ScopedLogHash| l.log_hash,
            )),
            historical_header: self.historical_header,
            tx_context: self.tx_context,
        }
    }

    pub fn to_private_call_data(self) -> PrivateCallData {
        PrivateCallData {
            public_inputs: self.to_private_circuit_public_inputs(),
            vk: self.client_ivc_vk,
            function_leaf_membership_witness: self.function_leaf_membership_witness,
            salted_initialization_hash: self.salted_initialization_hash,
            public_keys: self.public_keys,
            contract_class_artifact_hash: self.contract_class_artifact_hash,
            contract_class_public_bytecode_commitment: self
                .contract_class_public_bytecode_commitment,
            protocol_contract_sibling_path: self.protocol_contract_sibling_path,
            acir_hash: self.acir_hash,
        }
    }

    pub fn to_private_accumulated_data_builder(self) -> PrivateAccumulatedDataBuilder {
        PrivateAccumulatedDataBuilder {
            note_hashes: self.note_hashes,
            nullifiers: self.nullifiers,
            l2_to_l1_msgs: self.l2_to_l1_msgs,
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes,
            encrypted_logs_hashes: self.encrypted_logs_hashes,
            unencrypted_logs_hashes: self.unencrypted_logs_hashes,
            public_call_requests: self.public_call_requests,
            private_call_stack: vec_reverse(self.private_call_requests),
        }
    }

    pub fn to_private_accumulated_data(self) -> PrivateAccumulatedData {
        self.to_private_accumulated_data_builder().finish()
    }

    pub fn to_public_call_request(self) -> PublicCallRequest {
        PublicCallRequest {
            call_context: self.build_call_context(),
            args_hash: self.args_hash,
            counter: 0,
        }
    }

    pub fn to_public_accumulated_data_builder(self) -> PublicAccumulatedDataBuilder {
        let nullifiers = BoundedVec {
            storage: self.nullifiers.storage.map(|n: ScopedNullifier| n.nullifier),
            len: self.nullifiers.len(),
        };
        let note_encrypted_logs_hashes = BoundedVec {
            storage: self.note_encrypted_logs_hashes.storage.map(|l: NoteLogHash| {
                LogHash { value: l.value, counter: l.counter, length: l.length }
            }),
            len: self.note_encrypted_logs_hashes.len(),
        };
        let encrypted_logs_hashes = BoundedVec {
            storage: self.encrypted_logs_hashes.storage.map(|l: ScopedEncryptedLogHash| {
                ScopedLogHash {
                    log_hash: LogHash {
                        value: l.log_hash.value,
                        counter: l.log_hash.counter,
                        length: l.log_hash.length,
                    },
                    contract_address: l.contract_address,
                }
            }),
            len: self.encrypted_logs_hashes.len(),
        };

        PublicAccumulatedDataBuilder {
            note_hashes: self.note_hashes,
            nullifiers,
            l2_to_l1_msgs: self.l2_to_l1_msgs,
            note_encrypted_logs_hashes,
            encrypted_logs_hashes,
            unencrypted_logs_hashes: self.unencrypted_logs_hashes,
            public_data_update_requests: self.public_data_update_requests,
            public_call_stack: self.public_call_requests,
            gas_used: self.gas_used,
        }
    }

    pub fn to_public_accumulated_data(self) -> PublicAccumulatedData {
        self.to_public_accumulated_data_builder().finish()
    }

    pub fn to_exposed_public_accumulated_data(self) -> PublicAccumulatedData {
        PublicAccumulatedData {
            note_hashes: self.note_hashes.storage.map(|n: ScopedNoteHash| n.expose_to_public()),
            nullifiers: self.nullifiers.storage.map(|n: ScopedNullifier| n.expose_to_public()),
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage.map(|m: ScopedL2ToL1Message| {
                m.expose_to_public()
            }),
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes.storage.map(
                |l: NoteLogHash| l.expose_to_public(),
            ),
            encrypted_logs_hashes: self.encrypted_logs_hashes.storage.map(
                |l: ScopedEncryptedLogHash| l.expose_to_public(),
            ),
            unencrypted_logs_hashes: self.unencrypted_logs_hashes.storage.map(|l: ScopedLogHash| {
                l.expose_to_public()
            }),
            public_data_update_requests: self.public_data_update_requests.storage,
            public_call_stack: self.public_call_requests.storage.map(|cr: PublicCallRequest| {
                cr.expose_to_public()
            }),
            gas_used: self.gas_used,
        }
    }

    pub fn to_combined_accumulated_data(self) -> CombinedAccumulatedData {
        CombinedAccumulatedData {
            note_hashes: self.note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash.value),
            nullifiers: self.nullifiers.storage.map(|n: ScopedNullifier| n.nullifier.value),
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage.map(|m: ScopedL2ToL1Message| {
                m.expose_to_public()
            }),
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes.storage.map(
                |l: NoteLogHash| l.expose_to_public(),
            ),
            encrypted_logs_hashes: self.encrypted_logs_hashes.storage.map(
                |l: ScopedEncryptedLogHash| l.expose_to_public(),
            ),
            unencrypted_logs_hashes: self.unencrypted_logs_hashes.storage.map(|l: ScopedLogHash| {
                l.expose_to_public()
            }),
            note_encrypted_log_preimages_length: self.note_encrypted_log_preimages_length,
            encrypted_log_preimages_length: self.encrypted_log_preimages_length,
            unencrypted_log_preimages_length: self.unencrypted_log_preimages_length,
            public_data_update_requests: self.public_data_update_requests.storage,
            gas_used: self.gas_used,
        }
    }

    pub fn to_private_validation_requests(self) -> PrivateValidationRequests {
        PrivateValidationRequests {
            for_rollup: self.to_rollup_validation_requests(),
            note_hash_read_requests: self.note_hash_read_requests.storage,
            nullifier_read_requests: self.nullifier_read_requests.storage,
            scoped_key_validation_requests_and_generators: self
                .scoped_key_validation_requests_and_generators
                .storage,
            split_counter: self.validation_requests_split_counter,
        }
    }

    pub fn to_private_kernel_circuit_public_inputs(self) -> PrivateKernelCircuitPublicInputs {
        let end = self.to_private_accumulated_data();
        let validation_requests = self.to_private_validation_requests();
        let constants = self.to_constant_data();
        let public_teardown_call_request = self.public_teardown_call_request;

        PrivateKernelCircuitPublicInputs {
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            end,
            validation_requests,
            constants,
            public_teardown_call_request,
            fee_payer: self.fee_payer,
        }
    }

    pub fn to_private_kernel_data(self) -> PrivateKernelData {
        let public_inputs = self.to_private_kernel_circuit_public_inputs();
        PrivateKernelData {
            public_inputs,
            vk: self.client_ivc_vk,
            vk_index: self.vk_index,
            vk_path: self.vk_path,
        }
    }

    pub fn to_public_circuit_public_inputs(self) -> PublicCircuitPublicInputs {
        PublicCircuitPublicInputs {
            call_context: self.build_call_context(),
            args_hash: self.args_hash,
            returns_hash: self.returns_hash,
            note_hash_read_requests: subarray(self.note_hash_tree_leaf_read_requests.storage),
            nullifier_read_requests: subarray(self.nullifier_read_requests.storage.map(
                |r: ScopedReadRequest| r.read_request,
            )),
            nullifier_non_existent_read_requests: subarray(self
                .nullifier_non_existent_read_requests
                .storage
                .map(|r: ScopedReadRequest| r.read_request)),
            l1_to_l2_msg_read_requests: subarray(self.l1_to_l2_msg_read_requests.storage),
            contract_storage_update_requests: subarray(
                self.contract_storage_update_requests.storage,
            ),
            contract_storage_reads: self.contract_storage_reads.storage,
            public_call_requests: subarray(self.public_inner_call_requests.storage),
            note_hashes: subarray(
                self.note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash),
            ),
            nullifiers: subarray(
                self.nullifiers.storage.map(|n: ScopedNullifier| n.nullifier),
            ),
            l2_to_l1_msgs: subarray(self.l2_to_l1_msgs.storage.map(|m: ScopedL2ToL1Message| {
                m.message
            })),
            start_side_effect_counter: self.counter_start,
            end_side_effect_counter: self.counter,
            unencrypted_logs_hashes: subarray(self.unencrypted_logs_hashes.storage.map(
                |l: ScopedLogHash| l.log_hash,
            )),
            historical_header: self.historical_header,
            global_variables: self.global_variables,
            prover_address: self.prover_address,
            revert_code: self.revert_code,
            start_gas_left: self.start_gas_left,
            end_gas_left: self.end_gas_left,
            transaction_fee: self.transaction_fee,
        }
    }

    pub fn to_public_call_data(self) -> PublicCallData {
        PublicCallData {
            public_inputs: self.to_public_circuit_public_inputs(),
            proof: PublicCallDataProof {},
            bytecode_hash: self.bytecode_hash,
        }
    }

    pub fn to_public_validation_requests(self) -> PublicValidationRequests {
        PublicValidationRequests {
            for_rollup: self.to_rollup_validation_requests(),
            note_hash_read_requests: self.note_hash_tree_leaf_read_requests.storage,
            nullifier_read_requests: self.nullifier_read_requests.storage,
            nullifier_non_existent_read_requests: self.nullifier_non_existent_read_requests.storage,
            public_data_reads: self.public_data_reads.storage,
            l1_to_l2_msg_read_requests: self.l1_to_l2_msg_read_requests.storage,
        }
    }

    pub fn to_vm_circuit_public_inputs(self) -> VMCircuitPublicInputs {
        VMCircuitPublicInputs {
            constants: self.to_constant_data(),
            call_request: self.to_public_call_request(),
            public_call_stack: subarray(self.public_inner_call_requests.storage),
            previous_validation_request_array_lengths: PublicValidationRequestArrayLengths::empty(),
            validation_requests: self.to_public_validation_requests(),
            previous_accumulated_data_array_lengths: PublicAccumulatedDataArrayLengths::empty(),
            accumulated_data: self.to_public_accumulated_data(),
            start_side_effect_counter: self.counter_start,
            end_side_effect_counter: self.counter,
            start_gas_left: self.start_gas_left,
            transaction_fee: self.transaction_fee,
            reverted: self.revert_code != 0,
        }
    }

    pub fn to_enqueued_call_data(self) -> EnqueuedCallData {
        EnqueuedCallData { data: self.to_vm_circuit_public_inputs(), proof: Proof {} }
    }

    pub fn to_public_kernel_circuit_public_inputs(
        self,
        revertible: bool,
    ) -> PublicKernelCircuitPublicInputs {
        // TODO: Split the data using self.min_revertible_side_effect_counter.
        let accumulated_data = self.to_public_accumulated_data();
        let end_non_revertible = if revertible {
            PublicAccumulatedData::empty()
        } else {
            accumulated_data
        };
        let end = if revertible {
            accumulated_data
        } else {
            PublicAccumulatedData::empty()
        };

        PublicKernelCircuitPublicInputs {
            constants: self.to_constant_data(),
            validation_requests: self.to_public_validation_requests(),
            end_non_revertible,
            end,
            end_side_effect_counter: self.counter,
            public_teardown_call_request: self.public_teardown_call_request,
            fee_payer: self.fee_payer,
            revert_code: self.revert_code,
        }
    }

    pub fn to_public_kernel_data(self, revertible: bool) -> PublicKernelData {
        let public_inputs = self.to_public_kernel_circuit_public_inputs(revertible);
        PublicKernelData {
            public_inputs,
            proof: self.proof,
            vk: self.honk_vk,
            vk_index: self.vk_index,
            vk_path: self.vk_path,
        }
    }

    pub fn to_rollup_validation_requests(self) -> RollupValidationRequests {
        RollupValidationRequests { max_block_number: self.max_block_number }
    }

    pub fn to_kernel_circuit_public_inputs(self) -> KernelCircuitPublicInputs {
        let rollup_validation_requests = self.to_rollup_validation_requests();
        let end = self.to_combined_accumulated_data();
        let constants = self.to_constant_data();

        KernelCircuitPublicInputs {
            rollup_validation_requests,
            end,
            constants,
            start_state: self.start_state,
            revert_code: self.revert_code,
            fee_payer: self.fee_payer,
        }
    }

    pub fn add_new_note_hash(&mut self, value: Field) {
        self.note_hashes.push(NoteHash { value, counter: self.next_counter() }.scope(
            self.contract_address,
        ));
    }

    pub fn add_siloed_note_hash(&mut self, value: Field) {
        // First nullifier is tx hash.
        let tx_hash = self.nullifiers.get(0).value();
        let index = self.note_hashes.len();
        let note_hash_to_silo = NoteHash { value, counter: 0 }.scope(self.contract_address);
        let siloed_value = silo_note_hash(note_hash_to_silo, tx_hash, index);
        self.note_hashes.push(NoteHash { value: siloed_value, counter: self.next_counter() }.scope(
            AztecAddress::zero(),
        ));
    }

    pub fn append_note_hashes(&mut self, num_note_hashes: u32) {
        let index_offset = self.note_hashes.len();
        for i in 0..self.note_hashes.max_len() {
            if i < num_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                self.add_new_note_hash(value);
            }
        }
    }

    pub fn append_siloed_note_hashes(&mut self, num_note_hashes: u32) {
        let index_offset = self.note_hashes.len();
        for i in 0..self.note_hashes.max_len() {
            if i < num_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                self.add_siloed_note_hash(value);
            }
        }
    }

    pub fn append_note_hashes_with_logs(&mut self, num_note_hashes: u32) {
        let index_offset = self.note_hashes.len();
        for i in 0..self.note_hashes.max_len() {
            if i < num_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                self.add_new_note_hash(value);
                let (log_hash, length) = self.mock_note_encrypted_log(index_offset + i);
                self.add_note_encrypted_log_hash(log_hash, length, self.counter - 1);
            }
        }
    }

    pub fn set_first_nullifier(&mut self) {
        assert_eq(self.nullifiers.len(), 0, "first nullifier already set");
        let value = self.mock_nullifier_value(0);
        let first_nullifier =
            Nullifier { value, counter: 0, note_hash: 0 }.scope(AztecAddress::zero());
        self.nullifiers.push(first_nullifier);
    }

    pub fn add_nullifier(&mut self, value: Field) {
        let note_hash = 0;
        self.add_nullifier_for_note_hash(value, note_hash);
    }

    pub fn add_nullifier_for_note_hash(&mut self, value: Field, note_hash: Field) {
        self.nullifiers.push(Nullifier { value, counter: self.next_counter(), note_hash }.scope(
            self.contract_address,
        ));
    }

    pub fn add_siloed_nullifier(&mut self, value: Field) {
        let note_hash = 0;
        self.add_siloed_nullifier_for_note_hash(value, note_hash);
    }

    pub fn add_siloed_nullifier_for_note_hash(&mut self, value: Field, note_hash: Field) {
        let siloed_value = compute_siloed_nullifier(self.contract_address, value);
        self.nullifiers.push(Nullifier {
            value: siloed_value,
            counter: self.next_counter(),
            note_hash,
        }
            .scope(AztecAddress::zero()));
    }

    pub fn append_nullifiers(&mut self, num_extra_nullifier: u32) {
        let index_offset = self.nullifiers.len();
        for i in 0..self.nullifiers.max_len() {
            if i < num_extra_nullifier {
                let value = self.mock_nullifier_value(index_offset + i);
                self.add_nullifier(value);
            }
        }
    }

    pub fn append_siloed_nullifiers(&mut self, num_extra_nullifier: u32) {
        let index_offset = self.nullifiers.len();
        for i in 0..self.nullifiers.max_len() {
            if i < num_extra_nullifier {
                let value = self.mock_nullifier_value(index_offset + i);
                self.add_siloed_nullifier(value);
            }
        }
    }

    pub fn add_l2_to_l1_message(&mut self, content: Field, recipient: EthAddress) {
        self.l2_to_l1_msgs.push(L2ToL1Message { recipient, content, counter: self.next_counter() }
            .scope(self.contract_address));
    }

    pub fn add_exposed_l2_to_l1_message(&mut self, content: Field, recipient: EthAddress) {
        self.l2_to_l1_msgs.push(L2ToL1Message { recipient, content, counter: 0 }.scope(
            self.contract_address,
        ));
    }

    pub fn add_siloed_l2_to_l1_message(&mut self, content: Field, recipient: EthAddress) {
        let siloed_content = compute_l2_to_l1_hash(
            self.contract_address,
            recipient,
            content,
            self.tx_context.version,
            self.tx_context.chain_id,
        );
        self.add_l2_to_l1_message(siloed_content, recipient);
    }

    pub fn append_l2_to_l1_msgs(&mut self, num: u32) {
        let index_offset = self.l2_to_l1_msgs.len();
        for i in 0..self.l2_to_l1_msgs.max_len() {
            if i < num {
                let (content, recipient) = self.mock_l2_to_l1_msg(index_offset + i);
                self.add_l2_to_l1_message(content, recipient);
            }
        }
    }

    pub fn append_exposed_l2_to_l1_msgs(&mut self, num: u32) {
        let index_offset = self.l2_to_l1_msgs.len();
        for i in 0..self.l2_to_l1_msgs.max_len() {
            if i < num {
                let (content, recipient) = self.mock_l2_to_l1_msg(index_offset + i);
                self.add_exposed_l2_to_l1_message(content, recipient);
            }
        }
    }

    pub fn add_contract_storage_read_request(&mut self, storage_slot: Field, value: Field) {
        self.contract_storage_reads.push(
            StorageRead { storage_slot, current_value: value, counter: self.next_counter() },
        );
    }

    pub fn append_contract_storage_read_requests(&mut self, num: u32) {
        let index_offset = self.contract_storage_reads.len();
        for i in 0..self.contract_storage_reads.max_len() {
            if i < num {
                let (storage_slot, value) = self.mock_contract_storage_read(index_offset + i);
                self.add_contract_storage_read_request(storage_slot, value);
            }
        }
    }

    pub fn add_contract_storage_update_request(&mut self, storage_slot: Field, value: Field) {
        let update_request =
            StorageUpdateRequest { storage_slot, new_value: value, counter: self.next_counter() };
        self.contract_storage_update_requests.push(update_request);
    }

    pub fn append_contract_storage_update_requests(&mut self, num: u32) {
        let index_offset = self.contract_storage_update_requests.len();
        for i in 0..self.contract_storage_update_requests.max_len() {
            if i < num {
                let (storage_slot, value) = self.mock_contract_storage_write(index_offset + i);
                self.add_contract_storage_update_request(storage_slot, value);
            }
        }
    }

    pub fn add_public_data_update_request(&mut self, leaf_slot: Field, value: Field) {
        let update_request =
            PublicDataUpdateRequest { leaf_slot, new_value: value, counter: self.next_counter() };
        self.public_data_update_requests.push(update_request);
    }

    pub fn append_public_data_update_requests(&mut self, num_updates: u32) {
        let index_offset = self.public_data_update_requests.len();
        for i in 0..self.public_data_update_requests.max_len() {
            if i < num_updates {
                let (leaf_slot, value) = self.mock_public_data_write(index_offset + i);
                self.add_public_data_update_request(leaf_slot, value);
            }
        }
    }

    pub fn add_public_data_read_request(&mut self, leaf_slot: Field, value: Field) {
        self.public_data_reads.push(
            PublicDataRead { leaf_slot, value, counter: self.next_counter() },
        );
    }

    pub fn append_public_data_read_requests(&mut self, num_reads: u32) {
        let index_offset = self.public_data_reads.len();
        for i in 0..self.public_data_reads.max_len() {
            if i < num_reads {
                let (leaf_slot, value) = self.mock_public_data_read(index_offset + i);
                self.add_public_data_read_request(leaf_slot, value);
            }
        }
    }

    pub fn add_read_request_for_pending_note_hash(&mut self, note_hash_index: u32) -> u32 {
        let read_request_index = self.note_hash_read_requests.len();
        let value = self.mock_note_hash_value(note_hash_index);
        let read_request =
            ReadRequest { value, counter: self.next_counter() }.scope(self.contract_address);
        self.note_hash_read_requests.push(read_request);
        read_request_index
    }

    pub fn append_note_hash_read_requests(&mut self, num_reads: u32) {
        let index_offset = self.note_hash_read_requests.len();
        for i in 0..self.note_hash_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_note_hash_read_value(index_offset + i);
                let read_request = ReadRequest { value, counter: self.next_counter() }.scope(
                    self.contract_address,
                );
                self.note_hash_read_requests.push(read_request);
            }
        }
    }

    pub fn add_note_hash_tree_leaf_read_requests(&mut self, value: Field, leaf_index: Field) {
        let read_request = TreeLeafReadRequest { value, leaf_index };
        self.note_hash_tree_leaf_read_requests.push(read_request);
    }

    pub fn append_note_hash_tree_leaf_read_requests(&mut self, num_reads: u32) {
        let index_offset = self.note_hash_tree_leaf_read_requests.len();
        for i in 0..self.note_hash_tree_leaf_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_note_hash_read_value(index_offset + i);
                self.add_note_hash_tree_leaf_read_requests(value, (index_offset + i) as Field);
            }
        }
    }

    pub fn add_read_request_for_pending_nullifier(&mut self, nullifier_index: u32) -> u32 {
        let read_request_index = self.nullifier_read_requests.len();
        let nullifier = self.mock_nullifier_value(nullifier_index);
        let read_request = ReadRequest { value: nullifier, counter: self.next_counter() }.scope(
            self.contract_address,
        );
        self.nullifier_read_requests.push(read_request);
        read_request_index
    }

    pub fn add_non_existent_read_request_for_nullifier(&mut self, nullifier: Field) {
        let read_request = ReadRequest { value: nullifier, counter: self.next_counter() }.scope(
            self.contract_address,
        );
        self.nullifier_non_existent_read_requests.push(read_request);
    }

    pub fn append_nullifier_read_requests(&mut self, num_reads: u32) {
        let index_offset = self.nullifier_read_requests.len();
        for i in 0..self.nullifier_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_nullifier_read_value(index_offset + i);
                let read_request = ReadRequest { value, counter: self.next_counter() }.scope(
                    self.contract_address,
                );
                self.nullifier_read_requests.push(read_request);
            }
        }
    }

    pub fn append_nullifier_non_existent_read_requests(&mut self, num: u32) {
        let index_offset = self.nullifier_non_existent_read_requests.len();
        for i in 0..self.nullifier_non_existent_read_requests.max_len() {
            if i < num {
                let value = self.mock_nullifier_read_value(index_offset + i);
                self.add_non_existent_read_request_for_nullifier(value);
            }
        }
    }

    pub fn add_request_for_key_validation(
        &mut self,
        pk_m: Point,
        sk_app: Field,
        sk_app_generator: Field,
    ) -> u32 {
        let new_request_index = self.scoped_key_validation_requests_and_generators.len();
        let request = KeyValidationRequest { pk_m, sk_app };
        let request_and_generator = KeyValidationRequestAndGenerator { request, sk_app_generator };
        let scoped_key_validation_request_and_generator =
            request_and_generator.scope(self.contract_address);
        self.scoped_key_validation_requests_and_generators.push(
            scoped_key_validation_request_and_generator,
        );

        new_request_index
    }

    pub fn append_key_validation_requests(&mut self, num_requests: u32) {
        let index_offset = self.scoped_key_validation_requests_and_generators.len();
        for i in 0..self.scoped_key_validation_requests_and_generators.max_len() {
            if i < num_requests {
                let request = self.mock_key_validation_request(index_offset + i);
                self.scoped_key_validation_requests_and_generators.push(request.scope(
                    self.contract_address,
                ));
            }
        }
    }

    pub fn add_note_encrypted_log_hash(
        &mut self,
        value: Field,
        length: Field,
        note_hash_counter: u32,
    ) {
        let log_hash =
            NoteLogHash { value, counter: self.next_counter(), length, note_hash_counter };
        self.note_encrypted_logs_hashes.push(log_hash);
        self.encrypted_log_preimages_length += length;
    }

    pub fn append_note_encrypted_log_hashes(&mut self, num: u32) {
        let index_offset = self.note_encrypted_logs_hashes.len();
        for i in 0..self.note_encrypted_logs_hashes.max_len() {
            if i < num {
                let (log_hash, length) = self.mock_note_encrypted_log(index_offset + i);
                self.add_note_encrypted_log_hash(log_hash, length, 0);
            }
        }
    }

    pub fn add_encrypted_log_hash(&mut self, hash: Field, length: Field) {
        let log_hash =
            EncryptedLogHash { value: hash, counter: self.next_counter(), length, randomness: 2 };
        self.encrypted_logs_hashes.push(log_hash.scope(self.contract_address));
        self.encrypted_log_preimages_length += length;
    }

    pub fn add_masked_encrypted_log_hash(&mut self, hash: Field, length: Field) {
        let mut log_hash = EncryptedLogHash {
            value: hash,
            counter: self.next_counter(),
            length,
            randomness: 2,
        }
            .scope(self.contract_address);
        log_hash.contract_address = mask_encrypted_log_hash(log_hash);
        log_hash.log_hash.randomness = 0;
        self.encrypted_logs_hashes.push(log_hash);
        self.encrypted_log_preimages_length += length;
    }

    pub fn append_encrypted_log_hashes(&mut self, num: u32) {
        let index_offset = self.encrypted_logs_hashes.len();
        for i in 0..self.encrypted_logs_hashes.max_len() {
            if i < num {
                let (log_hash, length) = self.mock_encrypted_log(index_offset + i);
                self.add_encrypted_log_hash(log_hash, length);
            }
        }
    }

    pub fn mask_encrypted_log_hashes(&mut self) {
        for i in 0..self.encrypted_logs_hashes.max_len() {
            self.encrypted_logs_hashes.storage[i].contract_address =
                mask_encrypted_log_hash(self.encrypted_logs_hashes.storage[i]);
        }
    }

    pub fn add_unencrypted_log_hash(&mut self, hash: Field, length: Field) {
        let log_hash = LogHash { value: hash, counter: self.next_counter(), length };
        self.unencrypted_logs_hashes.push(log_hash.scope(self.contract_address));
        self.unencrypted_log_preimages_length += length;
    }

    pub fn append_unencrypted_log_hashes(&mut self, num: u32) {
        let index_offset = self.unencrypted_logs_hashes.len();
        for i in 0..self.unencrypted_logs_hashes.max_len() {
            if i < num {
                let (log_hash, length) = self.mock_unencrypted_log(index_offset + i);
                self.add_unencrypted_log_hash(log_hash, length);
            }
        }
    }

    pub fn hash_unencrypted_log_hashes(&mut self) {
        let mut log_hashes = self.unencrypted_logs_hashes.storage.map(|l: ScopedLogHash| l.inner());
        for i in 0..self.unencrypted_logs_hashes.max_len() {
            let log_hash = self.unencrypted_logs_hashes.storage[i];
            if !log_hash.contract_address.is_zero() {
                log_hashes[i].value = silo_unencrypted_log_hash(log_hash);
            }
        }
        self.unencrypted_logs_hash = compute_tx_logs_hash(log_hashes);
    }

    pub fn set_encrypted_logs_hash(&mut self, hash: Field, preimages_length: Field) {
        self.encrypted_logs_hash = hash;
        self.encrypted_log_preimages_length = preimages_length;
    }

    pub fn set_unencrypted_logs_hash(&mut self, hash: Field, preimages_length: Field) {
        self.unencrypted_logs_hash = hash;
        self.unencrypted_log_preimages_length = preimages_length;
    }

    pub fn add_private_call_request_for_private_call(&mut self, private_call: PrivateCallData) {
        let public_inputs = private_call.public_inputs;
        let start_counter = public_inputs.start_side_effect_counter;
        let end_counter = public_inputs.end_side_effect_counter;
        self.counter = end_counter + 1;

        self.private_call_requests.push(
            PrivateCallRequest {
                call_context: public_inputs.call_context,
                args_hash: public_inputs.args_hash,
                returns_hash: public_inputs.returns_hash,
                start_side_effect_counter: start_counter,
                end_side_effect_counter: end_counter,
            },
        );
    }

    pub fn add_private_call_request(&mut self) {
        let index_offset = self.private_call_requests.len();
        let mut request = self.mock_private_call_request(index_offset);

        let start_counter = self.next_counter();
        let end_counter = start_counter + 10;
        request.start_side_effect_counter = start_counter;
        request.end_side_effect_counter = end_counter;
        self.counter = end_counter + 1;

        self.private_call_requests.push(request);
    }

    pub fn append_private_call_requests(&mut self, num: u32) {
        for i in 0..self.private_call_requests.max_len() {
            if i < num {
                self.add_private_call_request();
            }
        }
    }

    pub fn add_public_call_request(&mut self, request: PublicCallRequest) {
        self.public_call_requests.push(request);
    }

    pub fn append_public_call_requests(&mut self, num: u32) {
        let index_offset = self.public_call_requests.len();
        for i in 0..self.public_call_requests.max_len() {
            if i < num {
                let mut request = self.mock_public_call_request(index_offset + i);
                request.counter = self.next_counter();
                self.add_public_call_request(request);
            }
        }
    }

    pub fn set_fee_payer(&mut self, fee_payer: AztecAddress) {
        self.fee_payer = fee_payer;
    }

    pub fn make_fee_payer(&mut self) -> AztecAddress {
        self.is_fee_payer = true;
        self.set_fee_payer(self.contract_address);
        self.contract_address
    }

    pub fn set_public_teardown_call_request(&mut self) {
        let mut request = self.mock_public_teardown_call_request();
        request.counter = self.next_counter();
        self.public_teardown_call_request = request;
    }

    pub fn end_setup(&mut self) {
        self.min_revertible_side_effect_counter = self.counter;
    }

    pub fn set_max_block_number(&mut self, max_block_number: u32) {
        self.max_block_number = MaxBlockNumber::new(max_block_number);
    }

    fn mock_note_hash_read_value(self, index: u32) -> Field {
        789 + self.value_offset + index as Field
    }

    fn mock_nullifier_read_value(self, index: u32) -> Field {
        22334 + self.value_offset + index as Field
    }

    fn mock_key_validation_request(self, index: u32) -> KeyValidationRequestAndGenerator {
        let value_offset = 3030 + self.value_offset + index as Field;
        let request = KeyValidationRequest {
            pk_m: Point { x: value_offset, y: 1 + value_offset, is_infinite: false },
            sk_app: 2 + value_offset,
        };
        KeyValidationRequestAndGenerator { request, sk_app_generator: 3 + value_offset }
    }

    fn mock_public_data_read(self, index: u32) -> (Field, Field) {
        let value_offset = 4545 + self.value_offset + index as Field;
        (value_offset, value_offset + 1)
    }

    fn mock_public_data_write(self, index: u32) -> (Field, Field) {
        let value_offset = 7788 + self.value_offset + index as Field;
        let leaf_slot = value_offset;
        let value = 1 + value_offset;
        (leaf_slot, value)
    }

    fn mock_contract_storage_read(self, index: u32) -> (Field, Field) {
        let value_offset = 543543 + self.value_offset + index as Field;
        (value_offset, value_offset + 1)
    }

    fn mock_contract_storage_write(self, index: u32) -> (Field, Field) {
        let value_offset = 336699 + self.value_offset + index as Field;
        (value_offset, value_offset + 1)
    }

    fn mock_note_hash_value(self, index: u32) -> Field {
        212121 + self.value_offset + index as Field
    }

    fn mock_nullifier_value(self, index: u32) -> Field {
        5678 + self.value_offset + index as Field
    }

    fn mock_nullifier_value_non_revertible(self, index: u32) -> Field {
        9876 + self.value_offset + index as Field
    }

    fn mock_l2_to_l1_msg(self, index: u32) -> (Field, EthAddress) {
        let value_offset = 72727 + self.value_offset + index as Field;
        (value_offset, EthAddress::from_field(1 + value_offset))
    }

    fn mock_note_encrypted_log(self, index: u32) -> (Field, Field) {
        let log_hash = 282828 + self.value_offset + index as Field;
        let length = 5 + index as Field;
        (log_hash, length)
    }

    fn mock_encrypted_log(self, index: u32) -> (Field, Field) {
        let log_hash = 50403 + self.value_offset + index as Field;
        let length = 3 + index as Field;
        (log_hash, length)
    }

    fn mock_unencrypted_log(self, index: u32) -> (Field, Field) {
        let log_hash = 199199 + self.value_offset + index as Field;
        let length = 1 + index as Field;
        (log_hash, length)
    }

    fn mock_private_call_request(self, index: u32) -> PrivateCallRequest {
        let value_offset = 766766 + self.value_offset + index as Field;
        let mut fields = [0; PRIVATE_CALL_REQUEST_LENGTH];
        for i in 0..fields.len() {
            fields[i] = value_offset + i as Field;
        }
        let mut request = PrivateCallRequest::deserialize(fields);
        request.call_context.msg_sender = self.contract_address;
        request.call_context.is_static_call = self.is_static_call;
        request
    }

    fn mock_public_call_request(self, index: u32) -> PublicCallRequest {
        let value_offset = 636363 + self.value_offset + index as Field;
        let mut fields = [0; PUBLIC_CALL_REQUEST_LENGTH];
        for i in 0..fields.len() {
            fields[i] = value_offset + i as Field;
        }
        let mut request = PublicCallRequest::deserialize(fields);
        request.call_context.msg_sender = self.contract_address;
        request.call_context.is_static_call = self.is_static_call;
        request
    }

    fn mock_public_teardown_call_request(self) -> PublicCallRequest {
        self.mock_public_call_request(54345)
    }

    fn mock_fee_payer(self) -> AztecAddress {
        AztecAddress::from_field(900900 + self.value_offset)
    }

    fn next_counter(&mut self) -> u32 {
        let counter = self.counter;
        self.counter += 1;
        counter
    }

    fn vk_tree_root() -> Field {
        fixtures::vk_tree::get_vk_merkle_tree().get_root()
    }
}

impl Empty for FixtureBuilder {
    fn empty() -> Self {
        FixtureBuilder {
            contract_address: AztecAddress::zero(),
            msg_sender: AztecAddress::zero(),
            is_static_call: false,
            is_fee_payer: false,
            fee_payer: AztecAddress::zero(),
            public_teardown_call_request: PublicCallRequest::empty(),
            historical_header: Header::empty(),
            tx_context: TxContext::empty(),
            global_variables: GlobalVariables::empty(),
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            l2_to_l1_msgs: BoundedVec::new(),
            note_encrypted_logs_hashes: BoundedVec::new(),
            encrypted_logs_hashes: BoundedVec::new(),
            unencrypted_logs_hashes: BoundedVec::new(),
            note_encrypted_logs_hash: 0,
            encrypted_logs_hash: 0,
            unencrypted_logs_hash: 0,
            note_encrypted_log_preimages_length: 0,
            encrypted_log_preimages_length: 0,
            unencrypted_log_preimages_length: 0,
            public_data_update_requests: BoundedVec::new(),
            contract_storage_update_requests: BoundedVec::new(),
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_inner_call_requests: BoundedVec::new(),
            max_block_number: MaxBlockNumber::empty(),
            note_hash_read_requests: BoundedVec::new(),
            note_hash_tree_leaf_read_requests: BoundedVec::new(),
            nullifier_read_requests: BoundedVec::new(),
            nullifier_non_existent_read_requests: BoundedVec::new(),
            l1_to_l2_msg_read_requests: BoundedVec::new(),
            scoped_key_validation_requests_and_generators: BoundedVec::new(),
            public_data_reads: BoundedVec::new(),
            contract_storage_reads: BoundedVec::new(),
            validation_requests_split_counter: Option::none(),
            function_data: FunctionData::empty(),
            args_hash: 0,
            returns_hash: 0,
            function_leaf_membership_witness: MembershipWitness::empty(),
            salted_initialization_hash: SaltedInitializationHash::from_field(0),
            public_keys: PublicKeys::default(),
            contract_class_artifact_hash: 0,
            contract_class_public_bytecode_commitment: 0,
            acir_hash: 0,
            bytecode_hash: 0,
            prover_address: AztecAddress::zero(),
            proof: NestedRecursiveProof::empty(),
            honk_vk: VerificationKey::empty(),
            client_ivc_vk: VerificationKey::empty(),
            vk_index: 0,
            vk_path: [0; VK_TREE_HEIGHT],
            vk_tree_root: FixtureBuilder::vk_tree_root(),
            protocol_contract_tree_root: 0,
            protocol_contract_sibling_path: [0; PROTOCOL_CONTRACT_TREE_HEIGHT],
            revert_code: 0,
            min_revertible_side_effect_counter: 0,
            counter_start: 0,
            counter: 0,
            start_state: PartialStateReference::empty(),
            gas_used: Gas::empty(),
            start_gas_left: Gas::empty(),
            end_gas_left: Gas::empty(),
            transaction_fee: 0,
            value_offset: 0,
        }
    }
}
