// Legend: source-level names of monomorphized struct/enum/alias types.
// A type claimed by several distinct names is printed structurally
// wherever it appears, to avoid guessing which name applies.
type AppendOnlyTreeSnapshot = (Field, Field);
type AztecAddress = (Field,);
type BlockHeader = ((Field, Field), StateReference, Field, GlobalVariables, Field, Field);
type BoundedVec<SideEffectCounter, 138> = ([(u32, u32); 138], u32);
type CallContext = ((Field,), (Field,), FunctionSelector, bool);
type ClaimedLengthArray<Counted<Field>, 16> = ([(Field, u32); 16], u32);
type ClaimedLengthArray<Counted<L2ToL1Message>, 8> = ([Counted<L2ToL1Message>; 8], u32);
type ClaimedLengthArray<Counted<LogHash>, 1> = ([Counted<LogHash>; 1], u32);
type ClaimedLengthArray<Counted<NoteHash>, 16> = ([(Field, u32); 16], u32);
type ClaimedLengthArray<Counted<Nullifier>, 16> = ([Counted<Nullifier>; 16], u32);
type ClaimedLengthArray<Counted<PrivateLogData>, 16> = ([Counted<PrivateLogData>; 16], u32);
type ClaimedLengthArray<Counted<PublicCallRequest>, 32> = ([Counted<PublicCallRequest>; 32], u32);
type ClaimedLengthArray<KeyValidationRequestAndSeparator, 16> = ([KeyValidationRequestAndSeparator; 16], u32);
type ClaimedLengthArray<PrivateCallRequest, 16> = ([PrivateCallRequest; 16], u32);
type ClaimedLengthArray<PrivateCallRequest, 8> = ([PrivateCallRequest; 8], u32);
type ClaimedLengthArray<Scoped<Counted<Field>>, 16> = ([((Field, u32), (Field,)); 16], u32);
type ClaimedLengthArray<Scoped<Counted<Field>>, 64> = ([((Field, u32), (Field,)); 64], u32);
type ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8> = ([Scoped<Counted<L2ToL1Message>>; 8], u32);
type ClaimedLengthArray<Scoped<Counted<LogHash>>, 1> = ([Scoped<Counted<LogHash>>; 1], u32);
type ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64> = ([((Field, u32), (Field,)); 64], u32);
type ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64> = ([Scoped<Counted<Nullifier>>; 64], u32);
type ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64> = ([Scoped<Counted<PrivateLogData>>; 64], u32);
type ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64> = ([Scoped<KeyValidationRequestAndSeparator>; 64], u32);
type ContractClassFunctionLeafPreimage = (FunctionSelector, Field);
type ContractClassId = (Field,);
type Counted<Field> = (Field, u32);
type Counted<L2ToL1Message> = (L2ToL1Message, u32);
type Counted<LogHash> = ((Field, u32), u32);
type Counted<NoteHash> = (Field, u32);
type Counted<Nullifier> = ((Field, Field), u32);
type Counted<PrivateLogData> = (PrivateLogData, u32);
type Counted<PublicCallRequest> = (PublicCallRequest, u32);
type DelayedPublicMutableValues<ContractClassId, 86400> = (ScheduledValueChange<ContractClassId>, ScheduledDelayChange<86400>);
type EmbeddedCurvePoint = (Field, Field);
type EmbeddedCurveScalar = (Field, Field);
type EthAddress = (Field,);
type FunctionData = (FunctionSelector, bool);
type FunctionSelector = (u32,);
type Gas = (u32, u32);
type GasFees = (u128, u128);
type GasSettings = ((u32, u32), (u32, u32), GasFees, GasFees);
type GlobalVariables = (Field, Field, u32, Field, u64, (Field,), (Field,), GasFees);
type IvpkM = ((Field, Field),);
type KeyValidationRequest = (Field, Field);
type KeyValidationRequestAndSeparator = ((Field, Field), Field);
type L2ToL1Message = ((Field,), Field);
type Log<16> = ([Field; 16], u32);
type LogHash = (Field, u32);
type MembershipWitness<40> = (Field, [Field; 40]);
type MembershipWitness<7> = (Field, [Field; 7]);
type Nullifier = (Field, Field);
type Option<u64> = (bool, u64);
type Ordering = (Field,);
type PartialAddress = (Field,);
type PartialStateReference = ((Field, Field), (Field, Field), (Field, Field));
type PrivateAccumulatedData = (([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, ClaimedLengthArray<Scoped<Counted<LogHash>>, 1>, ClaimedLengthArray<Counted<PublicCallRequest>, 32>, ClaimedLengthArray<PrivateCallRequest, 16>);
type PrivateCallData = (PrivateCircuitPublicInputs, VerificationKey<163>, PrivateVerificationKeyHints);
type PrivateCallDataValidator = (PrivateCallData,);
type PrivateCallDataWithoutPublicInputs = (VerificationKey<163>, PrivateVerificationKeyHints);
type PrivateCallRequest = (CallContext, Field, Field, u32, u32);
type PrivateCircuitPublicInputs = (CallContext, Field, Field, BlockHeader, TxContext, u32, bool, u64, u32, u32, u32, u32, ClaimedLengthArray<Scoped<Counted<Field>>, 16>, ClaimedLengthArray<Scoped<Counted<Field>>, 16>, ClaimedLengthArray<KeyValidationRequestAndSeparator, 16>, ClaimedLengthArray<PrivateCallRequest, 8>, ClaimedLengthArray<Counted<PublicCallRequest>, 32>, PublicCallRequest, ([(Field, u32); 16], u32), ClaimedLengthArray<Counted<Nullifier>, 16>, ClaimedLengthArray<Counted<L2ToL1Message>, 8>, ClaimedLengthArray<Counted<PrivateLogData>, 16>, ClaimedLengthArray<Counted<LogHash>, 1>, Field);
type PrivateKernelCircuitPublicInputs = (PrivateTxConstantData, u32, PrivateValidationRequests, PrivateAccumulatedData, PublicCallRequest, (Field,), u64, bool, Field, u32);
type PrivateKernelInitCircuitPrivateInputs = (TxRequest, PrivateCallData, Field, ProtocolContracts, bool, u32);
type PrivateLogData = (Log<16>, u32);
type PrivateTxConstantData = (BlockHeader, TxContext, Field, Field, ProtocolContracts);
type PrivateValidationRequests = (([((Field, u32), (Field,)); 64], u32), ([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64>);
type PrivateVerificationKeyHints = ((Field,), PublicKeys, Field, Field, MembershipWitness<7>, MembershipWitness<40>, PublicDataTreeLeafPreimage, [Field; 3]);
type ProtocolContracts = ([(Field,); 11],);
type PublicCallRequest = ((Field,), (Field,), bool, Field);
type PublicDataTreeLeafPreimage = (Field, Field, Field, Field);
type PublicKeys = (Field, IvpkM, Field, Field, Field, Field);
type PublicKeysHash = (Field,);
type SaltedInitializationHash = (Field,);
type ScheduledDelayChange<86400> = (Option<u64>, Option<u64>, u64);
type ScheduledValueChange<ContractClassId> = ((Field,), (Field,), u64);
type Scoped<Counted<Field>> = ((Field, u32), (Field,));
type Scoped<Counted<L2ToL1Message>> = (Counted<L2ToL1Message>, (Field,));
type Scoped<Counted<LogHash>> = (Counted<LogHash>, (Field,));
type Scoped<Counted<NoteHash>> = ((Field, u32), (Field,));
type Scoped<Counted<Nullifier>> = (Counted<Nullifier>, (Field,));
type Scoped<Counted<PrivateLogData>> = (Counted<PrivateLogData>, (Field,));
type Scoped<KeyValidationRequestAndSeparator> = (KeyValidationRequestAndSeparator, (Field,));
type SideEffectCounter = (u32, u32);
type SideEffectUniquenessHints = ([(u32, u32); 138], [u8; 16], [u8; 16], [u8; 16], [u8; 16], [u8; 8], [u8; 32], [u8; 8], [u8; 16], [u8; 1], u8);
type StateReference = ((Field, Field), PartialStateReference);
type TxContext = (Field, Field, GasSettings);
type TxRequest = ((Field,), Field, TxContext, FunctionData, Field);
type VerificationKey<163> = ([Field; 163], Field);
type Writer<15> = ([Field; 15], u32);
type Writer<4> = ([Field; 4], u32);

global NULL_MSG_SENDER_CONTRACT_ADDRESS: (Field,) = {
    let inner = -1;
    (inner)
};
global DOM_SEP__SILOED_NULLIFIER: u32 = 57496191;
global PROOF_TYPE_OINK: u32 = 1;
global PROOF_TYPE_HN: u32 = 2;
global DOM_SEP__TX_REQUEST: u32 = 3763737512;
global DOM_SEP__CONTRACT_CLASS_ID: u32 = 3923495515;
global MAX_PROTOCOL_CONTRACTS: u32 = 11;
global UPDATED_CLASS_IDS_SLOT: u32 = 1;
global CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS: (Field,) = {
    let inner = 2;
    (inner)
};
global GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET: u32 = 0;
global GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET: u32 = 16;
global GLOBAL_INDEX_NOTE_HASH_OFFSET: u32 = 32;
global GLOBAL_INDEX_NULLIFIER_OFFSET: u32 = 48;
global GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET: u32 = 80;
global GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET: u32 = 112;
global GLOBAL_INDEX_PRIVATE_LOG_OFFSET: u32 = 120;
global GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET: u32 = 136;
global GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET: u32 = 137;
global TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL: u32 = 138;
global GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET: u32 = 64;
global GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET: u32 = 72;
global TWO_POW_32: Field = 4294967296;
global TWO_POW_8: Field = 256;
global DOM_SEP__PRIVATE_FUNCTION_LEAF: u32 = 1389398688;
global DOM_SEP__PARTIAL_ADDRESS: u32 = 2103633018;
global DOM_SEP__CONTRACT_ADDRESS_V2: u32 = 4099338721;
global DOM_SEP__PUBLIC_STORAGE_MAP_SLOT: u32 = 4015149901;
global MAX_U32_VALUE: u32 = 4294967295;
global DOM_SEP__MERKLE_HASH: u32 = 2982624097;
global DOM_SEP__PUBLIC_KEYS_HASH: u32 = 777457226;
global DOM_SEP__PUBLIC_LEAF_SLOT: u32 = 1247650290;
global RATE: u32 = 3;
global TWO_POW_128: Field = 340282366920938463463374607431768211456;
global PLO: Field = 53438638232309528389504892708671455233;
global PHI: Field = 64323764613183177041862057485226039389;
global DOM_SEP__PUBLIC_DATA_MERKLE: u32 = 3756303423;
global POSEIDON2_CONFIG_STATE_SIZE: u32 = 4;
global DOM_SEP__SINGLE_PUBLIC_KEY_HASH: u32 = 3452068255;
fn main(tx_request: TxRequest, vk_tree_root: Field, protocol_contracts: ProtocolContracts, private_call: PrivateCallDataWithoutPublicInputs, is_private_only: bool, revertible_counter_hint: u32, app_public_inputs: call_data(1) PrivateCircuitPublicInputs) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = {
        let tx_request = tx_request;
        let vk_tree_root = vk_tree_root;
        let protocol_contracts = protocol_contracts;
        let private_call = to_private_call_data(private_call, app_public_inputs);
        let is_private_only = is_private_only;
        let revertible_counter_hint = revertible_counter_hint;
        (tx_request, private_call, vk_tree_root, protocol_contracts, is_private_only, revertible_counter_hint)
    };
    execute(private_inputs)
}
fn to_private_call_data(self: PrivateCallDataWithoutPublicInputs, public_inputs: PrivateCircuitPublicInputs) -> PrivateCallData {
    {
        let public_inputs = public_inputs;
        let vk = self.vk;
        let verification_key_hints = self.verification_key_hints;
        (public_inputs, vk, verification_key_hints)
    }
}
fn execute(inputs: PrivateKernelInitCircuitPrivateInputs) -> PrivateKernelCircuitPublicInputs {
    validate_as_first_call(new(inputs.private_call), inputs.tx_request, inputs.protocol_contracts, inputs.revertible_counter_hint);
    compose_output_for_init(inputs)
}
fn validate_as_first_call(self: PrivateCallDataValidator, tx_request: TxRequest, protocol_contracts: ProtocolContracts, claimed_revertible_counter: u32) -> () {
    validate_common(self, true, protocol_contracts, claimed_revertible_counter);
    validate_against_tx_request(self, tx_request);
    let this_call = self.data.public_inputs;
    assert(eq(this_call.call_context.msg_sender, NULL_MSG_SENDER_CONTRACT_ADDRESS), "Users cannot set msg_sender in first call");
    assert((this_call.call_context.is_static_call == false), "First call in a tx cannot be static");
    assert((this_call.start_side_effect_counter > 1), "start_side_effect_counter must be greater than 1");
}
fn new(data: PrivateCallData) -> PrivateCallDataValidator {
    {
        let data = data;
        (data)
    }
}
fn compose_output_for_init(inputs: PrivateKernelInitCircuitPrivateInputs) -> PrivateKernelCircuitPublicInputs {
    let constants = {
        let tx_context = inputs.private_call.public_inputs.tx_context;
        let tx_request_salt = inputs.private_call.public_inputs.tx_request_salt;
        let vk_tree_root = inputs.vk_tree_root;
        let protocol_contracts = inputs.protocol_contracts;
        let anchor_block_header = inputs.private_call.public_inputs.anchor_block_header;
        (anchor_block_header, tx_context, tx_request_salt, vk_tree_root, protocol_contracts)
    };
    let mut validation_requests = empty();
    let mut end = empty();
    let scoped_protocol_nullifier = create_protocol_nullifier(inputs.tx_request);
    let protocol_nullifier = compute_siloed_nullifier(scoped_protocol_nullifier.contract_address, innermost(scoped_protocol_nullifier).value);
    end.nullifiers.array[0] = scoped_protocol_nullifier;
    end.nullifiers.length = 1;
    let contract_address = inputs.private_call.public_inputs.call_context.contract_address;
    append_to_empty_dest((&mut validation_requests.note_hash_read_requests), inputs.private_call.public_inputs.note_hash_read_requests);
    append_to_empty_dest((&mut validation_requests.nullifier_read_requests), inputs.private_call.public_inputs.nullifier_read_requests);
    append_and_scope_to_empty_dest((&mut validation_requests.scoped_key_validation_requests_and_separators), inputs.private_call.public_inputs.key_validation_requests_and_separators, contract_address);
    append_and_scope_to_empty_dest((&mut end.note_hashes), inputs.private_call.public_inputs.note_hashes, contract_address);
    append_and_scope_after_protocol_nullifier((&mut end.nullifiers), inputs.private_call.public_inputs.nullifiers, contract_address);
    append_and_scope_to_empty_dest((&mut end.l2_to_l1_msgs), inputs.private_call.public_inputs.l2_to_l1_msgs, contract_address);
    append_and_scope_to_empty_dest((&mut end.private_logs), inputs.private_call.public_inputs.private_logs, contract_address);
    append_and_scope_to_empty_dest((&mut end.contract_class_logs_hashes), inputs.private_call.public_inputs.contract_class_logs_hashes, contract_address);
    append_to_empty_dest((&mut end.public_call_requests), inputs.private_call.public_inputs.public_call_requests);
    append_reversed_to_empty_dest((&mut end.private_call_stack), inputs.private_call.public_inputs.private_call_requests);
    let min_revertible_side_effect_counter = inputs.private_call.public_inputs.min_revertible_side_effect_counter;
    let public_teardown_call_request = inputs.private_call.public_inputs.public_teardown_call_request;
    let fee_payer = if inputs.private_call.public_inputs.is_fee_payer {
        contract_address
    } else {
        zero()
    };
    let timestamp_before_registry_read_goes_stale = get_expiration_timestamp_for_contract_updates(inputs.private_call);
    let expiration_timestamp = min(inputs.private_call.public_inputs.expiration_timestamp, timestamp_before_registry_read_goes_stale);
    let public_inputs = {
        let constants = constants;
        let min_revertible_side_effect_counter = min_revertible_side_effect_counter;
        let validation_requests = validation_requests;
        let end = end;
        let public_teardown_call_request = public_teardown_call_request;
        let fee_payer = fee_payer;
        let expiration_timestamp = expiration_timestamp;
        let is_private_only = inputs.is_private_only;
        let claimed_first_nullifier = protocol_nullifier;
        let claimed_revertible_counter = inputs.revertible_counter_hint;
        (constants, min_revertible_side_effect_counter, validation_requests, end, public_teardown_call_request, fee_payer, expiration_timestamp, is_private_only, claimed_first_nullifier, claimed_revertible_counter)
    };
    public_inputs
}
fn validate_common(self: PrivateCallDataValidator, is_first_function_call: bool, protocol_contracts: ProtocolContracts, claimed_revertible_counter: u32) -> () {
    if (!is_unconstrained()) {
        verify(self.data, is_first_function_call);
    };
    validate_contract_address(self.data, protocol_contracts);
    validate_claimed_lengths(self);
    validate_msg_senders(self);
    validate_expected_counters(self, claimed_revertible_counter);
    validate_unique_and_within_bounds_side_effect_counters(self.data.public_inputs);
}
fn validate_against_tx_request(self: PrivateCallDataValidator, tx_request: TxRequest) -> () {
    let this_call = self.data.public_inputs;
    assert(eq(tx_request.origin, this_call.call_context.contract_address), "contract address does not match origin");
    assert(eq(tx_request.function_data.selector, this_call.call_context.function_selector), "function_selector in call_context does not match the value in tx_request");
    assert(tx_request.function_data.is_private, "tx_request does not indicate the first function is private");
    assert((tx_request.args_hash == this_call.args_hash), "args_hash in private call does not match the value in tx_request");
    assert(eq(tx_request.tx_context, this_call.tx_context), "tx_context in private call does not match the value in tx_request");
    assert((tx_request.salt == this_call.tx_request_salt), "tx_request_salt in private call does not match the salt in tx_request");
}
fn eq(_self: AztecAddress, _other: AztecAddress) -> bool {
    (_self.inner == _other.inner)
}
fn empty() -> PrivateValidationRequests {
    {
        let note_hash_read_requests = empty();
        let nullifier_read_requests = empty();
        let scoped_key_validation_requests_and_separators = empty();
        (note_hash_read_requests, nullifier_read_requests, scoped_key_validation_requests_and_separators)
    }
}
fn empty() -> PrivateAccumulatedData {
    {
        let note_hashes = empty();
        let nullifiers = empty();
        let l2_to_l1_msgs = empty();
        let private_logs = empty();
        let contract_class_logs_hashes = empty();
        let public_call_requests = empty();
        let private_call_stack = empty();
        (note_hashes, nullifiers, l2_to_l1_msgs, private_logs, contract_class_logs_hashes, public_call_requests, private_call_stack)
    }
}
fn create_protocol_nullifier(tx_request: TxRequest) -> Scoped<Counted<Nullifier>> {
    scope(count({
        let value = hash(tx_request);
        let note_hash = 0;
        (value, note_hash)
    }, 1), NULL_MSG_SENDER_CONTRACT_ADDRESS)
}
fn compute_siloed_nullifier(contract_address: AztecAddress, nullifier: Field) -> Field {
    poseidon2_hash_with_separator([to_field(contract_address), nullifier], DOM_SEP__SILOED_NULLIFIER)
}
fn innermost(self: Scoped<Counted<Nullifier>>) -> Nullifier {
    self.inner.inner
}
fn append_to_empty_dest(dest: &mut ClaimedLengthArray<Scoped<Counted<Field>>, 64>, source: ClaimedLengthArray<Scoped<Counted<Field>>, 16>) -> () {
    static_assert((16 <= 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 16 {
        (*dest).array[i] = source.array[i]
    };
    (*dest).length = source.length
}
fn append_and_scope_to_empty_dest(dest: &mut ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64>, source: ClaimedLengthArray<KeyValidationRequestAndSeparator, 16>, contract_address: AztecAddress) -> () {
    static_assert((16 <= 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 16 {
        (*dest).array[i].inner = source.array[i]
    };
    let mut should_copy = true;
    for i in 0 .. 16 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[i].contract_address = contract_address
        };
    };
    (*dest).length = source.length
}
fn append_and_scope_to_empty_dest(dest: &mut ClaimedLengthArray<Scoped<Counted<Field>>, 64>, source: ClaimedLengthArray<Counted<Field>, 16>, contract_address: AztecAddress) -> () {
    static_assert((16 <= 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 16 {
        (*dest).array[i].inner = source.array[i]
    };
    let mut should_copy = true;
    for i in 0 .. 16 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[i].contract_address = contract_address
        };
    };
    (*dest).length = source.length
}
fn append_and_scope_after_protocol_nullifier(dest: &mut ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, source: ClaimedLengthArray<Counted<Nullifier>, 16>, contract_address: AztecAddress) -> () {
    static_assert((16 < 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    assert(((*dest).length == 1), "Expected dest to have length 1 (the protocol nullifier)");
    for i in 0 .. 16 {
        (*dest).array[(i + 1)].inner = source.array[i]
    };
    let mut should_copy = true;
    for i in 0 .. 16 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[(i + 1)].contract_address = contract_address
        };
    };
    (*dest).length = ((*dest).length + source.length)
}
fn append_and_scope_to_empty_dest(dest: &mut ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8>, source: ClaimedLengthArray<Counted<L2ToL1Message>, 8>, contract_address: AztecAddress) -> () {
    static_assert((8 <= 8), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 8 {
        (*dest).array[i].inner = source.array[i]
    };
    let mut should_copy = true;
    for i in 0 .. 8 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[i].contract_address = contract_address
        };
    };
    (*dest).length = source.length
}
fn append_and_scope_to_empty_dest(dest: &mut ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, source: ClaimedLengthArray<Counted<PrivateLogData>, 16>, contract_address: AztecAddress) -> () {
    static_assert((16 <= 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 16 {
        (*dest).array[i].inner = source.array[i]
    };
    let mut should_copy = true;
    for i in 0 .. 16 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[i].contract_address = contract_address
        };
    };
    (*dest).length = source.length
}
fn append_and_scope_to_empty_dest(dest: &mut ClaimedLengthArray<Scoped<Counted<LogHash>>, 1>, source: ClaimedLengthArray<Counted<LogHash>, 1>, contract_address: AztecAddress) -> () {
    static_assert((1 <= 1), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 1 {
        (*dest).array[i].inner = source.array[i]
    };
    let mut should_copy = true;
    for i in 0 .. 1 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[i].contract_address = contract_address
        };
    };
    (*dest).length = source.length
}
fn append_to_empty_dest(dest: &mut ClaimedLengthArray<Counted<PublicCallRequest>, 32>, source: ClaimedLengthArray<Counted<PublicCallRequest>, 32>) -> () {
    static_assert((32 <= 32), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    for i in 0 .. 32 {
        (*dest).array[i] = source.array[i]
    };
    (*dest).length = source.length
}
fn append_reversed_to_empty_dest(dest: &mut ClaimedLengthArray<PrivateCallRequest, 16>, source: ClaimedLengthArray<PrivateCallRequest, 8>) -> () {
    static_assert((8 <= 16), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
    let mut should_copy = true;
    for i in 0 .. 8 {
        should_copy = (should_copy & (i != source.length));
        if should_copy {
            (*dest).array[i] = source.array[((source.length - 1) - i)]
        }
    };
    (*dest).length = source.length
}
fn zero() -> AztecAddress {
    {
        let inner = 0;
        (inner)
    }
}
fn get_expiration_timestamp_for_contract_updates(private_call: PrivateCallData) -> u64 {
    let delayed_public_mutable_values = unpack(private_call.verification_key_hints.updated_class_id_delayed_public_mutable_values);
    compute_delayed_public_mutable_time_horizon(delayed_public_mutable_values, private_call.public_inputs.anchor_block_header.global_variables.timestamp)
}
fn min(v1: u64, v2: u64) -> u64 {
    if (cmp(v1, v2).0 == 2) {
        v2
    } else {
        v1
    }
}
fn verify(self: PrivateCallData, is_first_function_call: bool) -> () {
    let proof_type = if is_first_function_call {
        PROOF_TYPE_OINK
    } else {
        PROOF_TYPE_HN
    };
    verify_proof_with_type(self.vk.key, [], [], self.vk.hash, proof_type);
}
fn validate_contract_address(private_call_data: PrivateCallData, protocol_contracts: ProtocolContracts) -> () {
    let contract_address = private_call_data.public_inputs.call_context.contract_address;
    let function_selector = private_call_data.public_inputs.call_context.function_selector;
    let vk_hash = private_call_data.vk.hash;
    let hints = private_call_data.verification_key_hints;
    let private_functions_root = private_functions_root_from_siblings(function_selector, vk_hash, hints.function_leaf_membership_witness.leaf_index, hints.function_leaf_membership_witness.sibling_path);
    let computed_contract_class_id = compute(hints.contract_class_artifact_hash, private_functions_root, hints.contract_class_public_bytecode_commitment);
    let computed_address = compute_from_class_id(computed_contract_class_id, hints.salted_initialization_hash, hints.public_keys);
    let is_protocol_contract = is_magic_protocol_contract_address(contract_address);
    assert_not_derived_protocol_contract_address(protocol_contracts, contract_address);
    let expected_protocol_contract_derived_address = if is_protocol_contract {
        get_derived_address(protocol_contracts, contract_address)
    } else {
        zero()
    };
    let protocol_contract_address_derivation_check_ok = eq(computed_address, expected_protocol_contract_derived_address);
    assert(((!is_protocol_contract) | protocol_contract_address_derivation_check_ok), "computed contract address does not match protocol contract derived address");
    let updated_contract_class_id = get_updated_contract_class_id(contract_address, private_call_data.public_inputs.anchor_block_header, hints.updated_class_id_delayed_public_mutable_values, hints.updated_class_id_witness, hints.updated_class_id_leaf);
    let is_updated_contract = (!is_empty(updated_contract_class_id));
    let updated_class_check_ok = eq(computed_contract_class_id, updated_contract_class_id);
    assert(((!is_updated_contract) | updated_class_check_ok), "computed contract class id does not match updated contract class id");
    let is_regular_contract = ((!is_protocol_contract) & (!is_updated_contract));
    let address_derivation_check_ok = eq(computed_address, contract_address);
    assert(((!is_regular_contract) | address_derivation_check_ok), "computed contract address does not match expected one");
}
fn validate_claimed_lengths(self: PrivateCallDataValidator) -> () {
    assert_length_within_bounds(self.data.public_inputs.note_hash_read_requests, "note_hash_read_requests length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.nullifier_read_requests, "nullifier_read_requests length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.key_validation_requests_and_separators, "key_validation_requests_and_separators length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.private_call_requests, "private_call_requests length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.public_call_requests, "public_call_requests length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.note_hashes, "note_hashes length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.nullifiers, "nullifiers length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.l2_to_l1_msgs, "l2_to_l1_msgs length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.private_logs, "private_logs length out of bounds");
    assert_length_within_bounds(self.data.public_inputs.contract_class_logs_hashes, "contract_class_logs_hashes length out of bounds");
}
fn validate_msg_senders(self: PrivateCallDataValidator) -> () {
    let this_call = self.data.public_inputs;
    let expected_msg_sender = this_call.call_context.contract_address;
    for_each(this_call.private_call_requests, {
        let closure_variable = {
            let env = (expected_msg_sender);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    });
    for_each(this_call.public_call_requests, {
        let closure_variable = {
            let env = (expected_msg_sender);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    });
    let teardown_call_request = this_call.public_teardown_call_request;
    if (!is_empty(teardown_call_request)) {
        if (!eq(teardown_call_request.msg_sender, NULL_MSG_SENDER_CONTRACT_ADDRESS)) {
            assert(eq(teardown_call_request.msg_sender, expected_msg_sender), "incorrect msg_sender for public teardown call request");
        }
    }
}
fn validate_expected_counters(self: PrivateCallDataValidator, claimed_revertible_counter: u32) -> () {
    let expected_non_revertible_side_effect_counter = self.data.public_inputs.expected_non_revertible_side_effect_counter;
    let expected_revertible_side_effect_counter = self.data.public_inputs.expected_revertible_side_effect_counter;
    if (expected_non_revertible_side_effect_counter != 0) {
        assert(((claimed_revertible_counter == 0) | (expected_non_revertible_side_effect_counter < claimed_revertible_counter)), "Failed to validate expected non revertible side effect counter")
    };
    if (expected_revertible_side_effect_counter != 0) {
        assert(((claimed_revertible_counter != 0) & (expected_revertible_side_effect_counter >= claimed_revertible_counter)), "Failed to validate expected revertible side effect counter")
    }
}
fn validate_unique_and_within_bounds_side_effect_counters(public_inputs: PrivateCircuitPublicInputs) -> () {
    let side_effect_sorting_hints = {
        unsafe { build_uniqueness_hints(public_inputs) }
    };
    validate_unique_and_within_bounds_side_effect_counters_with_hints(public_inputs, side_effect_sorting_hints);
}
fn eq(_self: FunctionSelector, _other: FunctionSelector) -> bool {
    (_self.inner == _other.inner)
}
fn eq(_self: TxContext, _other: TxContext) -> bool {
    (((_self.chain_id == _other.chain_id) & (_self.version == _other.version)) & eq(_self.gas_settings, _other.gas_settings))
}
fn empty() -> ClaimedLengthArray<Scoped<Counted<Field>>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8> {
    {
        let array = [empty(); 8];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<Scoped<Counted<LogHash>>, 1> {
    {
        let array = [empty(); 1];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<Counted<PublicCallRequest>, 32> {
    {
        let array = [empty(); 32];
        let length = 0;
        (array, length)
    }
}
fn empty() -> ClaimedLengthArray<PrivateCallRequest, 16> {
    {
        let array = [empty(); 16];
        let length = 0;
        (array, length)
    }
}
fn scope(self: Counted<Nullifier>, contract_address: AztecAddress) -> Scoped<Counted<Nullifier>> {
    new(self, contract_address)
}
fn count(self: Nullifier, counter: u32) -> Counted<Nullifier> {
    new(self, counter)
}
fn hash(self: TxRequest) -> Field {
    poseidon2_hash_with_separator(serialize(self), DOM_SEP__TX_REQUEST)
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn to_field(self: AztecAddress) -> Field {
    self.inner
}
fn unpack(fields: [Field; 3]) -> DelayedPublicMutableValues<ContractClassId, 86400> {
    let svc = unpack_value_change(fields);
    let sdc = unpack_delay_change(fields[0]);
    new(svc, sdc)
}
fn compute_delayed_public_mutable_time_horizon(delayed_public_mutable_values: DelayedPublicMutableValues<ContractClassId, 86400>, anchor_block_timestamp: u64) -> u64 {
    let effective_minimum_delay = get_effective_minimum_delay_at(delayed_public_mutable_values.sdc, anchor_block_timestamp);
    get_time_horizon(delayed_public_mutable_values.svc, anchor_block_timestamp, effective_minimum_delay)
}
fn cmp(self: u64, other: u64) -> Ordering {
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
fn verify_proof_with_type(verification_key: [Field; 163], proof: [Field; 0], public_inputs: [Field; 0], key_hash: Field, proof_type: u32) -> () {
    if (!is_unconstrained()) {
        assert_constant(proof_type);
    };
    verify_proof_internal(verification_key, proof, public_inputs, key_hash, proof_type);
}
fn private_functions_root_from_siblings(selector: FunctionSelector, vk_hash: Field, function_leaf_index: Field, function_leaf_sibling_path: [Field; 7]) -> Field {
    let function_leaf_preimage = {
        let selector = selector;
        let vk_hash = vk_hash;
        (selector, vk_hash)
    };
    let function_leaf = hash(function_leaf_preimage);
    root_from_sibling_path(function_leaf, function_leaf_index, function_leaf_sibling_path)
}
fn compute(artifact_hash: Field, private_functions_root: Field, public_bytecode_commitment: Field) -> ContractClassId {
    let hash = poseidon2_hash_with_separator([artifact_hash, private_functions_root, public_bytecode_commitment], DOM_SEP__CONTRACT_CLASS_ID);
    from_field(hash)
}
fn compute_from_class_id(contract_class_id: ContractClassId, salted_initialization_hash: SaltedInitializationHash, public_keys: PublicKeys) -> AztecAddress {
    let partial_address = compute_from_salted_initialization_hash(contract_class_id, salted_initialization_hash);
    compute(public_keys, partial_address)
}
fn is_magic_protocol_contract_address(contract_address: AztecAddress) -> bool {
    let mut acc = 1;
    for i in 1 .. (MAX_PROTOCOL_CONTRACTS + 1) {
        {
            let op_rhs_0 = (to_field(contract_address) - (i as Field));
            acc = (acc * op_rhs_0)
        }
    };
    (acc == 0)
}
fn assert_not_derived_protocol_contract_address(self: ProtocolContracts, contract_address: AztecAddress) -> () {
    for i in 0 .. self.derived_addresses.len() {
        let derived_address = self.derived_addresses[i];
        if (derived_address.inner != 0) {
            assert((!eq(contract_address, derived_address)), "Attempting to execute a 'derived' protocol contract address. This is not allowed.");
        }
    }
}
fn get_derived_address(self: ProtocolContracts, magic_protocol_contract_address: AztecAddress) -> AztecAddress {
    let magic_protocol_contract_address_as_field = to_field(magic_protocol_contract_address);
    let index_of_derived_address_as_field = (magic_protocol_contract_address_as_field - 1);
    assert_max_bit_size(index_of_derived_address_as_field);
    self.derived_addresses[(index_of_derived_address_as_field as u32)]
}
fn get_updated_contract_class_id(contract_address: AztecAddress, anchor_block_header: BlockHeader, delayed_public_mutable_values: [Field; 3], witness: MembershipWitness<40>, leaf_preimage: PublicDataTreeLeafPreimage) -> ContractClassId {
    let delayed_public_mutable = unpack(delayed_public_mutable_values);
    let storage_slot = derive_storage_slot_in_map((UPDATED_CLASS_IDS_SLOT as Field), contract_address);
    read_current_value_of_delayed_public_mutable_with_hash(anchor_block_header, storage_slot, CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, delayed_public_mutable, witness, leaf_preimage)
}
fn is_empty(self: ContractClassId) -> bool {
    eq(self, empty())
}
fn eq(_self: ContractClassId, _other: ContractClassId) -> bool {
    (_self.inner == _other.inner)
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Scoped<Counted<Field>>, 16>, msg: str<44>) -> () {
    assert((self.length <= 16), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<KeyValidationRequestAndSeparator, 16>, msg: str<59>) -> () {
    assert((self.length <= 16), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<PrivateCallRequest, 8>, msg: str<42>) -> () {
    assert((self.length <= 8), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Counted<PublicCallRequest>, 32>, msg: str<41>) -> () {
    assert((self.length <= 32), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Counted<Field>, 16>, msg: str<32>) -> () {
    assert((self.length <= 16), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Counted<Nullifier>, 16>, msg: str<31>) -> () {
    assert((self.length <= 16), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Counted<L2ToL1Message>, 8>, msg: str<34>) -> () {
    assert((self.length <= 8), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Counted<PrivateLogData>, 16>, msg: str<33>) -> () {
    assert((self.length <= 16), msg);
}
fn assert_length_within_bounds(self: ClaimedLengthArray<Counted<LogHash>, 1>, msg: str<47>) -> () {
    assert((self.length <= 1), msg);
}
fn for_each(self: ClaimedLengthArray<PrivateCallRequest, 8>, f: fn[(AztecAddress,)](PrivateCallRequest) -> ()) -> () {
    let mut within_range = true;
    for i in 0 .. 8 {
        within_range = (within_range & (i != self.length));
        if within_range {
            {
                let tmp = f.0;
                tmp.1(tmp.0, self.array[i])
            };
        }
    }
}
fn lambda(mut env: ((Field,),), call_request: PrivateCallRequest) -> () {
    assert(eq(call_request.call_context.msg_sender, env.0), "incorrect msg_sender for private call request");
}
unconstrained fn lambda(mut env: ((Field,),), call_request: PrivateCallRequest) -> () {
    assert(eq(call_request.call_context.msg_sender, env.0), "incorrect msg_sender for private call request");
}
unconstrained fn eq(_self: AztecAddress, _other: AztecAddress) -> bool {
    (_self.inner == _other.inner)
}
fn for_each(self: ClaimedLengthArray<Counted<PublicCallRequest>, 32>, f: fn[(AztecAddress,)](Counted<PublicCallRequest>) -> ()) -> () {
    let mut within_range = true;
    for i in 0 .. 32 {
        within_range = (within_range & (i != self.length));
        if within_range {
            {
                let tmp = f.0;
                tmp.1(tmp.0, self.array[i])
            };
        }
    }
}
fn lambda(mut env: ((Field,),), call_request: Counted<PublicCallRequest>) -> () {
    if (!eq(call_request.inner.msg_sender, NULL_MSG_SENDER_CONTRACT_ADDRESS)) {
        assert(eq(call_request.inner.msg_sender, env.0), "incorrect msg_sender for public call request");
    }
}
unconstrained fn lambda(mut env: ((Field,),), call_request: Counted<PublicCallRequest>) -> () {
    if (!eq(call_request.inner.msg_sender, NULL_MSG_SENDER_CONTRACT_ADDRESS)) {
        assert(eq(call_request.inner.msg_sender, env.0), "incorrect msg_sender for public call request");
    }
}
fn is_empty(self: PublicCallRequest) -> bool {
    eq(self, empty())
}
unconstrained fn build_uniqueness_hints(public_inputs: PrivateCircuitPublicInputs) -> SideEffectUniquenessHints {
    let mut side_effect_counters = from_parts_unchecked([null(); 138], 0);
    for i in 0 .. public_inputs.note_hash_read_requests.length {
        push((&mut side_effect_counters), new(counter(public_inputs.note_hash_read_requests.array[i]), (i + GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET)));
    };
    for i in 0 .. public_inputs.nullifier_read_requests.length {
        push((&mut side_effect_counters), new(counter(public_inputs.nullifier_read_requests.array[i]), (i + GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET)));
    };
    for i in 0 .. public_inputs.note_hashes.length {
        push((&mut side_effect_counters), new(counter(public_inputs.note_hashes.array[i]), (i + GLOBAL_INDEX_NOTE_HASH_OFFSET)));
    };
    for i in 0 .. public_inputs.nullifiers.length {
        push((&mut side_effect_counters), new(counter(public_inputs.nullifiers.array[i]), (i + GLOBAL_INDEX_NULLIFIER_OFFSET)));
    };
    for i in 0 .. public_inputs.private_call_requests.length {
        {
            let _ = build_side_effect_counter_hints_for_private_call_request(public_inputs.private_call_requests.array[i], i);
            let start = _.0;
            let end = _.1
        };
        push((&mut side_effect_counters), start);
        push((&mut side_effect_counters), end);
    };
    for i in 0 .. public_inputs.public_call_requests.length {
        push((&mut side_effect_counters), new(counter(public_inputs.public_call_requests.array[i]), (i + GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET)));
    };
    for i in 0 .. public_inputs.l2_to_l1_msgs.length {
        push((&mut side_effect_counters), new(counter(public_inputs.l2_to_l1_msgs.array[i]), (i + GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET)));
    };
    for i in 0 .. public_inputs.private_logs.length {
        push((&mut side_effect_counters), new(counter(public_inputs.private_logs.array[i]), (i + GLOBAL_INDEX_PRIVATE_LOG_OFFSET)));
    };
    for i in 0 .. public_inputs.contract_class_logs_hashes.length {
        push((&mut side_effect_counters), new(counter(public_inputs.contract_class_logs_hashes.array[i]), (i + GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET)));
    };
    if (public_inputs.min_revertible_side_effect_counter != 0) {
        push((&mut side_effect_counters), new(public_inputs.min_revertible_side_effect_counter, GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET));
    };
    let sorted_side_effect_counters = sort_via((&storage(side_effect_counters)), lambda);
    let mut original_to_sorted_indices = [0; 138];
    static_assert((TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL < 256), "u8 is no longer appropriate for elements of original_to_sorted_indices", r#"{"kind":"string","length":70}"#, false);
    for i in 0 .. len((&side_effect_counters)) {
        let hint = sorted_side_effect_counters[i];
        original_to_sorted_indices[hint.global_index] = (i as u8)
    };
    {
        let sorted_side_effect_counters = sorted_side_effect_counters;
        let note_hash_read_request_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET);
        let nullifier_read_request_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET);
        let note_hashes_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_NOTE_HASH_OFFSET);
        let nullifiers_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_NULLIFIER_OFFSET);
        let private_call_requests_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET);
        let public_call_requests_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET);
        let l2_to_l1_msgs_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET);
        let private_logs_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_PRIVATE_LOG_OFFSET);
        let contract_class_logs_hashes_sorted_indices = subarray(original_to_sorted_indices, GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET);
        let min_revertible_side_effect_counter_sorted_index = original_to_sorted_indices[GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET];
        (sorted_side_effect_counters, note_hash_read_request_sorted_indices, nullifier_read_request_sorted_indices, note_hashes_sorted_indices, nullifiers_sorted_indices, private_call_requests_sorted_indices, public_call_requests_sorted_indices, l2_to_l1_msgs_sorted_indices, private_logs_sorted_indices, contract_class_logs_hashes_sorted_indices, min_revertible_side_effect_counter_sorted_index)
    }
}
fn validate_unique_and_within_bounds_side_effect_counters_with_hints(public_inputs: PrivateCircuitPublicInputs, side_effect_sorting_hints: SideEffectUniquenessHints) -> () {
    let sorted_side_effect_counters = side_effect_sorting_hints.sorted_side_effect_counters;
    let total_side_effects = (((((((((public_inputs.note_hash_read_requests.length + public_inputs.nullifier_read_requests.length) + public_inputs.note_hashes.length) + public_inputs.nullifiers.length) + (public_inputs.private_call_requests.length * 2)) + public_inputs.public_call_requests.length) + public_inputs.l2_to_l1_msgs.length) + public_inputs.private_logs.length) + public_inputs.contract_class_logs_hashes.length) + if (public_inputs.min_revertible_side_effect_counter == 0) {
        0
    } else {
        1
    });
    let mut should_be_null = false;
    for i in 0 .. sorted_side_effect_counters.len() {
        should_be_null = (should_be_null | (i == total_side_effects));
        if should_be_null {
            assert_null(sorted_side_effect_counters[i], "Sorted counter hints must have null trailing values");
        }
    };
    validate_side_effect_counters_for_array(public_inputs.note_hash_read_requests, side_effect_sorting_hints.note_hash_read_request_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.nullifier_read_requests, side_effect_sorting_hints.nullifier_read_request_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.note_hashes, side_effect_sorting_hints.note_hashes_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_NOTE_HASH_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.nullifiers, side_effect_sorting_hints.nullifiers_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_NULLIFIER_OFFSET);
    validate_side_effect_ranges_for_call_requests(public_inputs.private_call_requests, side_effect_sorting_hints.private_call_requests_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET, GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.public_call_requests, side_effect_sorting_hints.public_call_requests_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.l2_to_l1_msgs, side_effect_sorting_hints.l2_to_l1_msgs_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.private_logs, side_effect_sorting_hints.private_logs_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_PRIVATE_LOG_OFFSET);
    validate_side_effect_counters_for_array(public_inputs.contract_class_logs_hashes, side_effect_sorting_hints.contract_class_logs_hashes_sorted_indices, sorted_side_effect_counters, GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET);
    validate_side_effect_counter_for_single_value(public_inputs.min_revertible_side_effect_counter, side_effect_sorting_hints.min_revertible_side_effect_counter_sorted_index, sorted_side_effect_counters, GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET);
    let counter_start = public_inputs.start_side_effect_counter;
    let counter_end = public_inputs.end_side_effect_counter;
    assert((counter_start < counter_end), "Private call has incorrect counter range");
    validate_increasing_counters(sorted_side_effect_counters, total_side_effects, counter_start, counter_end);
}
fn eq(_self: GasSettings, _other: GasSettings) -> bool {
    (((eq(_self.gas_limits, _other.gas_limits) & eq(_self.teardown_gas_limits, _other.teardown_gas_limits)) & eq(_self.max_fees_per_gas, _other.max_fees_per_gas)) & eq(_self.max_priority_fees_per_gas, _other.max_priority_fees_per_gas))
}
fn empty() -> Scoped<Counted<Field>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn empty() -> Scoped<KeyValidationRequestAndSeparator> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn empty() -> Scoped<Counted<Nullifier>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn empty() -> Scoped<Counted<L2ToL1Message>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn empty() -> Scoped<Counted<PrivateLogData>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn empty() -> Scoped<Counted<LogHash>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
fn empty() -> Counted<PublicCallRequest> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
fn empty() -> PrivateCallRequest {
    {
        let call_context = empty();
        let args_hash = 0;
        let returns_hash = 0;
        let start_side_effect_counter = 0;
        let end_side_effect_counter = 0;
        (call_context, args_hash, returns_hash, start_side_effect_counter, end_side_effect_counter)
    }
}
fn new(inner: Counted<Nullifier>, contract_address: AztecAddress) -> Scoped<Counted<Nullifier>> {
    {
        let inner = inner;
        let contract_address = contract_address;
        (inner, contract_address)
    }
}
fn new(inner: Nullifier, counter: u32) -> Counted<Nullifier> {
    {
        let inner = inner;
        let counter = counter;
        (inner, counter)
    }
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 15], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn serialize(self: TxRequest) -> [Field; 15] {
    let mut writer = new();
    stream_serialize(self, (&mut writer));
    finish(writer)
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
#[inline_always]
fn to_field(self: u32) -> Field {
    (self as Field)
}
fn poseidon2_hash(inputs: [Field; 3]) -> Field {
    hash(inputs, 3)
}
fn unpack_value_change(packed: [Field; 3]) -> ScheduledValueChange<ContractClassId> {
    let svc_pre_packed = subarray(packed, 1);
    let svc_post_packed = subarray(packed, (1 + 1));
    let timestamp_of_change = ((packed[0] as u32) as u64);
    new(unpack(svc_pre_packed), unpack(svc_post_packed), timestamp_of_change)
}
fn unpack_delay_change(packed: Field) -> ScheduledDelayChange<86400> {
    let svc_timestamp_of_change = (packed as u32);
    let mut tmp = ((packed - (svc_timestamp_of_change as Field)) / TWO_POW_32);
    let sdc_timestamp_of_change = (tmp as u32);
    tmp = ((tmp - (sdc_timestamp_of_change as Field)) / TWO_POW_32);
    let sdc_post_is_some = (((tmp as u8) % 2) != 0);
    tmp = ((tmp - (sdc_post_is_some as Field)) / TWO_POW_8);
    let sdc_post_inner = (tmp as u32);
    tmp = ((tmp - (sdc_post_inner as Field)) / TWO_POW_32);
    let sdc_pre_is_some = (((tmp as u8) % 2) != 0);
    tmp = ((tmp - (sdc_pre_is_some as Field)) / TWO_POW_8);
    let sdc_pre_inner = (tmp as u32);
    {
        let pre = if sdc_pre_is_some {
            some((sdc_pre_inner as u64))
        } else {
            none()
        };
        let post = if sdc_post_is_some {
            some((sdc_post_inner as u64))
        } else {
            none()
        };
        let timestamp_of_change = (sdc_timestamp_of_change as u64);
        (pre, post, timestamp_of_change)
    }
}
fn new(svc: ScheduledValueChange<ContractClassId>, sdc: ScheduledDelayChange<86400>) -> DelayedPublicMutableValues<ContractClassId, 86400> {
    {
        let svc = svc;
        let sdc = sdc;
        (svc, sdc)
    }
}
fn get_effective_minimum_delay_at(self: ScheduledDelayChange<86400>, anchor_block_timestamp: u64) -> u64 {
    if (self.timestamp_of_change <= anchor_block_timestamp) {
        (unwrap_or(self.post, 86400) - 1)
    } else {
        let time_until_delay_change = (self.timestamp_of_change - anchor_block_timestamp);
        let time_until_next_delay_change = min(unwrap_or(self.pre, 86400), (time_until_delay_change + unwrap_or(self.post, 86400)));
        (time_until_next_delay_change - 1)
    }
}
fn get_time_horizon(self: ScheduledValueChange<ContractClassId>, anchor_block_timestamp: u64, minimum_delay: u64) -> u64 {
    if (anchor_block_timestamp >= self.timestamp_of_change) {
        (anchor_block_timestamp + minimum_delay)
    } else {
        min((anchor_block_timestamp + minimum_delay), (self.timestamp_of_change - 1))
    }
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
fn hash(self: ContractClassFunctionLeafPreimage) -> Field {
    poseidon2_hash_with_separator([to_field(self.selector), self.vk_hash], DOM_SEP__PRIVATE_FUNCTION_LEAF)
}
fn root_from_sibling_path(leaf: Field, leaf_index: Field, sibling_path: [Field; 7]) -> Field {
    root_from_sibling_path_with_hasher(leaf, leaf_index, sibling_path, (merkle_hash, merkle_hash))
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 3], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn from_field(value: Field) -> ContractClassId {
    {
        let inner = value;
        (inner)
    }
}
fn compute_from_salted_initialization_hash(contract_class_id: ContractClassId, salted_initialization_hash: SaltedInitializationHash) -> PartialAddress {
    from_field(poseidon2_hash_with_separator([to_field(contract_class_id), to_field(salted_initialization_hash)], DOM_SEP__PARTIAL_ADDRESS))
}
fn compute(public_keys: PublicKeys, partial_address: PartialAddress) -> AztecAddress {
    let public_keys_hash = hash(public_keys);
    let pre_address = poseidon2_hash_with_separator([to_field(public_keys_hash), to_field(partial_address)], DOM_SEP__CONTRACT_ADDRESS_V2);
    let address_point = add(fixed_base_scalar_mul(from_field(pre_address)), to_point(public_keys.ivpk_m));
    from_field(address_point.x)
}
fn assert_max_bit_size(self: Field) -> () {
    static_assert((4 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 4);
}
fn derive_storage_slot_in_map(storage_slot: Field, key: AztecAddress) -> Field {
    poseidon2_hash_with_separator([storage_slot, to_field(key)], DOM_SEP__PUBLIC_STORAGE_MAP_SLOT)
}
fn read_current_value_of_delayed_public_mutable_with_hash(historical_header: BlockHeader, storage_slot: Field, contract_address: AztecAddress, delayed_public_mutable: DelayedPublicMutableValues<ContractClassId, 86400>, witness: MembershipWitness<40>, leaf_preimage: PublicDataTreeLeafPreimage) -> ContractClassId {
    let storage_slot_of_hash = derive_storage_slot_of_packed_values_hash(storage_slot);
    let public_data_leaf_slot = compute_public_data_leaf_slot(contract_address, storage_slot_of_hash);
    let hash = public_data_storage_read(historical_header.state.partial.public_data_tree.root, public_data_leaf_slot, witness, leaf_preimage);
    let packed = pack(delayed_public_mutable);
    let computed_hash = poseidon2_hash(packed);
    if (hash != 0) {
        assert((hash == computed_hash), "Hint values do not match hash");
    } else {
        assert(eq(packed, [0; 3]), "delayed_public_mutable must be zeroed when its stored hash is zero");
    };
    get_current_at(delayed_public_mutable.svc, historical_header.global_variables.timestamp)
}
fn empty() -> ContractClassId {
    {
        let inner = 0;
        (inner)
    }
}
fn eq(_self: PublicCallRequest, _other: PublicCallRequest) -> bool {
    (((eq(_self.msg_sender, _other.msg_sender) & eq(_self.contract_address, _other.contract_address)) & (_self.is_static_call == _other.is_static_call)) & (_self.calldata_hash == _other.calldata_hash))
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
unconstrained fn from_parts_unchecked(array: [SideEffectCounter; 138], len: u32) -> BoundedVec<SideEffectCounter, 138> {
    assert((len <= 138));
    {
        let storage = array;
        let len = len;
        (storage, len)
    }
}
unconstrained fn null() -> SideEffectCounter {
    {
        let counter = 0;
        let global_index = MAX_U32_VALUE;
        (counter, global_index)
    }
}
unconstrained fn push(self: &mut BoundedVec<SideEffectCounter, 138>, elem: SideEffectCounter) -> () {
    assert(((*self).len < 138), "push out of bounds");
    (*self).storage[(*self).len] = elem;
    (*self).len = ((*self).len + 1)
}
unconstrained fn new(counter: u32, global_index: u32) -> SideEffectCounter {
    {
        let counter = counter;
        let global_index = global_index;
        (counter, global_index)
    }
}
unconstrained fn counter(self: Scoped<Counted<Field>>) -> u32 {
    self.inner.counter
}
unconstrained fn counter(self: Counted<Field>) -> u32 {
    self.counter
}
unconstrained fn counter(self: Counted<Nullifier>) -> u32 {
    self.counter
}
unconstrained fn build_side_effect_counter_hints_for_private_call_request(item: PrivateCallRequest, index_in_array: u32) -> (SideEffectCounter, SideEffectCounter) {
    let start = {
        let counter = item.start_side_effect_counter;
        let global_index = (index_in_array + GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET);
        (counter, global_index)
    };
    let end = {
        let counter = item.end_side_effect_counter;
        let global_index = (index_in_array + GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET);
        (counter, global_index)
    };
    (start, end)
}
unconstrained fn counter(self: Counted<PublicCallRequest>) -> u32 {
    self.counter
}
unconstrained fn counter(self: Counted<L2ToL1Message>) -> u32 {
    self.counter
}
unconstrained fn counter(self: Counted<PrivateLogData>) -> u32 {
    self.counter
}
unconstrained fn counter(self: Counted<LogHash>) -> u32 {
    self.counter
}
unconstrained fn sort_via(self: &[SideEffectCounter; 138], ordering: fn[()](SideEffectCounter, SideEffectCounter) -> bool) -> [SideEffectCounter; 138] {
    if (138 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (138 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn storage(self: BoundedVec<SideEffectCounter, 138>) -> [SideEffectCounter; 138] {
    self.storage
}
unconstrained fn is_null(self: SideEffectCounter) -> bool {
    (self.global_index == MAX_U32_VALUE)
}
unconstrained fn lambda(a: (u32, u32), b: (u32, u32)) -> bool {
    if is_null(b) {
        true
    } else {
        (a.counter <= b.counter)
    }
}
unconstrained fn lambda(a: (u32, u32), b: (u32, u32)) -> bool {
    if is_null(b) {
        true
    } else {
        (a.counter <= b.counter)
    }
}
unconstrained fn len(self: &BoundedVec<SideEffectCounter, 138>) -> u32 {
    (*self).len
}
unconstrained fn subarray(array: [u8; 138], offset: u32) -> [u8; 16] {
    let mut result = [empty(); 16];
    for i in 0 .. 16 {
        result[i] = array[(offset + i)]
    };
    result
}
unconstrained fn subarray(array: [u8; 138], offset: u32) -> [u8; 8] {
    let mut result = [empty(); 8];
    for i in 0 .. 8 {
        result[i] = array[(offset + i)]
    };
    result
}
unconstrained fn subarray(array: [u8; 138], offset: u32) -> [u8; 32] {
    let mut result = [empty(); 32];
    for i in 0 .. 32 {
        result[i] = array[(offset + i)]
    };
    result
}
unconstrained fn subarray(array: [u8; 138], offset: u32) -> [u8; 1] {
    let mut result = [empty(); 1];
    for i in 0 .. 1 {
        result[i] = array[(offset + i)]
    };
    result
}
fn assert_null(self: SideEffectCounter, msg: str<51>) -> () {
    assert((self.global_index == MAX_U32_VALUE), msg);
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Scoped<Counted<Field>>, 16>, original_to_sorted_indices_hints: [u8; 16], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 16 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Counted<Field>, 16>, original_to_sorted_indices_hints: [u8; 16], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 16 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Counted<Nullifier>, 16>, original_to_sorted_indices_hints: [u8; 16], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 16 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_ranges_for_call_requests(private_call_requests: ClaimedLengthArray<PrivateCallRequest, 8>, original_to_sorted_indices_hints: [u8; 8], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset_for_range_start: u32, global_index_offset_for_range_end: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 8 {
        let item = private_call_requests.array[i];
        let start_counter = item.start_side_effect_counter;
        let end_counter = item.end_side_effect_counter;
        let global_index_for_range_start = (global_index_offset_for_range_start + i);
        let global_index_for_range_end = (global_index_offset_for_range_end + i);
        should_check = (should_check & (i != private_call_requests.length));
        let sorted_index_hint = (original_to_sorted_indices_hints[i] as u32);
        let start_hint = sorted_side_effect_counters_hints[sorted_index_hint];
        let end_hint = sorted_side_effect_counters_hints[(sorted_index_hint + 1)];
        if should_check {
            assert((start_counter == start_hint.counter), "Mismatch counter: start of call request does not match hint");
            assert((end_counter == end_hint.counter), "Mismatch counter: end of call request does not match hint");
            assert((global_index_for_range_start == start_hint.global_index), "Mismatch global index: start of call request does not match hint");
            assert((global_index_for_range_end == end_hint.global_index), "Mismatch global index: end of call request does not match hint");
        }
    }
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Counted<PublicCallRequest>, 32>, original_to_sorted_indices_hints: [u8; 32], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 32 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Counted<L2ToL1Message>, 8>, original_to_sorted_indices_hints: [u8; 8], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 8 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Counted<PrivateLogData>, 16>, original_to_sorted_indices_hints: [u8; 16], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 16 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_counters_for_array(items: ClaimedLengthArray<Counted<LogHash>, 1>, original_to_sorted_indices_hints: [u8; 1], sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let mut should_check = true;
    for i in 0 .. 1 {
        let counter = counter(items.array[i]);
        let global_index = (global_index_offset + i);
        should_check = (should_check & (i != items.length));
        let sorted_index_of_original_index_i = original_to_sorted_indices_hints[i];
        let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(sorted_index_of_original_index_i as u32)];
        if should_check {
            assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: side effect does not match hint");
            assert((global_index == sorted_side_effect_counter_hint.global_index), "Mismatch global index: side effect does not match hint");
        }
    }
}
fn validate_side_effect_counter_for_single_value(counter: u32, original_to_sorted_index_hint: u8, sorted_side_effect_counters_hints: [SideEffectCounter; 138], global_index_offset: u32) -> () {
    let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(original_to_sorted_index_hint as u32)];
    if (counter != 0) {
        assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: value does not match hint");
        assert((global_index_offset == sorted_side_effect_counter_hint.global_index), "Mismatch global index: value does not match hint");
    }
}
fn validate_increasing_counters(sorted_side_effect_counters_hints: [SideEffectCounter; 138], total_side_effects: u32, private_call_counter_start: u32, private_call_counter_end: u32) -> () {
    let mut prev_counter = private_call_counter_start;
    let mut should_check = true;
    for i in 0 .. TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL {
        let hint = sorted_side_effect_counters_hints[i];
        should_check = (should_check & (i != total_side_effects));
        if should_check {
            assert((hint.counter > prev_counter), "Counter must be greater than previous counter");
            prev_counter = hint.counter
        }
    };
    assert((prev_counter < private_call_counter_end), "Counter must be less than the end counter of the call");
}
fn eq(_self: Gas, _other: Gas) -> bool {
    ((_self.da_gas == _other.da_gas) & (_self.l2_gas == _other.l2_gas))
}
fn eq(_self: GasFees, _other: GasFees) -> bool {
    ((_self.fee_per_da_gas == _other.fee_per_da_gas) & (_self.fee_per_l2_gas == _other.fee_per_l2_gas))
}
fn empty() -> Counted<Field> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
fn empty() -> AztecAddress {
    {
        let inner = 0;
        (inner)
    }
}
fn empty() -> KeyValidationRequestAndSeparator {
    {
        let request = empty();
        let key_type_domain_separator = 0;
        (request, key_type_domain_separator)
    }
}
fn empty() -> Counted<Nullifier> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
fn empty() -> Counted<L2ToL1Message> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
fn empty() -> Counted<PrivateLogData> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
fn empty() -> Counted<LogHash> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
fn empty() -> CallContext {
    {
        let msg_sender = empty();
        let contract_address = empty();
        let function_selector = empty();
        let is_static_call = false;
        (msg_sender, contract_address, function_selector, is_static_call)
    }
}
fn concat(self: &[Field; 1], array2: [Field; 15]) -> [Field; 16] {
    let mut result = [0; 16];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 15 {
        result[(i + 1)] = array2[i]
    };
    result
}
fn poseidon2_hash(inputs: [Field; 16]) -> Field {
    hash(inputs, 16)
}
fn new() -> Writer<15> {
    {
        let data = [0; 15];
        let offset = 0;
        (data, offset)
    }
}
#[inline_always]
fn stream_serialize(self: TxRequest, writer: &mut Writer<15>) -> () {
    stream_serialize(self.origin, writer);
    stream_serialize(self.args_hash, writer);
    stream_serialize(self.tx_context, writer);
    stream_serialize(self.function_data, writer);
    stream_serialize(self.salt, writer);
}
fn finish(self: Writer<15>) -> [Field; 15] {
    assert((self.offset == self.data.len()), "Writer did not write all data");
    self.data
}
#[no_predicates]
fn hash(input: [Field; 3], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
fn subarray(array: [Field; 3], offset: u32) -> [Field; 1] {
    let mut result = [empty(); 1];
    for i in 0 .. 1 {
        result[i] = array[(offset + i)]
    };
    result
}
fn new(pre: ContractClassId, post: ContractClassId, timestamp_of_change: u64) -> ScheduledValueChange<ContractClassId> {
    {
        let pre = pre;
        let post = post;
        let timestamp_of_change = timestamp_of_change;
        (pre, post, timestamp_of_change)
    }
}
#[inline_always]
fn unpack(packed: [Field; 1]) -> ContractClassId {
    {
        let inner = unpack(packed);
        (inner)
    }
}
fn some(_value: u64) -> Option<u64> {
    {
        let _is_some = true;
        let _value = _value;
        (_is_some, _value)
    }
}
fn none() -> Option<u64> {
    {
        let _is_some = false;
        let _value = 0;
        (_is_some, _value)
    }
}
fn unwrap_or(self: Option<u64>, default: u64) -> u64 {
    if self._is_some {
        self._value
    } else {
        default
    }
}
fn to_field(self: FunctionSelector) -> Field {
    (self.inner as Field)
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
fn concat(self: &[Field; 1], array2: [Field; 3]) -> [Field; 4] {
    let mut result = [0; 4];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 3 {
        result[(i + 1)] = array2[i]
    };
    result
}
fn poseidon2_hash(inputs: [Field; 4]) -> Field {
    hash(inputs, 4)
}
fn from_field(field: Field) -> PartialAddress {
    {
        let inner = field;
        (inner)
    }
}
fn to_field(self: ContractClassId) -> Field {
    self.inner
}
fn to_field(self: SaltedInitializationHash) -> Field {
    self.inner
}
fn hash(self: PublicKeys) -> PublicKeysHash {
    from_field(poseidon2_hash_with_separator([self.npk_m_hash, hash(self.ivpk_m), self.ovpk_m_hash, self.tpk_m_hash, self.mspk_m_hash, self.fbpk_m_hash], (DOM_SEP__PUBLIC_KEYS_HASH as Field)))
}
fn to_field(self: PublicKeysHash) -> Field {
    self.inner
}
fn to_field(self: PartialAddress) -> Field {
    self.inner
}
fn add(self: EmbeddedCurvePoint, other: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
    embedded_curve_add(self, other)
}
fn fixed_base_scalar_mul(scalar: EmbeddedCurveScalar) -> EmbeddedCurvePoint {
    multi_scalar_mul([generator()], [scalar])
}
fn from_field(scalar: Field) -> EmbeddedCurveScalar {
    {
        let _ = decompose(scalar);
        let a = _.0;
        let b = _.1
    };
    {
        let lo = a;
        let hi = b;
        (lo, hi)
    }
}
fn to_point(self: IvpkM) -> EmbeddedCurvePoint {
    self.inner
}
fn from_field(value: Field) -> AztecAddress {
    {
        let inner = value;
        (inner)
    }
}
fn to_field(self: AztecAddress) -> Field {
    self.inner
}
fn derive_storage_slot_of_packed_values_hash(start_storage_slot: Field) -> Field {
    (start_storage_slot + (3 as Field))
}
fn compute_public_data_leaf_slot(contract_address: AztecAddress, storage_slot: Field) -> Field {
    poseidon2_hash_with_separator([to_field(contract_address), storage_slot], DOM_SEP__PUBLIC_LEAF_SLOT)
}
fn public_data_storage_read(public_data_tree_root: Field, public_data_leaf_slot: Field, witness: MembershipWitness<40>, leaf_preimage: PublicDataTreeLeafPreimage) -> Field {
    let is_slot_in_tree = (leaf_preimage.slot == public_data_leaf_slot);
    {
        let _ = conditionally_check_membership_with_hasher(public_data_leaf_slot, is_slot_in_tree, leaf_preimage, witness, public_data_tree_root, (public_data_merkle_hash, public_data_merkle_hash));
        let _ = _.0;
        let is_expected_leaf = _.1;
        let is_leaf_in_tree = _.2
    };
    assert(is_leaf_in_tree, "Proving public value inclusion failed");
    assert(is_expected_leaf, "The provided public data tree leaf preimage is not the correct leaf for the requested slot");
    if is_slot_in_tree {
        leaf_preimage.value
    } else {
        0
    }
}
fn pack(self: DelayedPublicMutableValues<ContractClassId, 86400>) -> [Field; 3] {
    let mut result = [0; 3];
    assert_max_bit_size((self.svc.timestamp_of_change as Field));
    assert_max_bit_size((self.sdc.timestamp_of_change as Field));
    assert_max_bit_size((unwrap_unchecked(self.sdc.post) as Field));
    assert_max_bit_size((unwrap_unchecked(self.sdc.pre) as Field));
    result[0] = ((((((self.svc.timestamp_of_change as Field) + ((self.sdc.timestamp_of_change as Field) * pow_32(2, 32))) + ((is_some((&self.sdc.post)) as Field) * pow_32(2, 64))) + ((unwrap_unchecked(self.sdc.post) as Field) * pow_32(2, 72))) + ((is_some((&self.sdc.pre)) as Field) * pow_32(2, 104))) + ((unwrap_unchecked(self.sdc.pre) as Field) * pow_32(2, 112)));
    let svc_pre_packed = pack(self.svc.pre);
    let svc_post_packed = pack(self.svc.post);
    for i in 0 .. 1 {
        result[(i + 1)] = svc_pre_packed[i];
        result[((i + 1) + 1)] = svc_post_packed[i]
    };
    result
}
fn poseidon2_hash(inputs: [Field; 3]) -> Field {
    hash(inputs, 3)
}
fn eq(self: [Field; 3], other: [Field; 3]) -> bool {
    let mut result = true;
    for i in 0 .. self.len() {
        {
            let op_rhs_0 = eq(self[i], other[i]);
            result = (result & op_rhs_0)
        }
    };
    result
}
fn get_current_at(self: ScheduledValueChange<ContractClassId>, timestamp: u64) -> ContractClassId {
    if (timestamp < self.timestamp_of_change) {
        self.pre
    } else {
        self.post
    }
}
unconstrained fn quicksort(arr: &[SideEffectCounter; 138], sortfn: unconstrained fn[()](SideEffectCounter, SideEffectCounter) -> bool) -> [SideEffectCounter; 138] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SideEffectCounter; 138], rhs: &[SideEffectCounter; 138]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 138 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 138 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
#[inline_always]
unconstrained fn empty() -> u8 {
    0
}
fn counter(self: Scoped<Counted<Field>>) -> u32 {
    self.inner.counter
}
fn counter(self: Counted<Field>) -> u32 {
    self.counter
}
fn counter(self: Counted<Nullifier>) -> u32 {
    self.counter
}
fn counter(self: Counted<PublicCallRequest>) -> u32 {
    self.counter
}
fn counter(self: Counted<L2ToL1Message>) -> u32 {
    self.counter
}
fn counter(self: Counted<PrivateLogData>) -> u32 {
    self.counter
}
fn counter(self: Counted<LogHash>) -> u32 {
    self.counter
}
#[inline_always]
fn empty() -> Field {
    0
}
fn empty() -> KeyValidationRequest {
    {
        let pk_m_hash = 0;
        let sk_app = 0;
        (pk_m_hash, sk_app)
    }
}
fn empty() -> Nullifier {
    {
        let value = 0;
        let note_hash = 0;
        (value, note_hash)
    }
}
fn empty() -> L2ToL1Message {
    {
        let recipient = empty();
        let content = 0;
        (recipient, content)
    }
}
fn empty() -> PrivateLogData {
    {
        let log = empty();
        let note_hash_counter = 0;
        (log, note_hash_counter)
    }
}
fn empty() -> LogHash {
    {
        let value = 0;
        let length = 0;
        (value, length)
    }
}
fn empty() -> FunctionSelector {
    {
        let inner = (0 as u32);
        (inner)
    }
}
#[no_predicates]
fn hash(input: [Field; 16], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[inline_always]
fn stream_serialize(self: AztecAddress, writer: &mut Writer<15>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<15>) -> () {
    write(writer, self);
}
#[inline_always]
fn stream_serialize(self: TxContext, writer: &mut Writer<15>) -> () {
    stream_serialize(self.chain_id, writer);
    stream_serialize(self.version, writer);
    stream_serialize(self.gas_settings, writer);
}
#[inline_always]
fn stream_serialize(self: FunctionData, writer: &mut Writer<15>) -> () {
    stream_serialize(self.selector, writer);
    stream_serialize(self.is_private, writer);
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
#[inline_always]
fn unpack(fields: [Field; 1]) -> Field {
    fields[0]
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
unconstrained fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
#[no_predicates]
fn hash(input: [Field; 4], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
fn from_field(field: Field) -> PublicKeysHash {
    {
        let inner = field;
        (inner)
    }
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 6], separator: Field) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
fn hash(self: IvpkM) -> Field {
    hash_public_key(self.inner)
}
fn embedded_curve_add(point1: EmbeddedCurvePoint, point2: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
    embedded_curve_add_array_return(point1, point2, true)[0]
}
fn multi_scalar_mul(points: [EmbeddedCurvePoint; 1], scalars: [EmbeddedCurveScalar; 1]) -> EmbeddedCurvePoint {
    multi_scalar_mul_array_return(points, scalars, true)[0]
}
fn generator() -> EmbeddedCurvePoint {
    {
        let x = 1;
        let y = 17631683881184975370165255887551781615748388533673675138860;
        (x, y)
    }
}
fn decompose(x: Field) -> (Field, Field) {
    if is_unconstrained() {
        compute_decomposition(x)
    } else {
        {
            {
                let _ = unsafe { decompose_hint(x) };
                let xlo = _.0;
                let xhi = _.1
            };
            assert_max_bit_size(xlo);
            assert_max_bit_size(xhi);
            assert((x == (xlo + (TWO_POW_128 * xhi))));
            assert_gt_limbs((PLO, PHI), (xlo, xhi));
            (xlo, xhi)
        }
    }
}
fn conditionally_check_membership_with_hasher(key: Field, exists: bool, leaf_preimage: PublicDataTreeLeafPreimage, membership_witness: MembershipWitness<40>, tree_root: Field, hasher: fn(Field, Field) -> Field) -> (bool, bool, bool) {
    let is_matching_leaf = (key == get_key(leaf_preimage));
    {
        let _ = is_valid_low_leaf(key, leaf_preimage);
        let is_low_leaf = _.0;
        let _ = _.1;
        let _ = _.2
    };
    let is_expected_leaf = if exists {
        is_matching_leaf
    } else {
        is_low_leaf
    };
    let is_leaf_in_tree = check_membership_with_hasher(as_leaf(leaf_preimage), membership_witness, tree_root, hasher);
    let is_valid = (is_expected_leaf & is_leaf_in_tree);
    (is_valid, is_expected_leaf, is_leaf_in_tree)
}
fn public_data_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__PUBLIC_DATA_MERKLE)
}
unconstrained fn public_data_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__PUBLIC_DATA_MERKLE)
}
fn assert_max_bit_size(self: Field) -> () {
    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 32);
}
fn unwrap_unchecked(self: Option<u64>) -> u64 {
    self._value
}
fn pow_32(self: Field, exponent: Field) -> Field {
    let mut r = 1;
    let b = to_le_bits(exponent);
    for i in 1 .. 33 {
        r = (r * r);
        r = (((b[(32 - i)] as Field) * (r * self)) + ((1 - (b[(32 - i)] as Field)) * r))
    };
    r
}
fn is_some(self: &Option<u64>) -> bool {
    (*self)._is_some
}
#[inline_always]
fn pack(self: ContractClassId) -> [Field; 1] {
    pack(self.inner)
}
#[no_predicates]
fn hash(input: [Field; 3], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
fn eq(self: Field, other: Field) -> bool {
    (self == other)
}
unconstrained fn quicksort_loop(arr: &mut [SideEffectCounter; 138], low: u32, high: u32, sortfn: unconstrained fn[()](SideEffectCounter, SideEffectCounter) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 138) {
        if (stack.len() == 0) {
            break
        };
        {
            let _ = stack.pop_back();
            let new_stack = _.0;
            {
                let _ = _.1;
                let new_low = _.0;
                let new_high = _.1
            }
        };
        stack = new_stack;
        if (new_high < (new_low + 1)) {
            continue
        };
        let pivot_index = partition(arr, new_low, new_high, sortfn);
        stack = stack.push_back(((pivot_index + 1), new_high));
        if (0 < pivot_index) {
            stack = stack.push_back((new_low, (pivot_index - 1)))
        }
    }
}
unconstrained fn __get_shuffle_indices(lhs: &[SideEffectCounter; 138], rhs: &[SideEffectCounter; 138]) -> [u32; 138] {
    let mut shuffle_indices = [0; 138];
    let mut shuffle_mask = [false; 138];
    for i in 0 .. 138 {
        let mut found = false;
        for j in 0 .. 138 {
            if (shuffle_mask[j] == false) {
                if eq((*lhs)[i], (*rhs)[j]) {
                    found = true;
                    shuffle_indices[i] = j;
                    shuffle_mask[j] = true;
                    break
                }
            }
        };
        assert((found == true), "check_shuffle, lhs and rhs arrays do not contain equivalent values");
    };
    shuffle_indices
}
unconstrained fn __get_index(indices: &[u32; 138], idx: u32) -> u32 {
    let mut result = 0;
    for i in 0 .. 138 {
        if ((*indices)[i] == idx) {
            result = i;
            break
        }
    };
    result
}
unconstrained fn eq(_self: SideEffectCounter, _other: SideEffectCounter) -> bool {
    ((_self.counter == _other.counter) & (_self.global_index == _other.global_index))
}
fn empty() -> EthAddress {
    {
        let inner = 0;
        (inner)
    }
}
fn empty() -> Log<16> {
    {
        let fields = [0; 16];
        let length = 0;
        (fields, length)
    }
}
fn hash_internal(input: [Field; 16], in_len: u32) -> Field {
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
        let mut states = [[0; 4]; 6];
        states[0] = state;
        for chunk_idx in 0 .. (16 / RATE) {
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
fn write(self: &mut Writer<15>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}
#[inline_always]
fn stream_serialize(self: GasSettings, writer: &mut Writer<15>) -> () {
    stream_serialize(self.gas_limits, writer);
    stream_serialize(self.teardown_gas_limits, writer);
    stream_serialize(self.max_fees_per_gas, writer);
    stream_serialize(self.max_priority_fees_per_gas, writer);
}
#[inline_always]
fn stream_serialize(self: FunctionSelector, writer: &mut Writer<15>) -> () {
    stream_serialize(self.inner, writer);
}
#[inline_always]
fn stream_serialize(self: bool, writer: &mut Writer<15>) -> () {
    write(writer, (self as Field));
}
fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
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
fn hash_internal(input: [Field; 4], in_len: u32) -> Field {
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
        for chunk_idx in 0 .. (4 / RATE) {
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
fn concat(self: &[Field; 1], array2: [Field; 6]) -> [Field; 7] {
    let mut result = [0; 7];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 6 {
        result[(i + 1)] = array2[i]
    };
    result
}
#[inline_always]
fn to_field(self: Field) -> Field {
    self
}
fn poseidon2_hash(inputs: [Field; 7]) -> Field {
    hash(inputs, 7)
}
fn hash_public_key(p: EmbeddedCurvePoint) -> Field {
    poseidon2_hash_with_separator([p.x, p.y], (DOM_SEP__SINGLE_PUBLIC_KEY_HASH as Field))
}
fn compute_decomposition(x: Field) -> (Field, Field) {
    let low = ((x as u128) as Field);
    let high = ((x - low) / TWO_POW_128);
    (low, high)
}
unconstrained fn decompose_hint(x: Field) -> (Field, Field) {
    compute_decomposition(x)
}
fn assert_max_bit_size(self: Field) -> () {
    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 128);
}
fn assert_gt_limbs(a: (Field, Field), b: (Field, Field)) -> () {
    {
        let _ = a;
        let alo = _.0;
        let ahi = _.1
    };
    {
        let _ = b;
        let blo = _.0;
        let bhi = _.1
    };
    {
        let borrow = unsafe { lte_hint(alo, blo) };
        let rlo = (((alo - blo) - 1) + ((borrow as Field) * TWO_POW_128));
        let rhi = ((ahi - bhi) - (borrow as Field));
        assert_max_bit_size(rlo);
        assert_max_bit_size(rhi);
    }
}
fn get_key(self: PublicDataTreeLeafPreimage) -> Field {
    self.slot
}
fn is_valid_low_leaf(key: Field, low_leaf_preimage: PublicDataTreeLeafPreimage) -> (bool, bool, bool) {
    let low_key = get_key(low_leaf_preimage);
    let next_key = get_next_key(low_leaf_preimage);
    let is_greater_than_low = lt(low_key, key);
    let is_less_than_next = (lt(key, next_key) | points_to_infinity(low_leaf_preimage));
    let is_valid = (is_greater_than_low & is_less_than_next);
    (is_valid, is_greater_than_low, is_less_than_next)
}
fn check_membership_with_hasher(leaf: Field, membership_witness: MembershipWitness<40>, root: Field, hasher: fn(Field, Field) -> Field) -> bool {
    let calculated_root = root_from_sibling_path_with_hasher(leaf, membership_witness.leaf_index, membership_witness.sibling_path, hasher);
    (calculated_root == root)
}
fn as_leaf(self: PublicDataTreeLeafPreimage) -> Field {
    hash(self)
}
fn to_le_bits(self: Field) -> [bool; 32] {
    let bits = __to_le_bits(self);
    if (!is_unconstrained()) {
        let p = @[true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, false, false, true, false, false, true, true, false, true, false, true, true, true, true, true, false, false, false, false, true, true, true, true, true, false, false, false, false, true, false, true, false, false, false, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, true, true, false, false, true, true, true, true, false, false, false, false, true, false, false, true, false, false, false, false, true, false, true, true, true, true, true, false, false, true, true, false, false, false, false, false, true, false, true, false, false, true, false, true, true, true, false, true, false, false, false, false, true, true, false, true, false, true, false, false, false, false, false, false, true, true, false, false, false, false, false, false, true, false, true, true, false, true, true, false, true, true, false, true, false, false, false, true, false, false, false, false, false, true, false, true, false, false, false, false, true, true, true, false, true, true, false, false, true, false, true, false, false, false, false, false, false, false, true, false, true, true, false, false, false, true, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, false, true, true, true, false, false, true, false, false, false, true, false, false, true, true, false, false, false, false, false, true, true];
        assert((bits.len() <= p.len()));
        let mut ok = (bits.len() != p.len());
        for i in 0 .. 32 {
            if (!ok) {
                if (bits[((32 - 1) - i)] != p[((32 - 1) - i)]) {
                    assert(p[((32 - 1) - i)]);
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bits
}
#[inline_always]
fn pack(self: Field) -> [Field; 1] {
    [self]
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
unconstrained fn partition(arr: &mut [SideEffectCounter; 138], low: u32, high: u32, sortfn: unconstrained fn[()](SideEffectCounter, SideEffectCounter) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if sortfn.1((*arr)[j], (*arr)[pivot]) {
            let temp = (*arr)[i];
            (*arr)[i] = (*arr)[j];
            (*arr)[j] = temp;
            i = (i + 1)
        }
    };
    let temp = (*arr)[i];
    (*arr)[i] = (*arr)[pivot];
    (*arr)[pivot] = temp;
    i
}
#[inline_always]
fn stream_serialize(self: Gas, writer: &mut Writer<15>) -> () {
    stream_serialize(self.da_gas, writer);
    stream_serialize(self.l2_gas, writer);
}
#[inline_always]
fn stream_serialize(self: GasFees, writer: &mut Writer<15>) -> () {
    stream_serialize(self.fee_per_da_gas, writer);
    stream_serialize(self.fee_per_l2_gas, writer);
}
#[inline_always]
fn stream_serialize(self: u32, writer: &mut Writer<15>) -> () {
    write(writer, (self as Field));
}
#[no_predicates]
unconstrained fn hash(input: [Field; 3], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[no_predicates]
fn hash(input: [Field; 7], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: Field) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
unconstrained fn compute_decomposition(x: Field) -> (Field, Field) {
    let low = ((x as u128) as Field);
    let high = ((x - low) / TWO_POW_128);
    (low, high)
}
unconstrained fn lte_hint(x: Field, y: Field) -> bool {
    if (x == y) {
        true
    } else {
        field_less_than(x, y)
    }
}
fn get_next_key(self: PublicDataTreeLeafPreimage) -> Field {
    self.next_slot
}
fn lt(self: Field, another: Field) -> bool {
    if is_bn254() {
        lt(self, another)
    } else {
        lt_fallback(self, another)
    }
}
fn points_to_infinity(self: PublicDataTreeLeafPreimage) -> bool {
    ((self.next_slot == 0) & (self.next_index == 0))
}
fn root_from_sibling_path_with_hasher(leaf: Field, leaf_index: Field, sibling_path: [Field; 40], hasher: fn(Field, Field) -> Field) -> Field {
    let mut node = leaf;
    let indices = to_le_bits(leaf_index);
    for i in 0 .. 40 {
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
fn hash(self: PublicDataTreeLeafPreimage) -> Field {
    poseidon2_hash(serialize(self))
}
#[inline_always]
fn stream_serialize(self: u128, writer: &mut Writer<15>) -> () {
    write(writer, (self as Field));
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
fn hash_internal(input: [Field; 7], in_len: u32) -> Field {
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
        let mut states = [[0; 4]; 3];
        states[0] = state;
        for chunk_idx in 0 .. (7 / RATE) {
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
unconstrained fn field_less_than(x: Field, y: Field) -> bool {
    __field_less_than(x, y)
}
fn is_bn254() -> bool {
    true
}
fn lt(a: Field, b: Field) -> bool {
    gt(b, a)
}
fn lt_fallback(x: Field, y: Field) -> bool {
    if is_unconstrained() {
        {
            unsafe { field_less_than(x, y) }
        }
    } else {
        let x_bytes = to_le_bytes(x);
        let y_bytes = to_le_bytes(y);
        let mut x_is_lt = false;
        let mut done = false;
        for i in 0 .. 32 {
            if (!done) {
                let x_byte = (x_bytes[((32 - 1) - i)] as u8);
                let y_byte = (y_bytes[((32 - 1) - i)] as u8);
                let bytes_match = (x_byte == y_byte);
                if (!bytes_match) {
                    x_is_lt = (x_byte < y_byte);
                    done = true
                }
            }
        };
        x_is_lt
    }
}
fn to_le_bits(self: Field) -> [bool; 40] {
    let bits = __to_le_bits(self);
    if (!is_unconstrained()) {
        let p = @[true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, false, false, true, false, false, true, true, false, true, false, true, true, true, true, true, false, false, false, false, true, true, true, true, true, false, false, false, false, true, false, true, false, false, false, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, true, true, false, false, true, true, true, true, false, false, false, false, true, false, false, true, false, false, false, false, true, false, true, true, true, true, true, false, false, true, true, false, false, false, false, false, true, false, true, false, false, true, false, true, true, true, false, true, false, false, false, false, true, true, false, true, false, true, false, false, false, false, false, false, true, true, false, false, false, false, false, false, true, false, true, true, false, true, true, false, true, true, false, true, false, false, false, true, false, false, false, false, false, true, false, true, false, false, false, false, true, true, true, false, true, true, false, false, true, false, true, false, false, false, false, false, false, false, true, false, true, true, false, false, false, true, true, false, false, true, false, false, false, false, true, true, true, false, true, false, false, true, true, true, false, false, true, true, true, false, false, true, false, false, false, true, false, false, true, true, false, false, false, false, false, true, true];
        assert((bits.len() <= p.len()));
        let mut ok = (bits.len() != p.len());
        for i in 0 .. 40 {
            if (!ok) {
                if (bits[((40 - 1) - i)] != p[((40 - 1) - i)]) {
                    assert(p[((40 - 1) - i)]);
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bits
}
fn poseidon2_hash(inputs: [Field; 4]) -> Field {
    hash(inputs, 4)
}
fn serialize(self: PublicDataTreeLeafPreimage) -> [Field; 4] {
    let mut writer = new();
    stream_serialize(self, (&mut writer));
    finish(writer)
}
unconstrained fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
}
fn gt(a: Field, b: Field) -> bool {
    if is_unconstrained() {
        {
            unsafe { field_less_than(b, a) }
        }
    } else {
        if (a == b) {
            false
        } else {
            {
                if unsafe { field_less_than(a, b) } {
                    assert_gt(b, a);
                    false
                } else {
                    assert_gt(a, b);
                    true
                }
            }
        }
    }
}
fn to_le_bytes(self: Field) -> [u8; 32] {
    static_assert((32 <= @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48].len()), "N must be less than or equal to modulus_le_bytes().len()", r#"{"kind":"string","length":56}"#, false);
    let bytes = to_le_radix(self, 256);
    if (!is_unconstrained()) {
        let p = @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48];
        assert((bytes.len() <= p.len()));
        let mut ok = (bytes.len() != p.len());
        for i in 0 .. 32 {
            if (!ok) {
                if (bytes[((32 - 1) - i)] != p[((32 - 1) - i)]) {
                    assert((bytes[((32 - 1) - i)] < p[((32 - 1) - i)]));
                    ok = true
                }
            }
        };
        assert(ok);
    };
    bytes
}
#[no_predicates]
fn hash(input: [Field; 4], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
fn new() -> Writer<4> {
    {
        let data = [0; 4];
        let offset = 0;
        (data, offset)
    }
}
#[inline_always]
fn stream_serialize(self: PublicDataTreeLeafPreimage, writer: &mut Writer<4>) -> () {
    stream_serialize(self.slot, writer);
    stream_serialize(self.value, writer);
    stream_serialize(self.next_slot, writer);
    stream_serialize(self.next_index, writer);
}
fn finish(self: Writer<4>) -> [Field; 4] {
    assert((self.offset == self.data.len()), "Writer did not write all data");
    self.data
}
fn assert_gt(a: Field, b: Field) -> () {
    if is_unconstrained() {
        assert({
            unsafe { field_less_than(b, a) }
        });
    } else {
        let a_limbs = decompose(a);
        let b_limbs = decompose(b);
        assert_gt_limbs(a_limbs, b_limbs)
    }
}
fn to_le_radix(self: Field, radix: u32) -> [u8; 32] {
    if (!is_unconstrained()) {
        static_assert((1 < radix), "radix must be greater than 1", r#"{"kind":"string","length":28}"#, false);
        static_assert((radix <= 256), "radix must be less than or equal to 256", r#"{"kind":"string","length":39}"#, false);
        static_assert(((radix & (radix - 1)) == 0), "radix must be a power of 2", r#"{"kind":"string","length":26}"#, false);
    };
    __to_le_radix(self, radix)
}
fn hash_internal(input: [Field; 4], in_len: u32) -> Field {
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
        for chunk_idx in 0 .. (4 / RATE) {
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
fn stream_serialize(self: Field, writer: &mut Writer<4>) -> () {
    write(writer, self);
}
fn write(self: &mut Writer<4>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}

