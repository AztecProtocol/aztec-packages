// Legend: source-level names of monomorphized struct/enum/alias types.
// A type claimed by several distinct names is printed structurally
// wherever it appears, to avoid guessing which name applies.
type AppendOnlyTreeSnapshot = (Field, Field);
type AvmAccumulatedData = ([Field; 64], [Field; 64], [Scoped<L2ToL1Message>; 8], PublicLogs, [(Field, Field); 64]);
type AvmAccumulatedDataArrayLengths = (u32, u32, u32, u32);
type AvmCircuitPublicInputs = (GlobalVariables, ProtocolContracts, TreeSnapshots, Gas, GasSettings, GasFees, (Field,), Field, PublicCallRequestArrayLengths, [PublicCallRequest; 32], [PublicCallRequest; 32], PublicCallRequest, PrivateToAvmAccumulatedDataArrayLengths, PrivateToAvmAccumulatedDataArrayLengths, PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedData, TreeSnapshots, Gas, AvmAccumulatedDataArrayLengths, AvmAccumulatedData, Field, bool);
type AztecAddress = (Field,);
type BlockConstantData = ((Field, Field), (Field, Field), Field, Field, Field, GlobalVariables);
type BlockHeader = ((Field, Field), StateReference, Field, GlobalVariables, Field, Field);
type ContractClassLog = (Log<3023>, (Field,));
type EthAddress = (Field,);
type Gas = (u32, u32);
type GasFees = (u128, u128);
type GasSettings = (Gas, Gas, GasFees, GasFees);
type GlobalVariables = (Field, Field, u32, Field, u64, (Field,), (Field,), GasFees);
type L2ToL1Message = ((Field,), Field);
type Log<16> = ([Field; 16], u32);
type Log<3023> = ([Field; 3023], u32);
type LogHash = (Field, u32);
type MembershipWitness<30> = (Field, [Field; 30]);
type MembershipWitness<7> = (Field, [Field; 7]);
type Ordering = (Field,);
type PartialStateReference = ((Field, Field), (Field, Field), (Field, Field));
type Poseidon2Sponge = ([Field; 3], [Field; 4], u32, bool);
type PrivateToAvmAccumulatedData = ([Field; 64], [Field; 64], [Scoped<L2ToL1Message>; 8]);
type PrivateToAvmAccumulatedDataArrayLengths = (u32, u32, u32);
type PrivateToPublicAccumulatedData = ([Field; 64], [Field; 64], [Scoped<L2ToL1Message>; 8], [Log<16>; 64], [Scoped<LogHash>; 1], [PublicCallRequest; 32]);
type PrivateToPublicKernelCircuitPublicInputs = (TxConstantData, PrivateToPublicAccumulatedData, PrivateToPublicAccumulatedData, PublicCallRequest, Gas, (Field,), u64);
type ProofData<PublicChonkVerifierPublicInputs, 480, 115> = (PublicChonkVerifierPublicInputs, [Field; 480], VkData<115>);
type ProofDataForFixedVk<AvmCircuitPublicInputs, 15516> = (AvmCircuitPublicInputs, [Field; 15516]);
type ProtocolContracts = ([(Field,); 11],);
type PublicCallRequest = ((Field,), (Field,), bool, Field);
type PublicCallRequestArrayLengths = (u32, u32, bool);
type PublicChonkVerifierPublicInputs = (PrivateToPublicKernelCircuitPublicInputs, Field);
type PublicDataWrite = (Field, Field);
type PublicLogs = (u32, [Field; 4096]);
type PublicTxBaseInputsValidator = (ProofData<PublicChonkVerifierPublicInputs, 480, 115>, ProofDataForFixedVk<AvmCircuitPublicInputs, 15516>, BlockConstantData, [Field; 30]);
type PublicTxBaseRollupPrivateInputs = (ProofData<PublicChonkVerifierPublicInputs, 480, 115>, ProofDataForFixedVk<AvmCircuitPublicInputs, 15516>, SpongeBlob, (Field, Field), [Field; 30], [[Field; 3023]; 1]);
type Scoped<L2ToL1Message> = (L2ToL1Message, (Field,));
type Scoped<LogHash> = (LogHash, (Field,));
type SpongeBlob = (Poseidon2Sponge, u32);
type StateReference = ((Field, Field), PartialStateReference);
type TreeSnapshots = ((Field, Field), (Field, Field), (Field, Field), (Field, Field));
type TxBasePublicInputsComposer = (BlockConstantData, TxEffect, TxEffectArrayLengths, PartialStateReference, PartialStateReference, SpongeBlob, Gas);
type TxConstantData = (BlockHeader, TxContext, Field, Field);
type TxContext = (Field, Field, GasSettings);
type TxEffect = (u8, Field, Field, [Field; 64], [Field; 64], [Field; 8], [(Field, Field); 64], [Log<16>; 64], PublicLogs, [ContractClassLog; 1]);
type TxEffectArrayLengths = (u32, u32, u32, u32, u32, u32);
type TxRollupPublicInputs = (u16, BlockConstantData, PartialStateReference, PartialStateReference, SpongeBlob, SpongeBlob, Field, Field, Field);
type UnbalancedMerkleTree = (Field,);
type VerificationKey<115> = ([Field; 115], Field);
type VkData<115> = (VerificationKey<115>, u32, [Field; 7]);
type Writer<11> = ([Field; 11], u32);
type Writer<22> = ([Field; 22], u32);
type Writer<2784> = ([Field; 2784], u32);
type Writer<2785> = ([Field; 2785], u32);

global PUBLIC_CHONK_VERIFIER_VK_INDEX: u32 = 6;
global MAX_CONTRACT_CLASS_LOGS_PER_TX: u32 = 1;
global DOM_SEP__PUBLIC_TX_HASH: u32 = 1630108851;
global PROOF_TYPE_ROLLUP_HONK: u32 = 4;
global PROOF_TYPE_AVM: u32 = 3;
global MAX_PROCESSABLE_L2_GAS: u32 = 6540000;
global DOM_SEP__PROTOCOL_CONTRACTS: u32 = 3904434327;
global AVM_NUM_PUBLIC_INPUT_COLUMNS: u32 = 4;
global AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH: u32 = 4685;
global DOM_SEP__BLOCK_HEADER_HASH: u32 = 4195546849;
global NUM_BLOB_FIELDS_BIT_SIZE: u32 = 32;
global REVERT_CODE_BIT_SIZE: u32 = 8;
global CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE: u32 = 16;
global PUBLIC_LOGS_LENGTH_BIT_SIZE: u32 = 32;
global PRIVATE_LOGS_LENGTH_BIT_SIZE: u32 = 16;
global NUM_PRIVATE_LOG_BIT_SIZE: u32 = 16;
global NUM_PUBLIC_DATA_WRITE_BIT_SIZE: u32 = 16;
global NUM_L2_TO_L1_MSG_BIT_SIZE: u32 = 16;
global NUM_NULLIFIER_BIT_SIZE: u32 = 16;
global NUM_NOTE_HASH_BIT_SIZE: u32 = 16;
global TX_START_PREFIX_BIT_SIZE: u32 = 32;
global TX_START_PREFIX: Field = 2624615704;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX: u32 = 0;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX: u32 = 1;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX: u32 = 2;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX: u32 = 3;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX: u32 = 4;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX: u32 = 5;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX: u32 = 6;
global AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX: u32 = 7;
global AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX: u32 = 8;
global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX: u32 = 19;
global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX: u32 = 20;
global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX: u32 = 21;
global AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX: u32 = 22;
global AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX: u32 = 23;
global AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX: u32 = 24;
global AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX: u32 = 25;
global AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX: u32 = 26;
global AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX: u32 = 27;
global AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX: u32 = 28;
global AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX: u32 = 29;
global AVM_PUBLIC_INPUTS_PROVER_ID_ROW_IDX: u32 = 30;
global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX: u32 = 31;
global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX: u32 = 32;
global AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX: u32 = 33;
global AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX: u32 = 34;
global AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX: u32 = 66;
global AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX: u32 = 98;
global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX: u32 = 99;
global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX: u32 = 100;
global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX: u32 = 101;
global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX: u32 = 102;
global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX: u32 = 103;
global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX: u32 = 104;
global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX: u32 = 105;
global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX: u32 = 169;
global AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX: u32 = 233;
global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX: u32 = 241;
global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX: u32 = 305;
global AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX: u32 = 369;
global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX: u32 = 377;
global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX: u32 = 378;
global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX: u32 = 379;
global AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX: u32 = 380;
global AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX: u32 = 381;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX: u32 = 382;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX: u32 = 383;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX: u32 = 384;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX: u32 = 385;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX: u32 = 386;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX: u32 = 450;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX: u32 = 514;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX: u32 = 522;
global AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX: u32 = 4619;
global AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX: u32 = 4683;
global AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX: u32 = 4684;
global INITIAL_STATE: [u32; 8] = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
global DOM_SEP__MERKLE_HASH: u32 = 2982624097;
global FLAT_PUBLIC_LOGS_HEADER_LENGTH: u32 = 1;
global BLOCK_SIZE: u32 = 64;
global RATE: u32 = 3;
global RATE: u32 = 3;
global POSEIDON2_CONFIG_STATE_SIZE: u32 = 4;
global INT_SIZE: u32 = 4;
global TWO_POW_8: u32 = 256;
global PADDING_BIT_TABLE: [u32; 4] = [2147483648, 8388608, 32768, 128];
global MSG_SIZE_PTR: u32 = 56;
global TWO_POW_32: Field = 4294967296;
global INT_SIZE_PTR: u32 = 14;
fn main(inputs: PublicTxBaseRollupPrivateInputs) -> pub TxRollupPublicInputs {
    execute(inputs)
}
fn execute(inputs: PublicTxBaseRollupPrivateInputs) -> TxRollupPublicInputs {
    let composer = new_from_public_chonk_verifier_and_avm(inputs.public_chonk_verifier_proof_data.public_inputs, inputs.avm_proof_data.public_inputs, inputs.last_archive, inputs.contract_class_log_fields, inputs.start_sponge_blob);
    validate(new(inputs.public_chonk_verifier_proof_data, inputs.avm_proof_data, composer.constants, inputs.anchor_block_archive_sibling_path));
    finish(composer)
}
fn new_from_public_chonk_verifier_and_avm(public_chonk_verifier: PublicChonkVerifierPublicInputs, avm: AvmCircuitPublicInputs, last_archive: AppendOnlyTreeSnapshot, contract_class_log_fields: [[Field; 3023]; 1], start_sponge_blob: SpongeBlob) -> TxBasePublicInputsComposer {
    let private_to_public = public_chonk_verifier.private_tail;
    let constants = {
        let last_archive = last_archive;
        let l1_to_l2_tree_snapshot = avm.start_tree_snapshots.l1_to_l2_message_tree;
        let global_variables = avm.global_variables;
        let vk_tree_root = private_to_public.constants.vk_tree_root;
        let protocol_contracts_hash = private_to_public.constants.protocol_contracts_hash;
        let prover_id = public_chonk_verifier.prover_id;
        (last_archive, l1_to_l2_tree_snapshot, vk_tree_root, protocol_contracts_hash, prover_id, global_variables)
    };
    {
        let _ = build_tx_effect(private_to_public, avm, contract_class_log_fields);
        let tx_effect = _.0;
        let tx_effect_array_lengths = _.1
    };
    let start_tree_snapshots = to_partial_state_reference(avm.start_tree_snapshots);
    let end_tree_snapshots = to_partial_state_reference(avm.end_tree_snapshots);
    {
        let constants = constants;
        let tx_effect = tx_effect;
        let tx_effect_array_lengths = tx_effect_array_lengths;
        let start_tree_snapshots = start_tree_snapshots;
        let end_tree_snapshots = end_tree_snapshots;
        let start_sponge_blob = start_sponge_blob;
        let gas_used = avm.end_gas_used;
        (constants, tx_effect, tx_effect_array_lengths, start_tree_snapshots, end_tree_snapshots, start_sponge_blob, gas_used)
    }
}
fn validate(self: PublicTxBaseInputsValidator) -> () {
    validate_public_chonk_verifier_proof_and_vk(self);
    validate_avm_proof(self);
    validate_private_tail(self);
    validate_public_chonk_verifier_against_avm(self);
    validate_avm_accumulated_data_padding(self);
}
fn new(public_chonk_verifier_proof_data: RollupHonkProofData<PublicChonkVerifierPublicInputs>, avm_proof_data: AvmV2ProofData<AvmCircuitPublicInputs>, constants: BlockConstantData, anchor_block_archive_sibling_path: [Field; 30]) -> PublicTxBaseInputsValidator {
    {
        let public_chonk_verifier_proof_data = public_chonk_verifier_proof_data;
        let avm_proof_data = avm_proof_data;
        let constants = constants;
        let anchor_block_archive_sibling_path = anchor_block_archive_sibling_path;
        (public_chonk_verifier_proof_data, avm_proof_data, constants, anchor_block_archive_sibling_path)
    }
}
fn finish(self: TxBasePublicInputsComposer) -> TxRollupPublicInputs {
    let mut end_sponge_blob = self.start_sponge_blob;
    absorb_tx_blob_data((&mut end_sponge_blob), self.tx_effect, self.tx_effect_array_lengths);
    let out_hash = compute_kernel_out_hash(self);
    {
        let num_txs = 1;
        let constants = self.constants;
        let start_tree_snapshots = self.start_tree_snapshots;
        let end_tree_snapshots = self.end_tree_snapshots;
        let start_sponge_blob = self.start_sponge_blob;
        let end_sponge_blob = end_sponge_blob;
        let out_hash = out_hash;
        let accumulated_fees = self.tx_effect.transaction_fee;
        let accumulated_mana_used = (self.gas_used.l2_gas as Field);
        (num_txs, constants, start_tree_snapshots, end_tree_snapshots, start_sponge_blob, end_sponge_blob, out_hash, accumulated_fees, accumulated_mana_used)
    }
}
fn build_tx_effect(private_to_public: PrivateToPublicKernelCircuitPublicInputs, avm: AvmCircuitPublicInputs, contract_class_log_fields: [[Field; 3023]; 1]) -> (TxEffect, TxEffectArrayLengths) {
    let reverted = avm.reverted;
    let revert_code = if reverted {
        1
    } else {
        0
    };
    let global_variables = avm.global_variables;
    let siloed_l2_to_l1_msgs = map((&avm.accumulated_data.l2_to_l1_msgs), {
        let closure_variable = {
            let env = (global_variables);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    });
    let private_logs = if reverted {
        private_to_public.non_revertible_accumulated_data.private_logs
    } else {
        let num_non_revertible_private_logs = get_private_log_array_length(private_to_public.non_revertible_accumulated_data.private_logs);
        splice_at_count(private_to_public.non_revertible_accumulated_data.private_logs, num_non_revertible_private_logs, private_to_public.revertible_accumulated_data.private_logs)
    };
    let contract_class_log_hashes = if reverted {
        private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes
    } else {
        let num_non_revertible_contract_class_log_hashes = get_contract_class_log_hash_array_length(private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes);
        splice_at_count(private_to_public.non_revertible_accumulated_data.contract_class_logs_hashes, num_non_revertible_contract_class_log_hashes, private_to_public.revertible_accumulated_data.contract_class_logs_hashes)
    };
    validate_contract_class_logs(contract_class_log_hashes, contract_class_log_fields);
    let contract_class_logs = mapi((&contract_class_log_hashes), {
        let closure_variable = {
            let env = (contract_class_log_fields);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    });
    let tx_effect = {
        let tx_hash = hash(private_to_public);
        let revert_code = revert_code;
        let transaction_fee = avm.transaction_fee;
        let note_hashes = avm.accumulated_data.note_hashes;
        let nullifiers = avm.accumulated_data.nullifiers;
        let l2_to_l1_msgs = siloed_l2_to_l1_msgs;
        let public_data_writes = avm.accumulated_data.public_data_writes;
        let private_logs = private_logs;
        let public_logs = avm.accumulated_data.public_logs;
        let contract_class_logs = contract_class_logs;
        (revert_code, tx_hash, transaction_fee, note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes, private_logs, public_logs, contract_class_logs)
    };
    let private_logs_array_length = get_private_log_array_length(private_logs);
    let contract_class_logs_array_length = get_contract_class_log_hash_array_length(contract_class_log_hashes);
    let tx_effect_array_lengths = {
        let note_hashes = avm.accumulated_data_array_lengths.note_hashes;
        let nullifiers = avm.accumulated_data_array_lengths.nullifiers;
        let l2_to_l1_msgs = avm.accumulated_data_array_lengths.l2_to_l1_msgs;
        let public_data_writes = avm.accumulated_data_array_lengths.public_data_writes;
        let private_logs = private_logs_array_length;
        let contract_class_logs = contract_class_logs_array_length;
        (note_hashes, nullifiers, l2_to_l1_msgs, public_data_writes, private_logs, contract_class_logs)
    };
    (tx_effect, tx_effect_array_lengths)
}
fn to_partial_state_reference(self: TreeSnapshots) -> PartialStateReference {
    {
        let note_hash_tree = self.note_hash_tree;
        let nullifier_tree = self.nullifier_tree;
        let public_data_tree = self.public_data_tree;
        (note_hash_tree, nullifier_tree, public_data_tree)
    }
}
fn validate_public_chonk_verifier_proof_and_vk(self: PublicTxBaseInputsValidator) -> () {
    if (!is_unconstrained()) {
        verify_proof(self.public_chonk_verifier_proof_data);
    };
    assert((self.public_chonk_verifier_proof_data.vk_data.leaf_index == PUBLIC_CHONK_VERIFIER_VK_INDEX), "Incorrect public chonk verifier vk index");
    let vk_tree_root = self.constants.vk_tree_root;
    validate_in_vk_tree(self.public_chonk_verifier_proof_data.vk_data, vk_tree_root);
}
fn validate_avm_proof(self: PublicTxBaseInputsValidator) -> () {
    if (!is_unconstrained()) {
        verify_proof_with_columns(self.avm_proof_data);
    }
}
fn validate_private_tail(self: PublicTxBaseInputsValidator) -> () {
    let private_tail = self.public_chonk_verifier_proof_data.public_inputs.private_tail;
    validate_tx_constant_data(private_tail.constants, self.constants, self.anchor_block_archive_sibling_path);
    validate_expiration_timestamp(private_tail.expiration_timestamp, self.constants.global_variables);
}
fn validate_public_chonk_verifier_against_avm(self: PublicTxBaseInputsValidator) -> () {
    let avm = self.avm_proof_data.public_inputs;
    let public_chonk_verifier = self.public_chonk_verifier_proof_data.public_inputs;
    assert((public_chonk_verifier.prover_id == avm.prover_id), "Mismatched prover_id between private and avm");
    let private_tail = public_chonk_verifier.private_tail;
    assert((private_tail.constants.protocol_contracts_hash == hash(avm.protocol_contracts)), "Mismatched protocol_contracts between private and avm");
    assert(eq(private_tail.gas_used, avm.start_gas_used), "Mismatched start_gas_used between private and avm");
    assert(eq(private_tail.constants.tx_context.gas_settings, avm.gas_settings), "Mismatched gas_settings between private and avm");
    assert(eq(compute_effective_gas_fees(avm.global_variables.gas_fees, private_tail.constants.tx_context.gas_settings), avm.effective_gas_fees), "Incorrect effective gas fees used in the avm");
    assert(eq(private_tail.fee_payer, avm.fee_payer), "Mismatched fee_payer between private and avm");
    assert_eq_array_and_length(private_tail.non_revertible_accumulated_data.public_call_requests, avm.public_setup_call_requests, avm.public_call_request_array_lengths.setup_calls, "non-revertible public_call_requests");
    assert_eq_array_and_length(private_tail.revertible_accumulated_data.public_call_requests, avm.public_app_logic_call_requests, avm.public_call_request_array_lengths.app_logic_calls, "revertible public_call_requests");
    assert(eq(private_tail.public_teardown_call_request, avm.public_teardown_call_request), "Mismatched public_teardown_call_request between private and avm");
    assert((avm.public_call_request_array_lengths.teardown_call == (!is_empty(private_tail.public_teardown_call_request))), "Mismatched public_teardown_call_request length between private and avm");
    assert_eq_array_and_length(private_tail.non_revertible_accumulated_data.note_hashes, avm.previous_non_revertible_accumulated_data.note_hashes, avm.previous_non_revertible_accumulated_data_array_lengths.note_hashes, "non-revertible note_hashes");
    assert_eq_array_and_length(private_tail.non_revertible_accumulated_data.nullifiers, avm.previous_non_revertible_accumulated_data.nullifiers, avm.previous_non_revertible_accumulated_data_array_lengths.nullifiers, "non-revertible nullifiers");
    assert_eq_array_and_length(private_tail.non_revertible_accumulated_data.l2_to_l1_msgs, avm.previous_non_revertible_accumulated_data.l2_to_l1_msgs, avm.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs, "non-revertible l2_to_l1_msgs");
    assert_eq_array_and_length(private_tail.revertible_accumulated_data.note_hashes, avm.previous_revertible_accumulated_data.note_hashes, avm.previous_revertible_accumulated_data_array_lengths.note_hashes, "revertible note_hashes");
    assert_eq_array_and_length(private_tail.revertible_accumulated_data.nullifiers, avm.previous_revertible_accumulated_data.nullifiers, avm.previous_revertible_accumulated_data_array_lengths.nullifiers, "revertible nullifiers");
    assert_eq_array_and_length(private_tail.revertible_accumulated_data.l2_to_l1_msgs, avm.previous_revertible_accumulated_data.l2_to_l1_msgs, avm.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs, "revertible l2_to_l1_msgs");
}
fn validate_avm_accumulated_data_padding(self: PublicTxBaseInputsValidator) -> () {
    let avm_acc = self.avm_proof_data.public_inputs.accumulated_data;
    let avm_lens = self.avm_proof_data.public_inputs.accumulated_data_array_lengths;
    assert(array_padded_with(avm_acc.note_hashes, avm_lens.note_hashes, 0), "AVM note_hashes not zero-padded past length");
    assert(array_padded_with(avm_acc.nullifiers, avm_lens.nullifiers, 0), "AVM nullifiers not zero-padded past length");
    assert(array_padded_with(avm_acc.l2_to_l1_msgs, avm_lens.l2_to_l1_msgs, empty()), "AVM l2_to_l1_msgs not zero-padded past length");
    assert(array_padded_with(avm_acc.public_data_writes, avm_lens.public_data_writes, empty()), "AVM public_data_writes not zero-padded past length");
    assert(array_padded_with(avm_acc.public_logs.payload, avm_acc.public_logs.length, 0), "AVM public_logs payload not zero-padded past length");
}
fn absorb_tx_blob_data(self: &mut SpongeBlob, tx_effect: TxEffect, array_lengths: TxEffectArrayLengths) -> () {
    {
        let _ = create_tx_blob_data(tx_effect, array_lengths);
        let tx_blob_data = _.0;
        let num_blob_fields = _.1
    };
    absorb(self, tx_blob_data, num_blob_fields);
}
fn compute_kernel_out_hash(self: TxBasePublicInputsComposer) -> Field {
    let l2_to_l1_msgs = self.tx_effect.l2_to_l1_msgs;
    let num_non_empty_items = self.tx_effect_array_lengths.l2_to_l1_msgs;
    let merkle_tree = new_sha(l2_to_l1_msgs, num_non_empty_items);
    get_root(merkle_tree)
}
fn map(self: &[Scoped<L2ToL1Message>; 8], f: fn[(GlobalVariables,)](Scoped<L2ToL1Message>) -> Field) -> [Field; 8] {
    let uninitialized = 0;
    let mut ret = [uninitialized; 8];
    for i in 0 .. (*self).len() {
        ret[i] = {
            let tmp = f.0;
            tmp.1(tmp.0, (*self)[i])
        }
    };
    ret
}
fn lambda(mut env: (GlobalVariables,), message: Scoped<L2ToL1Message>) -> Field {
    if is_zero(message.contract_address) {
        0
    } else {
        compute_l2_to_l1_message_hash(message, env.0.version, env.0.chain_id)
    }
}
fn is_zero(self: AztecAddress) -> bool {
    (self.inner == 0)
}
fn compute_l2_to_l1_message_hash(message: Scoped<L2ToL1Message>, rollup_version_id: Field, chain_id: Field) -> Field {
    let contract_address_bytes = to_be_bytes(to_field(message.contract_address));
    let recipient_bytes = to_be_bytes(message.inner.recipient);
    let content_bytes = to_be_bytes(message.inner.content);
    let rollup_version_id_bytes = to_be_bytes(rollup_version_id);
    let chain_id_bytes = to_be_bytes(chain_id);
    let mut bytes = [0; 148];
    for i in 0 .. 32 {
        bytes[i] = contract_address_bytes[i];
        bytes[(i + 32)] = rollup_version_id_bytes[i];
        bytes[(i + 84)] = chain_id_bytes[i];
        bytes[(i + 116)] = content_bytes[i]
    };
    for i in 0 .. 20 {
        bytes[(64 + i)] = recipient_bytes[i]
    };
    sha256_to_field(bytes)
}
unconstrained fn lambda(mut env: (GlobalVariables,), message: Scoped<L2ToL1Message>) -> Field {
    if is_zero(message.contract_address) {
        0
    } else {
        compute_l2_to_l1_message_hash(message, env.0.version, env.0.chain_id)
    }
}
unconstrained fn is_zero(self: AztecAddress) -> bool {
    (self.inner == 0)
}
unconstrained fn compute_l2_to_l1_message_hash(message: Scoped<L2ToL1Message>, rollup_version_id: Field, chain_id: Field) -> Field {
    let contract_address_bytes = to_be_bytes(to_field(message.contract_address));
    let recipient_bytes = to_be_bytes(message.inner.recipient);
    let content_bytes = to_be_bytes(message.inner.content);
    let rollup_version_id_bytes = to_be_bytes(rollup_version_id);
    let chain_id_bytes = to_be_bytes(chain_id);
    let mut bytes = [0; 148];
    for i in 0 .. 32 {
        bytes[i] = contract_address_bytes[i];
        bytes[(i + 32)] = rollup_version_id_bytes[i];
        bytes[(i + 84)] = chain_id_bytes[i];
        bytes[(i + 116)] = content_bytes[i]
    };
    for i in 0 .. 20 {
        bytes[(64 + i)] = recipient_bytes[i]
    };
    sha256_to_field(bytes)
}
fn get_private_log_array_length(array: [PrivateLog; 64]) -> u32 {
    array_length_until(array, lambda)
}
fn splice_at_count(array1: [Log<16>; 64], count: u32, array2: [Log<16>; 64]) -> [Log<16>; 64] {
    assert((count <= 64), "Invalid count: splice_at_count requires count <= N");
    let result = {
        unsafe { splice_at_count_helper(array1, count, array2) }
    };
    validate_splice_at_count_result(array1, count, array2, result);
    result
}
fn get_contract_class_log_hash_array_length(array: [Scoped<LogHash>; 1]) -> u32 {
    array_length_until(array, lambda)
}
fn splice_at_count(array1: [Scoped<LogHash>; 1], count: u32, array2: [Scoped<LogHash>; 1]) -> [Scoped<LogHash>; 1] {
    assert((count <= 1), "Invalid count: splice_at_count requires count <= N");
    let result = {
        unsafe { splice_at_count_helper(array1, count, array2) }
    };
    validate_splice_at_count_result(array1, count, array2, result);
    result
}
fn validate_contract_class_logs(contract_class_log_hashes: [Scoped<LogHash>; 1], contract_class_log_fields: [[Field; 3023]; 1]) -> () {
    for i in 0 .. MAX_CONTRACT_CLASS_LOGS_PER_TX {
        let log_hash = contract_class_log_hashes[i];
        let log_fields = contract_class_log_fields[i];
        let expected_hash = if (log_hash.inner.length == 0) {
            0
        } else {
            compute_contract_class_log_hash(log_fields)
        };
        assert((log_hash.inner.value == expected_hash), "Mismatched contract class log hash");
        assert(array_padded_with(log_fields, log_hash.inner.length, 0), "Incorrect contract class log length");
    }
}
fn mapi(self: &[Scoped<LogHash>; 1], f: fn[([[Field; 3023]; 1],)](u32, Scoped<LogHash>) -> ContractClassLog) -> [ContractClassLog; 1] {
    let uninitialized = (([0; 3023], 0), (0));
    let mut ret = [uninitialized; 1];
    for i in 0 .. (*self).len() {
        ret[i] = {
            let tmp = f.0;
            tmp.1(tmp.0, i, (*self)[i])
        }
    };
    ret
}
fn lambda(mut env: ([[Field; 3023]; 1],), i: u32, log_hash: Scoped<LogHash>) -> ContractClassLog {
    {
        let log = new(env.0[i], log_hash.inner.length);
        let contract_address = log_hash.contract_address;
        (log, contract_address)
    }
}
fn new(fields: [Field; 3023], length: u32) -> Log<3023> {
    {
        let fields = fields;
        let length = length;
        (fields, length)
    }
}
unconstrained fn lambda(mut env: ([[Field; 3023]; 1],), i: u32, log_hash: Scoped<LogHash>) -> ContractClassLog {
    {
        let log = new(env.0[i], log_hash.inner.length);
        let contract_address = log_hash.contract_address;
        (log, contract_address)
    }
}
unconstrained fn new(fields: [Field; 3023], length: u32) -> Log<3023> {
    {
        let fields = fields;
        let length = length;
        (fields, length)
    }
}
fn hash(self: PrivateToPublicKernelCircuitPublicInputs) -> Field {
    poseidon2_hash_with_separator(serialize(self), DOM_SEP__PUBLIC_TX_HASH)
}
fn verify_proof(self: ProofData<PublicChonkVerifierPublicInputs, 480, 115>) -> () {
    verify(self, PROOF_TYPE_ROLLUP_HONK);
}
fn validate_in_vk_tree(self: VkData<115>, vk_tree_root: Field) -> () {
    assert(check_membership(self.vk.hash, {
        let leaf_index = (self.leaf_index as Field);
        let sibling_path = self.sibling_path;
        (leaf_index, sibling_path)
    }, vk_tree_root), "Membership check failed: vk hash not found in vk tree");
}
fn verify_proof_with_columns(self: ProofDataForFixedVk<AvmCircuitPublicInputs, 15516>) -> () {
    verify_proof_with_type([], self.proof, serialize_to_columns(self.public_inputs), 0, PROOF_TYPE_AVM);
}
fn validate_tx_constant_data(tx_constants: TxConstantData, block_constants: BlockConstantData, anchor_block_archive_sibling_path: [Field; 30]) -> () {
    let tx_anchor_block_header = tx_constants.anchor_block_header;
    let tx_chain_id = tx_constants.tx_context.chain_id;
    let tx_version = tx_constants.tx_context.version;
    let tx_gas_settings = tx_constants.tx_context.gas_settings;
    let tx_vk_tree_root = tx_constants.vk_tree_root;
    let tx_protocol_contracts_hash = tx_constants.protocol_contracts_hash;
    let block_last_archive_root = block_constants.last_archive.root;
    let block_chain_id = block_constants.global_variables.chain_id;
    let block_version = block_constants.global_variables.version;
    let block_gas_fees = block_constants.global_variables.gas_fees;
    let block_vk_tree_root = block_constants.vk_tree_root;
    let block_protocol_contracts_hash = block_constants.protocol_contracts_hash;
    let archive_leaf_value = hash(tx_anchor_block_header);
    let archive_leaf_index = tx_anchor_block_header.global_variables.block_number;
    assert(check_membership(archive_leaf_value, {
        let leaf_index = (archive_leaf_index as Field);
        let sibling_path = anchor_block_archive_sibling_path;
        (leaf_index, sibling_path)
    }, block_last_archive_root), "Membership check failed: anchor block header hash not found in archive tree");
    assert((tx_chain_id == block_chain_id), "Mismatched chain_id between kernel and rollup");
    assert((tx_version == block_version), "Mismatched version between kernel and rollup");
    assert((tx_vk_tree_root == block_vk_tree_root), "Mismatched vk_tree_root between kernel and rollup");
    assert((tx_protocol_contracts_hash == block_protocol_contracts_hash), "Mismatched protocol_contracts_hash between kernel and rollup");
    assert((tx_gas_settings.max_fees_per_gas.fee_per_da_gas >= block_gas_fees.fee_per_da_gas), "da gas is higher than the maximum specified by the tx");
    assert((tx_gas_settings.max_fees_per_gas.fee_per_l2_gas >= block_gas_fees.fee_per_l2_gas), "l2 gas is higher than the maximum specified by the tx");
    assert((tx_gas_settings.gas_limits.l2_gas <= MAX_PROCESSABLE_L2_GAS), "l2 gas limit exceeds max processable l2 gas");
}
fn validate_expiration_timestamp(expiration_timestamp: u64, global_variables_of_block_being_built: GlobalVariables) -> () {
    let is_building_block_1 = (global_variables_of_block_being_built.block_number == 1);
    let block_timestamp = global_variables_of_block_being_built.timestamp;
    if (!is_building_block_1) {
        assert((expiration_timestamp >= block_timestamp), "tx expiration_timestamp is smaller than block timestamp");
    }
}
fn hash(self: ProtocolContracts) -> Field {
    poseidon2_hash_with_separator(map((&self.derived_addresses), lambda), DOM_SEP__PROTOCOL_CONTRACTS)
}
fn eq(_self: Gas, _other: Gas) -> bool {
    ((_self.da_gas == _other.da_gas) & (_self.l2_gas == _other.l2_gas))
}
fn eq(_self: GasSettings, _other: GasSettings) -> bool {
    (((eq(_self.gas_limits, _other.gas_limits) & eq(_self.teardown_gas_limits, _other.teardown_gas_limits)) & eq(_self.max_fees_per_gas, _other.max_fees_per_gas)) & eq(_self.max_priority_fees_per_gas, _other.max_priority_fees_per_gas))
}
fn compute_effective_gas_fees(gas_fees: GasFees, gas_settings: GasSettings) -> GasFees {
    let max_priority_fees = gas_settings.max_priority_fees_per_gas;
    let max_fees = gas_settings.max_fees_per_gas;
    let priority_fees = new(min(max_priority_fees.fee_per_da_gas, (max_fees.fee_per_da_gas - gas_fees.fee_per_da_gas)), min(max_priority_fees.fee_per_l2_gas, (max_fees.fee_per_l2_gas - gas_fees.fee_per_l2_gas)));
    new((gas_fees.fee_per_da_gas + priority_fees.fee_per_da_gas), (gas_fees.fee_per_l2_gas + priority_fees.fee_per_l2_gas))
}
fn eq(_self: GasFees, _other: GasFees) -> bool {
    ((_self.fee_per_da_gas == _other.fee_per_da_gas) & (_self.fee_per_l2_gas == _other.fee_per_l2_gas))
}
fn eq(_self: AztecAddress, _other: AztecAddress) -> bool {
    (_self.inner == _other.inner)
}
fn assert_eq_array_and_length(array_from_private: [PublicCallRequest; 32], array_from_avm: [PublicCallRequest; 32], expected_length: u32, name: str<35>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn assert_eq_array_and_length(array_from_private: [PublicCallRequest; 32], array_from_avm: [PublicCallRequest; 32], expected_length: u32, name: str<31>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn eq(_self: PublicCallRequest, _other: PublicCallRequest) -> bool {
    (((eq(_self.msg_sender, _other.msg_sender) & eq(_self.contract_address, _other.contract_address)) & (_self.is_static_call == _other.is_static_call)) & (_self.calldata_hash == _other.calldata_hash))
}
fn is_empty(self: PublicCallRequest) -> bool {
    eq(self, empty())
}
fn assert_eq_array_and_length(array_from_private: [Field; 64], array_from_avm: [Field; 64], expected_length: u32, name: str<26>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn assert_eq_array_and_length(array_from_private: [Field; 64], array_from_avm: [Field; 64], expected_length: u32, name: str<25>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn assert_eq_array_and_length(array_from_private: [Scoped<L2ToL1Message>; 8], array_from_avm: [Scoped<L2ToL1Message>; 8], expected_length: u32, name: str<28>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn assert_eq_array_and_length(array_from_private: [Field; 64], array_from_avm: [Field; 64], expected_length: u32, name: str<22>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn assert_eq_array_and_length(array_from_private: [Field; 64], array_from_avm: [Field; 64], expected_length: u32, name: str<21>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn assert_eq_array_and_length(array_from_private: [Scoped<L2ToL1Message>; 8], array_from_avm: [Scoped<L2ToL1Message>; 8], expected_length: u32, name: str<24>) -> () {
    assert(eq(array_from_private, array_from_avm), f"Mismatched {name} between private and avm");
    let length = array_length(array_from_private);
    assert((length == expected_length), f"Mismatched {name} array length between private and avm");
}
fn array_padded_with(array: [Field; 64], from_index: u32, padded_with: Field) -> bool {
    assert((from_index <= 64), "from_index out of bounds");
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0 .. 64 {
        should_check = (should_check | (i == from_index));
        {
            let op_rhs_0 = ((!should_check) | eq(array[i], padded_with));
            is_valid = (is_valid & op_rhs_0)
        }
    };
    is_valid
}
fn array_padded_with(array: [Scoped<L2ToL1Message>; 8], from_index: u32, padded_with: Scoped<L2ToL1Message>) -> bool {
    assert((from_index <= 8), "from_index out of bounds");
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0 .. 8 {
        should_check = (should_check | (i == from_index));
        {
            let op_rhs_0 = ((!should_check) | eq(array[i], padded_with));
            is_valid = (is_valid & op_rhs_0)
        }
    };
    is_valid
}
fn empty() -> Scoped<L2ToL1Message> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn array_padded_with(array: [PublicDataWrite; 64], from_index: u32, padded_with: PublicDataWrite) -> bool {
    assert((from_index <= 64), "from_index out of bounds");
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0 .. 64 {
        should_check = (should_check | (i == from_index));
        {
            let op_rhs_0 = ((!should_check) | eq(array[i], padded_with));
            is_valid = (is_valid & op_rhs_0)
        }
    };
    is_valid
}
fn empty() -> PublicDataWrite {
    {
        let leaf_slot = 0;
        let value = 0;
        (leaf_slot, value)
    }
}
fn array_padded_with(array: [Field; 4096], from_index: u32, padded_with: Field) -> bool {
    assert((from_index <= 4096), "from_index out of bounds");
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0 .. 4096 {
        should_check = (should_check | (i == from_index));
        {
            let op_rhs_0 = ((!should_check) | eq(array[i], padded_with));
            is_valid = (is_valid & op_rhs_0)
        }
    };
    is_valid
}
fn create_tx_blob_data(tx_effect: TxEffect, array_lengths: TxEffectArrayLengths) -> ([Field; 8475], u32) {
    {
        let _ = {
            unsafe { get_tx_blob_fields_unsafe(tx_effect, array_lengths) }
        };
        let tx_blob_fields = _.0;
        let num_blob_fields = _.1;
        let private_logs_length = _.2
    };
    let expected_tx_start_marker = create_tx_start_marker(num_blob_fields, array_lengths, private_logs_length, tx_effect.public_logs.length, tx_effect.contract_class_logs[0].log.length, tx_effect.revert_code);
    assert((tx_blob_fields[0] == expected_tx_start_marker), "Incorrect tx start marker in blob data");
    assert((tx_blob_fields[1] == tx_effect.tx_hash), "Incorrect tx hash in blob data");
    assert((tx_blob_fields[2] == tx_effect.transaction_fee), "Incorrect transaction fee in blob data");
    let mut offset = 3;
    let note_hashes = tx_effect.note_hashes;
    {
        let mut check_elt = true;
        for i in 0 .. note_hashes.len() {
            check_elt = (check_elt & (i != array_lengths.note_hashes));
            if check_elt {
                assert((tx_blob_fields[(offset + i)] == note_hashes[i]), "Incorrect note hash in blob data");
            }
        };
        offset = (offset + array_lengths.note_hashes)
    };
    let nullifiers = tx_effect.nullifiers;
    {
        let mut check_elt = true;
        for i in 0 .. nullifiers.len() {
            check_elt = (check_elt & (i != array_lengths.nullifiers));
            if check_elt {
                assert((tx_blob_fields[(offset + i)] == nullifiers[i]), "Incorrect nullifier in blob data");
            }
        };
        offset = (offset + array_lengths.nullifiers)
    };
    let l2_to_l1_msgs = tx_effect.l2_to_l1_msgs;
    {
        let mut check_elt = true;
        for i in 0 .. l2_to_l1_msgs.len() {
            check_elt = (check_elt & (i != array_lengths.l2_to_l1_msgs));
            if check_elt {
                assert((tx_blob_fields[(offset + i)] == l2_to_l1_msgs[i]), "Incorrect L2 to L1 message in blob data");
            }
        };
        offset = (offset + array_lengths.l2_to_l1_msgs)
    };
    let public_data_writes = tx_effect.public_data_writes;
    {
        let mut check_elt = true;
        for i in 0 .. public_data_writes.len() {
            check_elt = (check_elt & (i != array_lengths.public_data_writes));
            if check_elt {
                assert((tx_blob_fields[(offset + (i * 2))] == public_data_writes[i].leaf_slot), "Incorrect public data write leaf slot in blob data");
                assert((tx_blob_fields[((offset + (i * 2)) + 1)] == public_data_writes[i].value), "Incorrect public data write value in blob data");
            }
        };
        offset = (offset + (array_lengths.public_data_writes * 2))
    };
    let private_logs = tx_effect.private_logs;
    let private_log_start_index = offset;
    {
        let mut check_log = true;
        for i in 0 .. private_logs.len() {
            let private_log = private_logs[i];
            check_log = (check_log & (i != array_lengths.private_logs));
            if check_log {
                assert((tx_blob_fields[offset] == (private_log.length as Field)), "Incorrect private log length in blob data");
                offset = (offset + 1);
                let mut check_elt = true;
                for j in 0 .. private_log.fields.len() {
                    check_elt = (check_elt & (j != private_log.length));
                    if check_elt {
                        assert((tx_blob_fields[(offset + j)] == private_log.fields[j]), "Incorrect private log field in blob data");
                    }
                };
                offset = (offset + private_log.length)
            }
        }
    };
    assert((offset == ((private_log_start_index + private_logs_length) + array_lengths.private_logs)), "Incorrect private logs length in tx start marker");
    let public_logs = tx_effect.public_logs;
    {
        let mut check_log = true;
        for i in 0 .. public_logs.payload.len() {
            check_log = (check_log & (i != public_logs.length));
            if check_log {
                assert((tx_blob_fields[(offset + i)] == public_logs.payload[i]), "Incorrect public log field in blob data");
            }
        };
        offset = (offset + public_logs.length)
    };
    let contract_class_logs = tx_effect.contract_class_logs;
    {
        let mut check_log = true;
        for i in 0 .. contract_class_logs.len() {
            let log = contract_class_logs[i];
            let log_len = log.log.length;
            check_log = (check_log & (i != array_lengths.contract_class_logs));
            if check_log {
                assert((tx_blob_fields[offset] == to_field(log.contract_address)), "Incorrect contract class log contract address in blob data");
                offset = (offset + 1)
            };
            let mut check_elt = true;
            for j in 0 .. log.log.fields.len() {
                check_elt = (check_elt & (j != log_len));
                if check_elt {
                    assert((tx_blob_fields[(offset + j)] == log.log.fields[j]), "Incorrect contract class log field in blob data");
                }
            };
            offset = (offset + log_len)
        }
    };
    assert((offset == num_blob_fields), "Incorrect number of blob fields in tx start marker");
    (tx_blob_fields, offset)
}
fn absorb(self: &mut SpongeBlob, input: [Field; 8475], in_len: u32) -> () {
    (*self).sponge = poseidon2_absorb_in_chunks_existing_sponge((*self).sponge, input, in_len);
    (*self).num_absorbed_fields = ((*self).num_absorbed_fields + in_len)
}
fn new_sha(leaves: [Field; 8], num_non_empty_leaves: u32) -> UnbalancedMerkleTree {
    let root = compute_unbalanced_merkle_root(leaves, num_non_empty_leaves, (sha_merkle_hash, sha_merkle_hash));
    {
        let root = root;
        (root)
    }
}
fn get_root(self: UnbalancedMerkleTree) -> Field {
    self.root
}
fn to_be_bytes(self: Field) -> [u8; 32] {
    static_assert((32 <= @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48].len()), "N must be less than or equal to modulus_le_bytes().len()", r#"{"kind":"string","length":56}"#, false);
    let bytes = to_be_radix(self, 256);
    if (!is_unconstrained()) {
        let p = @[48, 100, 78, 114, 225, 49, 160, 41, 184, 80, 69, 182, 129, 129, 88, 93, 40, 51, 232, 72, 121, 185, 112, 145, 67, 225, 245, 147, 240, 0, 0, 1];
        assert((bytes.len() <= p.len()));
        let mut ok = (bytes.len() != p.len());
        for i in 0 .. 32 {
            if (!ok) {
                if (bytes[i] != p[i]) {
                    assert((bytes[i] < p[i]));
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bytes
}
fn to_field(self: AztecAddress) -> Field {
    self.inner
}
fn to_be_bytes(self: EthAddress) -> [u8; 20] {
    let field_bytes = to_be_bytes(self.inner);
    let mut bytes = [0; 20];
    for i in 0 .. 20 {
        bytes[i] = field_bytes[(i + 12)]
    };
    bytes
}
fn sha256_to_field(bytes_to_hash: [u8; 148]) -> Field {
    let sha256_hashed = digest(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(sha256_hashed);
    hash_in_a_field
}
unconstrained fn to_be_bytes(self: Field) -> [u8; 32] {
    static_assert((32 <= @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48].len()), "N must be less than or equal to modulus_le_bytes().len()", r#"{"kind":"string","length":56}"#, false);
    let bytes = to_be_radix(self, 256);
    if (!is_unconstrained()) {
        let p = @[48, 100, 78, 114, 225, 49, 160, 41, 184, 80, 69, 182, 129, 129, 88, 93, 40, 51, 232, 72, 121, 185, 112, 145, 67, 225, 245, 147, 240, 0, 0, 1];
        assert((bytes.len() <= p.len()));
        let mut ok = (bytes.len() != p.len());
        for i in 0 .. 32 {
            if (!ok) {
                if (bytes[i] != p[i]) {
                    assert((bytes[i] < p[i]));
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bytes
}
unconstrained fn to_field(self: AztecAddress) -> Field {
    self.inner
}
unconstrained fn to_be_bytes(self: EthAddress) -> [u8; 20] {
    let field_bytes = to_be_bytes(self.inner);
    let mut bytes = [0; 20];
    for i in 0 .. 20 {
        bytes[i] = field_bytes[(i + 12)]
    };
    bytes
}
unconstrained fn sha256_to_field(bytes_to_hash: [u8; 148]) -> Field {
    let sha256_hashed = digest(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(sha256_hashed);
    hash_in_a_field
}
fn array_length_until(array: [Log<16>; 64], predicate: fn[()](Log<16>) -> bool) -> u32 {
    let mut length = 0;
    let mut stop = false;
    for i in 0 .. 64 {
        if predicate.0(array[i]) {
            stop = true
        } else {
            assert((stop == false), "non-matching element found after already encountering a matching element");
            length = (length + 1)
        }
    };
    length
}
fn lambda(log: Log<16>) -> bool {
    (log.length == 0)
}
unconstrained fn lambda(log: Log<16>) -> bool {
    (log.length == 0)
}
unconstrained fn splice_at_count_helper(array1: [Log<16>; 64], count: u32, array2: [Log<16>; 64]) -> [Log<16>; 64] {
    let mut result = array1;
    for i in count .. 64 {
        result[i] = array2[(i - count)]
    };
    result
}
fn validate_splice_at_count_result(array1: [Log<16>; 64], count: u32, array2: [Log<16>; 64], result: [Log<16>; 64]) -> () {
    let mut should_copy_from_2 = false;
    for i in 0 .. 64 {
        should_copy_from_2 = (should_copy_from_2 | (i == count));
        if should_copy_from_2 {
            assert(eq(result[i], array2[(i - count)]), "Mismatch expected and actual values: splice_at_count (array2)");
        } else {
            assert(eq(result[i], array1[i]), "Mismatch expected and actual values: splice_at_count (array1)");
        }
    }
}
fn array_length_until(array: [Scoped<LogHash>; 1], predicate: fn[()](Scoped<LogHash>) -> bool) -> u32 {
    let mut length = 0;
    let mut stop = false;
    for i in 0 .. 1 {
        if predicate.0(array[i]) {
            stop = true
        } else {
            assert((stop == false), "non-matching element found after already encountering a matching element");
            length = (length + 1)
        }
    };
    length
}
fn lambda(log: Scoped<LogHash>) -> bool {
    (log.inner.length == 0)
}
unconstrained fn lambda(log: Scoped<LogHash>) -> bool {
    (log.inner.length == 0)
}
unconstrained fn splice_at_count_helper(array1: [Scoped<LogHash>; 1], count: u32, array2: [Scoped<LogHash>; 1]) -> [Scoped<LogHash>; 1] {
    let mut result = array1;
    for i in count .. 1 {
        result[i] = array2[(i - count)]
    };
    result
}
fn validate_splice_at_count_result(array1: [Scoped<LogHash>; 1], count: u32, array2: [Scoped<LogHash>; 1], result: [Scoped<LogHash>; 1]) -> () {
    let mut should_copy_from_2 = false;
    for i in 0 .. 1 {
        should_copy_from_2 = (should_copy_from_2 | (i == count));
        if should_copy_from_2 {
            assert(eq(result[i], array2[(i - count)]), "Mismatch expected and actual values: splice_at_count (array2)");
        } else {
            assert(eq(result[i], array1[i]), "Mismatch expected and actual values: splice_at_count (array1)");
        }
    }
}
fn compute_contract_class_log_hash(log: [Field; 3023]) -> Field {
    poseidon2_hash(log)
}
fn array_padded_with(array: [Field; 3023], from_index: u32, padded_with: Field) -> bool {
    assert((from_index <= 3023), "from_index out of bounds");
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0 .. 3023 {
        should_check = (should_check | (i == from_index));
        {
            let op_rhs_0 = ((!should_check) | eq(array[i], padded_with));
            is_valid = (is_valid & op_rhs_0)
        }
    };
    is_valid
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 2784], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn serialize(self: PrivateToPublicKernelCircuitPublicInputs) -> [Field; 2784] {
    let mut writer = new();
    stream_serialize(self, (&mut writer));
    finish(writer)
}
fn verify(self: ProofData<PublicChonkVerifierPublicInputs, 480, 115>, proof_type: u32) -> () {
    let public_inputs = serialize(self.public_inputs);
    verify_proof_with_type(self.vk_data.vk.key, self.proof, public_inputs, self.vk_data.vk.hash, proof_type);
}
fn check_membership(leaf: Field, membership_witness: MembershipWitness<7>, root: Field) -> bool {
    let calculated_root = root_from_sibling_path(leaf, membership_witness.leaf_index, membership_witness.sibling_path);
    (calculated_root == root)
}
fn verify_proof_with_type(verification_key: [Field; 0], proof: [Field; 15516], public_inputs: [Field; 18740], key_hash: Field, proof_type: u32) -> () {
    if (!is_unconstrained()) {
        assert_constant(proof_type);
    };
    verify_proof_internal(verification_key, proof, public_inputs, key_hash, proof_type);
}
fn serialize_to_columns(self: AvmCircuitPublicInputs) -> [Field; 18740] {
    let mut flat = [0; 18740];
    let cols = to_columns(self);
    for col in 0 .. AVM_NUM_PUBLIC_INPUT_COLUMNS {
        for row in 0 .. AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH {
            flat[((col * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) + row)] = cols[col][row]
        }
    };
    flat
}
fn hash(self: BlockHeader) -> Field {
    poseidon2_hash_with_separator(serialize(self), DOM_SEP__BLOCK_HEADER_HASH)
}
fn check_membership(leaf: Field, membership_witness: MembershipWitness<30>, root: Field) -> bool {
    let calculated_root = root_from_sibling_path(leaf, membership_witness.leaf_index, membership_witness.sibling_path);
    (calculated_root == root)
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 11], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn map(self: &[AztecAddress; 11], f: fn[()](AztecAddress) -> Field) -> [Field; 11] {
    let uninitialized = 0;
    let mut ret = [uninitialized; 11];
    for i in 0 .. (*self).len() {
        ret[i] = f.0((*self)[i])
    };
    ret
}
fn lambda(address: (Field,)) -> Field {
    to_field(address)
}
unconstrained fn lambda(address: (Field,)) -> Field {
    to_field(address)
}
fn new(fee_per_da_gas: u128, fee_per_l2_gas: u128) -> GasFees {
    {
        let fee_per_da_gas = fee_per_da_gas;
        let fee_per_l2_gas = fee_per_l2_gas;
        (fee_per_da_gas, fee_per_l2_gas)
    }
}
fn min(v1: u128, v2: u128) -> u128 {
    if (cmp(v1, v2).0 == 2) {
        v2
    } else {
        v1
    }
}
fn eq(self: [PublicCallRequest; 32], other: [PublicCallRequest; 32]) -> bool {
    let mut result = true;
    for i in 0 .. self.len() {
        {
            let op_rhs_0 = eq(self[i], other[i]);
            result = (result & op_rhs_0)
        }
    };
    result
}
fn array_length(array: [PublicCallRequest; 32]) -> u32 {
    let length = {
        unsafe { find_first_index(array, lambda) }
    };
    validate_array_length_hint(array, length);
    length
}
fn empty() -> PublicCallRequest {
    {
        let msg_sender = empty();
        let contract_address = empty();
        let is_static_call = false;
        let calldata_hash = 0;
        (msg_sender, contract_address, is_static_call, calldata_hash)
    }
}
fn eq(self: [Field; 64], other: [Field; 64]) -> bool {
    let mut result = true;
    for i in 0 .. self.len() {
        {
            let op_rhs_0 = eq(self[i], other[i]);
            result = (result & op_rhs_0)
        }
    };
    result
}
fn array_length(array: [Field; 64]) -> u32 {
    let length = {
        unsafe { find_first_index(array, lambda) }
    };
    validate_array_length_hint(array, length);
    length
}
fn eq(self: [Scoped<L2ToL1Message>; 8], other: [Scoped<L2ToL1Message>; 8]) -> bool {
    let mut result = true;
    for i in 0 .. self.len() {
        {
            let op_rhs_0 = eq(self[i], other[i]);
            result = (result & op_rhs_0)
        }
    };
    result
}
fn array_length(array: [Scoped<L2ToL1Message>; 8]) -> u32 {
    let length = {
        unsafe { find_first_index(array, lambda) }
    };
    validate_array_length_hint(array, length);
    length
}
fn eq(self: Field, other: Field) -> bool {
    (self == other)
}
fn eq(self: Scoped<L2ToL1Message>, other: Scoped<L2ToL1Message>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
fn empty() -> L2ToL1Message {
    {
        let recipient = empty();
        let content = 0;
        (recipient, content)
    }
}
fn empty() -> AztecAddress {
    {
        let inner = 0;
        (inner)
    }
}
fn eq(_self: PublicDataWrite, _other: PublicDataWrite) -> bool {
    ((_self.leaf_slot == _other.leaf_slot) & (_self.value == _other.value))
}
unconstrained fn get_tx_blob_fields_unsafe(tx_effect: TxEffect, array_lengths: TxEffectArrayLengths) -> ([Field; 8475], u32, u32) {
    let mut tx_blob_fields = [0; 8475];
    tx_blob_fields[1] = tx_effect.tx_hash;
    tx_blob_fields[2] = tx_effect.transaction_fee;
    let mut offset = 3;
    let note_hashes = tx_effect.note_hashes;
    for i in 0 .. array_lengths.note_hashes {
        tx_blob_fields[(offset + i)] = note_hashes[i]
    };
    offset = (offset + array_lengths.note_hashes);
    let nullifiers = tx_effect.nullifiers;
    for i in 0 .. array_lengths.nullifiers {
        tx_blob_fields[(offset + i)] = nullifiers[i]
    };
    offset = (offset + array_lengths.nullifiers);
    let l2_to_l1_msgs = tx_effect.l2_to_l1_msgs;
    for i in 0 .. array_lengths.l2_to_l1_msgs {
        tx_blob_fields[(offset + i)] = l2_to_l1_msgs[i]
    };
    offset = (offset + array_lengths.l2_to_l1_msgs);
    let public_data_writes = tx_effect.public_data_writes;
    for i in 0 .. array_lengths.public_data_writes {
        tx_blob_fields[(offset + (i * 2))] = public_data_writes[i].leaf_slot;
        tx_blob_fields[((offset + (i * 2)) + 1)] = public_data_writes[i].value
    };
    offset = (offset + (array_lengths.public_data_writes * 2));
    let private_logs = tx_effect.private_logs;
    let mut private_logs_length = 0;
    for i in 0 .. array_lengths.private_logs {
        let log = private_logs[i];
        let log_len = log.length;
        private_logs_length = (private_logs_length + log_len);
        tx_blob_fields[offset] = (log_len as Field);
        offset = (offset + 1);
        for j in 0 .. log_len {
            tx_blob_fields[(offset + j)] = log.fields[j]
        };
        offset = (offset + log_len)
    };
    let public_logs = tx_effect.public_logs;
    for i in 0 .. public_logs.length {
        tx_blob_fields[(offset + i)] = public_logs.payload[i]
    };
    offset = (offset + public_logs.length);
    let contract_class_logs = tx_effect.contract_class_logs;
    for i in 0 .. array_lengths.contract_class_logs {
        let log = contract_class_logs[i];
        let log_len = log.log.length;
        tx_blob_fields[offset] = to_field(log.contract_address);
        offset = (offset + 1);
        for j in 0 .. log_len {
            tx_blob_fields[(offset + j)] = log.log.fields[j]
        };
        offset = (offset + log_len)
    };
    tx_blob_fields[0] = create_tx_start_marker(offset, array_lengths, private_logs_length, tx_effect.public_logs.length, tx_effect.contract_class_logs[0].log.length, tx_effect.revert_code);
    (tx_blob_fields, offset, private_logs_length)
}
fn create_tx_start_marker(num_blob_fields: u32, array_lengths: TxEffectArrayLengths, private_logs_length: u32, public_logs_length: u32, contract_class_log_length: u32, revert_code: u8) -> Field {
    static_assert((((((((((((NUM_BLOB_FIELDS_BIT_SIZE + REVERT_CODE_BIT_SIZE) + CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE) + PUBLIC_LOGS_LENGTH_BIT_SIZE) + PRIVATE_LOGS_LENGTH_BIT_SIZE) + NUM_PRIVATE_LOG_BIT_SIZE) + NUM_PUBLIC_DATA_WRITE_BIT_SIZE) + NUM_L2_TO_L1_MSG_BIT_SIZE) + NUM_NULLIFIER_BIT_SIZE) + NUM_NOTE_HASH_BIT_SIZE) + TX_START_PREFIX_BIT_SIZE) <= 253), "These bit-sizes don't fit within a field anymore. Have you changed a constant?", r#"{"kind":"string","length":78}"#, false);
    let num_blob_fields_field = (num_blob_fields as Field);
    assert_max_bit_size(num_blob_fields_field);
    let mut marker = num_blob_fields_field;
    let mut shift = ((1 << (NUM_BLOB_FIELDS_BIT_SIZE as u64)) as Field);
    let revert_code_field = (revert_code as Field);
    assert_max_bit_size(revert_code_field);
    marker = (marker + (revert_code_field * shift));
    shift = (shift * ((1 << REVERT_CODE_BIT_SIZE) as Field));
    let contract_class_log_length_field = (contract_class_log_length as Field);
    assert_max_bit_size(contract_class_log_length_field);
    marker = (marker + (contract_class_log_length_field * shift));
    shift = (shift * ((1 << CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE) as Field));
    let public_logs_length_field = (public_logs_length as Field);
    assert_max_bit_size(public_logs_length_field);
    marker = (marker + (public_logs_length_field * shift));
    shift = (shift * ((1 << (PUBLIC_LOGS_LENGTH_BIT_SIZE as u64)) as Field));
    let private_logs_length_field = (private_logs_length as Field);
    assert_max_bit_size(private_logs_length_field);
    marker = (marker + (private_logs_length_field * shift));
    shift = (shift * ((1 << PRIVATE_LOGS_LENGTH_BIT_SIZE) as Field));
    let num_private_logs_field = (array_lengths.private_logs as Field);
    assert_max_bit_size(num_private_logs_field);
    marker = (marker + (num_private_logs_field * shift));
    shift = (shift * ((1 << NUM_PRIVATE_LOG_BIT_SIZE) as Field));
    let num_public_data_writes_field = (array_lengths.public_data_writes as Field);
    assert_max_bit_size(num_public_data_writes_field);
    marker = (marker + (num_public_data_writes_field * shift));
    shift = (shift * ((1 << NUM_PUBLIC_DATA_WRITE_BIT_SIZE) as Field));
    let num_l2_to_l1_msgs_field = (array_lengths.l2_to_l1_msgs as Field);
    assert_max_bit_size(num_l2_to_l1_msgs_field);
    marker = (marker + (num_l2_to_l1_msgs_field * shift));
    shift = (shift * ((1 << NUM_L2_TO_L1_MSG_BIT_SIZE) as Field));
    let num_nullifiers_field = (array_lengths.nullifiers as Field);
    assert_max_bit_size(num_nullifiers_field);
    marker = (marker + (num_nullifiers_field * shift));
    shift = (shift * ((1 << NUM_NULLIFIER_BIT_SIZE) as Field));
    let num_note_hashes_field = (array_lengths.note_hashes as Field);
    assert_max_bit_size(num_note_hashes_field);
    marker = (marker + (num_note_hashes_field * shift));
    shift = (shift * ((1 << NUM_NOTE_HASH_BIT_SIZE) as Field));
    marker = (marker + (TX_START_PREFIX * shift));
    marker
}
fn poseidon2_absorb_in_chunks_existing_sponge(mut sponge: Poseidon2Sponge, input: [Field; 8475], in_len: u32) -> Poseidon2Sponge {
    assert((in_len <= 8475), "Given in_len to absorb is larger than the input array len");
    assert((!sponge.squeeze_mode), "Cannot absorb in squeeze mode");
    absorb_in_chunks(sponge, input, in_len)
}
fn compute_unbalanced_merkle_root(leaves: [Field; 8], num_non_empty_leaves: u32, hasher: fn(Field, Field) -> Field) -> Field {
    let mut nodes = [0; 8];
    let subtree_sizes = compute_subtree_sizes(num_non_empty_leaves);
    let first_subtree_size = subtree_sizes[0];
    let mut subtree_size = first_subtree_size;
    let mut subtree_size_index = 0;
    let mut num_remaining_leaves = num_non_empty_leaves;
    let mut num_remaining_subtree_nodes = 0;
    let mut prev_subtree_root_index = 0;
    let mut leaf_start_index = 0;
    let mut node_start_index = 0;
    for i in 0 .. (8 - 1) {
        if ((num_remaining_subtree_nodes == 0) & (num_remaining_leaves != 0)) {
            subtree_size = subtree_sizes[subtree_size_index];
            subtree_size_index = (subtree_size_index + 1);
            num_remaining_subtree_nodes = subtree_size;
            leaf_start_index = (num_remaining_leaves - subtree_size);
            node_start_index = i
        };
        let is_single_leaf = ((i == 0) & (subtree_size <= 1));
        {
            let _ = if (num_remaining_subtree_nodes == 0) {
                (0, 0)
            } else {
                if (leaf_start_index != num_remaining_leaves) {
                    {
                        let _ = (leaf_start_index, (leaf_start_index + 1));
                        let left_index = _.0;
                        let right_index = _.1
                    };
                    {
                        let op_rhs_0 = if is_single_leaf {
                            1
                        } else {
                            2
                        };
                        leaf_start_index = (leaf_start_index + op_rhs_0)
                    };
                    (leaves[left_index], leaves[right_index])
                } else {
                    if (num_remaining_subtree_nodes != 1) {
                        {
                            let _ = (node_start_index, (node_start_index + 1));
                            let left_index = _.0;
                            let right_index = _.1
                        };
                        node_start_index = (node_start_index + 2);
                        (nodes[left_index], nodes[right_index])
                    } else {
                        (nodes[(i - 1)], nodes[prev_subtree_root_index])
                    }
                }
            };
            let left = _.0;
            let right = _.1
        };
        nodes[i] = if is_single_leaf {
            left
        } else {
            hasher.0(left, right)
        };
        if ((num_remaining_subtree_nodes == 2) & (subtree_size == first_subtree_size)) {
            num_remaining_subtree_nodes = (num_remaining_subtree_nodes - 1)
        };
        if (num_remaining_subtree_nodes == 1) {
            prev_subtree_root_index = i;
            num_remaining_leaves = (num_remaining_leaves - subtree_size)
        };
        if (num_remaining_subtree_nodes != 0) {
            num_remaining_subtree_nodes = (num_remaining_subtree_nodes - 1)
        }
    };
    nodes[prev_subtree_root_index]
}
fn sha_merkle_hash(left: Field, right: Field) -> Field {
    accumulate_sha256(left, right)
}
unconstrained fn sha_merkle_hash(left: Field, right: Field) -> Field {
    accumulate_sha256(left, right)
}
fn to_be_radix(self: Field, radix: u32) -> [u8; 32] {
    if (!is_unconstrained()) {
        static_assert((1 < radix), "radix must be greater than 1", r#"{"kind":"string","length":28}"#, false);
        static_assert((radix <= 256), "radix must be less than or equal to 256", r#"{"kind":"string","length":39}"#, false);
        static_assert(((radix & (radix - 1)) == 0), "radix must be a power of 2", r#"{"kind":"string","length":26}"#, false);
    };
    __to_be_radix(self, radix)
}
#[no_predicates]
fn digest(msg: [u8; 148]) -> HASH {
    sha256_var(msg, 148)
}
fn field_from_bytes_32_trunc(bytes32: [u8; 32]) -> Field {
    let mut v = 1;
    let mut high = (0 as Field);
    let mut low = (0 as Field);
    for i in 0 .. 15 {
        low = (low + ((bytes32[((15 + 15) - i)] as Field) * v));
        v = (v * 256);
        high = (high + ((bytes32[(14 - i)] as Field) * v))
    };
    low = (low + ((bytes32[15] as Field) * v));
    (low + (high * v))
}
unconstrained fn to_be_radix(self: Field, radix: u32) -> [u8; 32] {
    if (!is_unconstrained()) {
        static_assert((1 < radix), "radix must be greater than 1", r#"{"kind":"string","length":28}"#, false);
        static_assert((radix <= 256), "radix must be less than or equal to 256", r#"{"kind":"string","length":39}"#, false);
        static_assert(((radix & (radix - 1)) == 0), "radix must be a power of 2", r#"{"kind":"string","length":26}"#, false);
    };
    __to_be_radix(self, radix)
}
#[no_predicates]
unconstrained fn digest(msg: [u8; 148]) -> HASH {
    sha256_var(msg, 148)
}
unconstrained fn field_from_bytes_32_trunc(bytes32: [u8; 32]) -> Field {
    let mut v = 1;
    let mut high = (0 as Field);
    let mut low = (0 as Field);
    for i in 0 .. 15 {
        low = (low + ((bytes32[((15 + 15) - i)] as Field) * v));
        v = (v * 256);
        high = (high + ((bytes32[(14 - i)] as Field) * v))
    };
    low = (low + ((bytes32[15] as Field) * v));
    (low + (high * v))
}
fn eq(_self: Log<16>, _other: Log<16>) -> bool {
    (eq(_self.fields, _other.fields) & (_self.length == _other.length))
}
fn eq(self: Scoped<LogHash>, other: Scoped<LogHash>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
fn poseidon2_hash(inputs: [Field; 3023]) -> Field {
    hash(inputs, 3023)
}
fn concat(self: &[Field; 1], array2: [Field; 2784]) -> [Field; 2785] {
    let mut result = [0; 2785];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 2784 {
        result[(i + 1)] = array2[i]
    };
    result
}
#[inline_always]
fn to_field(self: u32) -> Field {
    (self as Field)
}
fn poseidon2_hash(inputs: [Field; 2785]) -> Field {
    hash(inputs, 2785)
}
fn new() -> Writer<2784> {
    {
        let data = [0; 2784];
        let offset = 0;
        (data, offset)
    }
}
#[inline_always]
fn stream_serialize(self: PrivateToPublicKernelCircuitPublicInputs, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.constants, writer);
    stream_serialize(self.non_revertible_accumulated_data, writer);
    stream_serialize(self.revertible_accumulated_data, writer);
    stream_serialize(self.public_teardown_call_request, writer);
    stream_serialize(self.gas_used, writer);
    stream_serialize(self.fee_payer, writer);
    stream_serialize(self.expiration_timestamp, writer);
}
fn finish(self: Writer<2784>) -> [Field; 2784] {
    assert((self.offset == self.data.len()), "Writer did not write all data");
    self.data
}
fn serialize(self: PublicChonkVerifierPublicInputs) -> [Field; 2785] {
    let mut writer = new();
    stream_serialize(self, (&mut writer));
    finish(writer)
}
fn verify_proof_with_type(verification_key: [Field; 115], proof: [Field; 480], public_inputs: [Field; 2785], key_hash: Field, proof_type: u32) -> () {
    if (!is_unconstrained()) {
        assert_constant(proof_type);
    };
    verify_proof_internal(verification_key, proof, public_inputs, key_hash, proof_type);
}
fn root_from_sibling_path(leaf: Field, leaf_index: Field, sibling_path: [Field; 7]) -> Field {
    root_from_sibling_path_with_hasher(leaf, leaf_index, sibling_path, (merkle_hash, merkle_hash))
}
fn to_columns(self: AvmCircuitPublicInputs) -> [[Field; 4685]; 4] {
    let mut cols = [[0; 4685]; 4];
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX] = self.global_variables.chain_id;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX] = self.global_variables.version;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] = (self.global_variables.block_number as Field);
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX] = self.global_variables.slot_number;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX] = (self.global_variables.timestamp as Field);
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX] = to_field(self.global_variables.coinbase);
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX] = to_field(self.global_variables.fee_recipient);
    set_gas_fees_in_cols(self.global_variables.gas_fees, (&mut cols), AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);
    set_protocol_contracts_in_cols(self.protocol_contracts, (&mut cols), AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX);
    set_snapshot_in_cols(self.start_tree_snapshots.l1_to_l2_message_tree, (&mut cols), AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX);
    set_snapshot_in_cols(self.start_tree_snapshots.note_hash_tree, (&mut cols), AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX);
    set_snapshot_in_cols(self.start_tree_snapshots.nullifier_tree, (&mut cols), AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX);
    set_snapshot_in_cols(self.start_tree_snapshots.public_data_tree, (&mut cols), AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX);
    set_gas_in_cols(self.start_gas_used, (&mut cols), AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX);
    set_gas_in_cols(self.gas_settings.gas_limits, (&mut cols), AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX);
    set_gas_in_cols(self.gas_settings.teardown_gas_limits, (&mut cols), AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX);
    set_gas_fees_in_cols(self.gas_settings.max_fees_per_gas, (&mut cols), AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX);
    set_gas_fees_in_cols(self.gas_settings.max_priority_fees_per_gas, (&mut cols), AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX);
    set_gas_fees_in_cols(self.effective_gas_fees, (&mut cols), AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX);
    cols[0][AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX] = to_field(self.fee_payer);
    cols[0][AVM_PUBLIC_INPUTS_PROVER_ID_ROW_IDX] = self.prover_id;
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX] = (self.public_call_request_array_lengths.setup_calls as Field);
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX] = (self.public_call_request_array_lengths.app_logic_calls as Field);
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX] = (self.public_call_request_array_lengths.teardown_call as Field);
    set_public_call_request_array_in_cols(self.public_setup_call_requests, (&mut cols), AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX);
    set_public_call_request_array_in_cols(self.public_app_logic_call_requests, (&mut cols), AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX);
    set_public_call_request_in_cols(self.public_teardown_call_request, (&mut cols), AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX);
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] = (self.previous_non_revertible_accumulated_data_array_lengths.note_hashes as Field);
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] = (self.previous_non_revertible_accumulated_data_array_lengths.nullifiers as Field);
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] = (self.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field);
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] = (self.previous_revertible_accumulated_data_array_lengths.note_hashes as Field);
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] = (self.previous_revertible_accumulated_data_array_lengths.nullifiers as Field);
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] = (self.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field);
    set_field_array_in_cols(self.previous_non_revertible_accumulated_data.note_hashes, (&mut cols), AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(self.previous_non_revertible_accumulated_data.nullifiers, (&mut cols), AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(self.previous_non_revertible_accumulated_data.l2_to_l1_msgs, (&mut cols), AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);
    set_field_array_in_cols(self.previous_revertible_accumulated_data.note_hashes, (&mut cols), AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(self.previous_revertible_accumulated_data.nullifiers, (&mut cols), AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(self.previous_revertible_accumulated_data.l2_to_l1_msgs, (&mut cols), AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);
    set_snapshot_in_cols(self.end_tree_snapshots.l1_to_l2_message_tree, (&mut cols), AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX);
    set_snapshot_in_cols(self.end_tree_snapshots.note_hash_tree, (&mut cols), AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX);
    set_snapshot_in_cols(self.end_tree_snapshots.nullifier_tree, (&mut cols), AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX);
    set_snapshot_in_cols(self.end_tree_snapshots.public_data_tree, (&mut cols), AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX);
    set_gas_in_cols(self.end_gas_used, (&mut cols), AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX);
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] = (self.accumulated_data_array_lengths.note_hashes as Field);
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] = (self.accumulated_data_array_lengths.nullifiers as Field);
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] = (self.accumulated_data_array_lengths.l2_to_l1_msgs as Field);
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX] = (self.accumulated_data_array_lengths.public_data_writes as Field);
    set_field_array_in_cols(self.accumulated_data.note_hashes, (&mut cols), AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(self.accumulated_data.nullifiers, (&mut cols), AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(self.accumulated_data.l2_to_l1_msgs, (&mut cols), AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);
    set_public_logs_in_cols(self.accumulated_data.public_logs, (&mut cols), AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX);
    set_public_data_writes_in_cols(self.accumulated_data.public_data_writes, (&mut cols), AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX);
    cols[0][AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX] = self.transaction_fee;
    cols[0][AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX] = (self.reverted as Field);
    cols
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 22], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn serialize(self: BlockHeader) -> [Field; 22] {
    let mut writer = new();
    stream_serialize(self, (&mut writer));
    finish(writer)
}
fn root_from_sibling_path(leaf: Field, leaf_index: Field, sibling_path: [Field; 30]) -> Field {
    root_from_sibling_path_with_hasher(leaf, leaf_index, sibling_path, (merkle_hash, merkle_hash))
}
fn concat(self: &[Field; 1], array2: [Field; 11]) -> [Field; 12] {
    let mut result = [0; 12];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 11 {
        result[(i + 1)] = array2[i]
    };
    result
}
fn poseidon2_hash(inputs: [Field; 12]) -> Field {
    hash(inputs, 12)
}
fn cmp(self: u128, other: u128) -> Ordering {
    if (self < other) {
        less()
    } else {
        if (self > other) {
            greater()
        } else {
            equal()
        }
    }
}
unconstrained fn find_first_index(array: [PublicCallRequest; 32], find: fn[()](PublicCallRequest) -> bool) -> u32 {
    let mut index = 32;
    for i in 0 .. 32 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn is_empty(self: PublicCallRequest) -> bool {
    eq(self, empty())
}
unconstrained fn lambda(elem: PublicCallRequest) -> bool {
    is_empty(elem)
}
unconstrained fn lambda(elem: PublicCallRequest) -> bool {
    is_empty(elem)
}
fn validate_array_length_hint(array: [PublicCallRequest; 32], length: u32) -> () {
    if (length != 32) {
        assert_empty(array[length], "Expected array[length] to be empty");
    };
    if (length != 0) {
        assert((!is_empty(array[(length - 1)])), "Expected claimed final element of array (array[length - 1]) to be nonempty");
    }
}
unconstrained fn find_first_index(array: [Field; 64], find: fn[()](Field) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn is_empty(self: Field) -> bool {
    eq(self, empty())
}
unconstrained fn lambda(elem: Field) -> bool {
    is_empty(elem)
}
unconstrained fn lambda(elem: Field) -> bool {
    is_empty(elem)
}
fn validate_array_length_hint(array: [Field; 64], length: u32) -> () {
    if (length != 64) {
        assert_empty(array[length], "Expected array[length] to be empty");
    };
    if (length != 0) {
        assert((!is_empty(array[(length - 1)])), "Expected claimed final element of array (array[length - 1]) to be nonempty");
    }
}
unconstrained fn find_first_index(array: [Scoped<L2ToL1Message>; 8], find: fn[()](Scoped<L2ToL1Message>) -> bool) -> u32 {
    let mut index = 8;
    for i in 0 .. 8 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn is_empty(self: Scoped<L2ToL1Message>) -> bool {
    eq(self, empty())
}
unconstrained fn lambda(elem: Scoped<L2ToL1Message>) -> bool {
    is_empty(elem)
}
unconstrained fn lambda(elem: Scoped<L2ToL1Message>) -> bool {
    is_empty(elem)
}
fn validate_array_length_hint(array: [Scoped<L2ToL1Message>; 8], length: u32) -> () {
    if (length != 8) {
        assert_empty(array[length], "Expected array[length] to be empty");
    };
    if (length != 0) {
        assert((!is_empty(array[(length - 1)])), "Expected claimed final element of array (array[length - 1]) to be nonempty");
    }
}
fn eq(_self: L2ToL1Message, _other: L2ToL1Message) -> bool {
    (eq(_self.recipient, _other.recipient) & (_self.content == _other.content))
}
fn empty() -> EthAddress {
    {
        let inner = 0;
        (inner)
    }
}
unconstrained fn create_tx_start_marker(num_blob_fields: u32, array_lengths: TxEffectArrayLengths, private_logs_length: u32, public_logs_length: u32, contract_class_log_length: u32, revert_code: u8) -> Field {
    static_assert((((((((((((NUM_BLOB_FIELDS_BIT_SIZE + REVERT_CODE_BIT_SIZE) + CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE) + PUBLIC_LOGS_LENGTH_BIT_SIZE) + PRIVATE_LOGS_LENGTH_BIT_SIZE) + NUM_PRIVATE_LOG_BIT_SIZE) + NUM_PUBLIC_DATA_WRITE_BIT_SIZE) + NUM_L2_TO_L1_MSG_BIT_SIZE) + NUM_NULLIFIER_BIT_SIZE) + NUM_NOTE_HASH_BIT_SIZE) + TX_START_PREFIX_BIT_SIZE) <= 253), "These bit-sizes don't fit within a field anymore. Have you changed a constant?", r#"{"kind":"string","length":78}"#, false);
    let num_blob_fields_field = (num_blob_fields as Field);
    assert_max_bit_size(num_blob_fields_field);
    let mut marker = num_blob_fields_field;
    let mut shift = ((1 << (NUM_BLOB_FIELDS_BIT_SIZE as u64)) as Field);
    let revert_code_field = (revert_code as Field);
    assert_max_bit_size(revert_code_field);
    marker = (marker + (revert_code_field * shift));
    shift = (shift * ((1 << REVERT_CODE_BIT_SIZE) as Field));
    let contract_class_log_length_field = (contract_class_log_length as Field);
    assert_max_bit_size(contract_class_log_length_field);
    marker = (marker + (contract_class_log_length_field * shift));
    shift = (shift * ((1 << CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE) as Field));
    let public_logs_length_field = (public_logs_length as Field);
    assert_max_bit_size(public_logs_length_field);
    marker = (marker + (public_logs_length_field * shift));
    shift = (shift * ((1 << (PUBLIC_LOGS_LENGTH_BIT_SIZE as u64)) as Field));
    let private_logs_length_field = (private_logs_length as Field);
    assert_max_bit_size(private_logs_length_field);
    marker = (marker + (private_logs_length_field * shift));
    shift = (shift * ((1 << PRIVATE_LOGS_LENGTH_BIT_SIZE) as Field));
    let num_private_logs_field = (array_lengths.private_logs as Field);
    assert_max_bit_size(num_private_logs_field);
    marker = (marker + (num_private_logs_field * shift));
    shift = (shift * ((1 << NUM_PRIVATE_LOG_BIT_SIZE) as Field));
    let num_public_data_writes_field = (array_lengths.public_data_writes as Field);
    assert_max_bit_size(num_public_data_writes_field);
    marker = (marker + (num_public_data_writes_field * shift));
    shift = (shift * ((1 << NUM_PUBLIC_DATA_WRITE_BIT_SIZE) as Field));
    let num_l2_to_l1_msgs_field = (array_lengths.l2_to_l1_msgs as Field);
    assert_max_bit_size(num_l2_to_l1_msgs_field);
    marker = (marker + (num_l2_to_l1_msgs_field * shift));
    shift = (shift * ((1 << NUM_L2_TO_L1_MSG_BIT_SIZE) as Field));
    let num_nullifiers_field = (array_lengths.nullifiers as Field);
    assert_max_bit_size(num_nullifiers_field);
    marker = (marker + (num_nullifiers_field * shift));
    shift = (shift * ((1 << NUM_NULLIFIER_BIT_SIZE) as Field));
    let num_note_hashes_field = (array_lengths.note_hashes as Field);
    assert_max_bit_size(num_note_hashes_field);
    marker = (marker + (num_note_hashes_field * shift));
    shift = (shift * ((1 << NUM_NOTE_HASH_BIT_SIZE) as Field));
    marker = (marker + (TX_START_PREFIX * shift));
    marker
}
fn assert_max_bit_size(self: Field) -> () {
    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 32);
}
fn assert_max_bit_size(self: Field) -> () {
    static_assert((8 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 8);
}
fn assert_max_bit_size(self: Field) -> () {
    static_assert((16 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 16);
}
fn absorb_in_chunks(mut sponge: Poseidon2Sponge, input: [Field; 8475], in_len: u32) -> Poseidon2Sponge {
    static_assert(((2825 * 3) <= 8475), "MAX_CHUNKS * 3 must be less than or equal to NUM_ITEMS", r#"{"kind":"string","length":54}"#, false);
    static_assert((((2825 + 1) * 3) > 8475), "MAX_CHUNKS + 1 * 3 must be greater than NUM_ITEMS", r#"{"kind":"string","length":49}"#, false);
    let prefix_items_to_align = items_needed_for_cache_1(sponge.cache_size);
    let num_prefix_items = min(prefix_items_to_align, in_len);
    sponge = absorb_items(sponge, input, 0, num_prefix_items);
    let num_full_permutations = ((in_len - num_prefix_items) / 3);
    sponge = absorb_full_permutations(sponge, input, num_prefix_items, num_full_permutations);
    let num_suffix_items = ((in_len - num_prefix_items) - (num_full_permutations * 3));
    sponge = absorb_items(sponge, input, (num_prefix_items + (num_full_permutations * 3)), num_suffix_items);
    sponge
}
fn compute_subtree_sizes(num_non_empty_leaves: u32) -> [u32; 3] {
    let mut subtree_sizes = [0; 3];
    let mut counter = 0;
    let mut subtree_size = 1;
    for _ in 0 .. (3 + 1) {
        if ((num_non_empty_leaves & subtree_size) != 0) {
            subtree_sizes[counter] = subtree_size;
            counter = (counter + 1)
        };
        subtree_size = (subtree_size * 2)
    };
    subtree_sizes
}
fn accumulate_sha256(v0: Field, v1: Field) -> Field {
    let v0_as_bytes = to_be_bytes(v0);
    let v1_as_bytes = to_be_bytes(v1);
    let hash_input_flattened = concat((&v0_as_bytes), v1_as_bytes);
    sha256_to_field(hash_input_flattened)
}
unconstrained fn accumulate_sha256(v0: Field, v1: Field) -> Field {
    let v0_as_bytes = to_be_bytes(v0);
    let v1_as_bytes = to_be_bytes(v1);
    let hash_input_flattened = concat((&v0_as_bytes), v1_as_bytes);
    sha256_to_field(hash_input_flattened)
}
fn sha256_var(msg: [u8; 148], message_size: u32) -> HASH {
    assert((message_size <= 148));
    {
        let _ = process_full_blocks(msg, message_size, INITIAL_STATE);
        let h = _.0;
        let msg_block = _.1
    };
    finalize_sha256_blocks(message_size, h, msg_block)
}
unconstrained fn sha256_var(msg: [u8; 148], message_size: u32) -> HASH {
    assert((message_size <= 148));
    {
        let _ = process_full_blocks(msg, message_size, INITIAL_STATE);
        let h = _.0;
        let msg_block = _.1
    };
    finalize_sha256_blocks(message_size, h, msg_block)
}
fn eq(self: [Field; 16], other: [Field; 16]) -> bool {
    let mut result = true;
    for i in 0 .. self.len() {
        {
            let op_rhs_0 = eq(self[i], other[i]);
            result = (result & op_rhs_0)
        }
    };
    result
}
fn eq(_self: LogHash, _other: LogHash) -> bool {
    ((_self.value == _other.value) & (_self.length == _other.length))
}
#[no_predicates]
fn hash(input: [Field; 3023], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[no_predicates]
fn hash(input: [Field; 2785], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[inline_always]
fn stream_serialize(self: TxConstantData, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.anchor_block_header, writer);
    stream_serialize(self.tx_context, writer);
    stream_serialize(self.vk_tree_root, writer);
    stream_serialize(self.protocol_contracts_hash, writer);
}
#[inline_always]
fn stream_serialize(self: PrivateToPublicAccumulatedData, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.note_hashes, writer);
    stream_serialize(self.nullifiers, writer);
    stream_serialize(self.l2_to_l1_msgs, writer);
    stream_serialize(self.private_logs, writer);
    stream_serialize(self.contract_class_logs_hashes, writer);
    stream_serialize(self.public_call_requests, writer);
}
#[inline_always]
fn stream_serialize(self: PublicCallRequest, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.msg_sender, writer);
    stream_serialize(self.contract_address, writer);
    stream_serialize(self.is_static_call, writer);
    stream_serialize(self.calldata_hash, writer);
}
#[inline_always]
fn stream_serialize(self: Gas, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.da_gas, writer);
    stream_serialize(self.l2_gas, writer);
}
#[inline_always]
fn stream_serialize(self: AztecAddress, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: u64, writer: &mut Writer<2784>) -> () {
    write(writer, (self as Field));
}
fn new() -> Writer<2785> {
    {
        let data = [0; 2785];
        let offset = 0;
        (data, offset)
    }
}
#[inline_always]
fn stream_serialize(self: PublicChonkVerifierPublicInputs, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.private_tail, writer);
    stream_serialize(self.prover_id, writer);
}
fn finish(self: Writer<2785>) -> [Field; 2785] {
    assert((self.offset == self.data.len()), "Writer did not write all data");
    self.data
}
fn root_from_sibling_path_with_hasher(leaf: Field, leaf_index: Field, sibling_path: [Field; 7], hasher: fn(Field, Field) -> Field) -> Field {
    let mut node = leaf;
    let indices = to_le_bits(leaf_index);
    for i in 0 .. 7 {
        {
            let _ = if indices[i] {
                (sibling_path[i], node)
            } else {
                (node, sibling_path[i])
            };
            let hash_left = _.0;
            let hash_right = _.1
        };
        node = hasher.0(hash_left, hash_right)
    };
    node
}
fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}
unconstrained fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}
fn to_field(self: EthAddress) -> Field {
    self.inner
}
fn set_gas_fees_in_cols(gas_fees: GasFees, cols: &mut [[Field; 4685]; 4], row_idx: u32) -> () {
    (*cols)[0][row_idx] = (gas_fees.fee_per_da_gas as Field);
    (*cols)[1][row_idx] = (gas_fees.fee_per_l2_gas as Field)
}
fn set_protocol_contracts_in_cols(protocol_contracts: ProtocolContracts, cols: &mut [[Field; 4685]; 4], protocol_contracts_start_row_idx: u32) -> () {
    let serialized = serialize(protocol_contracts);
    for i in 0 .. serialized.len() {
        (*cols)[0][(protocol_contracts_start_row_idx + i)] = serialized[i]
    }
}
fn set_snapshot_in_cols(snapshot: AppendOnlyTreeSnapshot, cols: &mut [[Field; 4685]; 4], row_idx: u32) -> () {
    (*cols)[0][row_idx] = snapshot.root;
    (*cols)[1][row_idx] = snapshot.next_available_leaf_index
}
fn set_gas_in_cols(gas: Gas, cols: &mut [[Field; 4685]; 4], row_idx: u32) -> () {
    (*cols)[0][row_idx] = (gas.da_gas as Field);
    (*cols)[1][row_idx] = (gas.l2_gas as Field)
}
fn set_public_call_request_array_in_cols(requests: [PublicCallRequest; 32], cols: &mut [[Field; 4685]; 4], array_start_row_idx: u32) -> () {
    for i in 0 .. requests.len() {
        let row = (array_start_row_idx + i);
        set_public_call_request_in_cols(requests[i], cols, row);
    }
}
fn set_public_call_request_in_cols(request: PublicCallRequest, cols: &mut [[Field; 4685]; 4], row_idx: u32) -> () {
    (*cols)[0][row_idx] = to_field(request.msg_sender);
    (*cols)[1][row_idx] = to_field(request.contract_address);
    (*cols)[2][row_idx] = (request.is_static_call as Field);
    (*cols)[3][row_idx] = request.calldata_hash
}
fn set_field_array_in_cols(arr: [Field; 64], cols: &mut [[Field; 4685]; 4], array_start_row_idx: u32) -> () {
    for i in 0 .. arr.len() {
        let row = (array_start_row_idx + i);
        (*cols)[0][row] = arr[i]
    }
}
fn set_l2_to_l1_msg_array_in_cols(arr: [Scoped<L2ToL1Message>; 8], cols: &mut [[Field; 4685]; 4], array_start_row_idx: u32) -> () {
    for i in 0 .. arr.len() {
        let row = (array_start_row_idx + i);
        (*cols)[0][row] = to_field(arr[i].inner.recipient);
        (*cols)[1][row] = arr[i].inner.content;
        (*cols)[2][row] = to_field(arr[i].contract_address)
    }
}
fn set_public_logs_in_cols(logs: PublicLogs, cols: &mut [[Field; 4685]; 4], array_start_row_idx: u32) -> () {
    (*cols)[0][array_start_row_idx] = (logs.length as Field);
    for i in 0 .. logs.payload.len() {
        (*cols)[0][((array_start_row_idx + i) + FLAT_PUBLIC_LOGS_HEADER_LENGTH)] = logs.payload[i]
    }
}
fn set_public_data_writes_in_cols(writes: [PublicDataWrite; 64], cols: &mut [[Field; 4685]; 4], array_start_row_idx: u32) -> () {
    for i in 0 .. writes.len() {
        let row = (array_start_row_idx + i);
        (*cols)[0][row] = writes[i].leaf_slot;
        (*cols)[1][row] = writes[i].value
    }
}
fn concat(self: &[Field; 1], array2: [Field; 22]) -> [Field; 23] {
    let mut result = [0; 23];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 22 {
        result[(i + 1)] = array2[i]
    };
    result
}
fn poseidon2_hash(inputs: [Field; 23]) -> Field {
    hash(inputs, 23)
}
fn new() -> Writer<22> {
    {
        let data = [0; 22];
        let offset = 0;
        (data, offset)
    }
}
#[inline_always]
fn stream_serialize(self: BlockHeader, writer: &mut Writer<22>) -> () {
    stream_serialize(self.last_archive, writer);
    stream_serialize(self.state, writer);
    stream_serialize(self.sponge_blob_hash, writer);
    stream_serialize(self.global_variables, writer);
    stream_serialize(self.total_fees, writer);
    stream_serialize(self.total_mana_used, writer);
}
fn finish(self: Writer<22>) -> [Field; 22] {
    assert((self.offset == self.data.len()), "Writer did not write all data");
    self.data
}
fn root_from_sibling_path_with_hasher(leaf: Field, leaf_index: Field, sibling_path: [Field; 30], hasher: fn(Field, Field) -> Field) -> Field {
    let mut node = leaf;
    let indices = to_le_bits(leaf_index);
    for i in 0 .. 30 {
        {
            let _ = if indices[i] {
                (sibling_path[i], node)
            } else {
                (node, sibling_path[i])
            };
            let hash_left = _.0;
            let hash_right = _.1
        };
        node = hasher.0(hash_left, hash_right)
    };
    node
}
#[no_predicates]
fn hash(input: [Field; 12], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
fn less() -> Ordering {
    {
        let result = 0;
        (result)
    }
}
fn greater() -> Ordering {
    {
        let result = 2;
        (result)
    }
}
fn equal() -> Ordering {
    {
        let result = 1;
        (result)
    }
}
unconstrained fn eq(_self: PublicCallRequest, _other: PublicCallRequest) -> bool {
    (((eq(_self.msg_sender, _other.msg_sender) & eq(_self.contract_address, _other.contract_address)) & (_self.is_static_call == _other.is_static_call)) & (_self.calldata_hash == _other.calldata_hash))
}
unconstrained fn empty() -> PublicCallRequest {
    {
        let msg_sender = empty();
        let contract_address = empty();
        let is_static_call = false;
        let calldata_hash = 0;
        (msg_sender, contract_address, is_static_call, calldata_hash)
    }
}
fn assert_empty(self: PublicCallRequest, msg: str<34>) -> () {
    assert(is_empty(self), msg);
}
unconstrained fn eq(self: Field, other: Field) -> bool {
    (self == other)
}
#[inline_always]
unconstrained fn empty() -> Field {
    0
}
fn assert_empty(self: Field, msg: str<34>) -> () {
    assert(is_empty(self), msg);
}
fn is_empty(self: Field) -> bool {
    eq(self, empty())
}
unconstrained fn eq(self: Scoped<L2ToL1Message>, other: Scoped<L2ToL1Message>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
unconstrained fn empty() -> Scoped<L2ToL1Message> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn assert_empty(self: Scoped<L2ToL1Message>, msg: str<34>) -> () {
    assert(is_empty(self), msg);
}
fn is_empty(self: Scoped<L2ToL1Message>) -> bool {
    eq(self, empty())
}
fn eq(_self: EthAddress, _other: EthAddress) -> bool {
    (_self.inner == _other.inner)
}
unconstrained fn assert_max_bit_size(self: Field) -> () {
    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 32);
}
unconstrained fn assert_max_bit_size(self: Field) -> () {
    static_assert((8 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 8);
}
unconstrained fn assert_max_bit_size(self: Field) -> () {
    static_assert((16 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 16);
}
fn items_needed_for_cache_1(sponge_cache_size: u32) -> u32 {
    assert((sponge_cache_size <= 3), "Sponge cache size is greater than permutation size");
    if (sponge_cache_size == 0) {
        1
    } else {
        if (sponge_cache_size == 1) {
            0
        } else {
            ((3 + 1) - sponge_cache_size)
        }
    }
}
fn min(v1: u32, v2: u32) -> u32 {
    if (cmp(v1, v2).0 == 2) {
        v2
    } else {
        v1
    }
}
fn absorb_items(mut sponge: Poseidon2Sponge, input: [Field; 8475], offset: u32, num_items: u32) -> Poseidon2Sponge {
    let mut should_add = true;
    assert((num_items <= 2), "num_items is greater than MAX_ITEMS");
    for i in 0 .. 2 {
        should_add = (should_add & (i != num_items));
        if should_add {
            absorb((&mut sponge), input[(offset + i)]);
        }
    };
    sponge
}
fn absorb_full_permutations(mut sponge: Poseidon2Sponge, input: [Field; 8475], offset: u32, num_permutations: u32) -> Poseidon2Sponge {
    static_assert((sponge.cache.len() == 3), "Sponge cache must be 3 items", r#"{"kind":"string","length":28}"#, false);
    assert((num_permutations <= 2825), "num_permutations is greater than MAX_PERMUTATIONS");
    if (num_permutations != 0) {
        assert((sponge.cache_size == 1), "Sponge must be in cache_size=1");
    };
    let mut should_add = true;
    for i in 0 .. 2825 {
        should_add = (should_add & (i != num_permutations));
        let chunk_base_index = (offset + (i * 3));
        if should_add {
            sponge.cache[1] = input[chunk_base_index];
            sponge.cache[2] = input[(chunk_base_index + 1)];
            for j in 0 .. 3 {
                sponge.state[j] = (sponge.state[j] + sponge.cache[j])
            };
            sponge.state = poseidon2_permutation(sponge.state);
            sponge.cache[0] = input[(chunk_base_index + 2)]
        }
    };
    sponge
}
fn concat(self: &[u8; 32], array2: [u8; 32]) -> [u8; 64] {
    let mut result = [0; 64];
    for i in 0 .. 32 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 32 {
        result[(i + 32)] = array2[i]
    };
    result
}
fn sha256_to_field(bytes_to_hash: [u8; 64]) -> Field {
    let sha256_hashed = digest(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(sha256_hashed);
    hash_in_a_field
}
unconstrained fn concat(self: &[u8; 32], array2: [u8; 32]) -> [u8; 64] {
    let mut result = [0; 64];
    for i in 0 .. 32 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 32 {
        result[(i + 32)] = array2[i]
    };
    result
}
unconstrained fn sha256_to_field(bytes_to_hash: [u8; 64]) -> Field {
    let sha256_hashed = digest(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(sha256_hashed);
    hash_in_a_field
}
fn process_full_blocks(msg: [u8; 148], message_size: u32, initial_state: STATE) -> (STATE, MSG_BLOCK) {
    if is_unconstrained() {
        let num_full_blocks = (message_size / BLOCK_SIZE);
        let mut h = initial_state;
        for i in 0 .. num_full_blocks {
            let msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * i));
            h = sha256_compression(msg_block, h)
        };
        let msg_byte_ptr = (message_size % BLOCK_SIZE);
        let msg_block = if (msg_byte_ptr != 0) {
            let num_full_blocks = (message_size / BLOCK_SIZE);
            let msg_start = (BLOCK_SIZE * num_full_blocks);
            build_msg_block(msg, message_size, msg_start)
        } else {
            [0; 16]
        };
        (h, msg_block)
    } else {
        let num_blocks = (148 / BLOCK_SIZE);
        let mut blocks = [[0; 16]; 3];
        let mut states = [initial_state; 3];
        let first_partially_filled_block_index = if (148 >= BLOCK_SIZE) {
            (message_size / BLOCK_SIZE)
        } else {
            0
        };
        for i in 0 .. num_blocks {
            let msg_start = (BLOCK_SIZE * i);
            let new_msg_block = build_msg_block(msg, message_size, msg_start);
            blocks[i] = new_msg_block;
            states[(i + 1)] = sha256_compression(new_msg_block, states[i])
        };
        if ((148 % BLOCK_SIZE) != 0) {
            let new_msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * num_blocks));
            blocks[num_blocks] = new_msg_block
        };
        (states[first_partially_filled_block_index], blocks[first_partially_filled_block_index])
    }
}
fn finalize_sha256_blocks(message_size: u32, mut h: STATE, mut msg_block: MSG_BLOCK) -> HASH {
    let msg_byte_ptr = (message_size % BLOCK_SIZE);
    {
        let _ = add_padding_byte_and_compress_if_needed(msg_block, msg_byte_ptr, h);
        let h = _.0;
        let mut msg_block = _.1
    };
    msg_block = attach_len_to_msg_block(msg_block, message_size);
    hash_final_block(msg_block, h)
}
unconstrained fn process_full_blocks(msg: [u8; 148], message_size: u32, initial_state: STATE) -> (STATE, MSG_BLOCK) {
    if is_unconstrained() {
        let num_full_blocks = (message_size / BLOCK_SIZE);
        let mut h = initial_state;
        for i in 0 .. num_full_blocks {
            let msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * i));
            h = sha256_compression(msg_block, h)
        };
        let msg_byte_ptr = (message_size % BLOCK_SIZE);
        let msg_block = if (msg_byte_ptr != 0) {
            let num_full_blocks = (message_size / BLOCK_SIZE);
            let msg_start = (BLOCK_SIZE * num_full_blocks);
            build_msg_block(msg, message_size, msg_start)
        } else {
            [0; 16]
        };
        (h, msg_block)
    } else {
        let num_blocks = (148 / BLOCK_SIZE);
        let mut blocks = [[0; 16]; 3];
        let mut states = [initial_state; 3];
        let first_partially_filled_block_index = if (148 >= BLOCK_SIZE) {
            (message_size / BLOCK_SIZE)
        } else {
            0
        };
        for i in 0 .. num_blocks {
            let msg_start = (BLOCK_SIZE * i);
            let new_msg_block = build_msg_block(msg, message_size, msg_start);
            blocks[i] = new_msg_block;
            states[(i + 1)] = sha256_compression(new_msg_block, states[i])
        };
        if ((148 % BLOCK_SIZE) != 0) {
            let new_msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * num_blocks));
            blocks[num_blocks] = new_msg_block
        };
        (states[first_partially_filled_block_index], blocks[first_partially_filled_block_index])
    }
}
unconstrained fn finalize_sha256_blocks(message_size: u32, mut h: STATE, mut msg_block: MSG_BLOCK) -> HASH {
    let msg_byte_ptr = (message_size % BLOCK_SIZE);
    {
        let _ = add_padding_byte_and_compress_if_needed(msg_block, msg_byte_ptr, h);
        let h = _.0;
        let mut msg_block = _.1
    };
    msg_block = attach_len_to_msg_block(msg_block, message_size);
    hash_final_block(msg_block, h)
}
fn hash_internal(input: [Field; 3023], in_len: u32) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = ((in_len as Field) * two_pow_64);
    let mut state = [0; 4];
    state[RATE] = iv;
    if is_unconstrained() {
        for i in 0 .. (in_len / RATE) {
            state[0] = (state[0] + input[(i * RATE)]);
            state[1] = (state[1] + input[((i * RATE) + 1)]);
            state[2] = (state[2] + input[((i * RATE) + 2)]);
            state = poseidon2_permutation(state)
        };
        let num_extra_fields = (in_len % RATE);
        if (num_extra_fields != 0) {
            let remainder_start = (in_len - num_extra_fields);
            state[0] = (state[0] + input[remainder_start]);
            if (num_extra_fields > 1) {
                state[1] = (state[1] + input[(remainder_start + 1)])
            }
        }
    } else {
        let mut states = [[0; 4]; 1008];
        states[0] = state;
        for chunk_idx in 0 .. (3023 / RATE) {
            for i in 0 .. RATE {
                state[i] = (state[i] + input[((chunk_idx * RATE) + i)])
            };
            state = poseidon2_permutation(state);
            states[(chunk_idx + 1)] = state
        };
        let first_partially_filled_chunk = (in_len / RATE);
        state = states[first_partially_filled_chunk];
        let remainder_start = ((in_len / RATE) * RATE);
        for j in 0 .. RATE {
            let idx = (remainder_start + j);
            if (idx < in_len) {
                state[j] = (state[j] + input[idx])
            }
        }
    };
    if ((in_len == 0) | ((in_len % RATE) != 0)) {
        state = poseidon2_permutation(state)
    };
    state[0]
}
fn hash_internal(input: [Field; 2785], in_len: u32) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = ((in_len as Field) * two_pow_64);
    let mut state = [0; 4];
    state[RATE] = iv;
    if is_unconstrained() {
        for i in 0 .. (in_len / RATE) {
            state[0] = (state[0] + input[(i * RATE)]);
            state[1] = (state[1] + input[((i * RATE) + 1)]);
            state[2] = (state[2] + input[((i * RATE) + 2)]);
            state = poseidon2_permutation(state)
        };
        let num_extra_fields = (in_len % RATE);
        if (num_extra_fields != 0) {
            let remainder_start = (in_len - num_extra_fields);
            state[0] = (state[0] + input[remainder_start]);
            if (num_extra_fields > 1) {
                state[1] = (state[1] + input[(remainder_start + 1)])
            }
        }
    } else {
        let mut states = [[0; 4]; 929];
        states[0] = state;
        for chunk_idx in 0 .. (2785 / RATE) {
            for i in 0 .. RATE {
                state[i] = (state[i] + input[((chunk_idx * RATE) + i)])
            };
            state = poseidon2_permutation(state);
            states[(chunk_idx + 1)] = state
        };
        let first_partially_filled_chunk = (in_len / RATE);
        state = states[first_partially_filled_chunk];
        let remainder_start = ((in_len / RATE) * RATE);
        for j in 0 .. RATE {
            let idx = (remainder_start + j);
            if (idx < in_len) {
                state[j] = (state[j] + input[idx])
            }
        }
    };
    if ((in_len == 0) | ((in_len % RATE) != 0)) {
        state = poseidon2_permutation(state)
    };
    state[0]
}
#[inline_always]
fn stream_serialize(self: BlockHeader, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.last_archive, writer);
    stream_serialize(self.state, writer);
    stream_serialize(self.sponge_blob_hash, writer);
    stream_serialize(self.global_variables, writer);
    stream_serialize(self.total_fees, writer);
    stream_serialize(self.total_mana_used, writer);
}
#[inline_always]
fn stream_serialize(self: TxContext, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.chain_id, writer);
    stream_serialize(self.version, writer);
    stream_serialize(self.gas_settings, writer);
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<2784>) -> () {
    write(writer, self);
}
#[inline_always]
fn stream_serialize(self: [Field; 64], writer: &mut Writer<2784>) -> () {
    for i in 0 .. 64 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [Scoped<L2ToL1Message>; 8], writer: &mut Writer<2784>) -> () {
    for i in 0 .. 8 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [Log<16>; 64], writer: &mut Writer<2784>) -> () {
    for i in 0 .. 64 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [Scoped<LogHash>; 1], writer: &mut Writer<2784>) -> () {
    for i in 0 .. 1 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [PublicCallRequest; 32], writer: &mut Writer<2784>) -> () {
    for i in 0 .. 32 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: bool, writer: &mut Writer<2784>) -> () {
    write(writer, (self as Field));
}
#[inline_always]
fn stream_serialize(self: u32, writer: &mut Writer<2784>) -> () {
    write(writer, (self as Field));
}
fn write(self: &mut Writer<2784>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}
#[inline_always]
fn stream_serialize(self: PrivateToPublicKernelCircuitPublicInputs, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.constants, writer);
    stream_serialize(self.non_revertible_accumulated_data, writer);
    stream_serialize(self.revertible_accumulated_data, writer);
    stream_serialize(self.public_teardown_call_request, writer);
    stream_serialize(self.gas_used, writer);
    stream_serialize(self.fee_payer, writer);
    stream_serialize(self.expiration_timestamp, writer);
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<2785>) -> () {
    write(writer, self);
}
fn to_le_bits(self: Field) -> [bool; 7] {
    let bits = __to_le_bits(self);
    if (!is_unconstrained()) {
        let p = @[true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, false, false, true, false, false, true, true, false, true, false, true, true, true, true, true, false, false, false, false, true, true, true, true, true, false, false, false, false, true, false, true, false, false, false, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, true, true, false, false, true, true, true, true, false, false, false, false, true, false, false, true, false, false, false, false, true, false, true, true, true, true, true, false, false, true, true, false, false, false, false, false, true, false, true, false, false, true, false, true, true, true, false, true, false, false, false, false, true, true, false, true, false, true, false, false, false, false, false, false, true, true, false, false, false, false, false, false, true, false, true, true, false, true, true, false, true, true, false, true, false, false, false, true, false, false, false, false, false, true, false, true, false, false, false, false, true, true, true, false, true, true, false, false, true, false, true, false, false, false, false, false, false, false, true, false, true, true, false, false, false, true, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, false, true, true, true, false, false, true, false, false, false, true, false, false, true, true, false, false, false, false, false, true, true];
        assert((bits.len() <= p.len()));
        let mut ok = (bits.len() != p.len());
        for i in 0 .. 7 {
            if (!ok) {
                if (bits[((7 - 1) - i)] != p[((7 - 1) - i)]) {
                    assert(p[((7 - 1) - i)]);
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bits
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
#[no_predicates]
unconstrained fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn serialize(self: ProtocolContracts) -> [Field; 11] {
    let mut writer = new();
    stream_serialize(self, (&mut writer));
    finish(writer)
}
#[no_predicates]
fn hash(input: [Field; 23], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[inline_always]
fn stream_serialize(self: AppendOnlyTreeSnapshot, writer: &mut Writer<22>) -> () {
    stream_serialize(self.root, writer);
    stream_serialize(self.next_available_leaf_index, writer);
}
#[inline_always]
fn stream_serialize(self: StateReference, writer: &mut Writer<22>) -> () {
    stream_serialize(self.l1_to_l2_message_tree, writer);
    stream_serialize(self.partial, writer);
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<22>) -> () {
    write(writer, self);
}
#[inline_always]
fn stream_serialize(self: GlobalVariables, writer: &mut Writer<22>) -> () {
    stream_serialize(self.chain_id, writer);
    stream_serialize(self.version, writer);
    stream_serialize(self.block_number, writer);
    stream_serialize(self.slot_number, writer);
    stream_serialize(self.timestamp, writer);
    stream_serialize(self.coinbase, writer);
    stream_serialize(self.fee_recipient, writer);
    stream_serialize(self.gas_fees, writer);
}
fn to_le_bits(self: Field) -> [bool; 30] {
    let bits = __to_le_bits(self);
    if (!is_unconstrained()) {
        let p = @[true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, false, false, true, false, false, true, true, false, true, false, true, true, true, true, true, false, false, false, false, true, true, true, true, true, false, false, false, false, true, false, true, false, false, false, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, true, true, false, false, true, true, true, true, false, false, false, false, true, false, false, true, false, false, false, false, true, false, true, true, true, true, true, false, false, true, true, false, false, false, false, false, true, false, true, false, false, true, false, true, true, true, false, true, false, false, false, false, true, true, false, true, false, true, false, false, false, false, false, false, true, true, false, false, false, false, false, false, true, false, true, true, false, true, true, false, true, true, false, true, false, false, false, true, false, false, false, false, false, true, false, true, false, false, false, false, true, true, true, false, true, true, false, false, true, false, true, false, false, false, false, false, false, false, true, false, true, true, false, false, false, true, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, false, true, true, true, false, false, true, false, false, false, true, false, false, true, true, false, false, false, false, false, true, true];
        assert((bits.len() <= p.len()));
        let mut ok = (bits.len() != p.len());
        for i in 0 .. 30 {
            if (!ok) {
                if (bits[((30 - 1) - i)] != p[((30 - 1) - i)]) {
                    assert(p[((30 - 1) - i)]);
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bits
}
fn hash_internal(input: [Field; 12], in_len: u32) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = ((in_len as Field) * two_pow_64);
    let mut state = [0; 4];
    state[RATE] = iv;
    if is_unconstrained() {
        for i in 0 .. (in_len / RATE) {
            state[0] = (state[0] + input[(i * RATE)]);
            state[1] = (state[1] + input[((i * RATE) + 1)]);
            state[2] = (state[2] + input[((i * RATE) + 2)]);
            state = poseidon2_permutation(state)
        };
        let num_extra_fields = (in_len % RATE);
        if (num_extra_fields != 0) {
            let remainder_start = (in_len - num_extra_fields);
            state[0] = (state[0] + input[remainder_start]);
            if (num_extra_fields > 1) {
                state[1] = (state[1] + input[(remainder_start + 1)])
            }
        }
    } else {
        let mut states = [[0; 4]; 5];
        states[0] = state;
        for chunk_idx in 0 .. (12 / RATE) {
            for i in 0 .. RATE {
                state[i] = (state[i] + input[((chunk_idx * RATE) + i)])
            };
            state = poseidon2_permutation(state);
            states[(chunk_idx + 1)] = state
        };
        let first_partially_filled_chunk = (in_len / RATE);
        state = states[first_partially_filled_chunk];
        let remainder_start = ((in_len / RATE) * RATE);
        for j in 0 .. RATE {
            let idx = (remainder_start + j);
            if (idx < in_len) {
                state[j] = (state[j] + input[idx])
            }
        }
    };
    if ((in_len == 0) | ((in_len % RATE) != 0)) {
        state = poseidon2_permutation(state)
    };
    state[0]
}
unconstrained fn eq(_self: AztecAddress, _other: AztecAddress) -> bool {
    (_self.inner == _other.inner)
}
unconstrained fn empty() -> AztecAddress {
    {
        let inner = 0;
        (inner)
    }
}
#[inline_always]
fn empty() -> Field {
    0
}
unconstrained fn eq(_self: L2ToL1Message, _other: L2ToL1Message) -> bool {
    (eq(_self.recipient, _other.recipient) & (_self.content == _other.content))
}
unconstrained fn empty() -> L2ToL1Message {
    {
        let recipient = empty();
        let content = 0;
        (recipient, content)
    }
}
fn is_empty(self: Scoped<L2ToL1Message>) -> bool {
    eq(self, empty())
}
fn empty() -> Scoped<L2ToL1Message> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn cmp(self: u32, other: u32) -> Ordering {
    if (self < other) {
        less()
    } else {
        if (self > other) {
            greater()
        } else {
            equal()
        }
    }
}
fn absorb(self: &mut Poseidon2Sponge, input: Field) -> () {
    assert((!(*self).squeeze_mode));
    if ((*self).cache_size == RATE) {
        perform_duplex(self);
        (*self).cache[0] = input;
        (*self).cache_size = 1
    } else {
        (*self).cache[(*self).cache_size] = input;
        (*self).cache_size = ((*self).cache_size + 1)
    }
}
fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
}
#[no_predicates]
fn digest(msg: [u8; 64]) -> HASH {
    sha256_var(msg, 64)
}
#[no_predicates]
unconstrained fn digest(msg: [u8; 64]) -> HASH {
    sha256_var(msg, 64)
}
fn build_msg_block(msg: [u8; 148], message_size: u32, msg_start: u32) -> MSG_BLOCK {
    let msg_block = {
        unsafe { build_msg_block_helper(msg, message_size, msg_start) }
    };
    if (!is_unconstrained()) {
        let mut msg_end = (msg_start + BLOCK_SIZE);
        let max_read_index = min(message_size, msg_end);
        let mut msg_item = 0;
        for k in msg_start ..= msg_end {
            if ((k != msg_start) & ((k % INT_SIZE) == 0)) {
                let msg_block_index = (((k - msg_start) / INT_SIZE) - 1);
                assert(((msg_block[msg_block_index] as Field) == msg_item));
                msg_item = 0
            };
            let msg_byte = if (k < max_read_index) {
                msg[k]
            } else {
                0
            };
            msg_item = ((msg_item * (TWO_POW_8 as Field)) + (msg_byte as Field))
        }
    };
    msg_block
}
fn add_padding_byte_and_compress_if_needed(mut msg_block: MSG_BLOCK, msg_byte_ptr: BLOCK_BYTE_PTR, h: STATE) -> (STATE, MSG_BLOCK) {
    let index = (msg_byte_ptr / INT_SIZE);
    msg_block[index] = (msg_block[index] + PADDING_BIT_TABLE[(msg_byte_ptr % INT_SIZE)]);
    if (msg_byte_ptr >= MSG_SIZE_PTR) {
        let h = sha256_compression(msg_block, h);
        let msg_block = [0; 16];
        (h, msg_block)
    } else {
        (h, msg_block)
    }
}
fn attach_len_to_msg_block(mut msg_block: MSG_BLOCK, message_size: u32) -> MSG_BLOCK {
    {
        let _ = {
            unsafe { encode_len(message_size) }
        };
        let lo = _.0;
        let hi = _.1
    };
    assert(((8 * (message_size as Field)) == ((lo as Field) + ((hi as Field) * TWO_POW_32))));
    msg_block[INT_SIZE_PTR] = hi;
    msg_block[(INT_SIZE_PTR + 1)] = lo;
    msg_block
}
fn hash_final_block(msg_block: MSG_BLOCK, mut state: STATE) -> HASH {
    state = sha256_compression(msg_block, state);
    let mut out_h = [0; 32];
    for j in 0 .. 8 {
        let h_bytes = to_be_bytes((state[j] as Field));
        for k in 0 .. 4 {
            out_h[((4 * j) + k)] = h_bytes[k]
        }
    };
    out_h
}
unconstrained fn build_msg_block(msg: [u8; 148], message_size: u32, msg_start: u32) -> MSG_BLOCK {
    let msg_block = {
        build_msg_block_helper(msg, message_size, msg_start)
    };
    if (!is_unconstrained()) {
        let mut msg_end = (msg_start + BLOCK_SIZE);
        let max_read_index = min(message_size, msg_end);
        let mut msg_item = 0;
        for k in msg_start ..= msg_end {
            if ((k != msg_start) & ((k % INT_SIZE) == 0)) {
                let msg_block_index = (((k - msg_start) / INT_SIZE) - 1);
                assert(((msg_block[msg_block_index] as Field) == msg_item));
                msg_item = 0
            };
            let msg_byte = if (k < max_read_index) {
                msg[k]
            } else {
                0
            };
            msg_item = ((msg_item * (TWO_POW_8 as Field)) + (msg_byte as Field))
        }
    };
    msg_block
}
unconstrained fn add_padding_byte_and_compress_if_needed(mut msg_block: MSG_BLOCK, msg_byte_ptr: BLOCK_BYTE_PTR, h: STATE) -> (STATE, MSG_BLOCK) {
    let index = (msg_byte_ptr / INT_SIZE);
    msg_block[index] = (msg_block[index] + PADDING_BIT_TABLE[(msg_byte_ptr % INT_SIZE)]);
    if (msg_byte_ptr >= MSG_SIZE_PTR) {
        let h = sha256_compression(msg_block, h);
        let msg_block = [0; 16];
        (h, msg_block)
    } else {
        (h, msg_block)
    }
}
unconstrained fn attach_len_to_msg_block(mut msg_block: MSG_BLOCK, message_size: u32) -> MSG_BLOCK {
    {
        let _ = {
            encode_len(message_size)
        };
        let lo = _.0;
        let hi = _.1
    };
    assert(((8 * (message_size as Field)) == ((lo as Field) + ((hi as Field) * TWO_POW_32))));
    msg_block[INT_SIZE_PTR] = hi;
    msg_block[(INT_SIZE_PTR + 1)] = lo;
    msg_block
}
unconstrained fn hash_final_block(msg_block: MSG_BLOCK, mut state: STATE) -> HASH {
    state = sha256_compression(msg_block, state);
    let mut out_h = [0; 32];
    for j in 0 .. 8 {
        let h_bytes = to_be_bytes((state[j] as Field));
        for k in 0 .. 4 {
            out_h[((4 * j) + k)] = h_bytes[k]
        }
    };
    out_h
}
#[inline_always]
fn stream_serialize(self: AppendOnlyTreeSnapshot, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.root, writer);
    stream_serialize(self.next_available_leaf_index, writer);
}
#[inline_always]
fn stream_serialize(self: StateReference, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.l1_to_l2_message_tree, writer);
    stream_serialize(self.partial, writer);
}
#[inline_always]
fn stream_serialize(self: GlobalVariables, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.chain_id, writer);
    stream_serialize(self.version, writer);
    stream_serialize(self.block_number, writer);
    stream_serialize(self.slot_number, writer);
    stream_serialize(self.timestamp, writer);
    stream_serialize(self.coinbase, writer);
    stream_serialize(self.fee_recipient, writer);
    stream_serialize(self.gas_fees, writer);
}
#[inline_always]
fn stream_serialize(self: GasSettings, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.gas_limits, writer);
    stream_serialize(self.teardown_gas_limits, writer);
    stream_serialize(self.max_fees_per_gas, writer);
    stream_serialize(self.max_priority_fees_per_gas, writer);
}
#[inline_always]
fn stream_serialize(self: Scoped<L2ToL1Message>, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.inner, writer);
    stream_serialize(self.contract_address, writer);
}
#[inline_always]
fn stream_serialize(self: Log<16>, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.fields, writer);
    stream_serialize(self.length, writer);
}
#[inline_always]
fn stream_serialize(self: Scoped<LogHash>, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.inner, writer);
    stream_serialize(self.contract_address, writer);
}
#[inline_always]
fn stream_serialize(self: TxConstantData, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.anchor_block_header, writer);
    stream_serialize(self.tx_context, writer);
    stream_serialize(self.vk_tree_root, writer);
    stream_serialize(self.protocol_contracts_hash, writer);
}
#[inline_always]
fn stream_serialize(self: PrivateToPublicAccumulatedData, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.note_hashes, writer);
    stream_serialize(self.nullifiers, writer);
    stream_serialize(self.l2_to_l1_msgs, writer);
    stream_serialize(self.private_logs, writer);
    stream_serialize(self.contract_class_logs_hashes, writer);
    stream_serialize(self.public_call_requests, writer);
}
#[inline_always]
fn stream_serialize(self: PublicCallRequest, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.msg_sender, writer);
    stream_serialize(self.contract_address, writer);
    stream_serialize(self.is_static_call, writer);
    stream_serialize(self.calldata_hash, writer);
}
#[inline_always]
fn stream_serialize(self: Gas, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.da_gas, writer);
    stream_serialize(self.l2_gas, writer);
}
#[inline_always]
fn stream_serialize(self: AztecAddress, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: u64, writer: &mut Writer<2785>) -> () {
    write(writer, (self as Field));
}
fn write(self: &mut Writer<2785>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}
fn concat(self: &[Field; 1], array2: [Field; 2]) -> [Field; 3] {
    let mut result = [0; 3];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 2 {
        result[(i + 1)] = array2[i]
    };
    result
}
fn poseidon2_hash(inputs: [Field; 3]) -> Field {
    hash(inputs, 3)
}
unconstrained fn concat(self: &[Field; 1], array2: [Field; 2]) -> [Field; 3] {
    let mut result = [0; 3];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 2 {
        result[(i + 1)] = array2[i]
    };
    result
}
#[inline_always]
unconstrained fn to_field(self: u32) -> Field {
    (self as Field)
}
unconstrained fn poseidon2_hash(inputs: [Field; 3]) -> Field {
    hash(inputs, 3)
}
fn new() -> Writer<11> {
    {
        let data = [0; 11];
        let offset = 0;
        (data, offset)
    }
}
#[inline_always]
fn stream_serialize(self: ProtocolContracts, writer: &mut Writer<11>) -> () {
    stream_serialize(self.derived_addresses, writer);
}
fn finish(self: Writer<11>) -> [Field; 11] {
    assert((self.offset == self.data.len()), "Writer did not write all data");
    self.data
}
fn hash_internal(input: [Field; 23], in_len: u32) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = ((in_len as Field) * two_pow_64);
    let mut state = [0; 4];
    state[RATE] = iv;
    if is_unconstrained() {
        for i in 0 .. (in_len / RATE) {
            state[0] = (state[0] + input[(i * RATE)]);
            state[1] = (state[1] + input[((i * RATE) + 1)]);
            state[2] = (state[2] + input[((i * RATE) + 2)]);
            state = poseidon2_permutation(state)
        };
        let num_extra_fields = (in_len % RATE);
        if (num_extra_fields != 0) {
            let remainder_start = (in_len - num_extra_fields);
            state[0] = (state[0] + input[remainder_start]);
            if (num_extra_fields > 1) {
                state[1] = (state[1] + input[(remainder_start + 1)])
            }
        }
    } else {
        let mut states = [[0; 4]; 8];
        states[0] = state;
        for chunk_idx in 0 .. (23 / RATE) {
            for i in 0 .. RATE {
                state[i] = (state[i] + input[((chunk_idx * RATE) + i)])
            };
            state = poseidon2_permutation(state);
            states[(chunk_idx + 1)] = state
        };
        let first_partially_filled_chunk = (in_len / RATE);
        state = states[first_partially_filled_chunk];
        let remainder_start = ((in_len / RATE) * RATE);
        for j in 0 .. RATE {
            let idx = (remainder_start + j);
            if (idx < in_len) {
                state[j] = (state[j] + input[idx])
            }
        }
    };
    if ((in_len == 0) | ((in_len % RATE) != 0)) {
        state = poseidon2_permutation(state)
    };
    state[0]
}
#[inline_always]
fn stream_serialize(self: PartialStateReference, writer: &mut Writer<22>) -> () {
    stream_serialize(self.note_hash_tree, writer);
    stream_serialize(self.nullifier_tree, writer);
    stream_serialize(self.public_data_tree, writer);
}
fn write(self: &mut Writer<22>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}
#[inline_always]
fn stream_serialize(self: u32, writer: &mut Writer<22>) -> () {
    write(writer, (self as Field));
}
#[inline_always]
fn stream_serialize(self: u64, writer: &mut Writer<22>) -> () {
    write(writer, (self as Field));
}
#[inline_always]
fn stream_serialize(self: EthAddress, writer: &mut Writer<22>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: AztecAddress, writer: &mut Writer<22>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: GasFees, writer: &mut Writer<22>) -> () {
    stream_serialize(self.fee_per_da_gas, writer);
    stream_serialize(self.fee_per_l2_gas, writer);
}
unconstrained fn eq(_self: EthAddress, _other: EthAddress) -> bool {
    (_self.inner == _other.inner)
}
unconstrained fn empty() -> EthAddress {
    {
        let inner = 0;
        (inner)
    }
}
fn perform_duplex(self: &mut Poseidon2Sponge) -> () {
    for i in 0 .. RATE {
        if (i < (*self).cache_size) {
            (*self).state[i] = ((*self).state[i] + (*self).cache[i])
        }
    };
    (*self).state = poseidon2_permutation((*self).state)
}
fn sha256_var(msg: [u8; 64], message_size: u32) -> HASH {
    assert((message_size <= 64));
    {
        let _ = process_full_blocks(msg, message_size, INITIAL_STATE);
        let h = _.0;
        let msg_block = _.1
    };
    finalize_sha256_blocks(message_size, h, msg_block)
}
unconstrained fn sha256_var(msg: [u8; 64], message_size: u32) -> HASH {
    assert((message_size <= 64));
    {
        let _ = process_full_blocks(msg, message_size, INITIAL_STATE);
        let h = _.0;
        let msg_block = _.1
    };
    finalize_sha256_blocks(message_size, h, msg_block)
}
unconstrained fn build_msg_block_helper(msg: [u8; 148], message_size: u32, msg_start: u32) -> MSG_BLOCK {
    let mut msg_block = [0; 16];
    let block_input = if (message_size < msg_start) {
        0
    } else {
        if (message_size < (msg_start + BLOCK_SIZE)) {
            (message_size - msg_start)
        } else {
            BLOCK_SIZE
        }
    };
    let int_input = (((block_input + INT_SIZE) - 1) / INT_SIZE);
    for i in 0 .. int_input {
        let mut msg_item = 0;
        for j in 0 .. INT_SIZE {
            let k = ((i * INT_SIZE) + j);
            let msg_byte = if (k < block_input) {
                msg[(msg_start + k)]
            } else {
                0
            };
            msg_item = ((msg_item << 8) + (msg_byte as u32))
        };
        msg_block[i] = msg_item
    };
    msg_block
}
unconstrained fn encode_len(message_size: u32) -> (u32, u32) {
    let len = (8 * (message_size as u64));
    let lo = (len & 4294967295);
    let hi = ((len >> 32) & 4294967295);
    ((lo as u32), (hi as u32))
}
fn to_be_bytes(self: Field) -> [u8; 4] {
    static_assert((4 <= @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48].len()), "N must be less than or equal to modulus_le_bytes().len()", r#"{"kind":"string","length":56}"#, false);
    let bytes = to_be_radix(self, 256);
    if (!is_unconstrained()) {
        let p = @[48, 100, 78, 114, 225, 49, 160, 41, 184, 80, 69, 182, 129, 129, 88, 93, 40, 51, 232, 72, 121, 185, 112, 145, 67, 225, 245, 147, 240, 0, 0, 1];
        assert((bytes.len() <= p.len()));
        let mut ok = (bytes.len() != p.len());
        for i in 0 .. 4 {
            if (!ok) {
                if (bytes[i] != p[i]) {
                    assert((bytes[i] < p[i]));
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bytes
}
unconstrained fn min(v1: u32, v2: u32) -> u32 {
    if (cmp(v1, v2).0 == 2) {
        v2
    } else {
        v1
    }
}
unconstrained fn to_be_bytes(self: Field) -> [u8; 4] {
    static_assert((4 <= @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48].len()), "N must be less than or equal to modulus_le_bytes().len()", r#"{"kind":"string","length":56}"#, false);
    let bytes = to_be_radix(self, 256);
    if (!is_unconstrained()) {
        let p = @[48, 100, 78, 114, 225, 49, 160, 41, 184, 80, 69, 182, 129, 129, 88, 93, 40, 51, 232, 72, 121, 185, 112, 145, 67, 225, 245, 147, 240, 0, 0, 1];
        assert((bytes.len() <= p.len()));
        let mut ok = (bytes.len() != p.len());
        for i in 0 .. 4 {
            if (!ok) {
                if (bytes[i] != p[i]) {
                    assert((bytes[i] < p[i]));
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bytes
}
#[inline_always]
fn stream_serialize(self: PartialStateReference, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.note_hash_tree, writer);
    stream_serialize(self.nullifier_tree, writer);
    stream_serialize(self.public_data_tree, writer);
}
#[inline_always]
fn stream_serialize(self: EthAddress, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: GasFees, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.fee_per_da_gas, writer);
    stream_serialize(self.fee_per_l2_gas, writer);
}
#[inline_always]
fn stream_serialize(self: L2ToL1Message, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.recipient, writer);
    stream_serialize(self.content, writer);
}
#[inline_always]
fn stream_serialize(self: [Field; 16], writer: &mut Writer<2784>) -> () {
    for i in 0 .. 16 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: LogHash, writer: &mut Writer<2784>) -> () {
    stream_serialize(self.value, writer);
    stream_serialize(self.length, writer);
}
#[inline_always]
fn stream_serialize(self: BlockHeader, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.last_archive, writer);
    stream_serialize(self.state, writer);
    stream_serialize(self.sponge_blob_hash, writer);
    stream_serialize(self.global_variables, writer);
    stream_serialize(self.total_fees, writer);
    stream_serialize(self.total_mana_used, writer);
}
#[inline_always]
fn stream_serialize(self: TxContext, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.chain_id, writer);
    stream_serialize(self.version, writer);
    stream_serialize(self.gas_settings, writer);
}
#[inline_always]
fn stream_serialize(self: [Field; 64], writer: &mut Writer<2785>) -> () {
    for i in 0 .. 64 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [Scoped<L2ToL1Message>; 8], writer: &mut Writer<2785>) -> () {
    for i in 0 .. 8 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [Log<16>; 64], writer: &mut Writer<2785>) -> () {
    for i in 0 .. 64 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [Scoped<LogHash>; 1], writer: &mut Writer<2785>) -> () {
    for i in 0 .. 1 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: [PublicCallRequest; 32], writer: &mut Writer<2785>) -> () {
    for i in 0 .. 32 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: bool, writer: &mut Writer<2785>) -> () {
    write(writer, (self as Field));
}
#[inline_always]
fn stream_serialize(self: u32, writer: &mut Writer<2785>) -> () {
    write(writer, (self as Field));
}
#[no_predicates]
fn hash(input: [Field; 3], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[no_predicates]
unconstrained fn hash(input: [Field; 3], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[inline_always]
fn stream_serialize(self: [AztecAddress; 11], writer: &mut Writer<11>) -> () {
    for i in 0 .. 11 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: u128, writer: &mut Writer<22>) -> () {
    write(writer, (self as Field));
}
fn process_full_blocks(msg: [u8; 64], message_size: u32, initial_state: STATE) -> (STATE, MSG_BLOCK) {
    if is_unconstrained() {
        let num_full_blocks = (message_size / BLOCK_SIZE);
        let mut h = initial_state;
        for i in 0 .. num_full_blocks {
            let msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * i));
            h = sha256_compression(msg_block, h)
        };
        let msg_byte_ptr = (message_size % BLOCK_SIZE);
        let msg_block = if (msg_byte_ptr != 0) {
            let num_full_blocks = (message_size / BLOCK_SIZE);
            let msg_start = (BLOCK_SIZE * num_full_blocks);
            build_msg_block(msg, message_size, msg_start)
        } else {
            [0; 16]
        };
        (h, msg_block)
    } else {
        let num_blocks = (64 / BLOCK_SIZE);
        let mut blocks = [[0; 16]; 2];
        let mut states = [initial_state; 2];
        let first_partially_filled_block_index = if (64 >= BLOCK_SIZE) {
            (message_size / BLOCK_SIZE)
        } else {
            0
        };
        for i in 0 .. num_blocks {
            let msg_start = (BLOCK_SIZE * i);
            let new_msg_block = build_msg_block(msg, message_size, msg_start);
            blocks[i] = new_msg_block;
            states[(i + 1)] = sha256_compression(new_msg_block, states[i])
        };
        if ((64 % BLOCK_SIZE) != 0) {
            let new_msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * num_blocks));
            blocks[num_blocks] = new_msg_block
        };
        (states[first_partially_filled_block_index], blocks[first_partially_filled_block_index])
    }
}
unconstrained fn process_full_blocks(msg: [u8; 64], message_size: u32, initial_state: STATE) -> (STATE, MSG_BLOCK) {
    if is_unconstrained() {
        let num_full_blocks = (message_size / BLOCK_SIZE);
        let mut h = initial_state;
        for i in 0 .. num_full_blocks {
            let msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * i));
            h = sha256_compression(msg_block, h)
        };
        let msg_byte_ptr = (message_size % BLOCK_SIZE);
        let msg_block = if (msg_byte_ptr != 0) {
            let num_full_blocks = (message_size / BLOCK_SIZE);
            let msg_start = (BLOCK_SIZE * num_full_blocks);
            build_msg_block(msg, message_size, msg_start)
        } else {
            [0; 16]
        };
        (h, msg_block)
    } else {
        let num_blocks = (64 / BLOCK_SIZE);
        let mut blocks = [[0; 16]; 2];
        let mut states = [initial_state; 2];
        let first_partially_filled_block_index = if (64 >= BLOCK_SIZE) {
            (message_size / BLOCK_SIZE)
        } else {
            0
        };
        for i in 0 .. num_blocks {
            let msg_start = (BLOCK_SIZE * i);
            let new_msg_block = build_msg_block(msg, message_size, msg_start);
            blocks[i] = new_msg_block;
            states[(i + 1)] = sha256_compression(new_msg_block, states[i])
        };
        if ((64 % BLOCK_SIZE) != 0) {
            let new_msg_block = build_msg_block(msg, message_size, (BLOCK_SIZE * num_blocks));
            blocks[num_blocks] = new_msg_block
        };
        (states[first_partially_filled_block_index], blocks[first_partially_filled_block_index])
    }
}
fn to_be_radix(self: Field, radix: u32) -> [u8; 4] {
    if (!is_unconstrained()) {
        static_assert((1 < radix), "radix must be greater than 1", r#"{"kind":"string","length":28}"#, false);
        static_assert((radix <= 256), "radix must be less than or equal to 256", r#"{"kind":"string","length":39}"#, false);
        static_assert(((radix & (radix - 1)) == 0), "radix must be a power of 2", r#"{"kind":"string","length":26}"#, false);
    };
    __to_be_radix(self, radix)
}
unconstrained fn cmp(self: u32, other: u32) -> Ordering {
    if (self < other) {
        less()
    } else {
        if (self > other) {
            greater()
        } else {
            equal()
        }
    }
}
unconstrained fn to_be_radix(self: Field, radix: u32) -> [u8; 4] {
    if (!is_unconstrained()) {
        static_assert((1 < radix), "radix must be greater than 1", r#"{"kind":"string","length":28}"#, false);
        static_assert((radix <= 256), "radix must be less than or equal to 256", r#"{"kind":"string","length":39}"#, false);
        static_assert(((radix & (radix - 1)) == 0), "radix must be a power of 2", r#"{"kind":"string","length":26}"#, false);
    };
    __to_be_radix(self, radix)
}
#[inline_always]
fn stream_serialize(self: u128, writer: &mut Writer<2784>) -> () {
    write(writer, (self as Field));
}
#[inline_always]
fn stream_serialize(self: AppendOnlyTreeSnapshot, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.root, writer);
    stream_serialize(self.next_available_leaf_index, writer);
}
#[inline_always]
fn stream_serialize(self: StateReference, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.l1_to_l2_message_tree, writer);
    stream_serialize(self.partial, writer);
}
#[inline_always]
fn stream_serialize(self: GlobalVariables, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.chain_id, writer);
    stream_serialize(self.version, writer);
    stream_serialize(self.block_number, writer);
    stream_serialize(self.slot_number, writer);
    stream_serialize(self.timestamp, writer);
    stream_serialize(self.coinbase, writer);
    stream_serialize(self.fee_recipient, writer);
    stream_serialize(self.gas_fees, writer);
}
#[inline_always]
fn stream_serialize(self: GasSettings, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.gas_limits, writer);
    stream_serialize(self.teardown_gas_limits, writer);
    stream_serialize(self.max_fees_per_gas, writer);
    stream_serialize(self.max_priority_fees_per_gas, writer);
}
#[inline_always]
fn stream_serialize(self: Scoped<L2ToL1Message>, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.inner, writer);
    stream_serialize(self.contract_address, writer);
}
#[inline_always]
fn stream_serialize(self: Log<16>, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.fields, writer);
    stream_serialize(self.length, writer);
}
#[inline_always]
fn stream_serialize(self: Scoped<LogHash>, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.inner, writer);
    stream_serialize(self.contract_address, writer);
}
fn hash_internal(input: [Field; 3], in_len: u32) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = ((in_len as Field) * two_pow_64);
    let mut state = [0; 4];
    state[RATE] = iv;
    if is_unconstrained() {
        for i in 0 .. (in_len / RATE) {
            state[0] = (state[0] + input[(i * RATE)]);
            state[1] = (state[1] + input[((i * RATE) + 1)]);
            state[2] = (state[2] + input[((i * RATE) + 2)]);
            state = poseidon2_permutation(state)
        };
        let num_extra_fields = (in_len % RATE);
        if (num_extra_fields != 0) {
            let remainder_start = (in_len - num_extra_fields);
            state[0] = (state[0] + input[remainder_start]);
            if (num_extra_fields > 1) {
                state[1] = (state[1] + input[(remainder_start + 1)])
            }
        }
    } else {
        let mut states = [[0; 4]; 2];
        states[0] = state;
        for chunk_idx in 0 .. (3 / RATE) {
            for i in 0 .. RATE {
                state[i] = (state[i] + input[((chunk_idx * RATE) + i)])
            };
            state = poseidon2_permutation(state);
            states[(chunk_idx + 1)] = state
        };
        let first_partially_filled_chunk = (in_len / RATE);
        state = states[first_partially_filled_chunk];
        let remainder_start = ((in_len / RATE) * RATE);
        for j in 0 .. RATE {
            let idx = (remainder_start + j);
            if (idx < in_len) {
                state[j] = (state[j] + input[idx])
            }
        }
    };
    if ((in_len == 0) | ((in_len % RATE) != 0)) {
        state = poseidon2_permutation(state)
    };
    state[0]
}
unconstrained fn hash_internal(input: [Field; 3], in_len: u32) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = ((in_len as Field) * two_pow_64);
    let mut state = [0; 4];
    state[RATE] = iv;
    if is_unconstrained() {
        for i in 0 .. (in_len / RATE) {
            state[0] = (state[0] + input[(i * RATE)]);
            state[1] = (state[1] + input[((i * RATE) + 1)]);
            state[2] = (state[2] + input[((i * RATE) + 2)]);
            state = poseidon2_permutation(state)
        };
        let num_extra_fields = (in_len % RATE);
        if (num_extra_fields != 0) {
            let remainder_start = (in_len - num_extra_fields);
            state[0] = (state[0] + input[remainder_start]);
            if (num_extra_fields > 1) {
                state[1] = (state[1] + input[(remainder_start + 1)])
            }
        }
    } else {
        let mut states = [[0; 4]; 2];
        states[0] = state;
        for chunk_idx in 0 .. (3 / RATE) {
            for i in 0 .. RATE {
                state[i] = (state[i] + input[((chunk_idx * RATE) + i)])
            };
            state = poseidon2_permutation(state);
            states[(chunk_idx + 1)] = state
        };
        let first_partially_filled_chunk = (in_len / RATE);
        state = states[first_partially_filled_chunk];
        let remainder_start = ((in_len / RATE) * RATE);
        for j in 0 .. RATE {
            let idx = (remainder_start + j);
            if (idx < in_len) {
                state[j] = (state[j] + input[idx])
            }
        }
    };
    if ((in_len == 0) | ((in_len % RATE) != 0)) {
        state = poseidon2_permutation(state)
    };
    state[0]
}
#[inline_always]
fn stream_serialize(self: AztecAddress, writer: &mut Writer<11>) -> () {
    stream_serialize(self.inner, writer);
}
fn build_msg_block(msg: [u8; 64], message_size: u32, msg_start: u32) -> MSG_BLOCK {
    let msg_block = {
        unsafe { build_msg_block_helper(msg, message_size, msg_start) }
    };
    if (!is_unconstrained()) {
        let mut msg_end = (msg_start + BLOCK_SIZE);
        let max_read_index = min(message_size, msg_end);
        let mut msg_item = 0;
        for k in msg_start ..= msg_end {
            if ((k != msg_start) & ((k % INT_SIZE) == 0)) {
                let msg_block_index = (((k - msg_start) / INT_SIZE) - 1);
                assert(((msg_block[msg_block_index] as Field) == msg_item));
                msg_item = 0
            };
            let msg_byte = if (k < max_read_index) {
                msg[k]
            } else {
                0
            };
            msg_item = ((msg_item * (TWO_POW_8 as Field)) + (msg_byte as Field))
        }
    };
    msg_block
}
unconstrained fn build_msg_block(msg: [u8; 64], message_size: u32, msg_start: u32) -> MSG_BLOCK {
    let msg_block = {
        build_msg_block_helper(msg, message_size, msg_start)
    };
    if (!is_unconstrained()) {
        let mut msg_end = (msg_start + BLOCK_SIZE);
        let max_read_index = min(message_size, msg_end);
        let mut msg_item = 0;
        for k in msg_start ..= msg_end {
            if ((k != msg_start) & ((k % INT_SIZE) == 0)) {
                let msg_block_index = (((k - msg_start) / INT_SIZE) - 1);
                assert(((msg_block[msg_block_index] as Field) == msg_item));
                msg_item = 0
            };
            let msg_byte = if (k < max_read_index) {
                msg[k]
            } else {
                0
            };
            msg_item = ((msg_item * (TWO_POW_8 as Field)) + (msg_byte as Field))
        }
    };
    msg_block
}
unconstrained fn less() -> Ordering {
    {
        let result = 0;
        (result)
    }
}
unconstrained fn greater() -> Ordering {
    {
        let result = 2;
        (result)
    }
}
unconstrained fn equal() -> Ordering {
    {
        let result = 1;
        (result)
    }
}
#[inline_always]
fn stream_serialize(self: PartialStateReference, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.note_hash_tree, writer);
    stream_serialize(self.nullifier_tree, writer);
    stream_serialize(self.public_data_tree, writer);
}
#[inline_always]
fn stream_serialize(self: EthAddress, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: GasFees, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.fee_per_da_gas, writer);
    stream_serialize(self.fee_per_l2_gas, writer);
}
#[inline_always]
fn stream_serialize(self: L2ToL1Message, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.recipient, writer);
    stream_serialize(self.content, writer);
}
#[inline_always]
fn stream_serialize(self: [Field; 16], writer: &mut Writer<2785>) -> () {
    for i in 0 .. 16 {
        stream_serialize(self[i], writer);
    }
}
#[inline_always]
fn stream_serialize(self: LogHash, writer: &mut Writer<2785>) -> () {
    stream_serialize(self.value, writer);
    stream_serialize(self.length, writer);
}
unconstrained fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<11>) -> () {
    write(writer, self);
}
unconstrained fn build_msg_block_helper(msg: [u8; 64], message_size: u32, msg_start: u32) -> MSG_BLOCK {
    let mut msg_block = [0; 16];
    let block_input = if (message_size < msg_start) {
        0
    } else {
        if (message_size < (msg_start + BLOCK_SIZE)) {
            (message_size - msg_start)
        } else {
            BLOCK_SIZE
        }
    };
    let int_input = (((block_input + INT_SIZE) - 1) / INT_SIZE);
    for i in 0 .. int_input {
        let mut msg_item = 0;
        for j in 0 .. INT_SIZE {
            let k = ((i * INT_SIZE) + j);
            let msg_byte = if (k < block_input) {
                msg[(msg_start + k)]
            } else {
                0
            };
            msg_item = ((msg_item << 8) + (msg_byte as u32))
        };
        msg_block[i] = msg_item
    };
    msg_block
}
#[inline_always]
fn stream_serialize(self: u128, writer: &mut Writer<2785>) -> () {
    write(writer, (self as Field));
}
fn write(self: &mut Writer<11>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}

