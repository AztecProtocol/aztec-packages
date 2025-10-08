use crate::{
    abis::{
        accumulated_data::{
            avm_accumulated_data::{AvmAccumulatedData, AvmAccumulatedDataArrayLengths},
            private_to_avm_accumulated_data::{
                PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedDataArrayLengths,
            },
            PrivateAccumulatedData,
            PrivateAccumulatedDataBuilder,
            PrivateToPublicAccumulatedData,
            PrivateToRollupAccumulatedData,
        },
        avm_circuit_public_inputs::AvmCircuitPublicInputs,
        block_header::BlockHeader,
        call_context::CallContext,
        function_data::FunctionData,
        gas::Gas,
        gas_fees::GasFees,
        gas_settings::GasSettings,
        global_variables::GlobalVariables,
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
            PrivateToRollupKernelCircuitPublicInputs,
        },
        log_hash::LogHash,
        note_hash::{NoteHash, ScopedNoteHash},
        nullifier::{Nullifier, ScopedNullifier},
        partial_state_reference::PartialStateReference,
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::{PrivateCallData, PrivateVerificationKeyHints},
        private_kernel_data::PrivateKernelData,
        private_log::{PrivateLog, PrivateLogData},
        private_tx_constant_data::PrivateTxConstantData,
        protocol_contracts::ProtocolContracts,
        public_call_request::{PublicCallRequest, PublicCallRequestArrayLengths},
        public_data_write::PublicDataWrite,
        public_logs::PublicLogs,
        read_request::{ReadRequest, ScopedReadRequest},
        side_effect::{Counted, Ordered, scoped::Scoped},
        transaction::{tx_context::TxContext, tx_request::TxRequest},
        tree_snapshots::TreeSnapshots,
        tx_constant_data::TxConstantData,
        validation_requests::{
            KeyValidationRequest, KeyValidationRequestAndGenerator, PrivateValidationRequests,
            ScopedKeyValidationRequestAndGenerator,
        },
    },
    address::{AztecAddress, EthAddress, SaltedInitializationHash},
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
        DEFAULT_UPDATE_DELAY, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH, FUNCTION_TREE_HEIGHT,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_FIELD_VALUE,
        MAX_INCLUDE_BY_TIMESTAMP_DURATION, MAX_KEY_VALIDATION_REQUESTS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_U32_VALUE, MEGA_VK_LENGTH_IN_FIELDS,
        PRIVATE_CALL_REQUEST_LENGTH, PRIVATE_LOG_SIZE_IN_FIELDS, PUBLIC_CALL_REQUEST_LENGTH,
        PUBLIC_DATA_TREE_HEIGHT, SIDE_EFFECT_MASKING_ADDRESS, UPDATED_CLASS_IDS_SLOT,
        VK_TREE_HEIGHT,
    },
    contract_class_id::ContractClassId,
    data::{
        hash::compute_public_data_leaf_slot,
        public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    },
    delayed_public_mutable::{
        delayed_public_mutable_values::DelayedPublicMutableValues,
        scheduled_delay_change::ScheduledDelayChange, scheduled_value_change::ScheduledValueChange,
        with_hash::compute_with_hash_hash_storage_slot,
    },
    hash::{
        compute_contract_class_log_hash, compute_siloed_note_hash, compute_siloed_nullifier,
        compute_siloed_private_log_field, compute_unique_siloed_note_hash,
    },
    merkle_tree::membership::MembershipWitness,
    messaging::l2_to_l1_message::L2ToL1Message,
    point::Point,
    proof::{verification_key::{MegaVerificationKey, VerificationKey}, vk_data::VkData},
    public_keys::PublicKeys,
    storage::map::derive_storage_slot_in_map,
    tests::fixtures::{
        self,
        contract_functions::ContractFunction,
        contracts::ContractData,
        public_data_tree::empty_public_data_tree,
        vk_tree::{get_vk_data, vk_tree_root},
    },
    traits::{Deserialize, Empty, FromField, Hash, Packable},
    utils::arrays::ClaimedLengthArray,
};

/// For testing only.
fn subarray<T, let N: u32, let M: u32>(arr: [T; N]) -> [T; M] {
    assert(N >= M, "cannot call subarray on a smaller array");
    let mut new_arr = [arr[0]; M];
    for i in 0..M {
        new_arr[i] = arr[i];
    }
    new_arr
}

/// For testing only.
fn vec_reverse<T, let N: u32>(vec: BoundedVec<T, N>) -> BoundedVec<T, N> {
    let mut reversed = BoundedVec::new();
    let len = vec.len();
    for i in 0..N {
        if i < len {
            reversed.push(vec.get_unchecked(len - i - 1));
        }
    }
    reversed
}

/// For testing only. Not safe.
/// Not part of the ClaimedLengthArray methods, because we don't want it
/// to be accidentally called in production code.
pub fn claimed_length_array_from_bounded_vec<T, let N: u32>(
    vec: BoundedVec<T, N>,
) -> ClaimedLengthArray<T, N> {
    ClaimedLengthArray { array: vec.storage(), length: vec.len() }
}

#[derive(Eq)]
pub struct FixtureBuilder {
    pub contract_address: AztecAddress,
    pub msg_sender: AztecAddress,
    pub is_static_call: bool,
    pub is_private_only: bool,
    pub claimed_first_nullifier: Field,
    pub include_by_timestamp: u64,

    // Fees.
    pub is_fee_payer: bool,
    pub fee_payer: AztecAddress,
    pub public_teardown_call_request: PublicCallRequest,
    pub transaction_fee: Field,
    pub effective_gas_fees: GasFees,

    // Constant data.
    pub anchor_block_header: BlockHeader,
    pub tx_context: TxContext,
    pub global_variables: GlobalVariables,

    // Accumulated data.
    pub note_hashes: BoundedVec<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    pub nullifiers: BoundedVec<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    pub l2_to_l1_msgs: BoundedVec<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX>,
    pub private_logs: BoundedVec<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX>,
    pub public_logs: PublicLogs,
    pub contract_class_logs_hashes: BoundedVec<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    pub contract_class_log_fields: BoundedVec<[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS], MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    pub public_data_writes: BoundedVec<PublicDataWrite, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
    pub private_call_requests: BoundedVec<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    pub public_call_requests: BoundedVec<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>,
    pub gas_used: Gas,
    pub start_gas_used: Gas,
    pub end_gas_used: Gas,
    pub revert_code: u8,
    pub reverted: bool,

    // Validation requests.
    pub note_hash_read_requests: BoundedVec<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    pub nullifier_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pub scoped_key_validation_requests_and_generators: BoundedVec<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    pub validation_requests_split_counter: Option<u32>,

    // Function.
    pub function_data: FunctionData,
    pub args_hash: Field,
    pub calldata_hash: Field,
    pub returns_hash: Field,

    // Private call.
    pub salted_initialization_hash: SaltedInitializationHash,
    pub public_keys: PublicKeys,
    pub contract_class_artifact_hash: Field,
    pub contract_class_public_bytecode_commitment: Field,
    pub function_leaf_membership_witness: MembershipWitness<FUNCTION_TREE_HEIGHT>,

    // Public call.
    pub bytecode_hash: Field,
    pub prover_id: Field,

    // Proof.
    pub vk: MegaVerificationKey,
    pub vk_index: u32,
    pub vk_path: [Field; VK_TREE_HEIGHT],
    pub vk_tree_root: Field,

    // Protocol contracts.
    pub protocol_contracts: ProtocolContracts,

    // Contract updates
    pub updated_class_id_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    pub updated_class_id_leaf: PublicDataTreeLeafPreimage,
    pub updated_class_id_value_change: ScheduledValueChange<ContractClassId>,
    pub updated_class_id_delay_change: ScheduledDelayChange<DEFAULT_UPDATE_DELAY>,

    // Tree snapshots.
    pub start_tree_snapshots: TreeSnapshots,
    pub end_tree_snapshots: TreeSnapshots,

    // Counters.
    pub min_revertible_side_effect_counter: u32,
    pub counter_start: u32,
    pub counter: u32,

    // States.
    pub start_state: PartialStateReference,

    // Mock data.
    pub value_offset: Field,
}

impl FixtureBuilder {
    pub fn new() -> Self {
        FixtureBuilder::new_from_counter(0)
    }

    pub fn new_from_counter(counter_start: u32) -> Self {
        let mut builder: Self = std::mem::zeroed();

        builder.anchor_block_header.global_variables.timestamp = fixtures::GENESIS_TIMESTAMP;

        builder.global_variables.chain_id = fixtures::CHAIN_ID;
        builder.global_variables.version = fixtures::VERSION;
        builder.global_variables.timestamp = fixtures::GENESIS_TIMESTAMP + 135;

        let max_allowed_include_by_timestamp = builder
            .anchor_block_header
            .global_variables
            .timestamp
            + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
        builder.include_by_timestamp = max_allowed_include_by_timestamp;

        builder.vk_tree_root = vk_tree_root;

        builder.tx_context = TxContext {
            chain_id: fixtures::CHAIN_ID,
            version: fixtures::VERSION,
            gas_settings: GasSettings::empty(),
        };
        builder.msg_sender = fixtures::contracts::parent_contract.address;
        builder.counter_start = counter_start;
        builder.counter = counter_start + 1;

        builder.protocol_contracts = fixtures::protocol_contracts::get_protocol_contracts();

        let contract_data = fixtures::contracts::default_contract;
        let contract_function = fixtures::contract_functions::default_private_function;

        builder.use_contract(contract_data).use_function(
            contract_function,
            fixtures::contract_functions::default_vk,
        )
    }

    pub fn as_parent_contract(&mut self) -> Self {
        self.contract_address = fixtures::contracts::parent_contract.address;
        self.msg_sender = fixtures::MSG_SENDER;
        *self
    }

    pub fn in_vk_tree(&mut self, vk_index: u32) -> Self {
        let vk_data = get_vk_data(vk_index);

        self.vk_index = vk_index;
        self.vk = vk_data.vk;
        self.vk_path = vk_data.sibling_path;

        *self
    }
    // contract_index should be the same as contract address.
    pub fn use_protocol_contract(&mut self, contract_index: u32) -> Self {
        let contract_data = fixtures::contracts::get_protocol_contract(contract_index);
        let function_data =
            fixtures::contract_functions::get_protocol_contract_function(contract_index);

        let _ = self.use_contract(contract_data);
        self.contract_address = AztecAddress::from_field(contract_index as Field + 1);

        self.use_function(function_data, fixtures::contract_functions::default_vk)
    }

    pub fn use_contract(&mut self, contract_data: ContractData) -> Self {
        self.contract_address = contract_data.address;
        self.salted_initialization_hash = contract_data.salted_initialization_hash;
        self.public_keys = contract_data.public_keys;
        self.contract_class_artifact_hash = contract_data.artifact_hash;
        self.contract_class_public_bytecode_commitment = contract_data.public_bytecode_commitment;

        *self
    }

    pub fn use_function(
        &mut self,
        function_data: ContractFunction,
        vk: [Field; MEGA_VK_LENGTH_IN_FIELDS],
    ) -> Self {
        self.function_data = function_data.data;
        self.function_leaf_membership_witness = function_data.membership_witness;
        self.vk = VerificationKey { key: vk, hash: function_data.vk_hash };
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

    pub fn to_tx_constant_data(self) -> TxConstantData {
        TxConstantData {
            anchor_block_header: self.anchor_block_header,
            tx_context: self.tx_context,
            vk_tree_root: self.vk_tree_root,
            protocol_contracts_hash: self.protocol_contracts.hash(),
        }
    }

    pub fn to_private_tx_constant_data(self) -> PrivateTxConstantData {
        PrivateTxConstantData {
            anchor_block_header: self.anchor_block_header,
            tx_context: self.tx_context,
            vk_tree_root: self.vk_tree_root,
            protocol_contracts: self.protocol_contracts,
        }
    }

    pub fn build_tx_request(self) -> TxRequest {
        TxRequest {
            origin: self.contract_address,
            args_hash: self.args_hash,
            tx_context: self.tx_context,
            function_data: self.function_data,
            salt: 54321,
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
            include_by_timestamp: self.include_by_timestamp,
            note_hash_read_requests: ClaimedLengthArray {
                array: subarray(self.note_hash_read_requests.storage().map(|r: ScopedReadRequest| {
                    r.read_request
                })),
                length: self.note_hash_read_requests.len(),
            },
            nullifier_read_requests: ClaimedLengthArray {
                array: subarray(self.nullifier_read_requests.storage().map(|r: ScopedReadRequest| {
                    r.read_request
                })),
                length: self.nullifier_read_requests.len(),
            },
            key_validation_requests_and_generators: ClaimedLengthArray {
                array: subarray(self
                    .scoped_key_validation_requests_and_generators
                    .storage()
                    .map(|r: ScopedKeyValidationRequestAndGenerator| r.request)),
                length: self.scoped_key_validation_requests_and_generators.len(),
            },
            note_hashes: ClaimedLengthArray {
                array: subarray(
                    self.note_hashes.storage().map(|n: ScopedNoteHash| n.note_hash),
                ),
                length: self.note_hashes.len(),
            },
            nullifiers: ClaimedLengthArray {
                array: subarray(
                    self.nullifiers.storage().map(|n: ScopedNullifier| n.nullifier),
                ),
                length: self.nullifiers.len(),
            },
            private_call_requests: ClaimedLengthArray {
                array: subarray(self.private_call_requests.storage()),
                length: self.private_call_requests.len(),
            },
            public_call_requests: ClaimedLengthArray {
                array: subarray(self.public_call_requests.storage()),
                length: self.public_call_requests.len(),
            },
            public_teardown_call_request: self.public_teardown_call_request,
            l2_to_l1_msgs: ClaimedLengthArray {
                array: subarray(self
                    .l2_to_l1_msgs
                    .storage()
                    .map(|r: Scoped<Counted<L2ToL1Message>>| r.inner)),
                length: self.l2_to_l1_msgs.len(),
            },
            start_side_effect_counter: self.counter_start,
            end_side_effect_counter: self.counter,
            private_logs: ClaimedLengthArray {
                array: subarray(self.private_logs.storage().map(|l: Scoped<PrivateLogData>| {
                    l.inner
                })),
                length: self.private_logs.len(),
            },
            contract_class_logs_hashes: ClaimedLengthArray {
                array: subarray(self
                    .contract_class_logs_hashes
                    .storage()
                    .map(|l: Scoped<Counted<LogHash>>| l.inner)),
                length: self.contract_class_logs_hashes.len(),
            },
            anchor_block_header: self.anchor_block_header,
            tx_context: self.tx_context,
        }
    }

    pub fn to_private_verification_key_hints(self) -> PrivateVerificationKeyHints {
        PrivateVerificationKeyHints {
            function_leaf_membership_witness: self.function_leaf_membership_witness,
            salted_initialization_hash: self.salted_initialization_hash,
            public_keys: self.public_keys,
            contract_class_artifact_hash: self.contract_class_artifact_hash,
            contract_class_public_bytecode_commitment: self
                .contract_class_public_bytecode_commitment,
            updated_class_id_witness: self.updated_class_id_witness,
            updated_class_id_leaf: self.updated_class_id_leaf,
            updated_class_id_delayed_public_mutable_values: DelayedPublicMutableValues::new(
                self.updated_class_id_value_change,
                self.updated_class_id_delay_change,
            )
                .pack(),
        }
    }

    pub fn compute_update_tree_and_hints(&mut self) {
        let public_data_prefill = 2;
        let mut public_data_tree = empty_public_data_tree::<8, 3>(public_data_prefill);
        let last_leaf_index = (public_data_prefill - 1) as Field;
        let new_leaf_index = last_leaf_index + 1;

        if self.updated_class_id_value_change.is_empty()
            & self.updated_class_id_delay_change.is_empty() {
            self.anchor_block_header.state.partial.public_data_tree.root =
                public_data_tree.get_root();
            self.anchor_block_header.state.partial.public_data_tree.next_available_leaf_index =
                public_data_prefill as Field;

            self.updated_class_id_witness = MembershipWitness {
                leaf_index: last_leaf_index,
                sibling_path: public_data_tree.get_sibling_path(last_leaf_index),
            };
            self.updated_class_id_leaf = PublicDataTreeLeafPreimage {
                slot: (public_data_prefill - 1) as Field,
                value: 0,
                next_slot: 0,
                next_index: 0,
            };
        } else {
            let hashed_update = DelayedPublicMutableValues::new(
                self.updated_class_id_value_change,
                self.updated_class_id_delay_change,
            )
                .hash();
            let delayed_public_mutable_slot =
                derive_storage_slot_in_map(UPDATED_CLASS_IDS_SLOT as Field, self.contract_address);
            let hash_slot = compute_with_hash_hash_storage_slot::<DelayedPublicMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY>>(
                delayed_public_mutable_slot,
            );
            let hash_leaf_slot = compute_public_data_leaf_slot(
                CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
                hash_slot,
            );
            public_data_tree.update_leaf(
                last_leaf_index,
                PublicDataTreeLeafPreimage {
                    slot: (public_data_prefill - 1) as Field,
                    value: 0,
                    next_slot: hash_leaf_slot,
                    next_index: last_leaf_index + 1,
                }
                    .hash(),
            );
            self.updated_class_id_leaf = PublicDataTreeLeafPreimage {
                slot: hash_leaf_slot,
                value: hashed_update,
                next_slot: 0,
                next_index: 0,
            };
            public_data_tree.update_leaf(new_leaf_index, self.updated_class_id_leaf.hash());
            self.anchor_block_header.state.partial.public_data_tree.root =
                public_data_tree.get_root();
            self.anchor_block_header.state.partial.public_data_tree.next_available_leaf_index =
                new_leaf_index + 1;
            self.updated_class_id_witness = MembershipWitness {
                leaf_index: new_leaf_index,
                sibling_path: public_data_tree.get_sibling_path(new_leaf_index),
            };
        }
    }

    pub fn set_anchor_block_header_from_call_data(&mut self, private_call: PrivateCallData) {
        self.anchor_block_header = private_call.public_inputs.anchor_block_header;
    }

    pub fn to_private_call_data(mut self) -> PrivateCallData {
        PrivateCallData {
            public_inputs: self.to_private_circuit_public_inputs(),
            vk: self.vk,
            verification_key_hints: self.to_private_verification_key_hints(),
        }
    }

    pub fn to_private_accumulated_data_builder(self) -> PrivateAccumulatedDataBuilder {
        PrivateAccumulatedDataBuilder {
            note_hashes: claimed_length_array_from_bounded_vec(self.note_hashes),
            nullifiers: claimed_length_array_from_bounded_vec(self.nullifiers),
            l2_to_l1_msgs: claimed_length_array_from_bounded_vec(self.l2_to_l1_msgs),
            private_logs: claimed_length_array_from_bounded_vec(self.private_logs),
            contract_class_logs_hashes: claimed_length_array_from_bounded_vec(
                self.contract_class_logs_hashes,
            ),
            public_call_requests: claimed_length_array_from_bounded_vec(self.public_call_requests),
            private_call_stack: claimed_length_array_from_bounded_vec(vec_reverse(
                self.private_call_requests,
            )),
        }
    }

    pub fn to_private_accumulated_data(self) -> PrivateAccumulatedData {
        self.to_private_accumulated_data_builder().finish()
    }

    pub fn to_public_call_request(self) -> PublicCallRequest {
        PublicCallRequest {
            msg_sender: self.msg_sender,
            contract_address: self.contract_address,
            is_static_call: self.is_static_call,
            calldata_hash: self.calldata_hash,
        }
    }

    pub fn to_private_to_public_accumulated_data(
        self,
        revertible: bool,
    ) -> PrivateToPublicAccumulatedData {
        PrivateToPublicAccumulatedData {
            note_hashes: self
                .get_split_ordered_side_effects(self.note_hashes, revertible)
                .map(|n: ScopedNoteHash| n.note_hash.value),
            nullifiers: self
                .get_split_ordered_side_effects(self.nullifiers, revertible)
                .map(|n: ScopedNullifier| n.nullifier.value),
            l2_to_l1_msgs: self
                .get_split_ordered_side_effects(self.l2_to_l1_msgs, revertible)
                .map(|m: Scoped<Counted<L2ToL1Message>>| m.expose_to_public()),
            private_logs: self
                .get_split_ordered_side_effects(self.private_logs, revertible)
                .map(|l: Scoped<PrivateLogData>| l.expose_to_public()),
            contract_class_logs_hashes: self
                .get_split_ordered_side_effects(self.contract_class_logs_hashes, revertible)
                .map(|l: Scoped<Counted<LogHash>>| l.expose_to_public()),
            public_call_requests: self
                .get_split_ordered_side_effects(self.public_call_requests, revertible)
                .map(|cr: Counted<PublicCallRequest>| cr.inner),
        }
    }

    pub fn to_private_to_rollup_accumulated_data(self) -> PrivateToRollupAccumulatedData {
        PrivateToRollupAccumulatedData {
            note_hashes: self.note_hashes.storage().map(|n: ScopedNoteHash| n.note_hash.value),
            nullifiers: self.nullifiers.storage().map(|n: ScopedNullifier| n.nullifier.value),
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage().map(|m: Scoped<Counted<L2ToL1Message>>| {
                m.expose_to_public()
            }),
            private_logs: self.private_logs.storage().map(|l: Scoped<PrivateLogData>| {
                l.expose_to_public()
            }),
            contract_class_logs_hashes: self
                .contract_class_logs_hashes
                .storage()
                .map(|l: Scoped<Counted<LogHash>>| l.expose_to_public()),
        }
    }

    pub fn to_private_validation_requests(self) -> PrivateValidationRequests {
        PrivateValidationRequests {
            note_hash_read_requests: claimed_length_array_from_bounded_vec(
                self.note_hash_read_requests,
            ),
            nullifier_read_requests: claimed_length_array_from_bounded_vec(
                self.nullifier_read_requests,
            ),
            scoped_key_validation_requests_and_generators: claimed_length_array_from_bounded_vec(
                self.scoped_key_validation_requests_and_generators,
            ),
            split_counter: self.validation_requests_split_counter,
        }
    }

    pub fn to_private_kernel_circuit_public_inputs(self) -> PrivateKernelCircuitPublicInputs {
        let constants = self.to_private_tx_constant_data();
        let end = self.to_private_accumulated_data();
        let validation_requests = self.to_private_validation_requests();
        let public_teardown_call_request = self.public_teardown_call_request;

        PrivateKernelCircuitPublicInputs {
            constants,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            end,
            validation_requests,
            public_teardown_call_request,
            fee_payer: self.fee_payer,
            include_by_timestamp: self.include_by_timestamp,
            is_private_only: self.is_private_only,
            claimed_first_nullifier: self.claimed_first_nullifier,
        }
    }

    pub fn to_private_kernel_data(self) -> PrivateKernelData {
        let public_inputs = self.to_private_kernel_circuit_public_inputs();
        PrivateKernelData {
            public_inputs,
            vk_data: VkData { vk: self.vk, leaf_index: self.vk_index, sibling_path: self.vk_path },
        }
    }

    pub fn to_private_to_public_kernel_circuit_public_inputs(
        self,
    ) -> PrivateToPublicKernelCircuitPublicInputs {
        PrivateToPublicKernelCircuitPublicInputs {
            constants: self.to_tx_constant_data(),
            non_revertible_accumulated_data: self.to_private_to_public_accumulated_data(
                false, /* revertible */
            ),
            revertible_accumulated_data: self.to_private_to_public_accumulated_data(
                true, /* revertible */
            ),
            public_teardown_call_request: self.public_teardown_call_request,
            gas_used: self.gas_used,
            fee_payer: self.fee_payer,
            include_by_timestamp: self.include_by_timestamp,
        }
    }

    pub fn to_private_to_rollup_kernel_circuit_public_inputs(
        self,
    ) -> PrivateToRollupKernelCircuitPublicInputs {
        let end = self.to_private_to_rollup_accumulated_data();
        let constants = self.to_tx_constant_data();

        PrivateToRollupKernelCircuitPublicInputs {
            end,
            constants,
            gas_used: self.gas_used,
            fee_payer: self.fee_payer,
            include_by_timestamp: self.include_by_timestamp,
        }
    }

    pub fn to_avm_accumulated_data(self) -> AvmAccumulatedData {
        AvmAccumulatedData {
            note_hashes: self.note_hashes.storage().map(|n: ScopedNoteHash| n.note_hash.value),
            nullifiers: self.nullifiers.storage().map(|n: ScopedNullifier| n.nullifier.value),
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage().map(|m: Scoped<Counted<L2ToL1Message>>| {
                m.expose_to_public()
            }),
            public_logs: self.public_logs,
            public_data_writes: self.public_data_writes.storage(),
        }
    }

    pub fn to_private_to_avm_accumulated_data(
        self,
        revertible: bool,
    ) -> PrivateToAvmAccumulatedData {
        PrivateToAvmAccumulatedData {
            note_hashes: self
                .get_split_ordered_side_effects(self.note_hashes, revertible)
                .map(|n: ScopedNoteHash| n.note_hash.value),
            nullifiers: self
                .get_split_ordered_side_effects(self.nullifiers, revertible)
                .map(|n: ScopedNullifier| n.nullifier.value),
            l2_to_l1_msgs: self
                .get_split_ordered_side_effects(self.l2_to_l1_msgs, revertible)
                .map(|m: Scoped<Counted<L2ToL1Message>>| m.expose_to_public()),
        }
    }

    pub fn to_avm_circuit_public_inputs(self) -> AvmCircuitPublicInputs {
        let public_setup_call_requests =
            self.get_split_side_effects(self.public_call_requests, false /* revertible */);
        let public_app_logic_call_requests =
            self.get_split_side_effects(self.public_call_requests, true /* revertible */);
        let public_teardown_call_request = self.public_teardown_call_request;
        let public_call_request_array_lengths = PublicCallRequestArrayLengths::new(
            public_setup_call_requests,
            public_app_logic_call_requests,
            public_teardown_call_request,
        );

        let previous_non_revertible_accumulated_data =
            self.to_private_to_avm_accumulated_data(false /* revertible */);
        let previous_non_revertible_accumulated_data_array_lengths =
            PrivateToAvmAccumulatedDataArrayLengths::new(previous_non_revertible_accumulated_data);

        let previous_revertible_accumulated_data =
            self.to_private_to_avm_accumulated_data(true /* revertible */);
        let previous_revertible_accumulated_data_array_lengths =
            PrivateToAvmAccumulatedDataArrayLengths::new(previous_revertible_accumulated_data);

        let accumulated_data = self.to_avm_accumulated_data();
        let accumulated_data_array_lengths = AvmAccumulatedDataArrayLengths::new(accumulated_data);

        AvmCircuitPublicInputs {
            global_variables: self.global_variables,
            protocol_contracts: self.protocol_contracts,
            start_tree_snapshots: self.start_tree_snapshots,
            start_gas_used: self.start_gas_used,
            gas_settings: self.tx_context.gas_settings,
            effective_gas_fees: self.effective_gas_fees,
            fee_payer: self.fee_payer,
            prover_id: self.prover_id,
            public_call_request_array_lengths,
            public_setup_call_requests,
            public_app_logic_call_requests,
            public_teardown_call_request,
            previous_non_revertible_accumulated_data_array_lengths,
            previous_revertible_accumulated_data_array_lengths,
            previous_non_revertible_accumulated_data,
            previous_revertible_accumulated_data,
            end_tree_snapshots: self.end_tree_snapshots,
            end_gas_used: self.end_gas_used,
            accumulated_data_array_lengths,
            accumulated_data,
            transaction_fee: self.transaction_fee,
            reverted: self.reverted,
        }
    }

    pub fn add_new_note_hash(&mut self, value: Field) {
        self.note_hashes.push(NoteHash { value, counter: self.next_counter() }.scope(
            self.contract_address,
        ));
    }

    pub fn add_siloed_note_hash(&mut self, value: Field) {
        let siloed_value = compute_siloed_note_hash(self.contract_address, value);
        self.note_hashes.push(NoteHash { value: siloed_value, counter: self.next_counter() }.scope(
            AztecAddress::zero(),
        ));
    }

    pub fn add_siloed_unique_note_hash(&mut self, value: Field) {
        let siloed_value = compute_siloed_note_hash(self.contract_address, value);
        let current_index = self.note_hashes.len();
        let unique_siloed_value = compute_unique_siloed_note_hash(
            siloed_value,
            self.claimed_first_nullifier,
            current_index,
        );

        self.note_hashes.push(NoteHash { value: unique_siloed_value, counter: self.next_counter() }
            .scope(AztecAddress::zero()));
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

    pub fn append_siloed_unique_note_hashes(&mut self, num_note_hashes: u32) {
        let index_offset = self.note_hashes.len();
        for i in 0..self.note_hashes.max_len() {
            if i < num_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                self.add_siloed_unique_note_hash(value);
            }
        }
    }

    pub fn append_note_hashes_with_logs(&mut self, num_note_hashes: u32) {
        let index_offset = self.note_hashes.len();
        for i in 0..self.note_hashes.max_len() {
            if i < num_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                self.add_new_note_hash(value);
                self.append_private_logs_for_note(1, self.counter - 1);
            }
        }
    }

    pub fn append_padded_note_hashes(&mut self, num_note_hashes: u32) {
        let index_offset = self.note_hashes.len();
        for i in 0..self.note_hashes.max_len() {
            if i < num_note_hashes {
                let value = self.mock_note_hash_value(index_offset + i);
                // Silo and clear the contract address here because the padded note hashes are siloed when added in the
                // reset circuit. We can only see the siloed version of it in the public inputs.
                let siloed_value = compute_siloed_note_hash(SIDE_EFFECT_MASKING_ADDRESS, value);
                self.note_hashes.push(NoteHash { value: siloed_value, counter: MAX_U32_VALUE }
                    .scope(AztecAddress::zero()));
            }
        }
    }

    pub fn set_protocol_nullifier(&mut self) {
        assert_eq(self.nullifiers.len(), 0, "first nullifier already set");
        let value = self.mock_nullifier_value(0);
        let first_nullifier =
            Nullifier { value, counter: 0, note_hash: 0 }.scope(AztecAddress::zero());
        self.nullifiers.push(first_nullifier);
        self.claimed_first_nullifier = value;
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

    pub fn append_padded_nullifiers(&mut self, num_nullifiers: u32) {
        let index_offset = self.nullifiers.len();
        for i in 0..self.nullifiers.max_len() {
            if i < num_nullifiers {
                let value = self.mock_nullifier_value(index_offset + i);
                // Silo and clear the contract address here because the padded nullifiers are siloed when added in the
                // reset circuit. We can only see the siloed version of it in the public inputs.
                let siloed_value = compute_siloed_nullifier(SIDE_EFFECT_MASKING_ADDRESS, value);
                self.nullifiers.push(Nullifier {
                    value: siloed_value,
                    counter: MAX_U32_VALUE,
                    note_hash: 0,
                }
                    .scope(AztecAddress::zero()));
            }
        }
    }

    pub fn add_l2_to_l1_message(&mut self, content: Field, recipient: EthAddress) {
        self.l2_to_l1_msgs.push(L2ToL1Message { recipient, content }
            .count(self.next_counter())
            .scope(self.contract_address));
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

    pub fn add_note_hash_read_request(&mut self, value: Field) -> u32 {
        let read_request_index = self.note_hash_read_requests.len();
        let read_request =
            ReadRequest { value, counter: self.next_counter() }.scope(self.contract_address);
        self.note_hash_read_requests.push(read_request);
        read_request_index
    }

    pub fn add_read_request_for_pending_note_hash(&mut self, note_hash_index: u32) -> u32 {
        let value = self.mock_note_hash_value(note_hash_index);
        self.add_note_hash_read_request(value)
    }

    pub fn append_note_hash_read_requests(&mut self, num_reads: u32) {
        let index_offset = self.note_hash_read_requests.len();
        for i in 0..self.note_hash_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_note_hash_read_value(index_offset + i);
                let _ = self.add_note_hash_read_request(value);
            }
        }
    }

    pub fn add_nullifier_read_request(&mut self, value: Field) -> u32 {
        let read_request_index = self.nullifier_read_requests.len();
        let read_request =
            ReadRequest { value, counter: self.next_counter() }.scope(self.contract_address);
        self.nullifier_read_requests.push(read_request);
        read_request_index
    }

    pub fn add_read_request_for_pending_nullifier(&mut self, nullifier_index: u32) -> u32 {
        let value = self.mock_nullifier_value(nullifier_index);
        self.add_nullifier_read_request(value)
    }

    pub fn append_nullifier_read_requests(&mut self, num_reads: u32) {
        let index_offset = self.nullifier_read_requests.len();
        for i in 0..self.nullifier_read_requests.max_len() {
            if i < num_reads {
                let value = self.mock_nullifier_read_value(index_offset + i);
                let _ = self.add_nullifier_read_request(value);
            }
        }
    }

    pub fn add_request_for_key_validation(
        &mut self,
        pk_m: Point,
        sk_app: Field,
        sk_app_generator: Field,
    ) {
        let request = KeyValidationRequest { pk_m, sk_app };
        let request_and_generator = KeyValidationRequestAndGenerator { request, sk_app_generator };
        let scoped_key_validation_request_and_generator =
            request_and_generator.scope(self.contract_address);
        self.scoped_key_validation_requests_and_generators.push(
            scoped_key_validation_request_and_generator,
        );
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

    pub fn add_private_log(
        &mut self,
        fields: [Field; PRIVATE_LOG_SIZE_IN_FIELDS],
        length: u32,
        note_hash_counter: u32,
    ) {
        let log = PrivateLog { fields, length };
        let logData = PrivateLogData { log, note_hash_counter, counter: self.next_counter() }.scope(
            self.contract_address,
        );
        self.private_logs.push(logData);
    }

    pub fn append_private_logs_for_note(&mut self, num_logs: u32, note_hash_counter: u32) {
        let index_offset = self.private_logs.len();
        for i in 0..self.private_logs.max_len() {
            if i < num_logs {
                let fields = self.mock_private_log_fields(index_offset + i);
                self.add_private_log(fields, fields.len(), note_hash_counter);
            }
        }
    }

    pub fn append_private_logs(&mut self, num_logs: u32) {
        self.append_private_logs_for_note(num_logs, 0 /* note_hash_counter */);
    }

    pub fn append_private_logs_with_length<let LogFieldsLen: u32>(&mut self, num_logs: u32) {
        for _i in 0..num_logs {
            self.append_private_logs_with_lengths([LogFieldsLen]);
        }
    }

    pub fn append_private_logs_with_lengths<let NumLogs: u32>(&mut self, lengths: [u32; NumLogs]) {
        let index_offset = self.private_logs.len();
        for i in 0..lengths.len() {
            let fields = self.mock_private_log_fields_with_length(index_offset + i, lengths[i]);
            self.add_private_log(fields, lengths[i], 0 /* note_hash_counter */);
        }
    }

    pub fn add_siloed_private_log(
        &mut self,
        fields: [Field; PRIVATE_LOG_SIZE_IN_FIELDS],
        length: u32,
        note_hash_counter: u32,
    ) {
        let log = PrivateLogData {
            log: PrivateLog { fields, length },
            note_hash_counter,
            counter: self.next_counter(),
        }
            .scope(AztecAddress::zero()); // When siloed, the address is set to zero by the reset kernel.
        self.private_logs.push(log);
    }

    pub fn append_siloed_private_logs_for_note(&mut self, num_logs: u32, note_hash_counter: u32) {
        let index_offset = self.private_logs.len();
        for i in 0..self.private_logs.max_len() {
            if i < num_logs {
                let mut fields = self.mock_private_log_fields(index_offset + i);
                fields[0] = compute_siloed_private_log_field(self.contract_address, fields[0]);
                self.add_siloed_private_log(fields, fields.len(), note_hash_counter);
            }
        }
    }

    pub fn append_siloed_private_logs_for_note_with_lengths<let NumLogs: u32>(
        &mut self,
        lengths: [u32; NumLogs],
        note_hash_counter: u32,
    ) {
        let index_offset = self.private_logs.len();
        for i in 0..lengths.len() {
            let length = lengths[i];
            let mut fields = self.mock_private_log_fields_with_length(index_offset + i, length);
            fields[0] = compute_siloed_private_log_field(self.contract_address, fields[0]);
            self.add_siloed_private_log(fields, length, note_hash_counter);
        }
    }

    pub fn append_siloed_private_logs(&mut self, num_logs: u32) {
        self.append_siloed_private_logs_for_note(num_logs, 0 /* note_hash_counter */);
    }

    pub fn append_padded_private_logs(&mut self, num_logs: u32) {
        let index_offset = self.private_logs.len();
        for i in 0..self.private_logs.max_len() {
            if i < num_logs {
                let mut fields = self.mock_private_log_fields(index_offset + i);
                // Silo and clear the contract address here because the padded private logs are siloed when added in the
                // reset circuit. We can only see the siloed version of it in the public inputs.
                fields[0] = compute_siloed_private_log_field(self.contract_address, fields[0]);
                self.private_logs.push(PrivateLogData {
                    log: PrivateLog { fields, length: fields.len() },
                    note_hash_counter: 0,
                    counter: MAX_U32_VALUE,
                }
                    .scope(AztecAddress::zero()));
            }
        }
    }

    pub fn add_public_logs(&mut self, length: u32) {
        let payload = self.mock_public_log_fields_with_length(length);
        self.public_logs = PublicLogs::new(payload, length);
    }

    pub fn add_contract_class_log_hash(&mut self, hash: Field, length: u32) {
        let log_hash =
            LogHash { value: hash, length }.count(self.next_counter()).scope(self.contract_address);
        self.contract_class_logs_hashes.push(log_hash);
    }

    pub fn append_contract_class_logs(&mut self, num_logs: u32) {
        // 12 here is just arbitrary length. Use `append_contract_class_logs_with_length` for custom lengths.
        self.append_contract_class_logs_with_length::<12>(num_logs);
    }

    pub fn append_contract_class_logs_with_length<let LogFieldsLen: u32>(&mut self, num_logs: u32) {
        for _i in 0..num_logs {
            self.append_contract_class_logs_with_lengths([LogFieldsLen]);
        }
    }

    pub fn append_contract_class_logs_with_lengths<let NumLogs: u32>(
        &mut self,
        lengths: [u32; NumLogs],
    ) {
        let index_offset = self.private_logs.len();
        for i in 0..lengths.len() {
            let length = lengths[i];
            let fields = self.mock_contract_class_log_fields_with_length(index_offset + i, length);
            self.contract_class_log_fields.push(fields);

            let log_hash = compute_contract_class_log_hash(fields);
            self.add_contract_class_log_hash(log_hash, length);
        }
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
        self.public_call_requests.push(Counted::new(request, self.next_counter()));
    }

    pub fn append_public_call_requests(&mut self, num: u32) {
        let index_offset = self.public_call_requests.len();
        for i in 0..self.public_call_requests.max_len() {
            if i < num {
                let request = self.mock_public_call_request(index_offset + i);
                self.add_public_call_request(request);
            }
        }
    }

    pub fn add_public_data_write(&mut self, leaf_slot: Field, value: Field) {
        let write = PublicDataWrite { leaf_slot, value };
        self.public_data_writes.push(write);
    }

    pub fn append_public_data_writes(&mut self, num: u32) {
        let index_offset = self.public_data_writes.len();
        for i in 0..self.public_data_writes.max_len() {
            if i < num {
                let (leaf_slot, value) = self.mock_public_data_write(index_offset + i);
                self.add_public_data_write(leaf_slot, value);
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

    pub fn set_gas_used(&mut self, da_gas: u32, l2_gas: u32) {
        self.gas_used = Gas { da_gas, l2_gas };
    }

    pub fn set_public_teardown_call_request(&mut self) {
        self.public_teardown_call_request = self.mock_public_teardown_call_request();
    }

    pub fn end_setup(&mut self) {
        self.min_revertible_side_effect_counter = self.counter;
    }

    fn get_split_side_effects<T, let N: u32>(
        self,
        array: BoundedVec<Counted<T>, N>,
        revertible: bool,
    ) -> [T; N] {
        let mut requests = BoundedVec::new();
        for i in 0..array.max_len() {
            if i < array.len() {
                let request = array.get(i);
                if revertible == (request.counter >= self.min_revertible_side_effect_counter) {
                    requests.push(request);
                }
            }
        }
        requests.storage().map(|r| r.inner)
    }

    fn get_split_ordered_side_effects<T, let N: u32>(
        self,
        array: BoundedVec<T, N>,
        revertible: bool,
    ) -> [T; N]
    where
        T: Ordered,
    {
        let mut requests = BoundedVec::new();
        for i in 0..array.max_len() {
            if i < array.len() {
                let request = array.get(i);
                let is_request_revertible = (self.min_revertible_side_effect_counter != 0)
                    & (request.counter() >= self.min_revertible_side_effect_counter);
                if is_request_revertible == revertible {
                    requests.push(request);
                }
            }
        }
        requests.storage()
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

    fn mock_public_data_write(self, index: u32) -> (Field, Field) {
        let value_offset = 7788 + self.value_offset + index as Field;
        let leaf_slot = value_offset;
        let value = 1 + value_offset;
        (leaf_slot, value)
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

    fn mock_private_log_fields(self, index: u32) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS] {
        self.mock_private_log_fields_with_length(index, PRIVATE_LOG_SIZE_IN_FIELDS)
    }

    fn mock_private_log_fields_with_length(
        self,
        index: u32,
        length: u32,
    ) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS] {
        let value_offset =
            328732 + self.value_offset + (index * PRIVATE_LOG_SIZE_IN_FIELDS) as Field;
        let mut fields = [0; PRIVATE_LOG_SIZE_IN_FIELDS];
        for i in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
            if i < length {
                fields[i] = value_offset + i as Field;
            }
        }
        fields
    }

    fn mock_public_log_fields_with_length(
        self,
        length: u32,
    ) -> [Field; FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH] {
        let value_offset = 199199 + self.value_offset;
        let mut fields = [0; FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH];
        for i in 0..FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH {
            if i < length {
                fields[i] = value_offset + i as Field;
            }
        }
        fields
    }

    fn mock_contract_class_log_fields_with_length(
        self,
        index: u32,
        length: u32,
    ) -> [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS] {
        let value_offset =
            95337 + self.value_offset + (index * CONTRACT_CLASS_LOG_SIZE_IN_FIELDS) as Field;
        let mut fields = [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS];
        for i in 0..CONTRACT_CLASS_LOG_SIZE_IN_FIELDS {
            if i < length {
                fields[i] = value_offset + i as Field;
            }
        }
        fields
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
        request.msg_sender = self.contract_address;
        request.is_static_call = self.is_static_call;
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
}
