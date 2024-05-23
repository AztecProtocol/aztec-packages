use crate::{
    abis::{
    gas::Gas, gas_settings::GasSettings, call_context::CallContext,
    call_request::{CallerContext, CallRequest},
    accumulated_data::{CombinedAccumulatedData, PrivateAccumulatedData, PrivateAccumulatedDataBuilder, PublicAccumulatedData},
    function_data::FunctionData, global_variables::GlobalVariables,
    combined_constant_data::CombinedConstantData,
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, PrivateKernelCircuitPublicInputs, PublicKernelCircuitPublicInputs},
    kernel_data::KernelData, public_kernel_data::PublicKernelData, max_block_number::MaxBlockNumber,
    private_kernel_data::PrivateKernelData, note_hash::{NoteHash, ScopedNoteHash},
    nullifier::{Nullifier, ScopedNullifier},
    key_validation_request::{ScopedKeyValidationRequest, KeyValidationRequest},
    private_call_request::{PrivateCallRequest, ScopedPrivateCallRequest},
    private_circuit_public_inputs::PrivateCircuitPublicInputs, public_data_read::PublicDataRead,
    public_data_update_request::PublicDataUpdateRequest, read_request::{ReadRequest, ScopedReadRequest},
    log_hash::{LogHash, NoteLogHash},
    validation_requests::{ValidationRequests, ValidationRequestsBuilder}
},
    address::{AztecAddress, EthAddress},
    constants::{
    MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_NULLIFIERS_PER_TX, MAX_NEW_L2_TO_L1_MSGS_PER_TX,
    MAX_PUBLIC_DATA_READS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, MAX_KEY_VALIDATION_REQUESTS_PER_TX, VK_TREE_HEIGHT,
    MAX_ENCRYPTED_LOGS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX
},
    hash::silo_nullifier, header::Header,
    messaging::l2_to_l1_message::{L2ToL1Message, ScopedL2ToL1Message},
    partial_state_reference::PartialStateReference, tests::fixtures,
    transaction::{tx_context::TxContext, tx_request::TxRequest}, traits::Empty,
    recursion::{verification_key::VerificationKey, proof::NestedRecursiveProof},
    grumpkin_point::GrumpkinPoint
};

fn subarray<T, N, M>(arr: [T; N]) -> [T; M] {
    assert(N >= M, "cannot call subarray on a smaller array");
    let mut new_arr = [arr[0]; M];
    for i in 0..M {
        new_arr[i] = arr[i];
    }
    new_arr
}

fn vec_reverse<T, N>(vec: BoundedVec<T, N>) -> BoundedVec<T, N> {
    let mut reversed = BoundedVec::new();
    let len = vec.len();
    for i in 0..N {
        if i < len {
            reversed.push(vec.storage[len - i - 1]);
        }
    }
    reversed
}

struct FixtureBuilder {
    contract_address: AztecAddress,
    storage_contract_address: AztecAddress,
    msg_sender: AztecAddress,
    is_delegate_call: bool,
    is_static_call: bool,

    // Fees.
    is_fee_payer: bool,
    fee_payer: AztecAddress,
    public_teardown_call_request: CallRequest,

    // Constant data.
    historical_header: Header,
    tx_context: TxContext,
    global_variables: GlobalVariables,
    
    // Accumulated data.
    new_note_hashes: BoundedVec<ScopedNoteHash, MAX_NEW_NOTE_HASHES_PER_TX>,
    new_nullifiers: BoundedVec<ScopedNullifier, MAX_NEW_NULLIFIERS_PER_TX>,
    new_l2_to_l1_msgs: BoundedVec<ScopedL2ToL1Message, MAX_NEW_L2_TO_L1_MSGS_PER_TX>,
    note_encrypted_logs_hashes: BoundedVec<NoteLogHash, MAX_NOTE_ENCRYPTED_LOGS_PER_TX>,
    encrypted_logs_hashes: BoundedVec<LogHash, MAX_ENCRYPTED_LOGS_PER_TX>,
    unencrypted_logs_hashes: BoundedVec<LogHash, MAX_UNENCRYPTED_LOGS_PER_TX>,
    note_encrypted_logs_hash: Field,
    encrypted_logs_hash: Field,
    unencrypted_logs_hash: Field,
    encrypted_log_preimages_length: Field,
    unencrypted_log_preimages_length: Field,
    public_data_update_requests: BoundedVec<PublicDataUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
    private_call_requests: BoundedVec<ScopedPrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    public_call_requests: BoundedVec<CallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    gas_used: Gas,
    non_revertible_gas_used: Gas,

    // Validation requests.
    max_block_number: MaxBlockNumber,
    note_hash_read_requests: BoundedVec<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    nullifier_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    nullifier_non_existent_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX>,
    key_validation_requests: BoundedVec<ScopedKeyValidationRequest, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    public_data_reads: BoundedVec<PublicDataRead, MAX_PUBLIC_DATA_READS_PER_TX>,

    // Function.
    function_data: FunctionData,
    args_hash: Field,
    returns_hash: Field,

    // Proof.
    proof: NestedRecursiveProof,
    vk: VerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
    revert_code: u8,
    
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
        let mut builder = FixtureBuilder::empty();
        builder.tx_context = TxContext { chain_id: fixtures::CHAIN_ID, version: fixtures::VERSION, gas_settings: GasSettings::empty() };
        builder.contract_address = fixtures::contracts::parent_contract.address;
        builder.storage_contract_address = fixtures::contracts::parent_contract.address;
        builder.msg_sender = fixtures::MSG_SENDER;
        builder.function_data = fixtures::contract_functions::default_private_function.data;
        builder.counter = 1;
        builder
    }

    pub fn to_constant_data(self) -> CombinedConstantData {
        CombinedConstantData {
            historical_header: self.historical_header,
            tx_context: self.tx_context,
            global_variables: self.global_variables
        }
    }

    pub fn build_tx_request(self) -> TxRequest {
        TxRequest {
            origin: self.contract_address,
            args_hash: self.args_hash,
            tx_context: self.tx_context,
            function_data: self.function_data
        }
    }

    pub fn build_call_context(self) -> CallContext {
        CallContext {
            msg_sender: self.msg_sender,
            storage_contract_address: self.storage_contract_address,
            function_selector: self.function_data.selector,
            is_delegate_call: self.is_delegate_call,
            is_static_call: self.is_static_call,
            side_effect_counter: self.counter_start
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
            note_hash_read_requests: subarray(self.note_hash_read_requests.storage.map(|r: ScopedReadRequest| r.read_request)),
            nullifier_read_requests: subarray(self.nullifier_read_requests.storage.map(|r: ScopedReadRequest| r.read_request)),
            key_validation_requests: subarray(self.key_validation_requests.storage.map(|r: ScopedKeyValidationRequest| r.request)),
            new_note_hashes: subarray(self.new_note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash)),
            new_nullifiers: subarray(self.new_nullifiers.storage.map(|n: ScopedNullifier| n.nullifier)),
            private_call_requests: subarray(self.private_call_requests.storage.map(|r: ScopedPrivateCallRequest| r.call_request)),
            public_call_stack_hashes: subarray(self.public_call_requests.storage.map(|c: CallRequest| c.hash)),
            public_teardown_function_hash: self.public_teardown_call_request.hash,
            new_l2_to_l1_msgs: subarray(self.new_l2_to_l1_msgs.storage.map(|r: ScopedL2ToL1Message| r.message)),
            start_side_effect_counter: self.counter_start,
            end_side_effect_counter: self.counter,
            note_encrypted_logs_hashes: subarray(self.note_encrypted_logs_hashes.storage),
            encrypted_logs_hashes: subarray(self.encrypted_logs_hashes.storage),
            unencrypted_logs_hashes: subarray(self.unencrypted_logs_hashes.storage),
            historical_header: self.historical_header,
            tx_context: self.tx_context
        }
    }

    pub fn to_private_accumulated_data(self) -> PrivateAccumulatedData {
        let public_inputs = PrivateAccumulatedDataBuilder {
            new_note_hashes: self.new_note_hashes,
            new_nullifiers: self.new_nullifiers,
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs,
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes,
            encrypted_logs_hashes: self.encrypted_logs_hashes,
            unencrypted_logs_hashes: self.unencrypted_logs_hashes,
            private_call_stack: vec_reverse(self.private_call_requests),
            public_call_stack: self.public_call_requests
        };
        public_inputs.finish()
    }

    pub fn to_public_accumulated_data(self) -> PublicAccumulatedData {
        PublicAccumulatedData {
            new_note_hashes: self.new_note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash),
            new_nullifiers: self.new_nullifiers.storage.map(|n: ScopedNullifier| n.nullifier),
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs.storage.map(|m: ScopedL2ToL1Message| m.message.content),
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes.storage,
            encrypted_logs_hashes: self.encrypted_logs_hashes.storage,
            unencrypted_logs_hashes: self.unencrypted_logs_hashes.storage,
            public_data_update_requests: self.public_data_update_requests.storage,
            public_call_stack: self.public_call_requests.storage,
            gas_used: self.gas_used
        }
    }

    pub fn to_combined_accumulated_data(self) -> CombinedAccumulatedData {
        CombinedAccumulatedData {
            new_note_hashes: self.new_note_hashes.storage.map(|n: ScopedNoteHash| n.note_hash.value),
            new_nullifiers: self.new_nullifiers.storage.map(|n: ScopedNullifier| n.nullifier.value),
            new_l2_to_l1_msgs: self.new_l2_to_l1_msgs.storage.map(|m: ScopedL2ToL1Message| m.message.content),
            note_encrypted_logs_hash: self.note_encrypted_logs_hash,
            encrypted_logs_hash: self.encrypted_logs_hash,
            unencrypted_logs_hash: self.unencrypted_logs_hash,
            encrypted_log_preimages_length: self.encrypted_log_preimages_length,
            unencrypted_log_preimages_length: self.unencrypted_log_preimages_length,
            public_data_update_requests: self.public_data_update_requests.storage,
            gas_used: self.gas_used
        }
    }

    pub fn to_validation_requests(self) -> ValidationRequests {
        let validation_requests = ValidationRequestsBuilder {
            max_block_number: self.max_block_number,
            note_hash_read_requests: self.note_hash_read_requests,
            nullifier_read_requests: self.nullifier_read_requests,
            nullifier_non_existent_read_requests: self.nullifier_non_existent_read_requests,
            key_validation_requests: self.key_validation_requests,
            public_data_reads: self.public_data_reads
        };
        validation_requests.finish()
    }

    pub fn to_private_kernel_circuit_public_inputs(self) -> PrivateKernelCircuitPublicInputs {
        let end = self.to_private_accumulated_data();
        let validation_requests = self.to_validation_requests();
        let constants = self.to_constant_data();

        PrivateKernelCircuitPublicInputs {
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            end,
            validation_requests,
            constants,
            public_teardown_call_request: self.public_teardown_call_request,
            fee_payer: self.fee_payer
        }
    }

    pub fn to_private_kernel_data(self) -> PrivateKernelData {
        let public_inputs = self.to_private_kernel_circuit_public_inputs();
        PrivateKernelData { public_inputs, proof: self.proof, vk: self.vk, vk_index: self.vk_index, vk_path: self.vk_path }
    }

    pub fn to_public_kernel_circuit_public_inputs(self, revertible: bool) -> PublicKernelCircuitPublicInputs {
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
        let validation_requests = self.to_validation_requests();
        let constants = self.to_constant_data();
        let mut public_teardown_call_stack: BoundedVec<CallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX> = BoundedVec::new();
        public_teardown_call_stack.push(self.public_teardown_call_request);

        PublicKernelCircuitPublicInputs {
            end_non_revertible,
            end,
            validation_requests,
            constants,
            revert_code: self.revert_code,
            public_teardown_call_stack: public_teardown_call_stack.storage,
            fee_payer: self.fee_payer
        }
    }

    pub fn to_public_kernel_data(self, revertible: bool) -> PublicKernelData {
        let public_inputs = self.to_public_kernel_circuit_public_inputs(revertible);
        PublicKernelData {
            public_inputs,
            proof: crate::mocked::Proof::empty(),
            vk: crate::mocked::VerificationKey::empty(),
            vk_index: self.vk_index,
            vk_path: self.vk_path
        }
    }

    pub fn to_kernel_circuit_public_inputs(self) -> KernelCircuitPublicInputs {
        let rollup_validation_requests = self.to_validation_requests().for_rollup;
        let end = self.to_combined_accumulated_data();
        let constants = self.to_constant_data();

        KernelCircuitPublicInputs {
            rollup_validation_requests,
            end,
            constants,
            start_state: self.start_state,
            revert_code: self.revert_code,
            fee_payer: self.fee_payer
        }
    }

    pub fn to_kernel_data(self) -> KernelData {
        let public_inputs = self.to_kernel_circuit_public_inputs();
        KernelData {
            public_inputs,
            proof: crate::mocked::Proof::empty(),
            vk: crate::mocked::VerificationKey::empty(),
            vk_index: self.vk_index,
            vk_path: self.vk_path
        }
    }

    pub fn add_new_note_hash(&mut self, value: Field, nullifier_counter: u32) {
        self.new_note_hashes.push(
            NoteHash { value, counter: self.next_counter() }.scope(nullifier_counter, self.storage_contract_address)
        );
    }

    pub fn append_new_note_hashes(&mut self, num_new_note_hashes: u64, broadcast: bool) {
        let index_offset = self.new_note_hashes.len();
        for i in 0..self.new_note_hashes.max_len() {
            if i < num_new_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                self.add_new_note_hash(value, 0);
                if (broadcast) {
                    let log_hash = self.mock_note_encrypted_log_hash(index_offset + i);
                    self.add_note_encrypted_log_hash(log_hash, self.counter - 1);
                }
            }
        }
    }

    pub fn add_nullifier(&mut self, value: Field) {
        self.new_nullifiers.push(
            Nullifier { value, counter: self.next_counter(), note_hash: 0 }.scope(self.storage_contract_address)
        );
    }

    pub fn add_siloed_nullifier(&mut self, value: Field) {
        let siloed_value = silo_nullifier(self.storage_contract_address, value);
        self.add_nullifier(siloed_value);
    }

    pub fn append_new_nullifiers(&mut self, num_extra_nullifier: u64) {
        let index_offset = self.new_nullifiers.len();
        for i in 0..self.new_nullifiers.max_len() {
            if i < num_extra_nullifier {
                let value = self.mock_nullifier_value(index_offset + i);
                self.add_nullifier(value);
            }
        }
    }

    pub fn append_siloed_nullifiers(&mut self, num_extra_nullifier: u64) {
        let index_offset = self.new_nullifiers.len();
        for i in 0..self.new_nullifiers.max_len() {
            if i < num_extra_nullifier {
                let value = self.mock_nullifier_value(index_offset + i);
                self.add_siloed_nullifier(value);
            }
        }
    }

    pub fn add_l2_to_l1_message(&mut self, content: Field, recipient: EthAddress) {
        self.new_l2_to_l1_msgs.push(
            L2ToL1Message { recipient, content, counter: self.next_counter() }.scope(self.storage_contract_address)
        );
    }

    pub fn append_new_l2_to_l1_msgs(&mut self, num: u64) {
        let index_offset = self.new_l2_to_l1_msgs.len();
        for i in 0..self.new_l2_to_l1_msgs.max_len() {
            if i < num {
                let (content, recipient) = self.mock_l2_to_l1_msg(index_offset + i);
                self.add_l2_to_l1_message(content, recipient);
            }
        }
    }

    pub fn add_public_data_update_request(&mut self, leaf_slot: Field, value: Field) {
        let update_request = PublicDataUpdateRequest { leaf_slot, new_value: value };
        self.public_data_update_requests.push(update_request);
    }

    pub fn append_public_data_update_requests(&mut self, num_updates: u64) {
        let index_offset = self.public_data_update_requests.len();
        for i in 0..self.public_data_update_requests.max_len() {
            if i < num_updates {
                let write = self.mock_public_data_write(index_offset + i);
                self.add_public_data_update_request(write.leaf_slot, write.new_value);
            }
        }
    }

    pub fn append_public_data_read_requests(&mut self, num_reads: u64) {
        let index_offset = self.public_data_reads.len();
        for i in 0..self.public_data_reads.max_len() {
            if i < num_reads {
                let read_request = self.mock_public_data_read(index_offset + i);
                self.public_data_reads.push(read_request);
            }
        }
    }

    pub fn add_read_request_for_pending_note_hash(&mut self, note_hash_index: u64) -> u64 {
        let read_request_index = self.note_hash_read_requests.len();
        let value = self.mock_note_hash_value(note_hash_index);
        let read_request = ReadRequest { value, counter: self.next_counter() }.scope(self.storage_contract_address);
        self.note_hash_read_requests.push(read_request);
        read_request_index
    }

    pub fn append_note_hash_read_requests(&mut self, num_reads: u64) {
        let index_offset = self.note_hash_read_requests.len();
        for i in 0..self.note_hash_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_note_hash_read_value(index_offset + i);
                let read_request = ReadRequest { value, counter: self.next_counter() }.scope(self.storage_contract_address);
                self.note_hash_read_requests.push(read_request);
            }
        }
    }

    pub fn add_read_request_for_pending_nullifier(&mut self, nullifier_index: u64) -> u64 {
        let read_request_index = self.nullifier_read_requests.len();
        let nullifier = self.mock_nullifier_value(nullifier_index);
        let read_request = ReadRequest { value: nullifier, counter: self.next_counter() }.scope(self.storage_contract_address);
        self.nullifier_read_requests.push(read_request);
        read_request_index
    }

    pub fn add_non_existent_read_request_for_nullifier(&mut self, nullifier: Field) {
        let read_request = ReadRequest { value: nullifier, counter: self.next_counter() }.scope(self.storage_contract_address);
        self.nullifier_non_existent_read_requests.push(read_request);
    }

    pub fn append_nullifier_read_requests(&mut self, num_reads: u64) {
        let index_offset = self.nullifier_read_requests.len();
        for i in 0..self.nullifier_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_nullifier_read_value(index_offset + i);
                let read_request = ReadRequest { value, counter: self.next_counter() }.scope(self.storage_contract_address);
                self.nullifier_read_requests.push(read_request);
            }
        }
    }

    pub fn add_read_request_for_pending_public_data(&mut self, public_date_update_request_index: u64) -> u64 {
        let new_read_request_index = self.public_data_reads.len();
        let public_write = self.public_data_update_requests.get(public_date_update_request_index);
        let read_request = PublicDataRead { leaf_slot: public_write.leaf_slot, value: public_write.new_value };
        self.public_data_reads.push(read_request);
        new_read_request_index
    }

    pub fn add_request_for_key_validation(&mut self, pk_m: GrumpkinPoint, sk_app: Field) -> u64 {
        let new_request_index = self.key_validation_requests.len();
        let request = KeyValidationRequest { pk_m, sk_app };
        self.key_validation_requests.push(request.scope(self.storage_contract_address));

        new_request_index
    }

    pub fn append_key_validation_requests(&mut self, num_requests: u64) {
        let index_offset = self.key_validation_requests.len();
        for i in 0..self.key_validation_requests.max_len() {
            if i < num_requests {
                let request = self.mock_key_validation_request(index_offset + i);
                self.key_validation_requests.push(request.scope(self.storage_contract_address));
            }
        }
    }

    pub fn add_note_encrypted_log_hash(&mut self, value: Field, note_hash_counter: u32) {
        self.note_encrypted_logs_hashes.push(NoteLogHash { value, counter: self.next_counter(), length: 64, note_hash_counter });
        self.encrypted_log_preimages_length += 64;
    }

    pub fn append_note_encrypted_logs_hashes(&mut self, num: u64) {
        let index_offset = self.note_encrypted_logs_hashes.len();
        for i in 0..self.note_encrypted_logs_hashes.max_len() {
            if i < num {
                let log_hash = self.mock_note_encrypted_log_hash(index_offset + i);
                self.add_note_encrypted_log_hash(log_hash, 0);
            }
        }
    }

    pub fn set_encrypted_logs(&mut self, hash: Field, preimages_length: Field) {
        let side_effect = LogHash { value: hash, counter: self.next_counter(), length: preimages_length };
        self.encrypted_logs_hashes.push(side_effect);
        self.encrypted_log_preimages_length += preimages_length;
    }

    pub fn set_unencrypted_logs(&mut self, hash: Field, preimages_length: Field) {
        let side_effect = LogHash { value: hash, counter: self.next_counter(), length: preimages_length };
        self.unencrypted_logs_hashes.push(side_effect);
        self.unencrypted_log_preimages_length += preimages_length;
    }

    pub fn set_encrypted_logs_hash(&mut self, hash: Field, preimages_length: Field) {
        self.encrypted_logs_hash = hash;
        self.encrypted_log_preimages_length = preimages_length;
    }

    pub fn set_unencrypted_logs_hash(&mut self, hash: Field, preimages_length: Field) {
        self.unencrypted_logs_hash = hash;
        self.unencrypted_log_preimages_length = preimages_length;
    }

    pub fn add_private_call_request(&mut self, hash: Field, is_delegate_call: bool) {
        let mut caller_context = CallerContext::empty();
        if is_delegate_call {
            caller_context.msg_sender = fixtures::MSG_SENDER;
            caller_context.storage_contract_address = self.contract_address;
        }
        let start_counter = self.next_counter();
        let end_counter = start_counter + 10;
        self.counter = end_counter;
        self.private_call_requests.push(
            PrivateCallRequest { hash, caller_context, start_side_effect_counter: start_counter, end_side_effect_counter: end_counter }.scope(self.contract_address)
        );
    }

    pub fn append_private_call_requests(&mut self, num: u64) {
        let index_offset = self.private_call_requests.len();
        for i in 0..self.private_call_requests.max_len() {
            if i < num {
                let hash = self.mock_private_call_request_hash(index_offset + i);
                self.add_private_call_request(hash, true);
            }
        }
    }

    pub fn push_public_call_request(&mut self, hash: Field, is_delegate_call: bool) {
        let call_request = self.generate_call_request(hash, is_delegate_call);
        self.public_call_requests.push(call_request);
    }

    pub fn append_public_call_requests(&mut self, num: u64) {
        let index_offset = self.public_call_requests.len();
        for i in 0..self.public_call_requests.max_len() {
            if i < num {
                let hash = self.mock_public_call_request_hash(index_offset + i);
                self.push_public_call_request(hash, true);
            }
        }
    }

    pub fn set_fee_payer(&mut self, fee_payer: AztecAddress) {
        self.fee_payer = fee_payer;
    }

    pub fn make_fee_payer(&mut self) -> AztecAddress {
        self.is_fee_payer = true;
        self.set_fee_payer(self.storage_contract_address);
        self.storage_contract_address
    }

    pub fn set_public_teardown_call_request(&mut self, hash: Field, is_delegate_call: bool) {
        self.public_teardown_call_request = self.generate_call_request(hash, is_delegate_call);
    }

    pub fn append_public_teardown_call_request(&mut self) {
        let hash = self.mock_public_teardown_call_request_hash(0);
        self.set_public_teardown_call_request(hash, true);
    }

    pub fn end_setup(&mut self) {
        self.min_revertible_side_effect_counter = self.counter;
    }

    pub fn set_max_block_number(&mut self, max_block_number: u32) {
        self.max_block_number = MaxBlockNumber::new(max_block_number);
    }

    fn generate_call_request(&mut self, hash: Field, is_delegate_call: bool) -> CallRequest {
        let mut caller_context = CallerContext::empty();
        if is_delegate_call {
            caller_context.msg_sender = self.msg_sender;
            caller_context.storage_contract_address = self.contract_address;
        }
        let start_counter = self.next_counter();
        let end_counter = start_counter + 10;
        self.counter = end_counter;
        CallRequest {
            hash,
            caller_contract_address: self.contract_address,
            caller_context,
            start_side_effect_counter: start_counter,
            end_side_effect_counter: end_counter
        }
    }

    fn mock_note_hash_read_value(self, index: u64) -> Field {
        789 + self.value_offset + index as Field
    }

    fn mock_nullifier_read_value(self, index: u64) -> Field {
        22334 + self.value_offset + index as Field
    }

    fn mock_key_validation_request(self, index: u64) -> KeyValidationRequest {
        let value_offset = 3030 + self.value_offset + index as Field;
        KeyValidationRequest { pk_m: GrumpkinPoint { x: value_offset, y: 1 + value_offset }, sk_app: 2 + value_offset }
    }

    fn mock_public_data_read(self, index: u64) -> PublicDataRead {
        let value_offset = 4545 + self.value_offset + index as Field;
        PublicDataRead { leaf_slot: value_offset, value: 1 + value_offset }
    }

    fn mock_public_data_write(self, index: u64) -> PublicDataUpdateRequest {
        let value_offset = 7788 + self.value_offset + index as Field;
        PublicDataUpdateRequest { leaf_slot: value_offset, new_value: 1 + value_offset }
    }

    fn mock_note_hash_value(self, index: u64) -> Field {
        212121 + self.value_offset + index as Field
    }

    fn mock_nullifier_value(self, index: u64) -> Field {
        5678 + self.value_offset + index as Field
    }

    fn mock_nullifier_value_non_revertible(self, index: u64) -> Field {
        9876 + self.value_offset + index as Field
    }

    fn mock_l2_to_l1_msg(self, index: u64) -> (Field, EthAddress) {
        let value_offset = 72727 + self.value_offset + index as Field;
        (value_offset, EthAddress::from_field(1 + value_offset))
    }

    fn mock_note_encrypted_log_hash(self, index: u64) -> Field {
        282828 + self.value_offset + index as Field
    }

    fn mock_private_call_request_hash(self, index: u64) -> Field {
        766766 + self.value_offset + index as Field
    }

    fn mock_public_call_request_hash(self, index: u64) -> Field {
        636363 + self.value_offset + index as Field
    }

    fn mock_public_teardown_call_request_hash(self, index: u64) -> Field {
        54345 + self.value_offset + index as Field
    }

    fn mock_fee_payer(self) -> AztecAddress {
        AztecAddress::from_field(900900 + self.value_offset)
    }

    fn next_counter(&mut self) -> u32 {
        let counter = self.counter;
        self.counter += 1;
        counter
    }
}

impl Empty for FixtureBuilder {
    fn empty() -> Self {
        FixtureBuilder {
            contract_address: AztecAddress::zero(),
            storage_contract_address: AztecAddress::zero(),
            msg_sender: AztecAddress::zero(),
            is_delegate_call: false,
            is_static_call: false,
            is_fee_payer: false,
            fee_payer: AztecAddress::zero(),
            historical_header: Header::empty(),
            tx_context: TxContext::empty(),
            global_variables: GlobalVariables::empty(),
            new_note_hashes: BoundedVec::new(),
            new_nullifiers: BoundedVec::new(),
            new_l2_to_l1_msgs: BoundedVec::new(),
            note_encrypted_logs_hashes: BoundedVec::new(),
            encrypted_logs_hashes: BoundedVec::new(),
            unencrypted_logs_hashes: BoundedVec::new(),
            note_encrypted_logs_hash: 0,
            encrypted_logs_hash: 0,
            unencrypted_logs_hash: 0,
            encrypted_log_preimages_length: 0,
            unencrypted_log_preimages_length: 0,
            public_data_update_requests: BoundedVec::new(),
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            max_block_number: MaxBlockNumber::empty(),
            note_hash_read_requests: BoundedVec::new(),
            nullifier_read_requests: BoundedVec::new(),
            nullifier_non_existent_read_requests: BoundedVec::new(),
            key_validation_requests: BoundedVec::new(),
            public_data_reads: BoundedVec::new(),
            function_data: FunctionData::empty(),
            args_hash: 0,
            returns_hash: 0,
            proof: NestedRecursiveProof::empty(),
            vk: VerificationKey::empty(),
            vk_index: 0,
            vk_path: [0; VK_TREE_HEIGHT],
            revert_code: 0,
            min_revertible_side_effect_counter: 0,
            counter_start: 0,
            counter: 0,
            start_state: PartialStateReference::empty(),
            gas_used: Gas::empty(),
            non_revertible_gas_used: Gas::empty(),
            public_teardown_call_request: CallRequest::empty(),
            value_offset: 0,
        }
    }
}
