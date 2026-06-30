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
        let private_call = {
            // >>> inlined call: to_private_call_data;
            let self = private_call;
            let public_inputs = app_public_inputs;
            {
                {
                    let public_inputs = public_inputs;
                    let vk = self.vk;
                    let verification_key_hints = self.verification_key_hints;
                    (public_inputs, vk, verification_key_hints)
                }
            }
        };
        let is_private_only = is_private_only;
        let revertible_counter_hint = revertible_counter_hint;
        (tx_request, private_call, vk_tree_root, protocol_contracts, is_private_only, revertible_counter_hint)
    };
    {
        // >>> inlined call: execute;
        let inputs = private_inputs;
        {
            {
                // >>> inlined call: validate_as_first_call;
                let self = {
                    // >>> inlined call: new;
                    let data = inputs.private_call;
                    {
                        {
                            let data = data;
                            (data)
                        }
                    }
                };
                let tx_request = inputs.tx_request;
                let protocol_contracts = inputs.protocol_contracts;
                let claimed_revertible_counter = inputs.revertible_counter_hint;
                {
                    {
                        // >>> inlined call: validate_common;
                        let __arg_0 = self;
                        let __arg_1 = true;
                        let __arg_2 = protocol_contracts;
                        let __arg_3 = claimed_revertible_counter;
                        let self = __arg_0;
                        let is_first_function_call = __arg_1;
                        let protocol_contracts = __arg_2;
                        let claimed_revertible_counter = __arg_3;
                        {
                            if (!is_unconstrained()) {
                                {
                                    // >>> inlined call: verify;
                                    let __arg_0 = self.data;
                                    let __arg_1 = is_first_function_call;
                                    let self = __arg_0;
                                    let is_first_function_call = __arg_1;
                                    {
                                        let proof_type = if is_first_function_call {
                                            PROOF_TYPE_OINK
                                        } else {
                                            PROOF_TYPE_HN
                                        };
                                        {
                                            // >>> inlined call: verify_proof_with_type;
                                            let __arg_0 = self.vk.key;
                                            let __arg_1 = [];
                                            let __arg_2 = [];
                                            let __arg_3 = self.vk.hash;
                                            let __arg_4 = proof_type;
                                            let verification_key = __arg_0;
                                            let proof = __arg_1;
                                            let public_inputs = __arg_2;
                                            let key_hash = __arg_3;
                                            let proof_type = __arg_4;
                                            {
                                                if (!is_unconstrained()) {
                                                    assert_constant(proof_type);
                                                };
                                                verify_proof_internal(verification_key, proof, public_inputs, key_hash, proof_type);
                                            }
                                        };
                                    }
                                };
                            };
                            {
                                // >>> inlined call: validate_contract_address;
                                let __arg_0 = self.data;
                                let __arg_1 = protocol_contracts;
                                let private_call_data = __arg_0;
                                let protocol_contracts = __arg_1;
                                {
                                    let contract_address = private_call_data.public_inputs.call_context.contract_address;
                                    let function_selector = private_call_data.public_inputs.call_context.function_selector;
                                    let vk_hash = private_call_data.vk.hash;
                                    let hints = private_call_data.verification_key_hints;
                                    let private_functions_root = {
                                        // >>> inlined call: private_functions_root_from_siblings;
                                        let __arg_0 = function_selector;
                                        let __arg_1 = vk_hash;
                                        let __arg_2 = hints.function_leaf_membership_witness.leaf_index;
                                        let __arg_3 = hints.function_leaf_membership_witness.sibling_path;
                                        let selector = __arg_0;
                                        let vk_hash = __arg_1;
                                        let function_leaf_index = __arg_2;
                                        let function_leaf_sibling_path = __arg_3;
                                        {
                                            let function_leaf_preimage = {
                                                let selector = selector;
                                                let vk_hash = vk_hash;
                                                (selector, vk_hash)
                                            };
                                            let function_leaf = {
                                                // >>> inlined call: hash;
                                                let self = function_leaf_preimage;
                                                {
                                                    poseidon2_hash_with_separator([{
                                                        // >>> inlined call: to_field;
                                                        let __arg_0 = self.selector;
                                                        let self = __arg_0;
                                                        {
                                                            (self.inner as Field)
                                                        }
                                                    }, self.vk_hash], DOM_SEP__PRIVATE_FUNCTION_LEAF)
                                                }
                                            };
                                            {
                                                // >>> inlined call: root_from_sibling_path;
                                                let leaf = function_leaf;
                                                let leaf_index = function_leaf_index;
                                                let sibling_path = function_leaf_sibling_path;
                                                {
                                                    {
                                                        // >>> inlined call: root_from_sibling_path_with_hasher;
                                                        let __arg_0 = leaf;
                                                        let __arg_1 = leaf_index;
                                                        let __arg_2 = sibling_path;
                                                        let __arg_3 = (merkle_hash, merkle_hash);
                                                        let leaf = __arg_0;
                                                        let leaf_index = __arg_1;
                                                        let sibling_path = __arg_2;
                                                        let hasher = __arg_3;
                                                        {
                                                            let mut node = leaf;
                                                            let indices = {
                                                                // >>> inlined call: to_le_bits;
                                                                let self = leaf_index;
                                                                {
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
                                                            };
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
                                                    }
                                                }
                                            }
                                        }
                                    };
                                    let computed_contract_class_id = {
                                        // >>> inlined call: compute;
                                        let __arg_0 = hints.contract_class_artifact_hash;
                                        let __arg_1 = private_functions_root;
                                        let __arg_2 = hints.contract_class_public_bytecode_commitment;
                                        let artifact_hash = __arg_0;
                                        let private_functions_root = __arg_1;
                                        let public_bytecode_commitment = __arg_2;
                                        {
                                            let hash = poseidon2_hash_with_separator([artifact_hash, private_functions_root, public_bytecode_commitment], DOM_SEP__CONTRACT_CLASS_ID);
                                            {
                                                // >>> inlined call: from_field;
                                                let value = hash;
                                                {
                                                    {
                                                        let inner = value;
                                                        (inner)
                                                    }
                                                }
                                            }
                                        }
                                    };
                                    let computed_address = {
                                        // >>> inlined call: compute_from_class_id;
                                        let contract_class_id = computed_contract_class_id;
                                        let salted_initialization_hash = hints.salted_initialization_hash;
                                        let public_keys = hints.public_keys;
                                        {
                                            let partial_address = {
                                                // >>> inlined call: compute_from_salted_initialization_hash;
                                                let __arg_0 = contract_class_id;
                                                let __arg_1 = salted_initialization_hash;
                                                let contract_class_id = __arg_0;
                                                let salted_initialization_hash = __arg_1;
                                                {
                                                    {
                                                        // >>> inlined call: from_field;
                                                        let field = poseidon2_hash_with_separator([{
                                                            // >>> inlined call: to_field;
                                                            let self = contract_class_id;
                                                            {
                                                                self.inner
                                                            }
                                                        }, {
                                                            // >>> inlined call: to_field;
                                                            let self = salted_initialization_hash;
                                                            {
                                                                self.inner
                                                            }
                                                        }], DOM_SEP__PARTIAL_ADDRESS);
                                                        {
                                                            {
                                                                let inner = field;
                                                                (inner)
                                                            }
                                                        }
                                                    }
                                                }
                                            };
                                            {
                                                // >>> inlined call: compute;
                                                let __arg_0 = public_keys;
                                                let __arg_1 = partial_address;
                                                let public_keys = __arg_0;
                                                let partial_address = __arg_1;
                                                {
                                                    let public_keys_hash = {
                                                        // >>> inlined call: hash;
                                                        let self = public_keys;
                                                        {
                                                            {
                                                                // >>> inlined call: from_field;
                                                                let field = poseidon2_hash_with_separator([self.npk_m_hash, {
                                                                    // >>> inlined call: hash;
                                                                    let __arg_0 = self.ivpk_m;
                                                                    let self = __arg_0;
                                                                    {
                                                                        {
                                                                            // >>> inlined call: hash_public_key;
                                                                            let p = self.inner;
                                                                            {
                                                                                poseidon2_hash_with_separator([p.x, p.y], (DOM_SEP__SINGLE_PUBLIC_KEY_HASH as Field))
                                                                            }
                                                                        }
                                                                    }
                                                                }, self.ovpk_m_hash, self.tpk_m_hash, self.mspk_m_hash, self.fbpk_m_hash], (DOM_SEP__PUBLIC_KEYS_HASH as Field));
                                                                {
                                                                    {
                                                                        let inner = field;
                                                                        (inner)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                    let pre_address = poseidon2_hash_with_separator([{
                                                        // >>> inlined call: to_field;
                                                        let self = public_keys_hash;
                                                        {
                                                            self.inner
                                                        }
                                                    }, {
                                                        // >>> inlined call: to_field;
                                                        let self = partial_address;
                                                        {
                                                            self.inner
                                                        }
                                                    }], DOM_SEP__CONTRACT_ADDRESS_V2);
                                                    let address_point = {
                                                        // >>> inlined call: add;
                                                        let self = {
                                                            // >>> inlined call: fixed_base_scalar_mul;
                                                            let scalar = {
                                                                // >>> inlined call: from_field;
                                                                let scalar = pre_address;
                                                                {
                                                                    {
                                                                        let _ = {
                                                                            // >>> inlined call: decompose;
                                                                            let x = scalar;
                                                                            {
                                                                                if is_unconstrained() {
                                                                                    {
                                                                                        // >>> inlined call: compute_decomposition;
                                                                                        let __arg_0 = x;
                                                                                        let x = __arg_0;
                                                                                        {
                                                                                            let low = ((x as u128) as Field);
                                                                                            let high = ((x - low) / TWO_POW_128);
                                                                                            (low, high)
                                                                                        }
                                                                                    }
                                                                                } else {
                                                                                    {
                                                                                        {
                                                                                            let _ = unsafe { decompose_hint(x) };
                                                                                            let xlo = _.0;
                                                                                            let xhi = _.1
                                                                                        };
                                                                                        {
                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                            let self = xlo;
                                                                                            {
                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                __assert_max_bit_size(self, 128);
                                                                                            }
                                                                                        };
                                                                                        {
                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                            let self = xhi;
                                                                                            {
                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                __assert_max_bit_size(self, 128);
                                                                                            }
                                                                                        };
                                                                                        assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                        {
                                                                                            // >>> inlined call: assert_gt_limbs;
                                                                                            let a = (PLO, PHI);
                                                                                            let b = (xlo, xhi);
                                                                                            {
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
                                                                                                    {
                                                                                                        // >>> inlined call: assert_max_bit_size;
                                                                                                        let self = rlo;
                                                                                                        {
                                                                                                            static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                            __assert_max_bit_size(self, 128);
                                                                                                        }
                                                                                                    };
                                                                                                    {
                                                                                                        // >>> inlined call: assert_max_bit_size;
                                                                                                        let self = rhi;
                                                                                                        {
                                                                                                            static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                            __assert_max_bit_size(self, 128);
                                                                                                        }
                                                                                                    };
                                                                                                }
                                                                                            }
                                                                                        };
                                                                                        (xlo, xhi)
                                                                                    }
                                                                                }
                                                                            }
                                                                        };
                                                                        let a = _.0;
                                                                        let b = _.1
                                                                    };
                                                                    {
                                                                        let lo = a;
                                                                        let hi = b;
                                                                        (lo, hi)
                                                                    }
                                                                }
                                                            };
                                                            {
                                                                {
                                                                    // >>> inlined call: multi_scalar_mul;
                                                                    let points = [{
                                                                        // >>> inlined call: generator;
                                                                        {
                                                                            {
                                                                                let x = 1;
                                                                                let y = 17631683881184975370165255887551781615748388533673675138860;
                                                                                (x, y)
                                                                            }
                                                                        }
                                                                    }];
                                                                    let scalars = [scalar];
                                                                    {
                                                                        multi_scalar_mul_array_return(points, scalars, true)[0]
                                                                    }
                                                                }
                                                            }
                                                        };
                                                        let other = {
                                                            // >>> inlined call: to_point;
                                                            let self = public_keys.ivpk_m;
                                                            {
                                                                self.inner
                                                            }
                                                        };
                                                        {
                                                            {
                                                                // >>> inlined call: embedded_curve_add;
                                                                let point1 = self;
                                                                let point2 = other;
                                                                {
                                                                    embedded_curve_add_array_return(point1, point2, true)[0]
                                                                }
                                                            }
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: from_field;
                                                        let value = address_point.x;
                                                        {
                                                            {
                                                                let inner = value;
                                                                (inner)
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    };
                                    let is_protocol_contract = {
                                        // >>> inlined call: is_magic_protocol_contract_address;
                                        let __arg_0 = contract_address;
                                        let contract_address = __arg_0;
                                        {
                                            let mut acc = 1;
                                            for i in 1 .. (MAX_PROTOCOL_CONTRACTS + 1) {
                                                {
                                                    let op_rhs_0 = ({
                                                        // >>> inlined call: to_field;
                                                        let self = contract_address;
                                                        {
                                                            self.inner
                                                        }
                                                    } - (i as Field));
                                                    acc = (acc * op_rhs_0)
                                                }
                                            };
                                            (acc == 0)
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_not_derived_protocol_contract_address;
                                        let __arg_0 = protocol_contracts;
                                        let __arg_1 = contract_address;
                                        let self = __arg_0;
                                        let contract_address = __arg_1;
                                        {
                                            for i in 0 .. self.derived_addresses.len() {
                                                let derived_address = self.derived_addresses[i];
                                                if (derived_address.inner != 0) {
                                                    assert((!{
                                                        // >>> inlined call: eq;
                                                        let _self = contract_address;
                                                        let _other = derived_address;
                                                        {
                                                            (_self.inner == _other.inner)
                                                        }
                                                    }), "Attempting to execute a 'derived' protocol contract address. This is not allowed.");
                                                }
                                            }
                                        }
                                    };
                                    let expected_protocol_contract_derived_address = if is_protocol_contract {
                                        {
                                            // >>> inlined call: get_derived_address;
                                            let self = protocol_contracts;
                                            let magic_protocol_contract_address = contract_address;
                                            {
                                                let magic_protocol_contract_address_as_field = {
                                                    // >>> inlined call: to_field;
                                                    let self = magic_protocol_contract_address;
                                                    {
                                                        self.inner
                                                    }
                                                };
                                                let index_of_derived_address_as_field = (magic_protocol_contract_address_as_field - 1);
                                                {
                                                    // >>> inlined call: assert_max_bit_size;
                                                    let self = index_of_derived_address_as_field;
                                                    {
                                                        static_assert((4 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                        __assert_max_bit_size(self, 4);
                                                    }
                                                };
                                                self.derived_addresses[(index_of_derived_address_as_field as u32)]
                                            }
                                        }
                                    } else {
                                        {
                                            // >>> inlined call: zero;
                                            {
                                                {
                                                    let inner = 0;
                                                    (inner)
                                                }
                                            }
                                        }
                                    };
                                    let protocol_contract_address_derivation_check_ok = {
                                        // >>> inlined call: eq;
                                        let _self = computed_address;
                                        let _other = expected_protocol_contract_derived_address;
                                        {
                                            (_self.inner == _other.inner)
                                        }
                                    };
                                    assert(((!is_protocol_contract) | protocol_contract_address_derivation_check_ok), "computed contract address does not match protocol contract derived address");
                                    let updated_contract_class_id = {
                                        // >>> inlined call: get_updated_contract_class_id;
                                        let __arg_0 = contract_address;
                                        let __arg_1 = private_call_data.public_inputs.anchor_block_header;
                                        let __arg_2 = hints.updated_class_id_delayed_public_mutable_values;
                                        let __arg_3 = hints.updated_class_id_witness;
                                        let __arg_4 = hints.updated_class_id_leaf;
                                        let contract_address = __arg_0;
                                        let anchor_block_header = __arg_1;
                                        let delayed_public_mutable_values = __arg_2;
                                        let witness = __arg_3;
                                        let leaf_preimage = __arg_4;
                                        {
                                            let delayed_public_mutable = {
                                                // >>> inlined call: unpack;
                                                let fields = delayed_public_mutable_values;
                                                {
                                                    let svc = {
                                                        // >>> inlined call: unpack_value_change;
                                                        let packed = fields;
                                                        {
                                                            let svc_pre_packed = {
                                                                // >>> inlined call: subarray;
                                                                let array = packed;
                                                                let offset = 1;
                                                                {
                                                                    let mut result = [{
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            0
                                                                        }
                                                                    }; 1];
                                                                    for i in 0 .. 1 {
                                                                        result[i] = array[(offset + i)]
                                                                    };
                                                                    result
                                                                }
                                                            };
                                                            let svc_post_packed = {
                                                                // >>> inlined call: subarray;
                                                                let array = packed;
                                                                let offset = (1 + 1);
                                                                {
                                                                    let mut result = [{
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            0
                                                                        }
                                                                    }; 1];
                                                                    for i in 0 .. 1 {
                                                                        result[i] = array[(offset + i)]
                                                                    };
                                                                    result
                                                                }
                                                            };
                                                            let timestamp_of_change = ((packed[0] as u32) as u64);
                                                            {
                                                                // >>> inlined call: new;
                                                                let __arg_0 = {
                                                                    // >>> inlined call: unpack;
                                                                    let packed = svc_pre_packed;
                                                                    {
                                                                        {
                                                                            let inner = {
                                                                                // >>> inlined call: unpack;
                                                                                let fields = packed;
                                                                                {
                                                                                    fields[0]
                                                                                }
                                                                            };
                                                                            (inner)
                                                                        }
                                                                    }
                                                                };
                                                                let __arg_1 = {
                                                                    // >>> inlined call: unpack;
                                                                    let packed = svc_post_packed;
                                                                    {
                                                                        {
                                                                            let inner = {
                                                                                // >>> inlined call: unpack;
                                                                                let fields = packed;
                                                                                {
                                                                                    fields[0]
                                                                                }
                                                                            };
                                                                            (inner)
                                                                        }
                                                                    }
                                                                };
                                                                let __arg_2 = timestamp_of_change;
                                                                let pre = __arg_0;
                                                                let post = __arg_1;
                                                                let timestamp_of_change = __arg_2;
                                                                {
                                                                    {
                                                                        let pre = pre;
                                                                        let post = post;
                                                                        let timestamp_of_change = timestamp_of_change;
                                                                        (pre, post, timestamp_of_change)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                    let sdc = {
                                                        // >>> inlined call: unpack_delay_change;
                                                        let packed = fields[0];
                                                        {
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
                                                                    {
                                                                        // >>> inlined call: some;
                                                                        let _value = (sdc_pre_inner as u64);
                                                                        {
                                                                            {
                                                                                let _is_some = true;
                                                                                let _value = _value;
                                                                                (_is_some, _value)
                                                                            }
                                                                        }
                                                                    }
                                                                } else {
                                                                    {
                                                                        // >>> inlined call: none;
                                                                        {
                                                                            {
                                                                                let _is_some = false;
                                                                                let _value = 0;
                                                                                (_is_some, _value)
                                                                            }
                                                                        }
                                                                    }
                                                                };
                                                                let post = if sdc_post_is_some {
                                                                    {
                                                                        // >>> inlined call: some;
                                                                        let _value = (sdc_post_inner as u64);
                                                                        {
                                                                            {
                                                                                let _is_some = true;
                                                                                let _value = _value;
                                                                                (_is_some, _value)
                                                                            }
                                                                        }
                                                                    }
                                                                } else {
                                                                    {
                                                                        // >>> inlined call: none;
                                                                        {
                                                                            {
                                                                                let _is_some = false;
                                                                                let _value = 0;
                                                                                (_is_some, _value)
                                                                            }
                                                                        }
                                                                    }
                                                                };
                                                                let timestamp_of_change = (sdc_timestamp_of_change as u64);
                                                                (pre, post, timestamp_of_change)
                                                            }
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: new;
                                                        let __arg_0 = svc;
                                                        let __arg_1 = sdc;
                                                        let svc = __arg_0;
                                                        let sdc = __arg_1;
                                                        {
                                                            {
                                                                let svc = svc;
                                                                let sdc = sdc;
                                                                (svc, sdc)
                                                            }
                                                        }
                                                    }
                                                }
                                            };
                                            let storage_slot = {
                                                // >>> inlined call: derive_storage_slot_in_map;
                                                let storage_slot = (UPDATED_CLASS_IDS_SLOT as Field);
                                                let key = contract_address;
                                                {
                                                    poseidon2_hash_with_separator([storage_slot, {
                                                        // >>> inlined call: to_field;
                                                        let self = key;
                                                        {
                                                            self.inner
                                                        }
                                                    }], DOM_SEP__PUBLIC_STORAGE_MAP_SLOT)
                                                }
                                            };
                                            {
                                                // >>> inlined call: read_current_value_of_delayed_public_mutable_with_hash;
                                                let __arg_0 = anchor_block_header;
                                                let __arg_1 = storage_slot;
                                                let __arg_2 = CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS;
                                                let __arg_3 = delayed_public_mutable;
                                                let __arg_4 = witness;
                                                let __arg_5 = leaf_preimage;
                                                let historical_header = __arg_0;
                                                let storage_slot = __arg_1;
                                                let contract_address = __arg_2;
                                                let delayed_public_mutable = __arg_3;
                                                let witness = __arg_4;
                                                let leaf_preimage = __arg_5;
                                                {
                                                    let storage_slot_of_hash = {
                                                        // >>> inlined call: derive_storage_slot_of_packed_values_hash;
                                                        let start_storage_slot = storage_slot;
                                                        {
                                                            (start_storage_slot + (3 as Field))
                                                        }
                                                    };
                                                    let public_data_leaf_slot = {
                                                        // >>> inlined call: compute_public_data_leaf_slot;
                                                        let __arg_0 = contract_address;
                                                        let __arg_1 = storage_slot_of_hash;
                                                        let contract_address = __arg_0;
                                                        let storage_slot = __arg_1;
                                                        {
                                                            poseidon2_hash_with_separator([{
                                                                // >>> inlined call: to_field;
                                                                let self = contract_address;
                                                                {
                                                                    self.inner
                                                                }
                                                            }, storage_slot], DOM_SEP__PUBLIC_LEAF_SLOT)
                                                        }
                                                    };
                                                    let hash = {
                                                        // >>> inlined call: public_data_storage_read;
                                                        let __arg_0 = historical_header.state.partial.public_data_tree.root;
                                                        let __arg_1 = public_data_leaf_slot;
                                                        let __arg_2 = witness;
                                                        let __arg_3 = leaf_preimage;
                                                        let public_data_tree_root = __arg_0;
                                                        let public_data_leaf_slot = __arg_1;
                                                        let witness = __arg_2;
                                                        let leaf_preimage = __arg_3;
                                                        {
                                                            let is_slot_in_tree = (leaf_preimage.slot == public_data_leaf_slot);
                                                            {
                                                                let _ = {
                                                                    // >>> inlined call: conditionally_check_membership_with_hasher;
                                                                    let __arg_0 = public_data_leaf_slot;
                                                                    let __arg_1 = is_slot_in_tree;
                                                                    let __arg_2 = leaf_preimage;
                                                                    let __arg_3 = witness;
                                                                    let __arg_4 = public_data_tree_root;
                                                                    let __arg_5 = (public_data_merkle_hash, public_data_merkle_hash);
                                                                    let key = __arg_0;
                                                                    let exists = __arg_1;
                                                                    let leaf_preimage = __arg_2;
                                                                    let membership_witness = __arg_3;
                                                                    let tree_root = __arg_4;
                                                                    let hasher = __arg_5;
                                                                    {
                                                                        let is_matching_leaf = (key == {
                                                                            // >>> inlined call: get_key;
                                                                            let self = leaf_preimage;
                                                                            {
                                                                                self.slot
                                                                            }
                                                                        });
                                                                        {
                                                                            let _ = {
                                                                                // >>> inlined call: is_valid_low_leaf;
                                                                                let __arg_0 = key;
                                                                                let __arg_1 = leaf_preimage;
                                                                                let key = __arg_0;
                                                                                let low_leaf_preimage = __arg_1;
                                                                                {
                                                                                    let low_key = {
                                                                                        // >>> inlined call: get_key;
                                                                                        let self = low_leaf_preimage;
                                                                                        {
                                                                                            self.slot
                                                                                        }
                                                                                    };
                                                                                    let next_key = {
                                                                                        // >>> inlined call: get_next_key;
                                                                                        let self = low_leaf_preimage;
                                                                                        {
                                                                                            self.next_slot
                                                                                        }
                                                                                    };
                                                                                    let is_greater_than_low = {
                                                                                        // >>> inlined call: lt;
                                                                                        let self = low_key;
                                                                                        let another = key;
                                                                                        {
                                                                                            if {
                                                                                                // >>> inlined call: is_bn254;
                                                                                                {
                                                                                                    true
                                                                                                }
                                                                                            } {
                                                                                                {
                                                                                                    // >>> inlined call: lt;
                                                                                                    let a = self;
                                                                                                    let b = another;
                                                                                                    {
                                                                                                        {
                                                                                                            // >>> inlined call: gt;
                                                                                                            let __arg_0 = b;
                                                                                                            let __arg_1 = a;
                                                                                                            let a = __arg_0;
                                                                                                            let b = __arg_1;
                                                                                                            {
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
                                                                                                                                {
                                                                                                                                    // >>> inlined call: assert_gt;
                                                                                                                                    let __arg_0 = b;
                                                                                                                                    let __arg_1 = a;
                                                                                                                                    let a = __arg_0;
                                                                                                                                    let b = __arg_1;
                                                                                                                                    {
                                                                                                                                        if is_unconstrained() {
                                                                                                                                            assert({
                                                                                                                                                unsafe { field_less_than(b, a) }
                                                                                                                                            });
                                                                                                                                        } else {
                                                                                                                                            let a_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = a;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            let b_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = b;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            {
                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                let a = a_limbs;
                                                                                                                                                let b = b_limbs;
                                                                                                                                                {
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
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rlo;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rhi;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            }
                                                                                                                                        }
                                                                                                                                    }
                                                                                                                                };
                                                                                                                                false
                                                                                                                            } else {
                                                                                                                                {
                                                                                                                                    // >>> inlined call: assert_gt;
                                                                                                                                    let __arg_0 = a;
                                                                                                                                    let __arg_1 = b;
                                                                                                                                    let a = __arg_0;
                                                                                                                                    let b = __arg_1;
                                                                                                                                    {
                                                                                                                                        if is_unconstrained() {
                                                                                                                                            assert({
                                                                                                                                                unsafe { field_less_than(b, a) }
                                                                                                                                            });
                                                                                                                                        } else {
                                                                                                                                            let a_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = a;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            let b_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = b;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            {
                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                let a = a_limbs;
                                                                                                                                                let b = b_limbs;
                                                                                                                                                {
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
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rlo;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rhi;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            }
                                                                                                                                        }
                                                                                                                                    }
                                                                                                                                };
                                                                                                                                true
                                                                                                                            }
                                                                                                                        }
                                                                                                                    }
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            } else {
                                                                                                {
                                                                                                    // >>> inlined call: lt_fallback;
                                                                                                    let x = self;
                                                                                                    let y = another;
                                                                                                    {
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
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    };
                                                                                    let is_less_than_next = ({
                                                                                        // >>> inlined call: lt;
                                                                                        let self = key;
                                                                                        let another = next_key;
                                                                                        {
                                                                                            if {
                                                                                                // >>> inlined call: is_bn254;
                                                                                                {
                                                                                                    true
                                                                                                }
                                                                                            } {
                                                                                                {
                                                                                                    // >>> inlined call: lt;
                                                                                                    let a = self;
                                                                                                    let b = another;
                                                                                                    {
                                                                                                        {
                                                                                                            // >>> inlined call: gt;
                                                                                                            let __arg_0 = b;
                                                                                                            let __arg_1 = a;
                                                                                                            let a = __arg_0;
                                                                                                            let b = __arg_1;
                                                                                                            {
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
                                                                                                                                {
                                                                                                                                    // >>> inlined call: assert_gt;
                                                                                                                                    let __arg_0 = b;
                                                                                                                                    let __arg_1 = a;
                                                                                                                                    let a = __arg_0;
                                                                                                                                    let b = __arg_1;
                                                                                                                                    {
                                                                                                                                        if is_unconstrained() {
                                                                                                                                            assert({
                                                                                                                                                unsafe { field_less_than(b, a) }
                                                                                                                                            });
                                                                                                                                        } else {
                                                                                                                                            let a_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = a;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            let b_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = b;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            {
                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                let a = a_limbs;
                                                                                                                                                let b = b_limbs;
                                                                                                                                                {
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
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rlo;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rhi;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            }
                                                                                                                                        }
                                                                                                                                    }
                                                                                                                                };
                                                                                                                                false
                                                                                                                            } else {
                                                                                                                                {
                                                                                                                                    // >>> inlined call: assert_gt;
                                                                                                                                    let __arg_0 = a;
                                                                                                                                    let __arg_1 = b;
                                                                                                                                    let a = __arg_0;
                                                                                                                                    let b = __arg_1;
                                                                                                                                    {
                                                                                                                                        if is_unconstrained() {
                                                                                                                                            assert({
                                                                                                                                                unsafe { field_less_than(b, a) }
                                                                                                                                            });
                                                                                                                                        } else {
                                                                                                                                            let a_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = a;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            let b_limbs = {
                                                                                                                                                // >>> inlined call: decompose;
                                                                                                                                                let x = b;
                                                                                                                                                {
                                                                                                                                                    if is_unconstrained() {
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: compute_decomposition;
                                                                                                                                                            let __arg_0 = x;
                                                                                                                                                            let x = __arg_0;
                                                                                                                                                            {
                                                                                                                                                                let low = ((x as u128) as Field);
                                                                                                                                                                let high = ((x - low) / TWO_POW_128);
                                                                                                                                                                (low, high)
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    } else {
                                                                                                                                                        {
                                                                                                                                                            {
                                                                                                                                                                let _ = unsafe { decompose_hint(x) };
                                                                                                                                                                let xlo = _.0;
                                                                                                                                                                let xhi = _.1
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xlo;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                let self = xhi;
                                                                                                                                                                {
                                                                                                                                                                    static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                    __assert_max_bit_size(self, 128);
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            assert((x == (xlo + (TWO_POW_128 * xhi))));
                                                                                                                                                            {
                                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                                let a = (PLO, PHI);
                                                                                                                                                                let b = (xlo, xhi);
                                                                                                                                                                {
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
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rlo;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                        {
                                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                                            let self = rhi;
                                                                                                                                                                            {
                                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                                            }
                                                                                                                                                                        };
                                                                                                                                                                    }
                                                                                                                                                                }
                                                                                                                                                            };
                                                                                                                                                            (xlo, xhi)
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            };
                                                                                                                                            {
                                                                                                                                                // >>> inlined call: assert_gt_limbs;
                                                                                                                                                let a = a_limbs;
                                                                                                                                                let b = b_limbs;
                                                                                                                                                {
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
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rlo;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                        {
                                                                                                                                                            // >>> inlined call: assert_max_bit_size;
                                                                                                                                                            let self = rhi;
                                                                                                                                                            {
                                                                                                                                                                static_assert((128 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                                                                                                                __assert_max_bit_size(self, 128);
                                                                                                                                                            }
                                                                                                                                                        };
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            }
                                                                                                                                        }
                                                                                                                                    }
                                                                                                                                };
                                                                                                                                true
                                                                                                                            }
                                                                                                                        }
                                                                                                                    }
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            } else {
                                                                                                {
                                                                                                    // >>> inlined call: lt_fallback;
                                                                                                    let x = self;
                                                                                                    let y = another;
                                                                                                    {
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
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    } | {
                                                                                        // >>> inlined call: points_to_infinity;
                                                                                        let self = low_leaf_preimage;
                                                                                        {
                                                                                            ((self.next_slot == 0) & (self.next_index == 0))
                                                                                        }
                                                                                    });
                                                                                    let is_valid = (is_greater_than_low & is_less_than_next);
                                                                                    (is_valid, is_greater_than_low, is_less_than_next)
                                                                                }
                                                                            };
                                                                            let is_low_leaf = _.0;
                                                                            let _ = _.1;
                                                                            let _ = _.2
                                                                        };
                                                                        let is_expected_leaf = if exists {
                                                                            is_matching_leaf
                                                                        } else {
                                                                            is_low_leaf
                                                                        };
                                                                        let is_leaf_in_tree = {
                                                                            // >>> inlined call: check_membership_with_hasher;
                                                                            let __arg_0 = {
                                                                                // >>> inlined call: as_leaf;
                                                                                let self = leaf_preimage;
                                                                                {
                                                                                    {
                                                                                        // >>> inlined call: hash;
                                                                                        let __arg_0 = self;
                                                                                        let self = __arg_0;
                                                                                        {
                                                                                            {
                                                                                                // >>> inlined call: poseidon2_hash;
                                                                                                let inputs = serialize(self);
                                                                                                {
                                                                                                    hash(inputs, 4)
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            };
                                                                            let __arg_1 = membership_witness;
                                                                            let __arg_2 = tree_root;
                                                                            let __arg_3 = hasher;
                                                                            let leaf = __arg_0;
                                                                            let membership_witness = __arg_1;
                                                                            let root = __arg_2;
                                                                            let hasher = __arg_3;
                                                                            {
                                                                                let calculated_root = {
                                                                                    // >>> inlined call: root_from_sibling_path_with_hasher;
                                                                                    let __arg_0 = leaf;
                                                                                    let __arg_1 = membership_witness.leaf_index;
                                                                                    let __arg_2 = membership_witness.sibling_path;
                                                                                    let __arg_3 = hasher;
                                                                                    let leaf = __arg_0;
                                                                                    let leaf_index = __arg_1;
                                                                                    let sibling_path = __arg_2;
                                                                                    let hasher = __arg_3;
                                                                                    {
                                                                                        let mut node = leaf;
                                                                                        let indices = {
                                                                                            // >>> inlined call: to_le_bits;
                                                                                            let self = leaf_index;
                                                                                            {
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
                                                                                        };
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
                                                                                };
                                                                                (calculated_root == root)
                                                                            }
                                                                        };
                                                                        let is_valid = (is_expected_leaf & is_leaf_in_tree);
                                                                        (is_valid, is_expected_leaf, is_leaf_in_tree)
                                                                    }
                                                                };
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
                                                    };
                                                    let packed = {
                                                        // >>> inlined call: pack;
                                                        let self = delayed_public_mutable;
                                                        {
                                                            let mut result = [0; 3];
                                                            {
                                                                // >>> inlined call: assert_max_bit_size;
                                                                let __arg_0 = (self.svc.timestamp_of_change as Field);
                                                                let self = __arg_0;
                                                                {
                                                                    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                    __assert_max_bit_size(self, 32);
                                                                }
                                                            };
                                                            {
                                                                // >>> inlined call: assert_max_bit_size;
                                                                let __arg_0 = (self.sdc.timestamp_of_change as Field);
                                                                let self = __arg_0;
                                                                {
                                                                    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                    __assert_max_bit_size(self, 32);
                                                                }
                                                            };
                                                            {
                                                                // >>> inlined call: assert_max_bit_size;
                                                                let __arg_0 = ({
                                                                    // >>> inlined call: unwrap_unchecked;
                                                                    let __arg_0 = self.sdc.post;
                                                                    let self = __arg_0;
                                                                    {
                                                                        self._value
                                                                    }
                                                                } as Field);
                                                                let self = __arg_0;
                                                                {
                                                                    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                    __assert_max_bit_size(self, 32);
                                                                }
                                                            };
                                                            {
                                                                // >>> inlined call: assert_max_bit_size;
                                                                let __arg_0 = ({
                                                                    // >>> inlined call: unwrap_unchecked;
                                                                    let __arg_0 = self.sdc.pre;
                                                                    let self = __arg_0;
                                                                    {
                                                                        self._value
                                                                    }
                                                                } as Field);
                                                                let self = __arg_0;
                                                                {
                                                                    static_assert((32 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                                                                    __assert_max_bit_size(self, 32);
                                                                }
                                                            };
                                                            result[0] = ((((((self.svc.timestamp_of_change as Field) + ((self.sdc.timestamp_of_change as Field) * {
                                                                // >>> inlined call: pow_32;
                                                                let self = 2;
                                                                let exponent = 32;
                                                                {
                                                                    let mut r = 1;
                                                                    let b = {
                                                                        // >>> inlined call: to_le_bits;
                                                                        let self = exponent;
                                                                        {
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
                                                                    };
                                                                    for i in 1 .. 33 {
                                                                        r = (r * r);
                                                                        r = (((b[(32 - i)] as Field) * (r * self)) + ((1 - (b[(32 - i)] as Field)) * r))
                                                                    };
                                                                    r
                                                                }
                                                            })) + (({
                                                                // >>> inlined call: is_some;
                                                                let __arg_0 = (&self.sdc.post);
                                                                let self = __arg_0;
                                                                {
                                                                    (*self)._is_some
                                                                }
                                                            } as Field) * {
                                                                // >>> inlined call: pow_32;
                                                                let self = 2;
                                                                let exponent = 64;
                                                                {
                                                                    let mut r = 1;
                                                                    let b = {
                                                                        // >>> inlined call: to_le_bits;
                                                                        let self = exponent;
                                                                        {
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
                                                                    };
                                                                    for i in 1 .. 33 {
                                                                        r = (r * r);
                                                                        r = (((b[(32 - i)] as Field) * (r * self)) + ((1 - (b[(32 - i)] as Field)) * r))
                                                                    };
                                                                    r
                                                                }
                                                            })) + (({
                                                                // >>> inlined call: unwrap_unchecked;
                                                                let __arg_0 = self.sdc.post;
                                                                let self = __arg_0;
                                                                {
                                                                    self._value
                                                                }
                                                            } as Field) * {
                                                                // >>> inlined call: pow_32;
                                                                let self = 2;
                                                                let exponent = 72;
                                                                {
                                                                    let mut r = 1;
                                                                    let b = {
                                                                        // >>> inlined call: to_le_bits;
                                                                        let self = exponent;
                                                                        {
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
                                                                    };
                                                                    for i in 1 .. 33 {
                                                                        r = (r * r);
                                                                        r = (((b[(32 - i)] as Field) * (r * self)) + ((1 - (b[(32 - i)] as Field)) * r))
                                                                    };
                                                                    r
                                                                }
                                                            })) + (({
                                                                // >>> inlined call: is_some;
                                                                let __arg_0 = (&self.sdc.pre);
                                                                let self = __arg_0;
                                                                {
                                                                    (*self)._is_some
                                                                }
                                                            } as Field) * {
                                                                // >>> inlined call: pow_32;
                                                                let self = 2;
                                                                let exponent = 104;
                                                                {
                                                                    let mut r = 1;
                                                                    let b = {
                                                                        // >>> inlined call: to_le_bits;
                                                                        let self = exponent;
                                                                        {
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
                                                                    };
                                                                    for i in 1 .. 33 {
                                                                        r = (r * r);
                                                                        r = (((b[(32 - i)] as Field) * (r * self)) + ((1 - (b[(32 - i)] as Field)) * r))
                                                                    };
                                                                    r
                                                                }
                                                            })) + (({
                                                                // >>> inlined call: unwrap_unchecked;
                                                                let __arg_0 = self.sdc.pre;
                                                                let self = __arg_0;
                                                                {
                                                                    self._value
                                                                }
                                                            } as Field) * {
                                                                // >>> inlined call: pow_32;
                                                                let self = 2;
                                                                let exponent = 112;
                                                                {
                                                                    let mut r = 1;
                                                                    let b = {
                                                                        // >>> inlined call: to_le_bits;
                                                                        let self = exponent;
                                                                        {
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
                                                                    };
                                                                    for i in 1 .. 33 {
                                                                        r = (r * r);
                                                                        r = (((b[(32 - i)] as Field) * (r * self)) + ((1 - (b[(32 - i)] as Field)) * r))
                                                                    };
                                                                    r
                                                                }
                                                            }));
                                                            let svc_pre_packed = {
                                                                // >>> inlined call: pack;
                                                                let __arg_0 = self.svc.pre;
                                                                let self = __arg_0;
                                                                {
                                                                    {
                                                                        // >>> inlined call: pack;
                                                                        let __arg_0 = self.inner;
                                                                        let self = __arg_0;
                                                                        {
                                                                            [self]
                                                                        }
                                                                    }
                                                                }
                                                            };
                                                            let svc_post_packed = {
                                                                // >>> inlined call: pack;
                                                                let __arg_0 = self.svc.post;
                                                                let self = __arg_0;
                                                                {
                                                                    {
                                                                        // >>> inlined call: pack;
                                                                        let __arg_0 = self.inner;
                                                                        let self = __arg_0;
                                                                        {
                                                                            [self]
                                                                        }
                                                                    }
                                                                }
                                                            };
                                                            for i in 0 .. 1 {
                                                                result[(i + 1)] = svc_pre_packed[i];
                                                                result[((i + 1) + 1)] = svc_post_packed[i]
                                                            };
                                                            result
                                                        }
                                                    };
                                                    let computed_hash = {
                                                        // >>> inlined call: poseidon2_hash;
                                                        let inputs = packed;
                                                        {
                                                            hash(inputs, 3)
                                                        }
                                                    };
                                                    if (hash != 0) {
                                                        assert((hash == computed_hash), "Hint values do not match hash");
                                                    } else {
                                                        assert({
                                                            // >>> inlined call: eq;
                                                            let self = packed;
                                                            let other = [0; 3];
                                                            {
                                                                let mut result = true;
                                                                for i in 0 .. self.len() {
                                                                    {
                                                                        let op_rhs_0 = {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self[i];
                                                                            let __arg_1 = other[i];
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                (self == other)
                                                                            }
                                                                        };
                                                                        result = (result & op_rhs_0)
                                                                    }
                                                                };
                                                                result
                                                            }
                                                        }, "delayed_public_mutable must be zeroed when its stored hash is zero");
                                                    };
                                                    {
                                                        // >>> inlined call: get_current_at;
                                                        let self = delayed_public_mutable.svc;
                                                        let timestamp = historical_header.global_variables.timestamp;
                                                        {
                                                            if (timestamp < self.timestamp_of_change) {
                                                                self.pre
                                                            } else {
                                                                self.post
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    };
                                    let is_updated_contract = (!{
                                        // >>> inlined call: is_empty;
                                        let self = updated_contract_class_id;
                                        {
                                            {
                                                // >>> inlined call: eq;
                                                let _self = self;
                                                let _other = {
                                                    // >>> inlined call: empty;
                                                    {
                                                        {
                                                            let inner = 0;
                                                            (inner)
                                                        }
                                                    }
                                                };
                                                {
                                                    (_self.inner == _other.inner)
                                                }
                                            }
                                        }
                                    });
                                    let updated_class_check_ok = {
                                        // >>> inlined call: eq;
                                        let _self = computed_contract_class_id;
                                        let _other = updated_contract_class_id;
                                        {
                                            (_self.inner == _other.inner)
                                        }
                                    };
                                    assert(((!is_updated_contract) | updated_class_check_ok), "computed contract class id does not match updated contract class id");
                                    let is_regular_contract = ((!is_protocol_contract) & (!is_updated_contract));
                                    let address_derivation_check_ok = {
                                        // >>> inlined call: eq;
                                        let _self = computed_address;
                                        let _other = contract_address;
                                        {
                                            (_self.inner == _other.inner)
                                        }
                                    };
                                    assert(((!is_regular_contract) | address_derivation_check_ok), "computed contract address does not match expected one");
                                }
                            };
                            {
                                // >>> inlined call: validate_claimed_lengths;
                                let __arg_0 = self;
                                let self = __arg_0;
                                {
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.note_hash_read_requests;
                                        let __arg_1 = "note_hash_read_requests length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 16), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.nullifier_read_requests;
                                        let __arg_1 = "nullifier_read_requests length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 16), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.key_validation_requests_and_separators;
                                        let __arg_1 = "key_validation_requests_and_separators length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 16), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.private_call_requests;
                                        let __arg_1 = "private_call_requests length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 8), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.public_call_requests;
                                        let __arg_1 = "public_call_requests length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 32), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.note_hashes;
                                        let __arg_1 = "note_hashes length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 16), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.nullifiers;
                                        let __arg_1 = "nullifiers length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 16), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.l2_to_l1_msgs;
                                        let __arg_1 = "l2_to_l1_msgs length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 8), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.private_logs;
                                        let __arg_1 = "private_logs length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 16), msg);
                                        }
                                    };
                                    {
                                        // >>> inlined call: assert_length_within_bounds;
                                        let __arg_0 = self.data.public_inputs.contract_class_logs_hashes;
                                        let __arg_1 = "contract_class_logs_hashes length out of bounds";
                                        let self = __arg_0;
                                        let msg = __arg_1;
                                        {
                                            assert((self.length <= 1), msg);
                                        }
                                    };
                                }
                            };
                            {
                                // >>> inlined call: validate_msg_senders;
                                let __arg_0 = self;
                                let self = __arg_0;
                                {
                                    let this_call = self.data.public_inputs;
                                    let expected_msg_sender = this_call.call_context.contract_address;
                                    {
                                        // >>> inlined call: for_each;
                                        let self = this_call.private_call_requests;
                                        let f = {
                                            let closure_variable = {
                                                let env = (expected_msg_sender);
                                                ((env, lambda), (env, lambda))
                                            };
                                            closure_variable
                                        };
                                        {
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
                                    };
                                    {
                                        // >>> inlined call: for_each;
                                        let self = this_call.public_call_requests;
                                        let f = {
                                            let closure_variable = {
                                                let env = (expected_msg_sender);
                                                ((env, lambda), (env, lambda))
                                            };
                                            closure_variable
                                        };
                                        {
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
                                    };
                                    let teardown_call_request = this_call.public_teardown_call_request;
                                    if (!{
                                        // >>> inlined call: is_empty;
                                        let self = teardown_call_request;
                                        {
                                            {
                                                // >>> inlined call: eq;
                                                let _self = self;
                                                let _other = {
                                                    // >>> inlined call: empty;
                                                    {
                                                        {
                                                            let msg_sender = {
                                                                // >>> inlined call: empty;
                                                                {
                                                                    {
                                                                        let inner = 0;
                                                                        (inner)
                                                                    }
                                                                }
                                                            };
                                                            let contract_address = {
                                                                // >>> inlined call: empty;
                                                                {
                                                                    {
                                                                        let inner = 0;
                                                                        (inner)
                                                                    }
                                                                }
                                                            };
                                                            let is_static_call = false;
                                                            let calldata_hash = 0;
                                                            (msg_sender, contract_address, is_static_call, calldata_hash)
                                                        }
                                                    }
                                                };
                                                {
                                                    ((({
                                                        // >>> inlined call: eq;
                                                        let __arg_0 = _self.msg_sender;
                                                        let __arg_1 = _other.msg_sender;
                                                        let _self = __arg_0;
                                                        let _other = __arg_1;
                                                        {
                                                            (_self.inner == _other.inner)
                                                        }
                                                    } & {
                                                        // >>> inlined call: eq;
                                                        let __arg_0 = _self.contract_address;
                                                        let __arg_1 = _other.contract_address;
                                                        let _self = __arg_0;
                                                        let _other = __arg_1;
                                                        {
                                                            (_self.inner == _other.inner)
                                                        }
                                                    }) & (_self.is_static_call == _other.is_static_call)) & (_self.calldata_hash == _other.calldata_hash))
                                                }
                                            }
                                        }
                                    }) {
                                        if (!{
                                            // >>> inlined call: eq;
                                            let _self = teardown_call_request.msg_sender;
                                            let _other = NULL_MSG_SENDER_CONTRACT_ADDRESS;
                                            {
                                                (_self.inner == _other.inner)
                                            }
                                        }) {
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = teardown_call_request.msg_sender;
                                                let _other = expected_msg_sender;
                                                {
                                                    (_self.inner == _other.inner)
                                                }
                                            }, "incorrect msg_sender for public teardown call request");
                                        }
                                    }
                                }
                            };
                            {
                                // >>> inlined call: validate_expected_counters;
                                let __arg_0 = self;
                                let __arg_1 = claimed_revertible_counter;
                                let self = __arg_0;
                                let claimed_revertible_counter = __arg_1;
                                {
                                    let expected_non_revertible_side_effect_counter = self.data.public_inputs.expected_non_revertible_side_effect_counter;
                                    let expected_revertible_side_effect_counter = self.data.public_inputs.expected_revertible_side_effect_counter;
                                    if (expected_non_revertible_side_effect_counter != 0) {
                                        assert(((claimed_revertible_counter == 0) | (expected_non_revertible_side_effect_counter < claimed_revertible_counter)), "Failed to validate expected non revertible side effect counter")
                                    };
                                    if (expected_revertible_side_effect_counter != 0) {
                                        assert(((claimed_revertible_counter != 0) & (expected_revertible_side_effect_counter >= claimed_revertible_counter)), "Failed to validate expected revertible side effect counter")
                                    }
                                }
                            };
                            {
                                // >>> inlined call: validate_unique_and_within_bounds_side_effect_counters;
                                let public_inputs = self.data.public_inputs;
                                {
                                    let side_effect_sorting_hints = {
                                        unsafe { build_uniqueness_hints(public_inputs) }
                                    };
                                    {
                                        // >>> inlined call: validate_unique_and_within_bounds_side_effect_counters_with_hints;
                                        let __arg_0 = public_inputs;
                                        let __arg_1 = side_effect_sorting_hints;
                                        let public_inputs = __arg_0;
                                        let side_effect_sorting_hints = __arg_1;
                                        {
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
                                                    {
                                                        // >>> inlined call: assert_null;
                                                        let self = sorted_side_effect_counters[i];
                                                        let msg = "Sorted counter hints must have null trailing values";
                                                        {
                                                            assert((self.global_index == MAX_U32_VALUE), msg);
                                                        }
                                                    };
                                                }
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.note_hash_read_requests;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.note_hash_read_request_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 16 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.inner.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.nullifier_read_requests;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.nullifier_read_request_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 16 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.inner.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.note_hashes;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.note_hashes_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_NOTE_HASH_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 16 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.nullifiers;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.nullifiers_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_NULLIFIER_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 16 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_ranges_for_call_requests;
                                                let private_call_requests = public_inputs.private_call_requests;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.private_call_requests_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset_for_range_start = GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET;
                                                let global_index_offset_for_range_end = GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET;
                                                {
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.public_call_requests;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.public_call_requests_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 32 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.l2_to_l1_msgs;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.l2_to_l1_msgs_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 8 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.private_logs;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.private_logs_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_PRIVATE_LOG_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 16 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counters_for_array;
                                                let items = public_inputs.contract_class_logs_hashes;
                                                let original_to_sorted_indices_hints = side_effect_sorting_hints.contract_class_logs_hashes_sorted_indices;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET;
                                                {
                                                    let mut should_check = true;
                                                    for i in 0 .. 1 {
                                                        let counter = {
                                                            // >>> inlined call: counter;
                                                            let self = items.array[i];
                                                            {
                                                                self.counter
                                                            }
                                                        };
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
                                            };
                                            {
                                                // >>> inlined call: validate_side_effect_counter_for_single_value;
                                                let counter = public_inputs.min_revertible_side_effect_counter;
                                                let original_to_sorted_index_hint = side_effect_sorting_hints.min_revertible_side_effect_counter_sorted_index;
                                                let sorted_side_effect_counters_hints = sorted_side_effect_counters;
                                                let global_index_offset = GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET;
                                                {
                                                    let sorted_side_effect_counter_hint = sorted_side_effect_counters_hints[(original_to_sorted_index_hint as u32)];
                                                    if (counter != 0) {
                                                        assert((counter == sorted_side_effect_counter_hint.counter), "Mismatch counter: value does not match hint");
                                                        assert((global_index_offset == sorted_side_effect_counter_hint.global_index), "Mismatch global index: value does not match hint");
                                                    }
                                                }
                                            };
                                            let counter_start = public_inputs.start_side_effect_counter;
                                            let counter_end = public_inputs.end_side_effect_counter;
                                            assert((counter_start < counter_end), "Private call has incorrect counter range");
                                            {
                                                // >>> inlined call: validate_increasing_counters;
                                                let __arg_0 = sorted_side_effect_counters;
                                                let __arg_1 = total_side_effects;
                                                let __arg_2 = counter_start;
                                                let __arg_3 = counter_end;
                                                let sorted_side_effect_counters_hints = __arg_0;
                                                let total_side_effects = __arg_1;
                                                let private_call_counter_start = __arg_2;
                                                let private_call_counter_end = __arg_3;
                                                {
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
                                            };
                                        }
                                    };
                                }
                            };
                        }
                    };
                    {
                        // >>> inlined call: validate_against_tx_request;
                        let __arg_0 = self;
                        let __arg_1 = tx_request;
                        let self = __arg_0;
                        let tx_request = __arg_1;
                        {
                            let this_call = self.data.public_inputs;
                            assert({
                                // >>> inlined call: eq;
                                let _self = tx_request.origin;
                                let _other = this_call.call_context.contract_address;
                                {
                                    (_self.inner == _other.inner)
                                }
                            }, "contract address does not match origin");
                            assert({
                                // >>> inlined call: eq;
                                let _self = tx_request.function_data.selector;
                                let _other = this_call.call_context.function_selector;
                                {
                                    (_self.inner == _other.inner)
                                }
                            }, "function_selector in call_context does not match the value in tx_request");
                            assert(tx_request.function_data.is_private, "tx_request does not indicate the first function is private");
                            assert((tx_request.args_hash == this_call.args_hash), "args_hash in private call does not match the value in tx_request");
                            assert({
                                // >>> inlined call: eq;
                                let _self = tx_request.tx_context;
                                let _other = this_call.tx_context;
                                {
                                    (((_self.chain_id == _other.chain_id) & (_self.version == _other.version)) & {
                                        // >>> inlined call: eq;
                                        let __arg_0 = _self.gas_settings;
                                        let __arg_1 = _other.gas_settings;
                                        let _self = __arg_0;
                                        let _other = __arg_1;
                                        {
                                            ((({
                                                // >>> inlined call: eq;
                                                let __arg_0 = _self.gas_limits;
                                                let __arg_1 = _other.gas_limits;
                                                let _self = __arg_0;
                                                let _other = __arg_1;
                                                {
                                                    ((_self.da_gas == _other.da_gas) & (_self.l2_gas == _other.l2_gas))
                                                }
                                            } & {
                                                // >>> inlined call: eq;
                                                let __arg_0 = _self.teardown_gas_limits;
                                                let __arg_1 = _other.teardown_gas_limits;
                                                let _self = __arg_0;
                                                let _other = __arg_1;
                                                {
                                                    ((_self.da_gas == _other.da_gas) & (_self.l2_gas == _other.l2_gas))
                                                }
                                            }) & {
                                                // >>> inlined call: eq;
                                                let __arg_0 = _self.max_fees_per_gas;
                                                let __arg_1 = _other.max_fees_per_gas;
                                                let _self = __arg_0;
                                                let _other = __arg_1;
                                                {
                                                    ((_self.fee_per_da_gas == _other.fee_per_da_gas) & (_self.fee_per_l2_gas == _other.fee_per_l2_gas))
                                                }
                                            }) & {
                                                // >>> inlined call: eq;
                                                let __arg_0 = _self.max_priority_fees_per_gas;
                                                let __arg_1 = _other.max_priority_fees_per_gas;
                                                let _self = __arg_0;
                                                let _other = __arg_1;
                                                {
                                                    ((_self.fee_per_da_gas == _other.fee_per_da_gas) & (_self.fee_per_l2_gas == _other.fee_per_l2_gas))
                                                }
                                            })
                                        }
                                    })
                                }
                            }, "tx_context in private call does not match the value in tx_request");
                            assert((tx_request.salt == this_call.tx_request_salt), "tx_request_salt in private call does not match the salt in tx_request");
                        }
                    };
                    let this_call = self.data.public_inputs;
                    assert({
                        // >>> inlined call: eq;
                        let _self = this_call.call_context.msg_sender;
                        let _other = NULL_MSG_SENDER_CONTRACT_ADDRESS;
                        {
                            (_self.inner == _other.inner)
                        }
                    }, "Users cannot set msg_sender in first call");
                    assert((this_call.call_context.is_static_call == false), "First call in a tx cannot be static");
                    assert((this_call.start_side_effect_counter > 1), "start_side_effect_counter must be greater than 1");
                }
            };
            {
                // >>> inlined call: compose_output_for_init;
                let __arg_0 = inputs;
                let inputs = __arg_0;
                {
                    let constants = {
                        let tx_context = inputs.private_call.public_inputs.tx_context;
                        let tx_request_salt = inputs.private_call.public_inputs.tx_request_salt;
                        let vk_tree_root = inputs.vk_tree_root;
                        let protocol_contracts = inputs.protocol_contracts;
                        let anchor_block_header = inputs.private_call.public_inputs.anchor_block_header;
                        (anchor_block_header, tx_context, tx_request_salt, vk_tree_root, protocol_contracts)
                    };
                    let mut validation_requests = {
                        // >>> inlined call: empty;
                        {
                            {
                                let note_hash_read_requests = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            0
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 64];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let nullifier_read_requests = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            0
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 64];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let scoped_key_validation_requests_and_separators = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let request = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let pk_m_hash = 0;
                                                                                let sk_app = 0;
                                                                                (pk_m_hash, sk_app)
                                                                            }
                                                                        }
                                                                    };
                                                                    let key_type_domain_separator = 0;
                                                                    (request, key_type_domain_separator)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 64];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                (note_hash_read_requests, nullifier_read_requests, scoped_key_validation_requests_and_separators)
                            }
                        }
                    };
                    let mut end = {
                        // >>> inlined call: empty;
                        {
                            {
                                let note_hashes = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            0
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 64];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let nullifiers = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let value = 0;
                                                                                let note_hash = 0;
                                                                                (value, note_hash)
                                                                            }
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 64];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let l2_to_l1_msgs = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let recipient = {
                                                                                    // >>> inlined call: empty;
                                                                                    {
                                                                                        {
                                                                                            let inner = 0;
                                                                                            (inner)
                                                                                        }
                                                                                    }
                                                                                };
                                                                                let content = 0;
                                                                                (recipient, content)
                                                                            }
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 8];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let private_logs = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let log = {
                                                                                    // >>> inlined call: empty;
                                                                                    {
                                                                                        {
                                                                                            let fields = [0; 16];
                                                                                            let length = 0;
                                                                                            (fields, length)
                                                                                        }
                                                                                    }
                                                                                };
                                                                                let note_hash_counter = 0;
                                                                                (log, note_hash_counter)
                                                                            }
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 64];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let contract_class_logs_hashes = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let value = 0;
                                                                                let length = 0;
                                                                                (value, length)
                                                                            }
                                                                        }
                                                                    };
                                                                    let counter = 0;
                                                                    (inner, counter)
                                                                }
                                                            }
                                                        };
                                                        let contract_address = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let inner = 0;
                                                                    (inner)
                                                                }
                                                            }
                                                        };
                                                        (inner, contract_address)
                                                    }
                                                }
                                            }; 1];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let public_call_requests = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let inner = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let msg_sender = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let inner = 0;
                                                                                (inner)
                                                                            }
                                                                        }
                                                                    };
                                                                    let contract_address = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let inner = 0;
                                                                                (inner)
                                                                            }
                                                                        }
                                                                    };
                                                                    let is_static_call = false;
                                                                    let calldata_hash = 0;
                                                                    (msg_sender, contract_address, is_static_call, calldata_hash)
                                                                }
                                                            }
                                                        };
                                                        let counter = 0;
                                                        (inner, counter)
                                                    }
                                                }
                                            }; 32];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                let private_call_stack = {
                                    // >>> inlined call: empty;
                                    {
                                        {
                                            let array = [{
                                                // >>> inlined call: empty;
                                                {
                                                    {
                                                        let call_context = {
                                                            // >>> inlined call: empty;
                                                            {
                                                                {
                                                                    let msg_sender = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let inner = 0;
                                                                                (inner)
                                                                            }
                                                                        }
                                                                    };
                                                                    let contract_address = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let inner = 0;
                                                                                (inner)
                                                                            }
                                                                        }
                                                                    };
                                                                    let function_selector = {
                                                                        // >>> inlined call: empty;
                                                                        {
                                                                            {
                                                                                let inner = (0 as u32);
                                                                                (inner)
                                                                            }
                                                                        }
                                                                    };
                                                                    let is_static_call = false;
                                                                    (msg_sender, contract_address, function_selector, is_static_call)
                                                                }
                                                            }
                                                        };
                                                        let args_hash = 0;
                                                        let returns_hash = 0;
                                                        let start_side_effect_counter = 0;
                                                        let end_side_effect_counter = 0;
                                                        (call_context, args_hash, returns_hash, start_side_effect_counter, end_side_effect_counter)
                                                    }
                                                }
                                            }; 16];
                                            let length = 0;
                                            (array, length)
                                        }
                                    }
                                };
                                (note_hashes, nullifiers, l2_to_l1_msgs, private_logs, contract_class_logs_hashes, public_call_requests, private_call_stack)
                            }
                        }
                    };
                    let scoped_protocol_nullifier = {
                        // >>> inlined call: create_protocol_nullifier;
                        let tx_request = inputs.tx_request;
                        {
                            {
                                // >>> inlined call: scope;
                                let self = {
                                    // >>> inlined call: count;
                                    let self = {
                                        let value = {
                                            // >>> inlined call: hash;
                                            let self = tx_request;
                                            {
                                                poseidon2_hash_with_separator(serialize(self), DOM_SEP__TX_REQUEST)
                                            }
                                        };
                                        let note_hash = 0;
                                        (value, note_hash)
                                    };
                                    let counter = 1;
                                    {
                                        {
                                            // >>> inlined call: new;
                                            let __arg_0 = self;
                                            let __arg_1 = counter;
                                            let inner = __arg_0;
                                            let counter = __arg_1;
                                            {
                                                {
                                                    let inner = inner;
                                                    let counter = counter;
                                                    (inner, counter)
                                                }
                                            }
                                        }
                                    }
                                };
                                let contract_address = NULL_MSG_SENDER_CONTRACT_ADDRESS;
                                {
                                    {
                                        // >>> inlined call: new;
                                        let __arg_0 = self;
                                        let __arg_1 = contract_address;
                                        let inner = __arg_0;
                                        let contract_address = __arg_1;
                                        {
                                            {
                                                let inner = inner;
                                                let contract_address = contract_address;
                                                (inner, contract_address)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    };
                    let protocol_nullifier = {
                        // >>> inlined call: compute_siloed_nullifier;
                        let contract_address = scoped_protocol_nullifier.contract_address;
                        let nullifier = {
                            // >>> inlined call: innermost;
                            let self = scoped_protocol_nullifier;
                            {
                                self.inner.inner
                            }
                        }.value;
                        {
                            poseidon2_hash_with_separator([{
                                // >>> inlined call: to_field;
                                let self = contract_address;
                                {
                                    self.inner
                                }
                            }, nullifier], DOM_SEP__SILOED_NULLIFIER)
                        }
                    };
                    end.nullifiers.array[0] = scoped_protocol_nullifier;
                    end.nullifiers.length = 1;
                    let contract_address = inputs.private_call.public_inputs.call_context.contract_address;
                    {
                        // >>> inlined call: append_to_empty_dest;
                        let dest = (&mut validation_requests.note_hash_read_requests);
                        let source = inputs.private_call.public_inputs.note_hash_read_requests;
                        {
                            static_assert((16 <= 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
                            for i in 0 .. 16 {
                                (*dest).array[i] = source.array[i]
                            };
                            (*dest).length = source.length
                        }
                    };
                    {
                        // >>> inlined call: append_to_empty_dest;
                        let dest = (&mut validation_requests.nullifier_read_requests);
                        let source = inputs.private_call.public_inputs.nullifier_read_requests;
                        {
                            static_assert((16 <= 64), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
                            for i in 0 .. 16 {
                                (*dest).array[i] = source.array[i]
                            };
                            (*dest).length = source.length
                        }
                    };
                    {
                        // >>> inlined call: append_and_scope_to_empty_dest;
                        let __arg_0 = (&mut validation_requests.scoped_key_validation_requests_and_separators);
                        let __arg_1 = inputs.private_call.public_inputs.key_validation_requests_and_separators;
                        let __arg_2 = contract_address;
                        let dest = __arg_0;
                        let source = __arg_1;
                        let contract_address = __arg_2;
                        {
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
                    };
                    {
                        // >>> inlined call: append_and_scope_to_empty_dest;
                        let __arg_0 = (&mut end.note_hashes);
                        let __arg_1 = inputs.private_call.public_inputs.note_hashes;
                        let __arg_2 = contract_address;
                        let dest = __arg_0;
                        let source = __arg_1;
                        let contract_address = __arg_2;
                        {
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
                    };
                    {
                        // >>> inlined call: append_and_scope_after_protocol_nullifier;
                        let __arg_0 = (&mut end.nullifiers);
                        let __arg_1 = inputs.private_call.public_inputs.nullifiers;
                        let __arg_2 = contract_address;
                        let dest = __arg_0;
                        let source = __arg_1;
                        let contract_address = __arg_2;
                        {
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
                    };
                    {
                        // >>> inlined call: append_and_scope_to_empty_dest;
                        let __arg_0 = (&mut end.l2_to_l1_msgs);
                        let __arg_1 = inputs.private_call.public_inputs.l2_to_l1_msgs;
                        let __arg_2 = contract_address;
                        let dest = __arg_0;
                        let source = __arg_1;
                        let contract_address = __arg_2;
                        {
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
                    };
                    {
                        // >>> inlined call: append_and_scope_to_empty_dest;
                        let __arg_0 = (&mut end.private_logs);
                        let __arg_1 = inputs.private_call.public_inputs.private_logs;
                        let __arg_2 = contract_address;
                        let dest = __arg_0;
                        let source = __arg_1;
                        let contract_address = __arg_2;
                        {
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
                    };
                    {
                        // >>> inlined call: append_and_scope_to_empty_dest;
                        let __arg_0 = (&mut end.contract_class_logs_hashes);
                        let __arg_1 = inputs.private_call.public_inputs.contract_class_logs_hashes;
                        let __arg_2 = contract_address;
                        let dest = __arg_0;
                        let source = __arg_1;
                        let contract_address = __arg_2;
                        {
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
                    };
                    {
                        // >>> inlined call: append_to_empty_dest;
                        let dest = (&mut end.public_call_requests);
                        let source = inputs.private_call.public_inputs.public_call_requests;
                        {
                            static_assert((32 <= 32), "Source array larger than dest array", r#"{"kind":"string","length":35}"#, false);
                            for i in 0 .. 32 {
                                (*dest).array[i] = source.array[i]
                            };
                            (*dest).length = source.length
                        }
                    };
                    {
                        // >>> inlined call: append_reversed_to_empty_dest;
                        let dest = (&mut end.private_call_stack);
                        let source = inputs.private_call.public_inputs.private_call_requests;
                        {
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
                    };
                    let min_revertible_side_effect_counter = inputs.private_call.public_inputs.min_revertible_side_effect_counter;
                    let public_teardown_call_request = inputs.private_call.public_inputs.public_teardown_call_request;
                    let fee_payer = if inputs.private_call.public_inputs.is_fee_payer {
                        contract_address
                    } else {
                        {
                            // >>> inlined call: zero;
                            {
                                {
                                    let inner = 0;
                                    (inner)
                                }
                            }
                        }
                    };
                    let timestamp_before_registry_read_goes_stale = {
                        // >>> inlined call: get_expiration_timestamp_for_contract_updates;
                        let private_call = inputs.private_call;
                        {
                            let delayed_public_mutable_values = {
                                // >>> inlined call: unpack;
                                let fields = private_call.verification_key_hints.updated_class_id_delayed_public_mutable_values;
                                {
                                    let svc = {
                                        // >>> inlined call: unpack_value_change;
                                        let packed = fields;
                                        {
                                            let svc_pre_packed = {
                                                // >>> inlined call: subarray;
                                                let array = packed;
                                                let offset = 1;
                                                {
                                                    let mut result = [{
                                                        // >>> inlined call: empty;
                                                        {
                                                            0
                                                        }
                                                    }; 1];
                                                    for i in 0 .. 1 {
                                                        result[i] = array[(offset + i)]
                                                    };
                                                    result
                                                }
                                            };
                                            let svc_post_packed = {
                                                // >>> inlined call: subarray;
                                                let array = packed;
                                                let offset = (1 + 1);
                                                {
                                                    let mut result = [{
                                                        // >>> inlined call: empty;
                                                        {
                                                            0
                                                        }
                                                    }; 1];
                                                    for i in 0 .. 1 {
                                                        result[i] = array[(offset + i)]
                                                    };
                                                    result
                                                }
                                            };
                                            let timestamp_of_change = ((packed[0] as u32) as u64);
                                            {
                                                // >>> inlined call: new;
                                                let __arg_0 = {
                                                    // >>> inlined call: unpack;
                                                    let packed = svc_pre_packed;
                                                    {
                                                        {
                                                            let inner = {
                                                                // >>> inlined call: unpack;
                                                                let fields = packed;
                                                                {
                                                                    fields[0]
                                                                }
                                                            };
                                                            (inner)
                                                        }
                                                    }
                                                };
                                                let __arg_1 = {
                                                    // >>> inlined call: unpack;
                                                    let packed = svc_post_packed;
                                                    {
                                                        {
                                                            let inner = {
                                                                // >>> inlined call: unpack;
                                                                let fields = packed;
                                                                {
                                                                    fields[0]
                                                                }
                                                            };
                                                            (inner)
                                                        }
                                                    }
                                                };
                                                let __arg_2 = timestamp_of_change;
                                                let pre = __arg_0;
                                                let post = __arg_1;
                                                let timestamp_of_change = __arg_2;
                                                {
                                                    {
                                                        let pre = pre;
                                                        let post = post;
                                                        let timestamp_of_change = timestamp_of_change;
                                                        (pre, post, timestamp_of_change)
                                                    }
                                                }
                                            }
                                        }
                                    };
                                    let sdc = {
                                        // >>> inlined call: unpack_delay_change;
                                        let packed = fields[0];
                                        {
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
                                                    {
                                                        // >>> inlined call: some;
                                                        let _value = (sdc_pre_inner as u64);
                                                        {
                                                            {
                                                                let _is_some = true;
                                                                let _value = _value;
                                                                (_is_some, _value)
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    {
                                                        // >>> inlined call: none;
                                                        {
                                                            {
                                                                let _is_some = false;
                                                                let _value = 0;
                                                                (_is_some, _value)
                                                            }
                                                        }
                                                    }
                                                };
                                                let post = if sdc_post_is_some {
                                                    {
                                                        // >>> inlined call: some;
                                                        let _value = (sdc_post_inner as u64);
                                                        {
                                                            {
                                                                let _is_some = true;
                                                                let _value = _value;
                                                                (_is_some, _value)
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    {
                                                        // >>> inlined call: none;
                                                        {
                                                            {
                                                                let _is_some = false;
                                                                let _value = 0;
                                                                (_is_some, _value)
                                                            }
                                                        }
                                                    }
                                                };
                                                let timestamp_of_change = (sdc_timestamp_of_change as u64);
                                                (pre, post, timestamp_of_change)
                                            }
                                        }
                                    };
                                    {
                                        // >>> inlined call: new;
                                        let __arg_0 = svc;
                                        let __arg_1 = sdc;
                                        let svc = __arg_0;
                                        let sdc = __arg_1;
                                        {
                                            {
                                                let svc = svc;
                                                let sdc = sdc;
                                                (svc, sdc)
                                            }
                                        }
                                    }
                                }
                            };
                            {
                                // >>> inlined call: compute_delayed_public_mutable_time_horizon;
                                let __arg_0 = delayed_public_mutable_values;
                                let __arg_1 = private_call.public_inputs.anchor_block_header.global_variables.timestamp;
                                let delayed_public_mutable_values = __arg_0;
                                let anchor_block_timestamp = __arg_1;
                                {
                                    let effective_minimum_delay = {
                                        // >>> inlined call: get_effective_minimum_delay_at;
                                        let __arg_0 = delayed_public_mutable_values.sdc;
                                        let __arg_1 = anchor_block_timestamp;
                                        let self = __arg_0;
                                        let anchor_block_timestamp = __arg_1;
                                        {
                                            if (self.timestamp_of_change <= anchor_block_timestamp) {
                                                ({
                                                    // >>> inlined call: unwrap_or;
                                                    let __arg_0 = self.post;
                                                    let __arg_1 = 86400;
                                                    let self = __arg_0;
                                                    let default = __arg_1;
                                                    {
                                                        if self._is_some {
                                                            self._value
                                                        } else {
                                                            default
                                                        }
                                                    }
                                                } - 1)
                                            } else {
                                                let time_until_delay_change = (self.timestamp_of_change - anchor_block_timestamp);
                                                let time_until_next_delay_change = {
                                                    // >>> inlined call: min;
                                                    let v1 = {
                                                        // >>> inlined call: unwrap_or;
                                                        let __arg_0 = self.pre;
                                                        let __arg_1 = 86400;
                                                        let self = __arg_0;
                                                        let default = __arg_1;
                                                        {
                                                            if self._is_some {
                                                                self._value
                                                            } else {
                                                                default
                                                            }
                                                        }
                                                    };
                                                    let v2 = (time_until_delay_change + {
                                                        // >>> inlined call: unwrap_or;
                                                        let __arg_0 = self.post;
                                                        let __arg_1 = 86400;
                                                        let self = __arg_0;
                                                        let default = __arg_1;
                                                        {
                                                            if self._is_some {
                                                                self._value
                                                            } else {
                                                                default
                                                            }
                                                        }
                                                    });
                                                    {
                                                        if ({
                                                            // >>> inlined call: cmp;
                                                            let self = v1;
                                                            let other = v2;
                                                            {
                                                                if (self < other) {
                                                                    {
                                                                        // >>> inlined call: less;
                                                                        {
                                                                            {
                                                                                let result = 0;
                                                                                (result)
                                                                            }
                                                                        }
                                                                    }
                                                                } else {
                                                                    if (self > other) {
                                                                        {
                                                                            // >>> inlined call: greater;
                                                                            {
                                                                                {
                                                                                    let result = 2;
                                                                                    (result)
                                                                                }
                                                                            }
                                                                        }
                                                                    } else {
                                                                        {
                                                                            // >>> inlined call: equal;
                                                                            {
                                                                                {
                                                                                    let result = 1;
                                                                                    (result)
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }.0 == 2) {
                                                            v2
                                                        } else {
                                                            v1
                                                        }
                                                    }
                                                };
                                                (time_until_next_delay_change - 1)
                                            }
                                        }
                                    };
                                    {
                                        // >>> inlined call: get_time_horizon;
                                        let __arg_0 = delayed_public_mutable_values.svc;
                                        let __arg_1 = anchor_block_timestamp;
                                        let __arg_2 = effective_minimum_delay;
                                        let self = __arg_0;
                                        let anchor_block_timestamp = __arg_1;
                                        let minimum_delay = __arg_2;
                                        {
                                            if (anchor_block_timestamp >= self.timestamp_of_change) {
                                                (anchor_block_timestamp + minimum_delay)
                                            } else {
                                                {
                                                    // >>> inlined call: min;
                                                    let v1 = (anchor_block_timestamp + minimum_delay);
                                                    let v2 = (self.timestamp_of_change - 1);
                                                    {
                                                        if ({
                                                            // >>> inlined call: cmp;
                                                            let self = v1;
                                                            let other = v2;
                                                            {
                                                                if (self < other) {
                                                                    {
                                                                        // >>> inlined call: less;
                                                                        {
                                                                            {
                                                                                let result = 0;
                                                                                (result)
                                                                            }
                                                                        }
                                                                    }
                                                                } else {
                                                                    if (self > other) {
                                                                        {
                                                                            // >>> inlined call: greater;
                                                                            {
                                                                                {
                                                                                    let result = 2;
                                                                                    (result)
                                                                                }
                                                                            }
                                                                        }
                                                                    } else {
                                                                        {
                                                                            // >>> inlined call: equal;
                                                                            {
                                                                                {
                                                                                    let result = 1;
                                                                                    (result)
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }.0 == 2) {
                                                            v2
                                                        } else {
                                                            v1
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    };
                    let expiration_timestamp = {
                        // >>> inlined call: min;
                        let v1 = inputs.private_call.public_inputs.expiration_timestamp;
                        let v2 = timestamp_before_registry_read_goes_stale;
                        {
                            if ({
                                // >>> inlined call: cmp;
                                let self = v1;
                                let other = v2;
                                {
                                    if (self < other) {
                                        {
                                            // >>> inlined call: less;
                                            {
                                                {
                                                    let result = 0;
                                                    (result)
                                                }
                                            }
                                        }
                                    } else {
                                        if (self > other) {
                                            {
                                                // >>> inlined call: greater;
                                                {
                                                    {
                                                        let result = 2;
                                                        (result)
                                                    }
                                                }
                                            }
                                        } else {
                                            {
                                                // >>> inlined call: equal;
                                                {
                                                    {
                                                        let result = 1;
                                                        (result)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }.0 == 2) {
                                v2
                            } else {
                                v1
                            }
                        }
                    };
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
            }
        }
    }
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = {
        // >>> inlined call: concat;
        let self = (&[{
            // >>> inlined call: to_field;
            let self = separator;
            {
                (self as Field)
            }
        }]);
        let array2 = inputs;
        {
            let mut result = [0; 3];
            for i in 0 .. 1 {
                result[i] = (*self)[i]
            };
            for i in 0 .. 2 {
                result[(i + 1)] = array2[i]
            };
            result
        }
    };
    {
        // >>> inlined call: poseidon2_hash;
        let inputs = inputs_with_separator;
        {
            hash(inputs, 3)
        }
    }
}
fn lambda(mut env: ((Field,),), call_request: PrivateCallRequest) -> () {
    assert({
        // >>> inlined call: eq;
        let _self = call_request.call_context.msg_sender;
        let _other = env.0;
        {
            (_self.inner == _other.inner)
        }
    }, "incorrect msg_sender for private call request");
}
unconstrained fn lambda(mut env: ((Field,),), call_request: PrivateCallRequest) -> () {
    assert(eq(call_request.call_context.msg_sender, env.0), "incorrect msg_sender for private call request");
}
unconstrained fn eq(_self: AztecAddress, _other: AztecAddress) -> bool {
    (_self.inner == _other.inner)
}
fn lambda(mut env: ((Field,),), call_request: Counted<PublicCallRequest>) -> () {
    if (!{
        // >>> inlined call: eq;
        let _self = call_request.inner.msg_sender;
        let _other = NULL_MSG_SENDER_CONTRACT_ADDRESS;
        {
            (_self.inner == _other.inner)
        }
    }) {
        assert({
            // >>> inlined call: eq;
            let _self = call_request.inner.msg_sender;
            let _other = env.0;
            {
                (_self.inner == _other.inner)
            }
        }, "incorrect msg_sender for public call request");
    }
}
unconstrained fn lambda(mut env: ((Field,),), call_request: Counted<PublicCallRequest>) -> () {
    if (!eq(call_request.inner.msg_sender, NULL_MSG_SENDER_CONTRACT_ADDRESS)) {
        assert(eq(call_request.inner.msg_sender, env.0), "incorrect msg_sender for public call request");
    }
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
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 15], separator: u32) -> Field {
    let inputs_with_separator = {
        // >>> inlined call: concat;
        let self = (&[{
            // >>> inlined call: to_field;
            let self = separator;
            {
                (self as Field)
            }
        }]);
        let array2 = inputs;
        {
            let mut result = [0; 16];
            for i in 0 .. 1 {
                result[i] = (*self)[i]
            };
            for i in 0 .. 15 {
                result[(i + 1)] = array2[i]
            };
            result
        }
    };
    {
        // >>> inlined call: poseidon2_hash;
        let inputs = inputs_with_separator;
        {
            hash(inputs, 16)
        }
    }
}
fn serialize(self: TxRequest) -> [Field; 15] {
    let mut writer = {
        // >>> inlined call: new;
        {
            {
                let data = [0; 15];
                let offset = 0;
                (data, offset)
            }
        }
    };
    stream_serialize(self, (&mut writer));
    {
        // >>> inlined call: finish;
        let self = writer;
        {
            assert((self.offset == self.data.len()), "Writer did not write all data");
            self.data
        }
    }
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 3], separator: u32) -> Field {
    let inputs_with_separator = {
        // >>> inlined call: concat;
        let self = (&[{
            // >>> inlined call: to_field;
            let self = separator;
            {
                (self as Field)
            }
        }]);
        let array2 = inputs;
        {
            let mut result = [0; 4];
            for i in 0 .. 1 {
                result[i] = (*self)[i]
            };
            for i in 0 .. 3 {
                result[(i + 1)] = array2[i]
            };
            result
        }
    };
    {
        // >>> inlined call: poseidon2_hash;
        let inputs = inputs_with_separator;
        {
            hash(inputs, 4)
        }
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
#[inline_always]
fn stream_serialize(self: TxRequest, writer: &mut Writer<15>) -> () {
    stream_serialize(self.origin, writer);
    stream_serialize(self.args_hash, writer);
    stream_serialize(self.tx_context, writer);
    stream_serialize(self.function_data, writer);
    stream_serialize(self.salt, writer);
}
#[no_predicates]
fn hash(input: [Field; 3], message_size: u32) -> Field {
    {
        // >>> inlined call: hash_internal;
        let __arg_0 = input;
        let __arg_1 = message_size;
        let input = __arg_0;
        let in_len = __arg_1;
        {
            let two_pow_64 = 18446744073709551616;
            let iv = ((in_len as Field) * two_pow_64);
            let mut state = [0; 4];
            state[RATE] = iv;
            if is_unconstrained() {
                for i in 0 .. (in_len / RATE) {
                    state[0] = (state[0] + input[(i * RATE)]);
                    state[1] = (state[1] + input[((i * RATE) + 1)]);
                    state[2] = (state[2] + input[((i * RATE) + 2)]);
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    }
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
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    };
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
                state = {
                    // >>> inlined call: poseidon2_permutation;
                    let input = state;
                    {
                        static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                        poseidon2_permutation_internal(input)
                    }
                }
            };
            state[0]
        }
    }
}
fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}
unconstrained fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
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
#[no_predicates]
fn hash(input: [Field; 16], message_size: u32) -> Field {
    {
        // >>> inlined call: hash_internal;
        let __arg_0 = input;
        let __arg_1 = message_size;
        let input = __arg_0;
        let in_len = __arg_1;
        {
            let two_pow_64 = 18446744073709551616;
            let iv = ((in_len as Field) * two_pow_64);
            let mut state = [0; 4];
            state[RATE] = iv;
            if is_unconstrained() {
                for i in 0 .. (in_len / RATE) {
                    state[0] = (state[0] + input[(i * RATE)]);
                    state[1] = (state[1] + input[((i * RATE) + 1)]);
                    state[2] = (state[2] + input[((i * RATE) + 2)]);
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    }
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
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    };
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
                state = {
                    // >>> inlined call: poseidon2_permutation;
                    let input = state;
                    {
                        static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                        poseidon2_permutation_internal(input)
                    }
                }
            };
            state[0]
        }
    }
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
#[no_predicates]
unconstrained fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
#[no_predicates]
fn hash(input: [Field; 4], message_size: u32) -> Field {
    {
        // >>> inlined call: hash_internal;
        let __arg_0 = input;
        let __arg_1 = message_size;
        let input = __arg_0;
        let in_len = __arg_1;
        {
            let two_pow_64 = 18446744073709551616;
            let iv = ((in_len as Field) * two_pow_64);
            let mut state = [0; 4];
            state[RATE] = iv;
            if is_unconstrained() {
                for i in 0 .. (in_len / RATE) {
                    state[0] = (state[0] + input[(i * RATE)]);
                    state[1] = (state[1] + input[((i * RATE) + 1)]);
                    state[2] = (state[2] + input[((i * RATE) + 2)]);
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    }
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
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    };
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
                state = {
                    // >>> inlined call: poseidon2_permutation;
                    let input = state;
                    {
                        static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                        poseidon2_permutation_internal(input)
                    }
                }
            };
            state[0]
        }
    }
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 6], separator: Field) -> Field {
    let inputs_with_separator = {
        // >>> inlined call: concat;
        let self = (&[{
            // >>> inlined call: to_field;
            let self = separator;
            {
                self
            }
        }]);
        let array2 = inputs;
        {
            let mut result = [0; 7];
            for i in 0 .. 1 {
                result[i] = (*self)[i]
            };
            for i in 0 .. 6 {
                result[(i + 1)] = array2[i]
            };
            result
        }
    };
    {
        // >>> inlined call: poseidon2_hash;
        let inputs = inputs_with_separator;
        {
            hash(inputs, 7)
        }
    }
}
fn public_data_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__PUBLIC_DATA_MERKLE)
}
unconstrained fn public_data_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__PUBLIC_DATA_MERKLE)
}
#[no_predicates]
fn hash(input: [Field; 3], message_size: u32) -> Field {
    {
        // >>> inlined call: hash_internal;
        let __arg_0 = input;
        let __arg_1 = message_size;
        let input = __arg_0;
        let in_len = __arg_1;
        {
            let two_pow_64 = 18446744073709551616;
            let iv = ((in_len as Field) * two_pow_64);
            let mut state = [0; 4];
            state[RATE] = iv;
            if is_unconstrained() {
                for i in 0 .. (in_len / RATE) {
                    state[0] = (state[0] + input[(i * RATE)]);
                    state[1] = (state[1] + input[((i * RATE) + 1)]);
                    state[2] = (state[2] + input[((i * RATE) + 2)]);
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    }
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
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    };
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
                state = {
                    // >>> inlined call: poseidon2_permutation;
                    let input = state;
                    {
                        static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                        poseidon2_permutation_internal(input)
                    }
                }
            };
            state[0]
        }
    }
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
unconstrained fn decompose_hint(x: Field) -> (Field, Field) {
    compute_decomposition(x)
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
    {
        // >>> inlined call: hash_internal;
        let __arg_0 = input;
        let __arg_1 = message_size;
        let input = __arg_0;
        let in_len = __arg_1;
        {
            let two_pow_64 = 18446744073709551616;
            let iv = ((in_len as Field) * two_pow_64);
            let mut state = [0; 4];
            state[RATE] = iv;
            if is_unconstrained() {
                for i in 0 .. (in_len / RATE) {
                    state[0] = (state[0] + input[(i * RATE)]);
                    state[1] = (state[1] + input[((i * RATE) + 1)]);
                    state[2] = (state[2] + input[((i * RATE) + 2)]);
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    }
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
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    };
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
                state = {
                    // >>> inlined call: poseidon2_permutation;
                    let input = state;
                    {
                        static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                        poseidon2_permutation_internal(input)
                    }
                }
            };
            state[0]
        }
    }
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: Field) -> Field {
    let inputs_with_separator = {
        // >>> inlined call: concat;
        let self = (&[{
            // >>> inlined call: to_field;
            let self = separator;
            {
                self
            }
        }]);
        let array2 = inputs;
        {
            let mut result = [0; 3];
            for i in 0 .. 1 {
                result[i] = (*self)[i]
            };
            for i in 0 .. 2 {
                result[(i + 1)] = array2[i]
            };
            result
        }
    };
    {
        // >>> inlined call: poseidon2_hash;
        let inputs = inputs_with_separator;
        {
            hash(inputs, 3)
        }
    }
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
unconstrained fn field_less_than(x: Field, y: Field) -> bool {
    __field_less_than(x, y)
}
fn serialize(self: PublicDataTreeLeafPreimage) -> [Field; 4] {
    let mut writer = {
        // >>> inlined call: new;
        {
            {
                let data = [0; 4];
                let offset = 0;
                (data, offset)
            }
        }
    };
    stream_serialize(self, (&mut writer));
    {
        // >>> inlined call: finish;
        let self = writer;
        {
            assert((self.offset == self.data.len()), "Writer did not write all data");
            self.data
        }
    }
}
unconstrained fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
}
fn to_le_bytes(self: Field) -> [u8; 32] {
    static_assert((32 <= @[1, 0, 0, 240, 147, 245, 225, 67, 145, 112, 185, 121, 72, 232, 51, 40, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48].len()), "N must be less than or equal to modulus_le_bytes().len()", r#"{"kind":"string","length":56}"#, false);
    let bytes = {
        // >>> inlined call: to_le_radix;
        let __arg_0 = self;
        let __arg_1 = 256;
        let self = __arg_0;
        let radix = __arg_1;
        {
            if (!is_unconstrained()) {
                static_assert((1 < radix), "radix must be greater than 1", r#"{"kind":"string","length":28}"#, false);
                static_assert((radix <= 256), "radix must be less than or equal to 256", r#"{"kind":"string","length":39}"#, false);
                static_assert(((radix & (radix - 1)) == 0), "radix must be a power of 2", r#"{"kind":"string","length":26}"#, false);
            };
            __to_le_radix(self, radix)
        }
    };
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
    {
        // >>> inlined call: hash_internal;
        let __arg_0 = input;
        let __arg_1 = message_size;
        let input = __arg_0;
        let in_len = __arg_1;
        {
            let two_pow_64 = 18446744073709551616;
            let iv = ((in_len as Field) * two_pow_64);
            let mut state = [0; 4];
            state[RATE] = iv;
            if is_unconstrained() {
                for i in 0 .. (in_len / RATE) {
                    state[0] = (state[0] + input[(i * RATE)]);
                    state[1] = (state[1] + input[((i * RATE) + 1)]);
                    state[2] = (state[2] + input[((i * RATE) + 2)]);
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    }
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
                    state = {
                        // >>> inlined call: poseidon2_permutation;
                        let input = state;
                        {
                            static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                            poseidon2_permutation_internal(input)
                        }
                    };
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
                state = {
                    // >>> inlined call: poseidon2_permutation;
                    let input = state;
                    {
                        static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
                        poseidon2_permutation_internal(input)
                    }
                }
            };
            state[0]
        }
    }
}
#[inline_always]
fn stream_serialize(self: PublicDataTreeLeafPreimage, writer: &mut Writer<4>) -> () {
    stream_serialize(self.slot, writer);
    stream_serialize(self.value, writer);
    stream_serialize(self.next_slot, writer);
    stream_serialize(self.next_index, writer);
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<4>) -> () {
    write(writer, self);
}
fn write(self: &mut Writer<4>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}

