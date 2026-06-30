// Legend: source-level names of monomorphized struct/enum/alias types.
// A type claimed by several distinct names is printed structurally
// wherever it appears, to avoid guessing which name applies.
type AppendOnlyTreeSnapshot = (Field, Field);
type AztecAddress = (Field,);
type BaseL2Gas = (u32, u32, u32, u32, u32);
type BlockHeader = ((Field, Field), StateReference, Field, GlobalVariables, Field, Field);
type CallContext = ((Field,), (Field,), FunctionSelector, bool);
type ClaimedLengthArray<Counted<PublicCallRequest>, 32> = ([Counted<PublicCallRequest>; 32], u32);
type ClaimedLengthArray<PrivateCallRequest, 16> = ([PrivateCallRequest; 16], u32);
type ClaimedLengthArray<Scoped<Counted<Field>>, 64> = ([((Field, u32), (Field,)); 64], u32);
type ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8> = ([Scoped<Counted<L2ToL1Message>>; 8], u32);
type ClaimedLengthArray<Scoped<Counted<LogHash>>, 1> = ([Scoped<Counted<LogHash>>; 1], u32);
type ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64> = ([((Field, u32), (Field,)); 64], u32);
type ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64> = ([Scoped<Counted<Nullifier>>; 64], u32);
type ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64> = ([Scoped<Counted<PrivateLogData>>; 64], u32);
type ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64> = ([Scoped<KeyValidationRequestAndSeparator>; 64], u32);
type Counted<Field> = (Field, u32);
type Counted<L2ToL1Message> = (L2ToL1Message, u32);
type Counted<LogHash> = ((Field, u32), u32);
type Counted<NoteHash> = (Field, u32);
type Counted<Nullifier> = ((Field, Field), u32);
type Counted<PrivateLogData> = (PrivateLogData, u32);
type Counted<PublicCallRequest> = (PublicCallRequest, u32);
type DerivedHints<64, 64, 64, 64> = (u32, [(u32, u32); 64], [bool; 64], [bool; 64], [(u32, u32); 64]);
type EmbeddedCurvePoint = (Field, Field);
type EmbeddedCurveScalar = (Field, Field);
type EthAddress = (Field,);
type FunctionSelector = (u32,);
type Gas = (u32, u32);
type GasFees = (u128, u128);
type GasSettings = ((u32, u32), (u32, u32), GasFees, GasFees);
type GlobalVariables = (Field, Field, u32, Field, u64, (Field,), (Field,), GasFees);
type KeyValidationHint = ((Field, Field),);
type KeyValidationRequest = (Field, Field);
type KeyValidationRequestAndSeparator = ((Field, Field), Field);
type KeyValidationRequestsValidator<64, 64> = (ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64>, ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64>, [KeyValidationHint; 64]);
type L2ToL1Message = ((Field,), Field);
type Log<16> = ([Field; 16], u32);
type LogHash = (Field, u32);
type MembershipWitness<42> = (Field, [Field; 42]);
type MembershipWitness<7> = (Field, [Field; 7]);
type NoteHashLeafPreimage = (Field,);
type NoteLogLinkedSourceIndices = (u32, u32);
type Nullifier = (Field, Field);
type NullifierLeafPreimage = (Field, Field, Field);
type OrderHints<64> = ([u32; 64], [u32; 64]);
type Ordering = (Field,);
type PaddedSideEffectAmounts = (u32, u32, u32, u32, u32, u32);
type PaddedSideEffects = ([Field; 64], [Field; 64], [Log<16>; 64]);
type PartialStateReference = ((Field, Field), (Field, Field), (Field, Field));
type PendingReadHint = (u32, u32);
type PrivateAccumulatedData = (([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, ClaimedLengthArray<Scoped<Counted<LogHash>>, 1>, ClaimedLengthArray<Counted<PublicCallRequest>, 32>, ClaimedLengthArray<PrivateCallRequest, 16>);
type PrivateCallRequest = (CallContext, Field, Field, u32, u32);
type PrivateKernelCircuitOutputComposer = (PrivateKernelCircuitPublicInputs,);
type PrivateKernelCircuitPublicInputs = (PrivateTxConstantData, u32, PrivateValidationRequests, PrivateAccumulatedData, PublicCallRequest, (Field,), u64, bool, Field, u32);
type PrivateKernelData = (PrivateKernelCircuitPublicInputs, VkData<163>);
type PrivateKernelDataWithoutPublicInputs = (VkData<163>,);
type PrivateKernelResetCircuitPrivateInputs<64, 64, 64, 64, 64, 64> = (PrivateKernelData, PaddedSideEffects, PrivateKernelResetHints<64, 64, 64, 64, 64, 64>);
type PrivateKernelResetHints<64, 64, 64, 64, 64, 64> = (ReadRequestHints<64, 64, 64, 42, NoteHashLeafPreimage>, ReadRequestHints<64, 64, 64, 42, NullifierLeafPreimage>, [KeyValidationHint; 64], [(u32, u32); 64]);
type PrivateKernelResetTailToPublicCircuitPrivateInputs<64, 64, 64, 64, 64, 64> = (PrivateKernelResetCircuitPrivateInputs<64, 64, 64, 64, 64, 64>, PaddedSideEffectAmounts, u64);
type PrivateLogData = (Log<16>, u32);
type PrivateToPublicAccumulatedData = ([Field; 64], [Field; 64], [Scoped<L2ToL1Message>; 8], [Log<16>; 64], [((Field, u32), (Field,)); 1], [PublicCallRequest; 32]);
type PrivateToPublicKernelCircuitPublicInputs = (TxConstantData, PrivateToPublicAccumulatedData, PrivateToPublicAccumulatedData, PublicCallRequest, (u32, u32), (Field,), u64);
type PrivateTxConstantData = (BlockHeader, TxContext, Field, Field, ProtocolContracts);
type PrivateValidationRequests = (([((Field, u32), (Field,)); 64], u32), ([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64>);
type ProtocolContracts = ([(Field,); 11],);
type PublicCallRequest = ((Field,), (Field,), bool, Field);
type ReadRequestAction = (u8, u32);
type ReadRequestActionEnum = (u8, u8, u8);
type ReadRequestHints<64, 64, 64, 42, NoteHashLeafPreimage> = ([ReadRequestAction; 64], [(u32, u32); 64], [SettledReadHint<42, NoteHashLeafPreimage>; 64]);
type ReadRequestHints<64, 64, 64, 42, NullifierLeafPreimage> = ([ReadRequestAction; 64], [(u32, u32); 64], [SettledReadHint<42, NullifierLeafPreimage>; 64]);
type ReadRequestValidator<64, Field, 64, 64, 64, 42, NoteHashLeafPreimage> = (([((Field, u32), (Field,)); 64], u32), ([((Field, u32), (Field,)); 64], u32), Field, ([((Field, u32), (Field,)); 64], u32), ReadRequestHints<64, 64, 64, 42, NoteHashLeafPreimage>, (fn(Field, Field) -> Field, unconstrained fn(Field, Field) -> Field));
type ReadRequestValidator<64, Nullifier, 64, 64, 64, 42, NullifierLeafPreimage> = (([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, Field, ([((Field, u32), (Field,)); 64], u32), ReadRequestHints<64, 64, 64, 42, NullifierLeafPreimage>, (fn(Field, Field) -> Field, unconstrained fn(Field, Field) -> Field));
type ResetOutputComposer = (PrivateKernelCircuitPublicInputs, PaddedSideEffects, [ReadRequestAction; 64], [ReadRequestAction; 64], SquashedOutputArrayHints);
type ResetOutputValidator<64, 64, 64, 64, 64, 64> = (PrivateKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputs, PaddedSideEffects, PrivateKernelResetHints<64, 64, 64, 64, 64, 64>, SquashedOutputArrayHints);
type Scoped<Counted<Field>> = ((Field, u32), (Field,));
type Scoped<Counted<L2ToL1Message>> = (Counted<L2ToL1Message>, (Field,));
type Scoped<Counted<LogHash>> = (Counted<LogHash>, (Field,));
type Scoped<Counted<NoteHash>> = ((Field, u32), (Field,));
type Scoped<Counted<Nullifier>> = (Counted<Nullifier>, (Field,));
type Scoped<Counted<PrivateLogData>> = (Counted<PrivateLogData>, (Field,));
type Scoped<KeyValidationRequestAndSeparator> = (KeyValidationRequestAndSeparator, (Field,));
type Scoped<L2ToL1Message> = (L2ToL1Message, (Field,));
type Scoped<LogHash> = ((Field, u32), (Field,));
type SettledReadHint<42, NoteHashLeafPreimage> = (u32, MembershipWitness<42>, (Field,));
type SettledReadHint<42, NullifierLeafPreimage> = (u32, MembershipWitness<42>, NullifierLeafPreimage);
type SortedTuple<Counted<PublicCallRequest>> = (Counted<PublicCallRequest>, u32);
type SortedTuple<Scoped<Counted<Field>>> = (((Field, u32), (Field,)), u32);
type SortedTuple<Scoped<Counted<L2ToL1Message>>> = (Scoped<Counted<L2ToL1Message>>, u32);
type SortedTuple<Scoped<Counted<LogHash>>> = (Scoped<Counted<LogHash>>, u32);
type SortedTuple<Scoped<Counted<Nullifier>>> = (Scoped<Counted<Nullifier>>, u32);
type SortedTuple<Scoped<Counted<PrivateLogData>>> = (Scoped<Counted<PrivateLogData>>, u32);
type SortedTuple<u32> = (u32, u32);
type SplitOrderHints<1> = ([u32; 1], [u32; 1], [u32; 1]);
type SplitOrderHints<32> = ([u32; 32], [u32; 32], [u32; 32]);
type SplitOrderHints<8> = ([u32; 8], [u32; 8], [u32; 8]);
type SquashedOutputArrayHints = (([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>);
type StateReference = ((Field, Field), PartialStateReference);
type TailToPublicOutputComposer = (PrivateKernelCircuitPublicInputs, PaddedSideEffectAmounts, u64);
type TailToPublicOutputValidator = (PrivateToPublicKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputs, PaddedSideEffectAmounts, u64);
type TransientDataSquashingHint = (u32, u32);
type TransientDataValidator<64, 64, 64, 64> = (([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, ([((Field, u32), (Field,)); 64], u32), ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, u32, [(u32, u32); 64], DerivedHints<64, 64, 64, 64>);
type TxConstantData = (BlockHeader, TxContext, Field, Field);
type TxContext = (Field, Field, GasSettings);
type VerificationKey<163> = ([Field; 163], Field);
type VkData<163> = (VerificationKey<163>, u32, [Field; 7]);
type Writer<3> = ([Field; 3], u32);

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 7] = [0, 66, 65, 1, 67, 68, 23];
global PRIVATE_LOG_SIZE_IN_FIELDS: u32 = 16;
global CONTRACT_CLASS_LOG_SIZE_IN_FIELDS: u32 = 3023;
global PROOF_TYPE_HN: u32 = 2;
global PROOF_TYPE_HN_TAIL: u32 = 8;
global PRIVATE_KERNEL_RESET_VK_INDEX: u32 = 23;
global PRIVATE_KERNEL_RESET_BLOCK_END: u32 = 43;
global PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX: u32 = 37;
global PRIVATE_KERNEL_RESET_TAIL_VK_INDEX: u32 = 31;
global MAX_TX_LIFETIME: u64 = 86400;
global MAX_U32_VALUE: u32 = 4294967295;
global SIDE_EFFECT_MASKING_ADDRESS: (Field,) = {
    let inner = -2365088537355691588942047354613137618320844663594058432923675757846780505630;
    (inner)
};
global DOM_SEP__MERKLE_HASH: u32 = 2982624097;
global DOM_SEP__NULLIFIER_MERKLE: u32 = 1157584160;
global PUBLIC_TX_L2_GAS: BaseL2Gas = {
    let note_hash = 19275;
    let nullifier = 30800;
    let l2_to_l1_msg = 5239;
    let private_log = 2500;
    let contract_class_log = 73000;
    (note_hash, nullifier, l2_to_l1_msg, private_log, contract_class_log)
};
global PRIVATE_ONLY_TX_L2_GAS: BaseL2Gas = {
    let note_hash = 9200;
    let nullifier = 16000;
    let l2_to_l1_msg = 5200;
    let private_log = 2500;
    let contract_class_log = 73000;
    (note_hash, nullifier, l2_to_l1_msg, private_log, contract_class_log)
};
global FIXED_AVM_STARTUP_L2_GAS: u32 = 20000;
global PUBLIC_DATA_WRITE_LENGTH: u32 = 2;
global DA_GAS_PER_FIELD: u32 = 32;
global ReadRequestActions: ReadRequestActionEnum = {
    let SKIP = 0;
    let READ_AS_PENDING = 1;
    let READ_AS_SETTLED = 2;
    (SKIP, READ_AS_PENDING, READ_AS_SETTLED)
};
global TX_DA_GAS_OVERHEAD: u32 = 96;
global PUBLIC_TX_L2_GAS_OVERHEAD: u32 = 540000;
global PRIVATE_TX_L2_GAS_OVERHEAD: u32 = 440000;
global DOM_SEP__PROTOCOL_CONTRACTS: u32 = 3904434327;
global DOM_SEP__SILOED_NOTE_HASH: u32 = 3361878420;
global DOM_SEP__SILOED_NULLIFIER: u32 = 57496191;
global DOM_SEP__SINGLE_PUBLIC_KEY_HASH: u32 = 3452068255;
global DOM_SEP__PRIVATE_LOG_FIRST_FIELD: u32 = 2769976252;
global DOM_SEP__NOTE_HASH_NONCE: u32 = 1721808740;
global DOM_SEP__UNIQUE_NOTE_HASH: u32 = 226850429;
global RATE: u32 = 3;
global POSEIDON2_CONFIG_STATE_SIZE: u32 = 4;
fn main(previous_kernel: PrivateKernelDataWithoutPublicInputs, previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs, padded_side_effects: PaddedSideEffects, hints: PrivateKernelResetHints<64, 64, 64, 64, 64, 64>, padded_side_effect_amounts: PaddedSideEffectAmounts, expiration_timestamp_upper_bound: u64) -> return_data PrivateToPublicKernelCircuitPublicInputs {
    let private_inputs = {
        // >>> inlined call: new;
        let __arg_0 = previous_kernel;
        let __arg_1 = previous_kernel_public_inputs;
        let __arg_2 = padded_side_effects;
        let __arg_3 = hints;
        let __arg_4 = padded_side_effect_amounts;
        let __arg_5 = expiration_timestamp_upper_bound;
        let previous_kernel = __arg_0;
        let previous_kernel_public_inputs = __arg_1;
        let padded_side_effects = __arg_2;
        let hints = __arg_3;
        let padded_side_effect_amounts = __arg_4;
        let expiration_timestamp_upper_bound = __arg_5;
        {
            {
                let reset_inputs = {
                    // >>> inlined call: new;
                    let __arg_0 = previous_kernel;
                    let __arg_1 = previous_kernel_public_inputs;
                    let __arg_2 = padded_side_effects;
                    let __arg_3 = hints;
                    let previous_kernel = __arg_0;
                    let previous_kernel_public_inputs = __arg_1;
                    let padded_side_effects = __arg_2;
                    let hints = __arg_3;
                    {
                        {
                            let previous_kernel = {
                                // >>> inlined call: to_private_kernel_data;
                                let self = previous_kernel;
                                let public_inputs = previous_kernel_public_inputs;
                                {
                                    {
                                        let public_inputs = public_inputs;
                                        let vk_data = self.vk_data;
                                        (public_inputs, vk_data)
                                    }
                                }
                            };
                            let padded_side_effects = padded_side_effects;
                            let hints = hints;
                            (previous_kernel, padded_side_effects, hints)
                        }
                    }
                };
                let padded_side_effect_amounts = padded_side_effect_amounts;
                let expiration_timestamp_upper_bound = expiration_timestamp_upper_bound;
                (reset_inputs, padded_side_effect_amounts, expiration_timestamp_upper_bound)
            }
        }
    };
    {
        // >>> inlined call: execute;
        let self = private_inputs;
        {
            let reset_output = {
                // >>> inlined call: execute_as_terminal;
                let __arg_0 = self.reset_inputs;
                let self = __arg_0;
                {
                    let previous_public_inputs = self.previous_kernel.public_inputs;
                    if (!is_unconstrained()) {
                        {
                            // >>> inlined call: verify;
                            let __arg_0 = self.previous_kernel;
                            let __arg_1 = true;
                            let self = __arg_0;
                            let is_last_kernel = __arg_1;
                            {
                                let mut proof_type = PROOF_TYPE_HN;
                                if is_last_kernel {
                                    proof_type = PROOF_TYPE_HN_TAIL
                                };
                                {
                                    // >>> inlined call: verify_proof_with_type;
                                    let __arg_0 = self.vk_data.vk.key;
                                    let __arg_1 = [];
                                    let __arg_2 = [];
                                    let __arg_3 = self.vk_data.vk.hash;
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
                        {
                            // >>> inlined call: validate_vk_in_vk_tree;
                            let __arg_0 = self.previous_kernel;
                            let __arg_1 = ALLOWED_PREVIOUS_CIRCUITS;
                            let self = __arg_0;
                            let allowed_indices = __arg_1;
                            {
                                let leaf = self.vk_data.leaf_index;
                                let vk_index = if ((leaf < PRIVATE_KERNEL_RESET_VK_INDEX) | (leaf >= PRIVATE_KERNEL_RESET_BLOCK_END)) {
                                    leaf
                                } else {
                                    if (leaf >= PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX) {
                                        PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX
                                    } else {
                                        if (leaf >= PRIVATE_KERNEL_RESET_TAIL_VK_INDEX) {
                                            PRIVATE_KERNEL_RESET_TAIL_VK_INDEX
                                        } else {
                                            PRIVATE_KERNEL_RESET_VK_INDEX
                                        }
                                    }
                                };
                                let index_hint = {
                                    unsafe { find_first_index(allowed_indices, {
                                        let closure_variable = {
                                            let env = (vk_index);
                                            ((env, lambda), (env, lambda))
                                        };
                                        closure_variable
                                    }) }
                                };
                                assert((index_hint != 7), "Vk index not in allowed list");
                                assert((allowed_indices[index_hint] == vk_index), "Invalid vk index");
                                {
                                    // >>> inlined call: validate_in_vk_tree;
                                    let __arg_0 = self.vk_data;
                                    let __arg_1 = self.public_inputs.constants.vk_tree_root;
                                    let self = __arg_0;
                                    let vk_tree_root = __arg_1;
                                    {
                                        assert({
                                            // >>> inlined call: check_membership;
                                            let leaf = self.vk.hash;
                                            let membership_witness = {
                                                let leaf_index = (self.leaf_index as Field);
                                                let sibling_path = self.sibling_path;
                                                (leaf_index, sibling_path)
                                            };
                                            let root = vk_tree_root;
                                            {
                                                let calculated_root = {
                                                    // >>> inlined call: root_from_sibling_path;
                                                    let __arg_0 = leaf;
                                                    let __arg_1 = membership_witness.leaf_index;
                                                    let __arg_2 = membership_witness.sibling_path;
                                                    let leaf = __arg_0;
                                                    let leaf_index = __arg_1;
                                                    let sibling_path = __arg_2;
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
                                                };
                                                (calculated_root == root)
                                            }
                                        }, "Membership check failed: vk hash not found in vk tree");
                                    }
                                };
                            }
                        };
                    };
                    {
                        let _ = {
                            unsafe { generate_output(self) }
                        };
                        let output = _.0;
                        let squashed_output_array_hints = _.1
                    };
                    if {
                        // >>> inlined call: should_validate_output;
                        {
                            true
                        }
                    } {
                        {
                            // >>> inlined call: validate;
                            let __arg_0 = {
                                // >>> inlined call: new;
                                let __arg_0 = output;
                                let __arg_1 = previous_public_inputs;
                                let __arg_2 = self.padded_side_effects;
                                let __arg_3 = self.hints;
                                let __arg_4 = squashed_output_array_hints;
                                let output = __arg_0;
                                let previous_kernel = __arg_1;
                                let padded_side_effects = __arg_2;
                                let reset_hints = __arg_3;
                                let squashed_output_array_hints = __arg_4;
                                {
                                    {
                                        let output = output;
                                        let previous_kernel = previous_kernel;
                                        let padded_side_effects = padded_side_effects;
                                        let reset_hints = reset_hints;
                                        let squashed_output_array_hints = squashed_output_array_hints;
                                        (output, previous_kernel, padded_side_effects, reset_hints, squashed_output_array_hints)
                                    }
                                }
                            };
                            let self = __arg_0;
                            {
                                {
                                    // >>> inlined call: validate_unchanged_data;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.constants;
                                            let _other = self.previous_kernel.constants;
                                            {
                                                (((({
                                                    // >>> inlined call: eq;
                                                    let __arg_0 = _self.anchor_block_header;
                                                    let __arg_1 = _other.anchor_block_header;
                                                    let _self = __arg_0;
                                                    let _other = __arg_1;
                                                    {
                                                        ((((({
                                                            // >>> inlined call: eq;
                                                            let __arg_0 = _self.last_archive;
                                                            let __arg_1 = _other.last_archive;
                                                            let _self = __arg_0;
                                                            let _other = __arg_1;
                                                            {
                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                            }
                                                        } & {
                                                            // >>> inlined call: eq;
                                                            let __arg_0 = _self.state;
                                                            let __arg_1 = _other.state;
                                                            let _self = __arg_0;
                                                            let _other = __arg_1;
                                                            {
                                                                ({
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.l1_to_l2_message_tree;
                                                                    let __arg_1 = _other.l1_to_l2_message_tree;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                    }
                                                                } & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.partial;
                                                                    let __arg_1 = _other.partial;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        (({
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.note_hash_tree;
                                                                            let __arg_1 = _other.note_hash_tree;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                            }
                                                                        } & {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.nullifier_tree;
                                                                            let __arg_1 = _other.nullifier_tree;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                            }
                                                                        }) & {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.public_data_tree;
                                                                            let __arg_1 = _other.public_data_tree;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                            }
                                                                        })
                                                                    }
                                                                })
                                                            }
                                                        }) & (_self.sponge_blob_hash == _other.sponge_blob_hash)) & {
                                                            // >>> inlined call: eq;
                                                            let __arg_0 = _self.global_variables;
                                                            let __arg_1 = _other.global_variables;
                                                            let _self = __arg_0;
                                                            let _other = __arg_1;
                                                            {
                                                                ((((((((_self.chain_id == _other.chain_id) & (_self.version == _other.version)) & (_self.block_number == _other.block_number)) & (_self.slot_number == _other.slot_number)) & (_self.timestamp == _other.timestamp)) & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.coinbase;
                                                                    let __arg_1 = _other.coinbase;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        (_self.inner == _other.inner)
                                                                    }
                                                                }) & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.fee_recipient;
                                                                    let __arg_1 = _other.fee_recipient;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        (_self.inner == _other.inner)
                                                                    }
                                                                }) & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.gas_fees;
                                                                    let __arg_1 = _other.gas_fees;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        ((_self.fee_per_da_gas == _other.fee_per_da_gas) & (_self.fee_per_l2_gas == _other.fee_per_l2_gas))
                                                                    }
                                                                })
                                                            }
                                                        }) & (_self.total_fees == _other.total_fees)) & (_self.total_mana_used == _other.total_mana_used))
                                                    }
                                                } & {
                                                    // >>> inlined call: eq;
                                                    let __arg_0 = _self.tx_context;
                                                    let __arg_1 = _other.tx_context;
                                                    let _self = __arg_0;
                                                    let _other = __arg_1;
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
                                                }) & (_self.tx_request_salt == _other.tx_request_salt)) & (_self.vk_tree_root == _other.vk_tree_root)) & {
                                                    // >>> inlined call: eq;
                                                    let __arg_0 = _self.protocol_contracts;
                                                    let __arg_1 = _other.protocol_contracts;
                                                    let _self = __arg_0;
                                                    let _other = __arg_1;
                                                    {
                                                        {
                                                            // >>> inlined call: eq;
                                                            let self = _self.derived_addresses;
                                                            let other = _other.derived_addresses;
                                                            {
                                                                let mut result = true;
                                                                for i in 0 .. self.len() {
                                                                    {
                                                                        let op_rhs_0 = {
                                                                            // >>> inlined call: eq;
                                                                            let _self = self[i];
                                                                            let _other = other[i];
                                                                            {
                                                                                (_self.inner == _other.inner)
                                                                            }
                                                                        };
                                                                        result = (result & op_rhs_0)
                                                                    }
                                                                };
                                                                result
                                                            }
                                                        }
                                                    }
                                                })
                                            }
                                        });
                                        assert((self.output.min_revertible_side_effect_counter == self.previous_kernel.min_revertible_side_effect_counter));
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.end.l2_to_l1_msgs;
                                            let _other = self.previous_kernel.end.l2_to_l1_msgs;
                                            {
                                                ({
                                                    // >>> inlined call: eq;
                                                    let self = _self.array;
                                                    let other = _other.array;
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
                                                                        ({
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self.inner;
                                                                            let __arg_1 = other.inner;
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                ({
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.inner;
                                                                                    let _other = other.inner;
                                                                                    {
                                                                                        ({
                                                                                            // >>> inlined call: eq;
                                                                                            let __arg_0 = _self.recipient;
                                                                                            let __arg_1 = _other.recipient;
                                                                                            let _self = __arg_0;
                                                                                            let _other = __arg_1;
                                                                                            {
                                                                                                (_self.inner == _other.inner)
                                                                                            }
                                                                                        } & (_self.content == _other.content))
                                                                                    }
                                                                                } & (self.counter == other.counter))
                                                                            }
                                                                        } & {
                                                                            // >>> inlined call: eq;
                                                                            let _self = self.contract_address;
                                                                            let _other = other.contract_address;
                                                                            {
                                                                                (_self.inner == _other.inner)
                                                                            }
                                                                        })
                                                                    }
                                                                };
                                                                result = (result & op_rhs_0)
                                                            }
                                                        };
                                                        result
                                                    }
                                                } & (_self.length == _other.length))
                                            }
                                        });
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.end.contract_class_logs_hashes;
                                            let _other = self.previous_kernel.end.contract_class_logs_hashes;
                                            {
                                                ({
                                                    // >>> inlined call: eq;
                                                    let self = _self.array;
                                                    let other = _other.array;
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
                                                                        ({
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self.inner;
                                                                            let __arg_1 = other.inner;
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                ({
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.inner;
                                                                                    let _other = other.inner;
                                                                                    {
                                                                                        ((_self.value == _other.value) & (_self.length == _other.length))
                                                                                    }
                                                                                } & (self.counter == other.counter))
                                                                            }
                                                                        } & {
                                                                            // >>> inlined call: eq;
                                                                            let _self = self.contract_address;
                                                                            let _other = other.contract_address;
                                                                            {
                                                                                (_self.inner == _other.inner)
                                                                            }
                                                                        })
                                                                    }
                                                                };
                                                                result = (result & op_rhs_0)
                                                            }
                                                        };
                                                        result
                                                    }
                                                } & (_self.length == _other.length))
                                            }
                                        });
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.end.public_call_requests;
                                            let _other = self.previous_kernel.end.public_call_requests;
                                            {
                                                ({
                                                    // >>> inlined call: eq;
                                                    let self = _self.array;
                                                    let other = _other.array;
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
                                                                        ({
                                                                            // >>> inlined call: eq;
                                                                            let _self = self.inner;
                                                                            let _other = other.inner;
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
                                                                        } & (self.counter == other.counter))
                                                                    }
                                                                };
                                                                result = (result & op_rhs_0)
                                                            }
                                                        };
                                                        result
                                                    }
                                                } & (_self.length == _other.length))
                                            }
                                        });
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.end.private_call_stack;
                                            let _other = self.previous_kernel.end.private_call_stack;
                                            {
                                                ({
                                                    // >>> inlined call: eq;
                                                    let self = _self.array;
                                                    let other = _other.array;
                                                    {
                                                        let mut result = true;
                                                        for i in 0 .. self.len() {
                                                            {
                                                                let op_rhs_0 = {
                                                                    // >>> inlined call: eq;
                                                                    let _self = self[i];
                                                                    let _other = other[i];
                                                                    {
                                                                        (((({
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.call_context;
                                                                            let __arg_1 = _other.call_context;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
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
                                                                                }) & {
                                                                                    // >>> inlined call: eq;
                                                                                    let __arg_0 = _self.function_selector;
                                                                                    let __arg_1 = _other.function_selector;
                                                                                    let _self = __arg_0;
                                                                                    let _other = __arg_1;
                                                                                    {
                                                                                        (_self.inner == _other.inner)
                                                                                    }
                                                                                }) & (_self.is_static_call == _other.is_static_call))
                                                                            }
                                                                        } & (_self.args_hash == _other.args_hash)) & (_self.returns_hash == _other.returns_hash)) & (_self.start_side_effect_counter == _other.start_side_effect_counter)) & (_self.end_side_effect_counter == _other.end_side_effect_counter))
                                                                    }
                                                                };
                                                                result = (result & op_rhs_0)
                                                            }
                                                        };
                                                        result
                                                    }
                                                } & (_self.length == _other.length))
                                            }
                                        });
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.public_teardown_call_request;
                                            let _other = self.previous_kernel.public_teardown_call_request;
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
                                        });
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.fee_payer;
                                            let _other = self.previous_kernel.fee_payer;
                                            {
                                                (_self.inner == _other.inner)
                                            }
                                        });
                                        assert((self.output.expiration_timestamp == self.previous_kernel.expiration_timestamp));
                                        assert((self.output.is_private_only == self.previous_kernel.is_private_only));
                                        assert((self.output.claimed_first_nullifier == self.previous_kernel.claimed_first_nullifier));
                                        assert((self.output.claimed_revertible_counter == self.previous_kernel.claimed_revertible_counter));
                                    }
                                };
                                {
                                    // >>> inlined call: validate_validation_requests;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        let validation_requests = self.previous_kernel.validation_requests;
                                        let tree_snapshots = self.previous_kernel.constants.anchor_block_header.state.partial;
                                        let output = self.output.validation_requests;
                                        {
                                            // >>> inlined call: validate;
                                            let __arg_0 = {
                                                let read_requests = validation_requests.note_hash_read_requests;
                                                let pending_values = self.previous_kernel.end.note_hashes;
                                                let tree_root = tree_snapshots.note_hash_tree.root;
                                                let propagated_read_requests = output.note_hash_read_requests;
                                                let hints = self.reset_hints.note_hash_read_request_hints;
                                                let merkle_hasher = (merkle_hash, merkle_hash);
                                                (read_requests, pending_values, tree_root, propagated_read_requests, hints, merkle_hasher)
                                            };
                                            let self = __arg_0;
                                            {
                                                if (64 != 0) {
                                                    static_assert((64 == 64), "PendingReadAmount should match the length of the hints array", r#"{"kind":"string","length":60}"#, false);
                                                    {
                                                        // >>> inlined call: validate_pending_read_requests;
                                                        let read_requests = self.read_requests;
                                                        let pending_values = self.pending_values;
                                                        let pending_read_hints = self.hints.pending_read_hints;
                                                        {
                                                            {
                                                                let $i0 = pending_read_hints;
                                                                for $i1 in 0 .. $i0.len() {
                                                                    let hint = $i0[$i1];
                                                                    {
                                                                        let read_request_index = hint.read_request_index;
                                                                        let pending_value_index = hint.pending_value_index;
                                                                        if (read_request_index != 64) {
                                                                            assert((pending_value_index < pending_values.length), "Cannot read a pending value beyond claimed length");
                                                                            let read_request = read_requests.array[read_request_index];
                                                                            let pending_value = pending_values.array[pending_value_index];
                                                                            {
                                                                                // >>> inlined call: assert_match_read_request;
                                                                                let __arg_0 = {
                                                                                    // >>> inlined call: innermost;
                                                                                    let self = pending_value;
                                                                                    {
                                                                                        self.inner.inner
                                                                                    }
                                                                                };
                                                                                let __arg_1 = {
                                                                                    // >>> inlined call: innermost;
                                                                                    let self = read_request;
                                                                                    {
                                                                                        self.inner.inner
                                                                                    }
                                                                                };
                                                                                let self = __arg_0;
                                                                                let read_request = __arg_1;
                                                                                {
                                                                                    assert((self == read_request), "Value of the note hash does not match read request");
                                                                                }
                                                                            };
                                                                            assert({
                                                                                // >>> inlined call: eq;
                                                                                let _self = pending_value.contract_address;
                                                                                let _other = read_request.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            }, "Contract address of the pending value does not match read request");
                                                                            assert(({
                                                                                // >>> inlined call: counter;
                                                                                let self = pending_value;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } < {
                                                                                // >>> inlined call: counter;
                                                                                let self = read_request;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            }), "Pending value must be emitted before the read request");
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                } else {
                                                    {
                                                        let $i0 = self.hints.pending_read_hints;
                                                        for $i1 in 0 .. $i0.len() {
                                                            let hint = $i0[$i1];
                                                            {
                                                                assert((hint.read_request_index == 64), "Unused pending read hint must not point to a read request");
                                                            }
                                                        }
                                                    }
                                                };
                                                if (64 != 0) {
                                                    static_assert((64 == self.hints.settled_read_hints.len()), "SettledReadAmount should match the length of the hints array", r#"{"kind":"string","length":60}"#, false);
                                                    {
                                                        // >>> inlined call: validate_settled_read_requests;
                                                        let read_requests = self.read_requests;
                                                        let settled_read_hints = self.hints.settled_read_hints;
                                                        let tree_root = self.tree_root;
                                                        let merkle_hasher = self.merkle_hasher;
                                                        {
                                                            {
                                                                let $i0 = settled_read_hints;
                                                                for $i1 in 0 .. $i0.len() {
                                                                    let hint = $i0[$i1];
                                                                    {
                                                                        let read_request_index = hint.read_request_index;
                                                                        if (read_request_index != 64) {
                                                                            let read_request = read_requests.array[read_request_index];
                                                                            assert({
                                                                                // >>> inlined call: is_zero;
                                                                                let self = read_request.contract_address;
                                                                                {
                                                                                    (self.inner == 0)
                                                                                }
                                                                            }, "Settled read request must have zero contract address");
                                                                            let leaf_preimage = hint.leaf_preimage;
                                                                            {
                                                                                // >>> inlined call: assert_match_read_request;
                                                                                let __arg_0 = leaf_preimage;
                                                                                let __arg_1 = {
                                                                                    // >>> inlined call: innermost;
                                                                                    let self = read_request;
                                                                                    {
                                                                                        self.inner.inner
                                                                                    }
                                                                                };
                                                                                let self = __arg_0;
                                                                                let read_request = __arg_1;
                                                                                {
                                                                                    assert((self.value == read_request), "Value of the note hash leaf does not match read request");
                                                                                }
                                                                            };
                                                                            let leaf = {
                                                                                // >>> inlined call: as_leaf;
                                                                                let self = leaf_preimage;
                                                                                {
                                                                                    self.value
                                                                                }
                                                                            };
                                                                            let witness = hint.membership_witness;
                                                                            assert({
                                                                                // >>> inlined call: check_membership_with_hasher;
                                                                                let __arg_0 = leaf;
                                                                                let __arg_1 = witness;
                                                                                let __arg_2 = tree_root;
                                                                                let __arg_3 = merkle_hasher;
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
                                                                                                        for i in 0 .. 42 {
                                                                                                            if (!ok) {
                                                                                                                if (bits[((42 - 1) - i)] != p[((42 - 1) - i)]) {
                                                                                                                    assert(p[((42 - 1) - i)]);
                                                                                                                    ok = true
                                                                                                                }
                                                                                                            }
                                                                                                        };
                                                                                                        assert(ok);
                                                                                                    };
                                                                                                    bits
                                                                                                }
                                                                                            };
                                                                                            for i in 0 .. 42 {
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
                                                                            }, "Membership check failed: leaf for read request not found in tree");
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                } else {
                                                    {
                                                        let $i0 = self.hints.settled_read_hints;
                                                        for $i1 in 0 .. $i0.len() {
                                                            let hint = $i0[$i1];
                                                            {
                                                                assert((hint.read_request_index == 64), "Unused settled read hint must not point to a read request");
                                                            }
                                                        }
                                                    }
                                                };
                                                {
                                                    // >>> inlined call: validate_propagated_read_requests;
                                                    let read_requests = self.read_requests;
                                                    let propagated_read_requests = self.propagated_read_requests;
                                                    let hints = self.hints;
                                                    {
                                                        let mut num_propagated = 0;
                                                        let mut within_length = true;
                                                        for i in 0 .. 64 {
                                                            within_length = (within_length & (i != read_requests.length));
                                                            let read_request = read_requests.array[i];
                                                            let status = hints.read_request_actions[i];
                                                            if (status.action == ReadRequestActions.READ_AS_PENDING) {
                                                                assert((hints.pending_read_hints[status.hint_index].read_request_index == i), "Hinted pending read request does not match status");
                                                            } else {
                                                                if (status.action == ReadRequestActions.READ_AS_SETTLED) {
                                                                    assert((hints.settled_read_hints[status.hint_index].read_request_index == i), "Hinted settled read request does not match status");
                                                                } else {
                                                                    assert({
                                                                        // >>> inlined call: eq;
                                                                        let self = propagated_read_requests.array[num_propagated];
                                                                        let other = read_request;
                                                                        {
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let __arg_0 = self.inner;
                                                                                        let __arg_1 = other.inner;
                                                                                        let self = __arg_0;
                                                                                        let other = __arg_1;
                                                                                        {
                                                                                            (self == other)
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    }, "Mismatch propagated read request");
                                                                    if within_length {
                                                                        num_propagated = (num_propagated + 1)
                                                                    }
                                                                }
                                                            }
                                                        };
                                                        assert((propagated_read_requests.length == num_propagated), "Incorrect propagated read requests length");
                                                    }
                                                };
                                            }
                                        };
                                        {
                                            // >>> inlined call: validate;
                                            let __arg_0 = {
                                                let read_requests = validation_requests.nullifier_read_requests;
                                                let pending_values = self.previous_kernel.end.nullifiers;
                                                let tree_root = tree_snapshots.nullifier_tree.root;
                                                let propagated_read_requests = output.nullifier_read_requests;
                                                let hints = self.reset_hints.nullifier_read_request_hints;
                                                let merkle_hasher = (nullifier_merkle_hash, nullifier_merkle_hash);
                                                (read_requests, pending_values, tree_root, propagated_read_requests, hints, merkle_hasher)
                                            };
                                            let self = __arg_0;
                                            {
                                                if (64 != 0) {
                                                    static_assert((64 == 64), "PendingReadAmount should match the length of the hints array", r#"{"kind":"string","length":60}"#, false);
                                                    {
                                                        // >>> inlined call: validate_pending_read_requests;
                                                        let read_requests = self.read_requests;
                                                        let pending_values = self.pending_values;
                                                        let pending_read_hints = self.hints.pending_read_hints;
                                                        {
                                                            {
                                                                let $i0 = pending_read_hints;
                                                                for $i1 in 0 .. $i0.len() {
                                                                    let hint = $i0[$i1];
                                                                    {
                                                                        let read_request_index = hint.read_request_index;
                                                                        let pending_value_index = hint.pending_value_index;
                                                                        if (read_request_index != 64) {
                                                                            assert((pending_value_index < pending_values.length), "Cannot read a pending value beyond claimed length");
                                                                            let read_request = read_requests.array[read_request_index];
                                                                            let pending_value = pending_values.array[pending_value_index];
                                                                            {
                                                                                // >>> inlined call: assert_match_read_request;
                                                                                let __arg_0 = {
                                                                                    // >>> inlined call: innermost;
                                                                                    let self = pending_value;
                                                                                    {
                                                                                        self.inner.inner
                                                                                    }
                                                                                };
                                                                                let __arg_1 = {
                                                                                    // >>> inlined call: innermost;
                                                                                    let self = read_request;
                                                                                    {
                                                                                        self.inner.inner
                                                                                    }
                                                                                };
                                                                                let self = __arg_0;
                                                                                let read_request = __arg_1;
                                                                                {
                                                                                    assert((self.value == read_request), "Value of the nullifier does not match read request");
                                                                                }
                                                                            };
                                                                            assert({
                                                                                // >>> inlined call: eq;
                                                                                let _self = pending_value.contract_address;
                                                                                let _other = read_request.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            }, "Contract address of the pending value does not match read request");
                                                                            assert(({
                                                                                // >>> inlined call: counter;
                                                                                let self = pending_value;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } < {
                                                                                // >>> inlined call: counter;
                                                                                let self = read_request;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            }), "Pending value must be emitted before the read request");
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                } else {
                                                    {
                                                        let $i0 = self.hints.pending_read_hints;
                                                        for $i1 in 0 .. $i0.len() {
                                                            let hint = $i0[$i1];
                                                            {
                                                                assert((hint.read_request_index == 64), "Unused pending read hint must not point to a read request");
                                                            }
                                                        }
                                                    }
                                                };
                                                if (64 != 0) {
                                                    static_assert((64 == self.hints.settled_read_hints.len()), "SettledReadAmount should match the length of the hints array", r#"{"kind":"string","length":60}"#, false);
                                                    {
                                                        // >>> inlined call: validate_settled_read_requests;
                                                        let read_requests = self.read_requests;
                                                        let settled_read_hints = self.hints.settled_read_hints;
                                                        let tree_root = self.tree_root;
                                                        let merkle_hasher = self.merkle_hasher;
                                                        {
                                                            {
                                                                let $i0 = settled_read_hints;
                                                                for $i1 in 0 .. $i0.len() {
                                                                    let hint = $i0[$i1];
                                                                    {
                                                                        let read_request_index = hint.read_request_index;
                                                                        if (read_request_index != 64) {
                                                                            let read_request = read_requests.array[read_request_index];
                                                                            assert({
                                                                                // >>> inlined call: is_zero;
                                                                                let self = read_request.contract_address;
                                                                                {
                                                                                    (self.inner == 0)
                                                                                }
                                                                            }, "Settled read request must have zero contract address");
                                                                            let leaf_preimage = hint.leaf_preimage;
                                                                            {
                                                                                // >>> inlined call: assert_match_read_request;
                                                                                let __arg_0 = leaf_preimage;
                                                                                let __arg_1 = {
                                                                                    // >>> inlined call: innermost;
                                                                                    let self = read_request;
                                                                                    {
                                                                                        self.inner.inner
                                                                                    }
                                                                                };
                                                                                let self = __arg_0;
                                                                                let read_request = __arg_1;
                                                                                {
                                                                                    assert((self.nullifier == read_request), "Value of the nullifier leaf does not match read request");
                                                                                }
                                                                            };
                                                                            let leaf = {
                                                                                // >>> inlined call: as_leaf;
                                                                                let self = leaf_preimage;
                                                                                {
                                                                                    {
                                                                                        // >>> inlined call: hash;
                                                                                        let __arg_0 = self;
                                                                                        let self = __arg_0;
                                                                                        {
                                                                                            if {
                                                                                                // >>> inlined call: is_empty;
                                                                                                let __arg_0 = self;
                                                                                                let self = __arg_0;
                                                                                                {
                                                                                                    (((self.nullifier == 0) & (self.next_nullifier == 0)) & (self.next_index == 0))
                                                                                                }
                                                                                            } {
                                                                                                0
                                                                                            } else {
                                                                                                {
                                                                                                    // >>> inlined call: poseidon2_hash;
                                                                                                    let inputs = serialize(self);
                                                                                                    {
                                                                                                        hash(inputs, 3)
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            };
                                                                            let witness = hint.membership_witness;
                                                                            assert({
                                                                                // >>> inlined call: check_membership_with_hasher;
                                                                                let __arg_0 = leaf;
                                                                                let __arg_1 = witness;
                                                                                let __arg_2 = tree_root;
                                                                                let __arg_3 = merkle_hasher;
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
                                                                                                        for i in 0 .. 42 {
                                                                                                            if (!ok) {
                                                                                                                if (bits[((42 - 1) - i)] != p[((42 - 1) - i)]) {
                                                                                                                    assert(p[((42 - 1) - i)]);
                                                                                                                    ok = true
                                                                                                                }
                                                                                                            }
                                                                                                        };
                                                                                                        assert(ok);
                                                                                                    };
                                                                                                    bits
                                                                                                }
                                                                                            };
                                                                                            for i in 0 .. 42 {
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
                                                                            }, "Membership check failed: leaf for read request not found in tree");
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                } else {
                                                    {
                                                        let $i0 = self.hints.settled_read_hints;
                                                        for $i1 in 0 .. $i0.len() {
                                                            let hint = $i0[$i1];
                                                            {
                                                                assert((hint.read_request_index == 64), "Unused settled read hint must not point to a read request");
                                                            }
                                                        }
                                                    }
                                                };
                                                {
                                                    // >>> inlined call: validate_propagated_read_requests;
                                                    let read_requests = self.read_requests;
                                                    let propagated_read_requests = self.propagated_read_requests;
                                                    let hints = self.hints;
                                                    {
                                                        let mut num_propagated = 0;
                                                        let mut within_length = true;
                                                        for i in 0 .. 64 {
                                                            within_length = (within_length & (i != read_requests.length));
                                                            let read_request = read_requests.array[i];
                                                            let status = hints.read_request_actions[i];
                                                            if (status.action == ReadRequestActions.READ_AS_PENDING) {
                                                                assert((hints.pending_read_hints[status.hint_index].read_request_index == i), "Hinted pending read request does not match status");
                                                            } else {
                                                                if (status.action == ReadRequestActions.READ_AS_SETTLED) {
                                                                    assert((hints.settled_read_hints[status.hint_index].read_request_index == i), "Hinted settled read request does not match status");
                                                                } else {
                                                                    assert({
                                                                        // >>> inlined call: eq;
                                                                        let self = propagated_read_requests.array[num_propagated];
                                                                        let other = read_request;
                                                                        {
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let __arg_0 = self.inner;
                                                                                        let __arg_1 = other.inner;
                                                                                        let self = __arg_0;
                                                                                        let other = __arg_1;
                                                                                        {
                                                                                            (self == other)
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    }, "Mismatch propagated read request");
                                                                    if within_length {
                                                                        num_propagated = (num_propagated + 1)
                                                                    }
                                                                }
                                                            }
                                                        };
                                                        assert((propagated_read_requests.length == num_propagated), "Incorrect propagated read requests length");
                                                    }
                                                };
                                            }
                                        };
                                        {
                                            // >>> inlined call: validate;
                                            let __arg_0 = {
                                                let key_validation_requests = validation_requests.scoped_key_validation_requests_and_separators;
                                                let propagated_key_validation_requests = output.scoped_key_validation_requests_and_separators;
                                                let hints = self.reset_hints.key_validation_hints;
                                                (key_validation_requests, propagated_key_validation_requests, hints)
                                            };
                                            let self = __arg_0;
                                            {
                                                if (64 == 0) {
                                                    assert({
                                                        // >>> inlined call: eq;
                                                        let _self = self.propagated_key_validation_requests;
                                                        let _other = self.key_validation_requests;
                                                        {
                                                            ({
                                                                // >>> inlined call: eq;
                                                                let self = _self.array;
                                                                let other = _other.array;
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
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ({
                                                                                                // >>> inlined call: eq;
                                                                                                let __arg_0 = _self.request;
                                                                                                let __arg_1 = _other.request;
                                                                                                let _self = __arg_0;
                                                                                                let _other = __arg_1;
                                                                                                {
                                                                                                    ((_self.pk_m_hash == _other.pk_m_hash) & (_self.sk_app == _other.sk_app))
                                                                                                }
                                                                                            } & (_self.key_type_domain_separator == _other.key_type_domain_separator))
                                                                                        }
                                                                                    } & {
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.contract_address;
                                                                                        let _other = other.contract_address;
                                                                                        {
                                                                                            (_self.inner == _other.inner)
                                                                                        }
                                                                                    })
                                                                                }
                                                                            };
                                                                            result = (result & op_rhs_0)
                                                                        }
                                                                    };
                                                                    result
                                                                }
                                                            } & (_self.length == _other.length))
                                                        }
                                                    }, "All unverified key validation requests must be propagated");
                                                } else {
                                                    assert((64 == 64), "hints array length does not match KeyValidationAmount");
                                                    let mut within_length = true;
                                                    for i in 0 .. 64 {
                                                        within_length = (within_length & (i != self.key_validation_requests.length));
                                                        let hint = self.hints[i];
                                                        let request = self.key_validation_requests.array[i];
                                                        if within_length {
                                                            {
                                                                // >>> inlined call: validate_key_validation_request;
                                                                let scoped_request = request;
                                                                let sk_m = hint.sk_m;
                                                                {
                                                                    let contract_address = scoped_request.contract_address;
                                                                    let request_and_separator = scoped_request.inner;
                                                                    let request = request_and_separator.request;
                                                                    let key_type_domain_separator = request_and_separator.key_type_domain_separator;
                                                                    let pk_m = {
                                                                        // >>> inlined call: fixed_base_scalar_mul;
                                                                        let scalar = sk_m;
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
                                                                    assert(({
                                                                        // >>> inlined call: is_infinite;
                                                                        let self = pk_m;
                                                                        {
                                                                            ((self.x == 0) & (self.y == 0))
                                                                        }
                                                                    } == false), "Derived master public key cannot be the point at infinity");
                                                                    assert(({
                                                                        // >>> inlined call: hash_public_key;
                                                                        let p = pk_m;
                                                                        {
                                                                            poseidon2_hash_with_separator([p.x, p.y], (DOM_SEP__SINGLE_PUBLIC_KEY_HASH as Field))
                                                                        }
                                                                    } == request.pk_m_hash), "Failed to derive matching master public key hash from the secret key");
                                                                    let sk_app = {
                                                                        // >>> inlined call: compute_app_siloed_secret_key;
                                                                        let __arg_0 = sk_m;
                                                                        let __arg_1 = contract_address;
                                                                        let __arg_2 = key_type_domain_separator;
                                                                        let master_secret_key = __arg_0;
                                                                        let app_address = __arg_1;
                                                                        let key_type_domain_separator = __arg_2;
                                                                        {
                                                                            poseidon2_hash_with_separator([master_secret_key.hi, master_secret_key.lo, {
                                                                                // >>> inlined call: to_field;
                                                                                let self = app_address;
                                                                                {
                                                                                    self.inner
                                                                                }
                                                                            }], key_type_domain_separator)
                                                                        }
                                                                    };
                                                                    assert((sk_app == request.sk_app), "Failed to derive matching app secret key from the secret key");
                                                                }
                                                            };
                                                        }
                                                    };
                                                    let num_unvalidated_items = if (self.key_validation_requests.length > 64) {
                                                        (self.key_validation_requests.length - 64)
                                                    } else {
                                                        0
                                                    };
                                                    assert((self.propagated_key_validation_requests.length == num_unvalidated_items), "Incorrect unverified key validation requests claimed length");
                                                    for i in 64 .. 64 {
                                                        let unvalidated_request = self.key_validation_requests.array[i];
                                                        let to_index = (i - 64);
                                                        let propagated_request = self.propagated_key_validation_requests.array[to_index];
                                                        assert({
                                                            // >>> inlined call: eq;
                                                            let self = propagated_request;
                                                            let other = unvalidated_request;
                                                            {
                                                                ({
                                                                    // >>> inlined call: eq;
                                                                    let _self = self.inner;
                                                                    let _other = other.inner;
                                                                    {
                                                                        ({
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.request;
                                                                            let __arg_1 = _other.request;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.pk_m_hash == _other.pk_m_hash) & (_self.sk_app == _other.sk_app))
                                                                            }
                                                                        } & (_self.key_type_domain_separator == _other.key_type_domain_separator))
                                                                    }
                                                                } & {
                                                                    // >>> inlined call: eq;
                                                                    let _self = self.contract_address;
                                                                    let _other = other.contract_address;
                                                                    {
                                                                        (_self.inner == _other.inner)
                                                                    }
                                                                })
                                                            }
                                                        }, "Mismatch propagated unverified key validation request");
                                                    }
                                                }
                                            }
                                        };
                                    }
                                };
                                {
                                    // >>> inlined call: validate_transient_data;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        let split_counter = if self.previous_kernel.is_private_only {
                                            0
                                        } else {
                                            self.previous_kernel.claimed_revertible_counter
                                        };
                                        if (64 == 0) {
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = self.squashed_output_array_hints.kept_note_hashes;
                                                let _other = self.previous_kernel.end.note_hashes;
                                                {
                                                    ({
                                                        // >>> inlined call: eq;
                                                        let self = _self.array;
                                                        let other = _other.array;
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
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let __arg_0 = self.inner;
                                                                                        let __arg_1 = other.inner;
                                                                                        let self = __arg_0;
                                                                                        let other = __arg_1;
                                                                                        {
                                                                                            (self == other)
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    };
                                                                    result = (result & op_rhs_0)
                                                                }
                                                            };
                                                            result
                                                        }
                                                    } & (_self.length == _other.length))
                                                }
                                            }, "mismatch kept note hashes");
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = self.squashed_output_array_hints.kept_nullifiers;
                                                let _other = self.previous_kernel.end.nullifiers;
                                                {
                                                    ({
                                                        // >>> inlined call: eq;
                                                        let self = _self.array;
                                                        let other = _other.array;
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
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ((_self.value == _other.value) & (_self.note_hash == _other.note_hash))
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    };
                                                                    result = (result & op_rhs_0)
                                                                }
                                                            };
                                                            result
                                                        }
                                                    } & (_self.length == _other.length))
                                                }
                                            }, "mismatch kept nullifiers");
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = self.squashed_output_array_hints.kept_private_logs;
                                                let _other = self.previous_kernel.end.private_logs;
                                                {
                                                    ({
                                                        // >>> inlined call: eq;
                                                        let self = _self.array;
                                                        let other = _other.array;
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
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ({
                                                                                                // >>> inlined call: eq;
                                                                                                let __arg_0 = _self.log;
                                                                                                let __arg_1 = _other.log;
                                                                                                let _self = __arg_0;
                                                                                                let _other = __arg_1;
                                                                                                {
                                                                                                    ({
                                                                                                        // >>> inlined call: eq;
                                                                                                        let self = _self.fields;
                                                                                                        let other = _other.fields;
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
                                                                                                    } & (_self.length == _other.length))
                                                                                                }
                                                                                            } & (_self.note_hash_counter == _other.note_hash_counter))
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    };
                                                                    result = (result & op_rhs_0)
                                                                }
                                                            };
                                                            result
                                                        }
                                                    } & (_self.length == _other.length))
                                                }
                                            }, "mismatch kept private logs");
                                        } else {
                                            {
                                                // >>> inlined call: validate;
                                                let __arg_0 = {
                                                    // >>> inlined call: new;
                                                    let __arg_0 = self.previous_kernel.end.note_hashes;
                                                    let __arg_1 = self.previous_kernel.end.nullifiers;
                                                    let __arg_2 = self.previous_kernel.end.private_logs;
                                                    let __arg_3 = self.squashed_output_array_hints.kept_note_hashes;
                                                    let __arg_4 = self.squashed_output_array_hints.kept_nullifiers;
                                                    let __arg_5 = self.squashed_output_array_hints.kept_private_logs;
                                                    let __arg_6 = split_counter;
                                                    let __arg_7 = self.reset_hints.transient_data_squashing_hints;
                                                    let note_hashes = __arg_0;
                                                    let nullifiers = __arg_1;
                                                    let logs = __arg_2;
                                                    let expected_kept_note_hashes = __arg_3;
                                                    let expected_kept_nullifiers = __arg_4;
                                                    let expected_kept_logs = __arg_5;
                                                    let split_counter = __arg_6;
                                                    let transient_data_squashing_hints = __arg_7;
                                                    {
                                                        let derived_hints = {
                                                            unsafe { build_derived_hints(note_hashes, nullifiers, logs, expected_kept_note_hashes, transient_data_squashing_hints) }
                                                        };
                                                        {
                                                            let note_hashes = note_hashes;
                                                            let nullifiers = nullifiers;
                                                            let logs = logs;
                                                            let expected_kept_note_hashes = expected_kept_note_hashes;
                                                            let expected_kept_nullifiers = expected_kept_nullifiers;
                                                            let expected_kept_logs = expected_kept_logs;
                                                            let split_counter = split_counter;
                                                            let transient_data_squashing_hints = transient_data_squashing_hints;
                                                            let derived_hints = derived_hints;
                                                            (note_hashes, nullifiers, logs, expected_kept_note_hashes, expected_kept_nullifiers, expected_kept_logs, split_counter, transient_data_squashing_hints, derived_hints)
                                                        }
                                                    }
                                                };
                                                let self = __arg_0;
                                                {
                                                    {
                                                        // >>> inlined call: validate_transient_data_squashing_hints;
                                                        let note_hashes = self.note_hashes;
                                                        let nullifiers = self.nullifiers;
                                                        let transient_data_squashing_hints = self.transient_data_squashing_hints;
                                                        let num_active_squashing_hints = self.derived_hints.num_active_squashing_hints;
                                                        let nullifier_index_sorted_tuples = self.derived_hints.nullifier_index_sorted_tuples;
                                                        {
                                                            let mut is_active_hint = true;
                                                            for i in 0 .. 64 {
                                                                let hint = transient_data_squashing_hints[i];
                                                                let nullifier_index_sorted_tuple = nullifier_index_sorted_tuples[i];
                                                                is_active_hint = (is_active_hint & (i != num_active_squashing_hints));
                                                                if is_active_hint {
                                                                    if (i != 0) {
                                                                        assert((hint.note_hash_index > transient_data_squashing_hints[(i - 1)].note_hash_index), "Note hash index hint is not in increasing order");
                                                                    };
                                                                    assert((nullifier_index_sorted_tuple.elem == transient_data_squashing_hints[nullifier_index_sorted_tuple.original_index].nullifier_index));
                                                                    if (i != 0) {
                                                                        assert((nullifier_index_sorted_tuple.elem > nullifier_index_sorted_tuples[(i - 1)].elem), "Nullifier index sorted tuples are not in increasing order");
                                                                    }
                                                                } else {
                                                                    assert((hint.note_hash_index == 64), "Unused note hash index hint must be set to NoteHashesLen");
                                                                    assert((hint.nullifier_index == 64), "Unused nullifier index hint must be set to NullifiersLen");
                                                                }
                                                            };
                                                            if (num_active_squashing_hints != 0) {
                                                                let last_active_squashing_hint_index = (num_active_squashing_hints - 1);
                                                                assert((nullifier_index_sorted_tuples[last_active_squashing_hint_index].elem < nullifiers.length), "Nullifier index hint exceeds claimed length");
                                                                assert((transient_data_squashing_hints[last_active_squashing_hint_index].note_hash_index < note_hashes.length), "Note hash index hint exceeds claimed length");
                                                            }
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: validate_note_hash_nullifier_squashing;
                                                        let note_hashes = self.note_hashes;
                                                        let nullifiers = self.nullifiers;
                                                        let expected_kept_note_hashes = self.expected_kept_note_hashes;
                                                        let expected_kept_nullifiers = self.expected_kept_nullifiers;
                                                        let split_counter = self.split_counter;
                                                        let transient_data_squashing_hints = self.transient_data_squashing_hints;
                                                        let num_active_squashing_hints = self.derived_hints.num_active_squashing_hints;
                                                        let note_hash_squash_flags = self.derived_hints.note_hash_squash_flags;
                                                        let nullifier_squash_flags = self.derived_hints.nullifier_squash_flags;
                                                        {
                                                            let mut is_active_hint = true;
                                                            for i in 0 .. 64 {
                                                                let hint = transient_data_squashing_hints[i];
                                                                is_active_hint = (is_active_hint & (i != num_active_squashing_hints));
                                                                if is_active_hint {
                                                                    let nullifier = nullifiers.array[hint.nullifier_index];
                                                                    let note_hash = note_hashes.array[hint.note_hash_index];
                                                                    {
                                                                        // >>> inlined call: validate_squashable_note_hash_nullifier_pair;
                                                                        let __arg_0 = note_hash;
                                                                        let __arg_1 = nullifier;
                                                                        let __arg_2 = split_counter;
                                                                        let note_hash = __arg_0;
                                                                        let nullifier = __arg_1;
                                                                        let split_counter = __arg_2;
                                                                        {
                                                                            assert(({
                                                                                // >>> inlined call: innermost;
                                                                                let self = note_hash;
                                                                                {
                                                                                    self.inner.inner
                                                                                }
                                                                            } != 0), "Cannot squash a zero-valued transient note hash");
                                                                            assert(({
                                                                                // >>> inlined call: innermost;
                                                                                let self = note_hash;
                                                                                {
                                                                                    self.inner.inner
                                                                                }
                                                                            } == {
                                                                                // >>> inlined call: innermost;
                                                                                let self = nullifier;
                                                                                {
                                                                                    self.inner.inner
                                                                                }
                                                                            }.note_hash), "Value of the hinted transient note hash does not match");
                                                                            assert({
                                                                                // >>> inlined call: eq;
                                                                                let _self = note_hash.contract_address;
                                                                                let _other = nullifier.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            }, "Contract address of the hinted transient note hash does not match");
                                                                            assert(({
                                                                                // >>> inlined call: counter;
                                                                                let self = nullifier;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } > {
                                                                                // >>> inlined call: counter;
                                                                                let self = note_hash;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            }), "Cannot nullify a note hash created afterwards");
                                                                            if ({
                                                                                // >>> inlined call: counter;
                                                                                let self = nullifier;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } > split_counter) {
                                                                                assert(({
                                                                                    // >>> inlined call: counter;
                                                                                    let self = note_hash;
                                                                                    {
                                                                                        self.inner.counter
                                                                                    }
                                                                                } > split_counter), "Cannot squash a non-revertible note hash with a revertible nullifier");
                                                                            }
                                                                        }
                                                                    };
                                                                    assert(note_hash_squash_flags[hint.note_hash_index], "Wrong squashed note hash hint");
                                                                    assert(nullifier_squash_flags[hint.nullifier_index], "Wrong squashed nullifier hint");
                                                                }
                                                            };
                                                            let num_squashed_pairs = num_active_squashing_hints;
                                                            let mut kept_note_hashes_counter = 0;
                                                            for i in 0 .. 64 {
                                                                if (!note_hash_squash_flags[i]) {
                                                                    assert({
                                                                        // >>> inlined call: eq;
                                                                        let self = expected_kept_note_hashes.array[kept_note_hashes_counter];
                                                                        let other = note_hashes.array[i];
                                                                        {
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let __arg_0 = self.inner;
                                                                                        let __arg_1 = other.inner;
                                                                                        let self = __arg_0;
                                                                                        let other = __arg_1;
                                                                                        {
                                                                                            (self == other)
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    }, "Propagated note hash does not match");
                                                                    kept_note_hashes_counter = (kept_note_hashes_counter + 1)
                                                                }
                                                            };
                                                            assert(((kept_note_hashes_counter + num_squashed_pairs) == 64), "Wrong number of note hashes removed");
                                                            assert((expected_kept_note_hashes.length == (note_hashes.length - num_squashed_pairs)), "Length of expected kept note hashes array is incorrect");
                                                            let mut kept_nullifiers_counter = 0;
                                                            for i in 0 .. 64 {
                                                                if (!nullifier_squash_flags[i]) {
                                                                    assert({
                                                                        // >>> inlined call: eq;
                                                                        let self = expected_kept_nullifiers.array[kept_nullifiers_counter];
                                                                        let other = nullifiers.array[i];
                                                                        {
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ((_self.value == _other.value) & (_self.note_hash == _other.note_hash))
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    }, "Propagated nullifier does not match");
                                                                    kept_nullifiers_counter = (kept_nullifiers_counter + 1)
                                                                }
                                                            };
                                                            assert(((kept_nullifiers_counter + num_squashed_pairs) == 64), "Wrong number of nullifiers removed");
                                                            assert((expected_kept_nullifiers.length == (nullifiers.length - num_squashed_pairs)), "Length of expected kept nullifiers array is incorrect");
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: validate_log_squashing;
                                                        let logs = self.logs;
                                                        let note_hashes = self.note_hashes;
                                                        let expected_kept_logs = self.expected_kept_logs;
                                                        let expected_kept_note_hashes = self.expected_kept_note_hashes;
                                                        let split_counter = self.split_counter;
                                                        let transient_data_squashing_hints = self.transient_data_squashing_hints;
                                                        let note_log_linked_source_indices = self.derived_hints.note_log_linked_source_indices;
                                                        {
                                                            let mut kept_logs_counter = 0;
                                                            let mut within_length = true;
                                                            for i in 0 .. 64 {
                                                                within_length = (within_length & (i != logs.length));
                                                                let log = logs.array[i];
                                                                let linked_source_indices = note_log_linked_source_indices[i];
                                                                let is_note_log = ({
                                                                    // >>> inlined call: innermost;
                                                                    let self = log;
                                                                    {
                                                                        self.inner.inner
                                                                    }
                                                                }.note_hash_counter != 0);
                                                                let squashed_note_hash_index = transient_data_squashing_hints[linked_source_indices.transient_data_squashing_hint_index].note_hash_index;
                                                                let expected_kept_note_hash = expected_kept_note_hashes.array[linked_source_indices.kept_note_hash_index];
                                                                let expected_kept_log = expected_kept_logs.array[kept_logs_counter];
                                                                let is_kept = (((!within_length) | (!is_note_log)) | {
                                                                    // >>> inlined call: is_log_linked_to_note_hash;
                                                                    let __arg_0 = log;
                                                                    let __arg_1 = expected_kept_note_hash;
                                                                    let log = __arg_0;
                                                                    let note_hash = __arg_1;
                                                                    {
                                                                        (({
                                                                            // >>> inlined call: innermost;
                                                                            let self = log;
                                                                            {
                                                                                self.inner.inner
                                                                            }
                                                                        }.note_hash_counter == {
                                                                            // >>> inlined call: counter;
                                                                            let self = note_hash;
                                                                            {
                                                                                self.inner.counter
                                                                            }
                                                                        }) & {
                                                                            // >>> inlined call: eq;
                                                                            let _self = log.contract_address;
                                                                            let _other = note_hash.contract_address;
                                                                            {
                                                                                (_self.inner == _other.inner)
                                                                            }
                                                                        })
                                                                    }
                                                                });
                                                                if is_kept {
                                                                    if is_note_log {
                                                                        assert((linked_source_indices.kept_note_hash_index < expected_kept_note_hashes.length), "Index of linked kept note hash exceeds claimed length");
                                                                    };
                                                                    assert({
                                                                        // >>> inlined call: eq;
                                                                        let self = log;
                                                                        let other = expected_kept_log;
                                                                        {
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ({
                                                                                                // >>> inlined call: eq;
                                                                                                let __arg_0 = _self.log;
                                                                                                let __arg_1 = _other.log;
                                                                                                let _self = __arg_0;
                                                                                                let _other = __arg_1;
                                                                                                {
                                                                                                    ({
                                                                                                        // >>> inlined call: eq;
                                                                                                        let self = _self.fields;
                                                                                                        let other = _other.fields;
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
                                                                                                    } & (_self.length == _other.length))
                                                                                                }
                                                                                            } & (_self.note_hash_counter == _other.note_hash_counter))
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    }, "Propagated private log does not match");
                                                                    kept_logs_counter = (kept_logs_counter + 1)
                                                                } else {
                                                                    let hinted_squashed_note_hash = note_hashes.array[squashed_note_hash_index];
                                                                    assert({
                                                                        // >>> inlined call: is_log_linked_to_note_hash;
                                                                        let __arg_0 = log;
                                                                        let __arg_1 = hinted_squashed_note_hash;
                                                                        let log = __arg_0;
                                                                        let note_hash = __arg_1;
                                                                        {
                                                                            (({
                                                                                // >>> inlined call: innermost;
                                                                                let self = log;
                                                                                {
                                                                                    self.inner.inner
                                                                                }
                                                                            }.note_hash_counter == {
                                                                                // >>> inlined call: counter;
                                                                                let self = note_hash;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            }) & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = log.contract_address;
                                                                                let _other = note_hash.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    }, "Log does not link to the hinted squashed note hash");
                                                                    let is_note_hash_revertible = ({
                                                                        // >>> inlined call: counter;
                                                                        let self = hinted_squashed_note_hash;
                                                                        {
                                                                            self.inner.counter
                                                                        }
                                                                    } > split_counter);
                                                                    let is_log_revertible = ({
                                                                        // >>> inlined call: counter;
                                                                        let self = log;
                                                                        {
                                                                            self.inner.counter
                                                                        }
                                                                    } > split_counter);
                                                                    assert((is_note_hash_revertible == is_log_revertible), "Cannot squash a note hash and log across the revertible/non-revertible boundary");
                                                                }
                                                            };
                                                            let num_squashed_logs = (64 - kept_logs_counter);
                                                            assert((expected_kept_logs.length == (logs.length - num_squashed_logs)), "Length of expected kept logs array is incorrect");
                                                        }
                                                    };
                                                }
                                            };
                                        }
                                    }
                                };
                                if (64 == 0) {
                                    {
                                        // >>> inlined call: validate_note_logs_linked_to_note_hashes;
                                        let logs = self.previous_kernel.end.private_logs;
                                        let note_hashes = self.previous_kernel.end.note_hashes;
                                        {
                                            for i in 0 .. 64 {
                                                let log = logs.array[i];
                                                if ({
                                                    // >>> inlined call: innermost;
                                                    let self = log;
                                                    {
                                                        self.inner.inner
                                                    }
                                                }.note_hash_counter != 0) {
                                                    let note_hash_index_hint = {
                                                        let index = unsafe { find_first_index(note_hashes.array, {
                                                            let closure_variable = {
                                                                let env = (log);
                                                                ((env, lambda), (env, lambda))
                                                            };
                                                            closure_variable
                                                        }) };
                                                        if (index == note_hashes.array.len()) {
                                                            0
                                                        } else {
                                                            index
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: validate_note_log_linked_to_note_hash_with_hint;
                                                        let __arg_0 = log;
                                                        let __arg_1 = note_hashes;
                                                        let __arg_2 = note_hash_index_hint;
                                                        let log = __arg_0;
                                                        let note_hashes = __arg_1;
                                                        let note_hash_index_hint = __arg_2;
                                                        {
                                                            assert((note_hash_index_hint < note_hashes.length), "Note hash index hint exceeds claimed length");
                                                            let note_hash = note_hashes.array[note_hash_index_hint];
                                                            assert(({
                                                                // >>> inlined call: innermost;
                                                                let self = log;
                                                                {
                                                                    self.inner.inner
                                                                }
                                                            }.note_hash_counter == {
                                                                // >>> inlined call: counter;
                                                                let self = note_hash;
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            }), "Can not find a note hash linked to note log");
                                                            assert({
                                                                // >>> inlined call: eq;
                                                                let _self = log.contract_address;
                                                                let _other = note_hash.contract_address;
                                                                {
                                                                    (_self.inner == _other.inner)
                                                                }
                                                            }, "Can not link a note log to a note hash in another contract");
                                                        }
                                                    };
                                                }
                                            }
                                        }
                                    };
                                };
                                {
                                    // >>> inlined call: validate_sorted_siloed_padded_data;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        if (64 == 0) {
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = self.output.end.note_hashes;
                                                let _other = self.squashed_output_array_hints.kept_note_hashes;
                                                {
                                                    ({
                                                        // >>> inlined call: eq;
                                                        let self = _self.array;
                                                        let other = _other.array;
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
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let __arg_0 = self.inner;
                                                                                        let __arg_1 = other.inner;
                                                                                        let self = __arg_0;
                                                                                        let other = __arg_1;
                                                                                        {
                                                                                            (self == other)
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    };
                                                                    result = (result & op_rhs_0)
                                                                }
                                                            };
                                                            result
                                                        }
                                                    } & (_self.length == _other.length))
                                                }
                                            }, "output note hashes mismatch");
                                        } else {
                                            {
                                                // >>> inlined call: validate_sorted_siloed_unique_padded_note_hashes;
                                                let __arg_0 = self;
                                                let self = __arg_0;
                                                {
                                                    let first_note_hash = self.previous_kernel.end.note_hashes.array[0];
                                                    assert(((self.previous_kernel.end.note_hashes.length == 0) | (!{
                                                        // >>> inlined call: is_zero;
                                                        let self = first_note_hash.contract_address;
                                                        {
                                                            (self.inner == 0)
                                                        }
                                                    })), "Note hashes have been siloed in a previous reset");
                                                    let note_hash_padding = self.padded_side_effects.note_hashes;
                                                    let siloed_note_hash_padding = {
                                                        // >>> inlined call: map;
                                                        let self = (&note_hash_padding);
                                                        let f = lambda;
                                                        {
                                                            let uninitialized = ((0, 0), (0));
                                                            let mut ret = [uninitialized; 64];
                                                            for i in 0 .. (*self).len() {
                                                                ret[i] = f.0((*self)[i])
                                                            };
                                                            ret
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: assert_sorted_padded_transformed_i_array_capped_size;
                                                        let original_array = self.squashed_output_array_hints.kept_note_hashes;
                                                        let padded_items = siloed_note_hash_padding;
                                                        let output_array = self.output.end.note_hashes;
                                                        let assert_transformed_i = {
                                                            let closure_variable = {
                                                                let env = (self);
                                                                ((env, lambda), (env, lambda))
                                                            };
                                                            closure_variable
                                                        };
                                                        {
                                                            {
                                                                let _ = {
                                                                    let sorted_indexes = unsafe { get_sorted_indexes(original_array.array) };
                                                                    let num_padded_items = unsafe { get_num_padded_items(padded_items, original_array.length, 64) };
                                                                    (sorted_indexes, num_padded_items)
                                                                };
                                                                let sorted_index_hints = _.0;
                                                                let num_padded_items_hint = _.1
                                                            };
                                                            {
                                                                // >>> inlined call: assert_sorted_padded_transformed_i_array_capped_size_with_hints;
                                                                let __arg_0 = original_array;
                                                                let __arg_1 = padded_items;
                                                                let __arg_2 = output_array;
                                                                let __arg_3 = assert_transformed_i;
                                                                let __arg_4 = sorted_index_hints;
                                                                let __arg_5 = num_padded_items_hint;
                                                                let original_array = __arg_0;
                                                                let padded_items = __arg_1;
                                                                let output_array = __arg_2;
                                                                let assert_transformed_i = __arg_3;
                                                                let sorted_index_hints = __arg_4;
                                                                let num_padded_items_hint = __arg_5;
                                                                {
                                                                    let original_array_length = original_array.length;
                                                                    let result_array_length = (original_array_length + num_padded_items_hint);
                                                                    assert((result_array_length <= 64), "CappedSize not large enough to cover all items in result_array");
                                                                    let mut should_be_padding = false;
                                                                    let mut should_be_empty = false;
                                                                    for i in 0 .. 64 {
                                                                        let output_item_i = output_array.array[i];
                                                                        if (i >= 64) {
                                                                            assert(({
                                                                                // >>> inlined call: counter;
                                                                                let self = output_item_i;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } == 0), "Trailing items must have counter 0");
                                                                        } else {
                                                                            should_be_padding = (should_be_padding | (i == original_array_length));
                                                                            should_be_empty = (should_be_empty | (i == result_array_length));
                                                                            let original = original_array.array[i];
                                                                            let sorted_index = sorted_index_hints[i];
                                                                            let padded_item = padded_items[i];
                                                                            {
                                                                                let _ = if should_be_padding {
                                                                                    (padded_item, i)
                                                                                } else {
                                                                                    (original, sorted_index)
                                                                                };
                                                                                let from = _.0;
                                                                                let to_index = _.1
                                                                            };
                                                                            let to = output_array.array[to_index];
                                                                            {
                                                                                let tmp = assert_transformed_i.0;
                                                                                tmp.1(tmp.0, from, to, to_index)
                                                                            };
                                                                            assert(({
                                                                                // >>> inlined call: counter;
                                                                                let self = from;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } == {
                                                                                // >>> inlined call: counter;
                                                                                let self = to;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            }), "mapped item has mismatch counter");
                                                                            if (!should_be_padding) {
                                                                                if (i != 0) {
                                                                                    assert(({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = output_item_i;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } > {
                                                                                        // >>> inlined call: counter;
                                                                                        let self = output_array.array[(i - 1)];
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    }), "value array must be sorted by counter in ascending order");
                                                                                }
                                                                            };
                                                                            assert((({
                                                                                // >>> inlined call: counter;
                                                                                let self = to;
                                                                                {
                                                                                    self.inner.counter
                                                                                }
                                                                            } == 0) == should_be_empty), "Incorrect hinted number of padded items");
                                                                        }
                                                                    };
                                                                    assert((output_array.length == result_array_length));
                                                                }
                                                            }
                                                        }
                                                    };
                                                }
                                            };
                                        };
                                        if (64 == 0) {
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = self.output.end.nullifiers;
                                                let _other = self.squashed_output_array_hints.kept_nullifiers;
                                                {
                                                    ({
                                                        // >>> inlined call: eq;
                                                        let self = _self.array;
                                                        let other = _other.array;
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
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ((_self.value == _other.value) & (_self.note_hash == _other.note_hash))
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    };
                                                                    result = (result & op_rhs_0)
                                                                }
                                                            };
                                                            result
                                                        }
                                                    } & (_self.length == _other.length))
                                                }
                                            }, "output nullifiers mismatch");
                                        } else {
                                            {
                                                // >>> inlined call: validate_sorted_siloed_padded_nullifiers;
                                                let __arg_0 = self;
                                                let self = __arg_0;
                                                {
                                                    let first_nullifier = self.previous_kernel.end.nullifiers.array[0];
                                                    assert(((self.previous_kernel.end.nullifiers.length == 0) | (!{
                                                        // >>> inlined call: is_zero;
                                                        let self = first_nullifier.contract_address;
                                                        {
                                                            (self.inner == 0)
                                                        }
                                                    })), "Nullifiers have been siloed in a previous reset");
                                                    let nullifier_padding = self.padded_side_effects.nullifiers;
                                                    let siloed_nullifier_padding = {
                                                        // >>> inlined call: map;
                                                        let self = (&nullifier_padding);
                                                        let f = lambda;
                                                        {
                                                            let uninitialized = (((0, 0), 0), (0));
                                                            let mut ret = [uninitialized; 64];
                                                            for i in 0 .. (*self).len() {
                                                                ret[i] = f.0((*self)[i])
                                                            };
                                                            ret
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: assert_sorted_padded_transformed_array_capped_size;
                                                        let original_array = self.squashed_output_array_hints.kept_nullifiers;
                                                        let padded_items = siloed_nullifier_padding;
                                                        let output_array = self.output.end.nullifiers;
                                                        let assert_transformed = lambda;
                                                        {
                                                            {
                                                                // >>> inlined call: assert_sorted_padded_transformed_i_array_capped_size;
                                                                let __arg_0 = original_array;
                                                                let __arg_1 = padded_items;
                                                                let __arg_2 = output_array;
                                                                let __arg_3 = {
                                                                    let closure_variable = {
                                                                        let env = (assert_transformed);
                                                                        ((env, lambda), (env, lambda))
                                                                    };
                                                                    closure_variable
                                                                };
                                                                let original_array = __arg_0;
                                                                let padded_items = __arg_1;
                                                                let output_array = __arg_2;
                                                                let assert_transformed_i = __arg_3;
                                                                {
                                                                    {
                                                                        let _ = {
                                                                            let sorted_indexes = unsafe { get_sorted_indexes(original_array.array) };
                                                                            let num_padded_items = unsafe { get_num_padded_items(padded_items, original_array.length, 64) };
                                                                            (sorted_indexes, num_padded_items)
                                                                        };
                                                                        let sorted_index_hints = _.0;
                                                                        let num_padded_items_hint = _.1
                                                                    };
                                                                    {
                                                                        // >>> inlined call: assert_sorted_padded_transformed_i_array_capped_size_with_hints;
                                                                        let __arg_0 = original_array;
                                                                        let __arg_1 = padded_items;
                                                                        let __arg_2 = output_array;
                                                                        let __arg_3 = assert_transformed_i;
                                                                        let __arg_4 = sorted_index_hints;
                                                                        let __arg_5 = num_padded_items_hint;
                                                                        let original_array = __arg_0;
                                                                        let padded_items = __arg_1;
                                                                        let output_array = __arg_2;
                                                                        let assert_transformed_i = __arg_3;
                                                                        let sorted_index_hints = __arg_4;
                                                                        let num_padded_items_hint = __arg_5;
                                                                        {
                                                                            let original_array_length = original_array.length;
                                                                            let result_array_length = (original_array_length + num_padded_items_hint);
                                                                            assert((result_array_length <= 64), "CappedSize not large enough to cover all items in result_array");
                                                                            let mut should_be_padding = false;
                                                                            let mut should_be_empty = false;
                                                                            for i in 0 .. 64 {
                                                                                let output_item_i = output_array.array[i];
                                                                                if (i >= 64) {
                                                                                    assert(({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = output_item_i;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } == 0), "Trailing items must have counter 0");
                                                                                } else {
                                                                                    should_be_padding = (should_be_padding | (i == original_array_length));
                                                                                    should_be_empty = (should_be_empty | (i == result_array_length));
                                                                                    let original = original_array.array[i];
                                                                                    let sorted_index = sorted_index_hints[i];
                                                                                    let padded_item = padded_items[i];
                                                                                    {
                                                                                        let _ = if should_be_padding {
                                                                                            (padded_item, i)
                                                                                        } else {
                                                                                            (original, sorted_index)
                                                                                        };
                                                                                        let from = _.0;
                                                                                        let to_index = _.1
                                                                                    };
                                                                                    let to = output_array.array[to_index];
                                                                                    {
                                                                                        let tmp = assert_transformed_i.0;
                                                                                        tmp.1(tmp.0, from, to, to_index)
                                                                                    };
                                                                                    assert(({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = from;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } == {
                                                                                        // >>> inlined call: counter;
                                                                                        let self = to;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    }), "mapped item has mismatch counter");
                                                                                    if (!should_be_padding) {
                                                                                        if (i != 0) {
                                                                                            assert(({
                                                                                                // >>> inlined call: counter;
                                                                                                let self = output_item_i;
                                                                                                {
                                                                                                    self.inner.counter
                                                                                                }
                                                                                            } > {
                                                                                                // >>> inlined call: counter;
                                                                                                let self = output_array.array[(i - 1)];
                                                                                                {
                                                                                                    self.inner.counter
                                                                                                }
                                                                                            }), "value array must be sorted by counter in ascending order");
                                                                                        }
                                                                                    };
                                                                                    assert((({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = to;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } == 0) == should_be_empty), "Incorrect hinted number of padded items");
                                                                                }
                                                                            };
                                                                            assert((output_array.length == result_array_length));
                                                                        }
                                                                    }
                                                                }
                                                            };
                                                        }
                                                    };
                                                }
                                            };
                                        };
                                        if (64 == 0) {
                                            assert({
                                                // >>> inlined call: eq;
                                                let _self = self.output.end.private_logs;
                                                let _other = self.squashed_output_array_hints.kept_private_logs;
                                                {
                                                    ({
                                                        // >>> inlined call: eq;
                                                        let self = _self.array;
                                                        let other = _other.array;
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
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let __arg_0 = self.inner;
                                                                                let __arg_1 = other.inner;
                                                                                let self = __arg_0;
                                                                                let other = __arg_1;
                                                                                {
                                                                                    ({
                                                                                        // >>> inlined call: eq;
                                                                                        let _self = self.inner;
                                                                                        let _other = other.inner;
                                                                                        {
                                                                                            ({
                                                                                                // >>> inlined call: eq;
                                                                                                let __arg_0 = _self.log;
                                                                                                let __arg_1 = _other.log;
                                                                                                let _self = __arg_0;
                                                                                                let _other = __arg_1;
                                                                                                {
                                                                                                    ({
                                                                                                        // >>> inlined call: eq;
                                                                                                        let self = _self.fields;
                                                                                                        let other = _other.fields;
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
                                                                                                    } & (_self.length == _other.length))
                                                                                                }
                                                                                            } & (_self.note_hash_counter == _other.note_hash_counter))
                                                                                        }
                                                                                    } & (self.counter == other.counter))
                                                                                }
                                                                            } & {
                                                                                // >>> inlined call: eq;
                                                                                let _self = self.contract_address;
                                                                                let _other = other.contract_address;
                                                                                {
                                                                                    (_self.inner == _other.inner)
                                                                                }
                                                                            })
                                                                        }
                                                                    };
                                                                    result = (result & op_rhs_0)
                                                                }
                                                            };
                                                            result
                                                        }
                                                    } & (_self.length == _other.length))
                                                }
                                            }, "output private logs mismatch");
                                        } else {
                                            {
                                                // >>> inlined call: validate_sorted_siloed_padded_private_logs;
                                                let __arg_0 = self;
                                                let self = __arg_0;
                                                {
                                                    let first_private_log = self.previous_kernel.end.private_logs.array[0];
                                                    assert(((self.previous_kernel.end.private_logs.length == 0) | (!{
                                                        // >>> inlined call: is_zero;
                                                        let self = first_private_log.contract_address;
                                                        {
                                                            (self.inner == 0)
                                                        }
                                                    })), "Private logs have been siloed in a previous reset");
                                                    let log_padding = self.padded_side_effects.private_logs;
                                                    let siloed_log_padding = {
                                                        // >>> inlined call: map;
                                                        let self = (&log_padding);
                                                        let f = lambda;
                                                        {
                                                            let uninitialized = (((([0; 16], 0), 0), 0), (0));
                                                            let mut ret = [uninitialized; 64];
                                                            for i in 0 .. (*self).len() {
                                                                ret[i] = f.0((*self)[i])
                                                            };
                                                            ret
                                                        }
                                                    };
                                                    {
                                                        // >>> inlined call: assert_sorted_padded_transformed_array_capped_size;
                                                        let original_array = self.squashed_output_array_hints.kept_private_logs;
                                                        let padded_items = siloed_log_padding;
                                                        let output_array = self.output.end.private_logs;
                                                        let assert_transformed = lambda;
                                                        {
                                                            {
                                                                // >>> inlined call: assert_sorted_padded_transformed_i_array_capped_size;
                                                                let __arg_0 = original_array;
                                                                let __arg_1 = padded_items;
                                                                let __arg_2 = output_array;
                                                                let __arg_3 = {
                                                                    let closure_variable = {
                                                                        let env = (assert_transformed);
                                                                        ((env, lambda), (env, lambda))
                                                                    };
                                                                    closure_variable
                                                                };
                                                                let original_array = __arg_0;
                                                                let padded_items = __arg_1;
                                                                let output_array = __arg_2;
                                                                let assert_transformed_i = __arg_3;
                                                                {
                                                                    {
                                                                        let _ = {
                                                                            let sorted_indexes = unsafe { get_sorted_indexes(original_array.array) };
                                                                            let num_padded_items = unsafe { get_num_padded_items(padded_items, original_array.length, 64) };
                                                                            (sorted_indexes, num_padded_items)
                                                                        };
                                                                        let sorted_index_hints = _.0;
                                                                        let num_padded_items_hint = _.1
                                                                    };
                                                                    {
                                                                        // >>> inlined call: assert_sorted_padded_transformed_i_array_capped_size_with_hints;
                                                                        let __arg_0 = original_array;
                                                                        let __arg_1 = padded_items;
                                                                        let __arg_2 = output_array;
                                                                        let __arg_3 = assert_transformed_i;
                                                                        let __arg_4 = sorted_index_hints;
                                                                        let __arg_5 = num_padded_items_hint;
                                                                        let original_array = __arg_0;
                                                                        let padded_items = __arg_1;
                                                                        let output_array = __arg_2;
                                                                        let assert_transformed_i = __arg_3;
                                                                        let sorted_index_hints = __arg_4;
                                                                        let num_padded_items_hint = __arg_5;
                                                                        {
                                                                            let original_array_length = original_array.length;
                                                                            let result_array_length = (original_array_length + num_padded_items_hint);
                                                                            assert((result_array_length <= 64), "CappedSize not large enough to cover all items in result_array");
                                                                            let mut should_be_padding = false;
                                                                            let mut should_be_empty = false;
                                                                            for i in 0 .. 64 {
                                                                                let output_item_i = output_array.array[i];
                                                                                if (i >= 64) {
                                                                                    assert(({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = output_item_i;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } == 0), "Trailing items must have counter 0");
                                                                                } else {
                                                                                    should_be_padding = (should_be_padding | (i == original_array_length));
                                                                                    should_be_empty = (should_be_empty | (i == result_array_length));
                                                                                    let original = original_array.array[i];
                                                                                    let sorted_index = sorted_index_hints[i];
                                                                                    let padded_item = padded_items[i];
                                                                                    {
                                                                                        let _ = if should_be_padding {
                                                                                            (padded_item, i)
                                                                                        } else {
                                                                                            (original, sorted_index)
                                                                                        };
                                                                                        let from = _.0;
                                                                                        let to_index = _.1
                                                                                    };
                                                                                    let to = output_array.array[to_index];
                                                                                    {
                                                                                        let tmp = assert_transformed_i.0;
                                                                                        tmp.1(tmp.0, from, to, to_index)
                                                                                    };
                                                                                    assert(({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = from;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } == {
                                                                                        // >>> inlined call: counter;
                                                                                        let self = to;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    }), "mapped item has mismatch counter");
                                                                                    if (!should_be_padding) {
                                                                                        if (i != 0) {
                                                                                            assert(({
                                                                                                // >>> inlined call: counter;
                                                                                                let self = output_item_i;
                                                                                                {
                                                                                                    self.inner.counter
                                                                                                }
                                                                                            } > {
                                                                                                // >>> inlined call: counter;
                                                                                                let self = output_array.array[(i - 1)];
                                                                                                {
                                                                                                    self.inner.counter
                                                                                                }
                                                                                            }), "value array must be sorted by counter in ascending order");
                                                                                        }
                                                                                    };
                                                                                    assert((({
                                                                                        // >>> inlined call: counter;
                                                                                        let self = to;
                                                                                        {
                                                                                            self.inner.counter
                                                                                        }
                                                                                    } == 0) == should_be_empty), "Incorrect hinted number of padded items");
                                                                                }
                                                                            };
                                                                            assert((output_array.length == result_array_length));
                                                                        }
                                                                    }
                                                                }
                                                            };
                                                        }
                                                    };
                                                }
                                            };
                                        }
                                    }
                                };
                            }
                        };
                    };
                    output
                }
            };
            {
                // >>> inlined call: validate_previous_kernel_for_tail;
                let previous_kernel_public_inputs = reset_output;
                let is_for_public = true;
                {
                    let min_revertible_side_effect_counter = previous_kernel_public_inputs.min_revertible_side_effect_counter;
                    if is_for_public {
                        assert((min_revertible_side_effect_counter != 0), "min_revertible_side_effect_counter must not be 0 for tail_to_public");
                    } else {
                    };
                    assert((previous_kernel_public_inputs.claimed_revertible_counter == min_revertible_side_effect_counter), "claimed_revertible_counter does not match min_revertible_side_effect_counter");
                    let validation_requests = previous_kernel_public_inputs.validation_requests;
                    assert((validation_requests.note_hash_read_requests.length == 0), "Non empty note hash read requests");
                    assert((validation_requests.nullifier_read_requests.length == 0), "Non empty nullifier read requests");
                    assert((validation_requests.scoped_key_validation_requests_and_separators.length == 0), "Non empty key validation requests");
                    let fee_payer = previous_kernel_public_inputs.fee_payer;
                    assert((!{
                        // >>> inlined call: is_empty;
                        let self = fee_payer;
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
                    }), "Fee payer can't be empty");
                    let is_private_only = previous_kernel_public_inputs.is_private_only;
                    if is_for_public {
                        assert((!is_private_only), "Must not be private only to be processed in tail to public");
                    } else {
                        assert(is_private_only, "Must be private only to be processed in tail");
                    };
                    assert((previous_kernel_public_inputs.end.nullifiers.length != 0), "TX must create at least one nullifier");
                    let claimed_first_nullifier = previous_kernel_public_inputs.claimed_first_nullifier;
                    let first_nullifier = previous_kernel_public_inputs.end.nullifiers.array[0];
                    assert((claimed_first_nullifier == {
                        // >>> inlined call: innermost;
                        let self = first_nullifier;
                        {
                            self.inner.inner
                        }
                    }.value), "First nullifier claim was not satisfied");
                    if is_for_public {
                        assert((first_nullifier.inner.counter < min_revertible_side_effect_counter), "First nullifier must be non revertible");
                    };
                    let note_hashes = previous_kernel_public_inputs.end.note_hashes;
                    let nullifiers = previous_kernel_public_inputs.end.nullifiers;
                    let private_logs = previous_kernel_public_inputs.end.private_logs;
                    let contract_class_logs_hashes = previous_kernel_public_inputs.end.contract_class_logs_hashes;
                    let l2_to_l1_msgs = previous_kernel_public_inputs.end.l2_to_l1_msgs;
                    let private_call_stack = previous_kernel_public_inputs.end.private_call_stack;
                    let public_call_requests = previous_kernel_public_inputs.end.public_call_requests;
                    let public_teardown_call_request = previous_kernel_public_inputs.public_teardown_call_request;
                    {
                        // >>> inlined call: validate_accumulated_items;
                        let __arg_0 = previous_kernel_public_inputs;
                        let __arg_1 = is_for_public;
                        let previous_kernel_public_inputs = __arg_0;
                        let is_for_public = __arg_1;
                        {
                            let note_hashes = previous_kernel_public_inputs.end.note_hashes;
                            let nullifiers = previous_kernel_public_inputs.end.nullifiers;
                            let l2_to_l1_msgs = previous_kernel_public_inputs.end.l2_to_l1_msgs;
                            let private_logs = previous_kernel_public_inputs.end.private_logs;
                            let contract_class_logs_hashes = previous_kernel_public_inputs.end.contract_class_logs_hashes;
                            let public_call_requests = previous_kernel_public_inputs.end.public_call_requests;
                            {
                                // >>> inlined call: assert_dense_trimmed_array;
                                let array = note_hashes;
                                let is_item_nullish = lambda;
                                {
                                    let mut should_be_nullish = false;
                                    for i in 0 .. 64 {
                                        should_be_nullish = (should_be_nullish | (i == array.length));
                                        let item = array.array[i];
                                        let is_nullish = is_item_nullish.0(item);
                                        assert((is_nullish == should_be_nullish), "array is not dense trimmed");
                                    }
                                }
                            };
                            {
                                // >>> inlined call: assert_dense_trimmed_array;
                                let array = nullifiers;
                                let is_item_nullish = lambda;
                                {
                                    let mut should_be_nullish = false;
                                    for i in 0 .. 64 {
                                        should_be_nullish = (should_be_nullish | (i == array.length));
                                        let item = array.array[i];
                                        let is_nullish = is_item_nullish.0(item);
                                        assert((is_nullish == should_be_nullish), "array is not dense trimmed");
                                    }
                                }
                            };
                            {
                                // >>> inlined call: assert_trimmed_array;
                                let array = l2_to_l1_msgs;
                                let is_item_nullish = lambda;
                                {
                                    let mut should_be_nullish = false;
                                    for i in 0 .. 8 {
                                        should_be_nullish = (should_be_nullish | (i == array.length));
                                        let item = array.array[i];
                                        let is_nullish = is_item_nullish.0(item);
                                        if should_be_nullish {
                                            assert(is_nullish, "array is not trimmed");
                                        }
                                    }
                                }
                            };
                            {
                                // >>> inlined call: assert_dense_array;
                                let array = private_logs;
                                let is_item_populated = lambda;
                                {
                                    let mut should_be_populated = true;
                                    for i in 0 .. 64 {
                                        should_be_populated = (should_be_populated & (i != array.length));
                                        let item = array.array[i];
                                        let is_populated = is_item_populated.0(item);
                                        if should_be_populated {
                                            assert(is_populated, "array is not dense");
                                        }
                                    }
                                }
                            };
                            {
                                // >>> inlined call: assert_trimmed_array;
                                let array = private_logs;
                                let is_item_nullish = lambda;
                                {
                                    let mut should_be_nullish = false;
                                    for i in 0 .. 64 {
                                        should_be_nullish = (should_be_nullish | (i == array.length));
                                        let item = array.array[i];
                                        let is_nullish = is_item_nullish.0(item);
                                        if should_be_nullish {
                                            assert(is_nullish, "array is not trimmed");
                                        }
                                    }
                                }
                            };
                            {
                                // >>> inlined call: assert_dense_array;
                                let array = contract_class_logs_hashes;
                                let is_item_populated = lambda;
                                {
                                    let mut should_be_populated = true;
                                    for i in 0 .. 1 {
                                        should_be_populated = (should_be_populated & (i != array.length));
                                        let item = array.array[i];
                                        let is_populated = is_item_populated.0(item);
                                        if should_be_populated {
                                            assert(is_populated, "array is not dense");
                                        }
                                    }
                                }
                            };
                            {
                                // >>> inlined call: assert_trimmed_array;
                                let array = contract_class_logs_hashes;
                                let is_item_nullish = lambda;
                                {
                                    let mut should_be_nullish = false;
                                    for i in 0 .. 1 {
                                        should_be_nullish = (should_be_nullish | (i == array.length));
                                        let item = array.array[i];
                                        let is_nullish = is_item_nullish.0(item);
                                        if should_be_nullish {
                                            assert(is_nullish, "array is not trimmed");
                                        }
                                    }
                                }
                            };
                            if is_for_public {
                                {
                                    // >>> inlined call: assert_trimmed_array;
                                    let array = public_call_requests;
                                    let is_item_nullish = lambda;
                                    {
                                        let mut should_be_nullish = false;
                                        for i in 0 .. 32 {
                                            should_be_nullish = (should_be_nullish | (i == array.length));
                                            let item = array.array[i];
                                            let is_nullish = is_item_nullish.0(item);
                                            if should_be_nullish {
                                                assert(is_nullish, "array is not trimmed");
                                            }
                                        }
                                    }
                                };
                            } else {
                                assert((public_call_requests.length == 0), "Public call stack must be empty when executing the tail circuit");
                            }
                        }
                    };
                    {
                        // >>> inlined call: validate_siloed_values;
                        let array = note_hashes;
                        let name = "note hashes";
                        {
                            let num_items = array.length;
                            if (num_items != 0) {
                                let item = array.array[(num_items - 1)];
                                assert({
                                    // >>> inlined call: eq;
                                    let _self = item.contract_address;
                                    let _other = {
                                        // >>> inlined call: zero;
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
                                }, f"{name} have not been siloed in a reset");
                            }
                        }
                    };
                    {
                        // >>> inlined call: validate_siloed_values;
                        let array = nullifiers;
                        let name = "nullifiers";
                        {
                            let num_items = array.length;
                            if (num_items != 0) {
                                let item = array.array[(num_items - 1)];
                                assert({
                                    // >>> inlined call: eq;
                                    let _self = item.contract_address;
                                    let _other = {
                                        // >>> inlined call: zero;
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
                                }, f"{name} have not been siloed in a reset");
                            }
                        }
                    };
                    {
                        // >>> inlined call: validate_siloed_values;
                        let array = private_logs;
                        let name = "private logs";
                        {
                            let num_items = array.length;
                            if (num_items != 0) {
                                let item = array.array[(num_items - 1)];
                                assert({
                                    // >>> inlined call: eq;
                                    let _self = item.contract_address;
                                    let _other = {
                                        // >>> inlined call: zero;
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
                                }, f"{name} have not been siloed in a reset");
                            }
                        }
                    };
                    {
                        // >>> inlined call: for_each;
                        let self = l2_to_l1_msgs;
                        let f = lambda;
                        {
                            let mut within_range = true;
                            for i in 0 .. 8 {
                                within_range = (within_range & (i != self.length));
                                if within_range {
                                    f.0(self.array[i]);
                                }
                            }
                        }
                    };
                    {
                        // >>> inlined call: validate_unsquashable_note_hash_nullifier_ordering;
                        let __arg_0 = previous_kernel_public_inputs;
                        let previous_kernel_public_inputs = __arg_0;
                        {
                            let note_hash_index_for_each_nullifier = {
                                unsafe { get_note_hash_index_for_each_nullifier(previous_kernel_public_inputs) }
                            };
                            let nullifiers = previous_kernel_public_inputs.end.nullifiers;
                            let note_hashes = previous_kernel_public_inputs.end.note_hashes;
                            for i in 0 .. nullifiers.array.len() {
                                let nullifier = nullifiers.array[i];
                                let nullified_note_hash = {
                                    // >>> inlined call: innermost;
                                    let self = nullifier;
                                    {
                                        self.inner.inner
                                    }
                                }.note_hash;
                                if (nullified_note_hash != 0) {
                                    let note_hash = note_hashes.array[note_hash_index_for_each_nullifier[i]];
                                    assert(({
                                        // >>> inlined call: innermost;
                                        let self = note_hash;
                                        {
                                            self.inner.inner
                                        }
                                    } == nullified_note_hash), "Hinted siloed note hash does not match nullified note hash");
                                    assert({
                                        // >>> inlined call: eq;
                                        let _self = note_hash.contract_address;
                                        let _other = nullifier.contract_address;
                                        {
                                            (_self.inner == _other.inner)
                                        }
                                    }, "Contract address of hinted note hash does not match nullifier");
                                    assert(({
                                        // >>> inlined call: counter;
                                        let self = note_hash;
                                        {
                                            self.inner.counter
                                        }
                                    } < {
                                        // >>> inlined call: counter;
                                        let self = nullifier;
                                        {
                                            self.inner.counter
                                        }
                                    }), "Cannot link a note hash emitted after a nullifier");
                                }
                            }
                        }
                    };
                    {
                        let $i0 = private_logs.array;
                        for $i1 in 0 .. $i0.len() {
                            let private_log = $i0[$i1];
                            {
                                assert(({
                                    // >>> inlined call: innermost;
                                    let self = private_log;
                                    {
                                        self.inner.inner
                                    }
                                }.log.length <= PRIVATE_LOG_SIZE_IN_FIELDS), "Private log length exceeds max");
                            }
                        }
                    };
                    {
                        let $i0 = contract_class_logs_hashes.array;
                        for $i1 in 0 .. $i0.len() {
                            let contract_class_log = $i0[$i1];
                            {
                                assert(({
                                    // >>> inlined call: innermost;
                                    let self = contract_class_log;
                                    {
                                        self.inner.inner
                                    }
                                }.length <= CONTRACT_CLASS_LOG_SIZE_IN_FIELDS), "Contract class log length exceeds max");
                            }
                        }
                    };
                    assert((private_call_stack.length == 0), "Private call stack must be empty when executing the tail circuit");
                    if is_for_public {
                        assert(((public_call_requests.length != 0) | (!{
                            // >>> inlined call: is_empty;
                            let self = public_teardown_call_request;
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
                        })), "Must have public calls when exporting public kernel data from the tail circuit");
                    } else {
                        {
                            // >>> inlined call: assert_empty;
                            let self = public_teardown_call_request;
                            let msg = "Public teardown call request must be empty when executing the tail circuit";
                            {
                                assert({
                                    // >>> inlined call: is_empty;
                                    let __arg_0 = self;
                                    let self = __arg_0;
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
                                }, msg);
                            }
                        };
                    }
                }
            };
            {
                // >>> inlined call: tail_to_public_finalize;
                let previous_kernel_public_inputs = reset_output;
                let padded_side_effect_amounts = self.padded_side_effect_amounts;
                let expiration_timestamp_upper_bound = self.expiration_timestamp_upper_bound;
                {
                    let output = {
                        unsafe { generate_tail_to_public_output(previous_kernel_public_inputs, padded_side_effect_amounts, expiration_timestamp_upper_bound) }
                    };
                    if {
                        // >>> inlined call: should_validate_output;
                        {
                            true
                        }
                    } {
                        {
                            // >>> inlined call: validate;
                            let self = {
                                // >>> inlined call: new;
                                let __arg_0 = output;
                                let __arg_1 = previous_kernel_public_inputs;
                                let __arg_2 = padded_side_effect_amounts;
                                let __arg_3 = expiration_timestamp_upper_bound;
                                let output = __arg_0;
                                let previous_kernel = __arg_1;
                                let padded_side_effect_amounts = __arg_2;
                                let expiration_timestamp_upper_bound = __arg_3;
                                {
                                    {
                                        let output = output;
                                        let previous_kernel = previous_kernel;
                                        let padded_side_effect_amounts = padded_side_effect_amounts;
                                        let expiration_timestamp_upper_bound = expiration_timestamp_upper_bound;
                                        (output, previous_kernel, padded_side_effect_amounts, expiration_timestamp_upper_bound)
                                    }
                                }
                            };
                            {
                                {
                                    // >>> inlined call: validate_propagated_values;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.constants;
                                            let _other = {
                                                // >>> inlined call: to_tx_constant_data;
                                                let __arg_0 = self.previous_kernel.constants;
                                                let self = __arg_0;
                                                {
                                                    {
                                                        let anchor_block_header = self.anchor_block_header;
                                                        let tx_context = self.tx_context;
                                                        let vk_tree_root = self.vk_tree_root;
                                                        let protocol_contracts_hash = {
                                                            // >>> inlined call: hash;
                                                            let __arg_0 = self.protocol_contracts;
                                                            let self = __arg_0;
                                                            {
                                                                poseidon2_hash_with_separator({
                                                                    // >>> inlined call: map;
                                                                    let __arg_0 = (&self.derived_addresses);
                                                                    let __arg_1 = lambda;
                                                                    let self = __arg_0;
                                                                    let f = __arg_1;
                                                                    {
                                                                        let uninitialized = 0;
                                                                        let mut ret = [uninitialized; 11];
                                                                        for i in 0 .. (*self).len() {
                                                                            ret[i] = f.0((*self)[i])
                                                                        };
                                                                        ret
                                                                    }
                                                                }, DOM_SEP__PROTOCOL_CONTRACTS)
                                                            }
                                                        };
                                                        (anchor_block_header, tx_context, vk_tree_root, protocol_contracts_hash)
                                                    }
                                                }
                                            };
                                            {
                                                ((({
                                                    // >>> inlined call: eq;
                                                    let __arg_0 = _self.anchor_block_header;
                                                    let __arg_1 = _other.anchor_block_header;
                                                    let _self = __arg_0;
                                                    let _other = __arg_1;
                                                    {
                                                        ((((({
                                                            // >>> inlined call: eq;
                                                            let __arg_0 = _self.last_archive;
                                                            let __arg_1 = _other.last_archive;
                                                            let _self = __arg_0;
                                                            let _other = __arg_1;
                                                            {
                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                            }
                                                        } & {
                                                            // >>> inlined call: eq;
                                                            let __arg_0 = _self.state;
                                                            let __arg_1 = _other.state;
                                                            let _self = __arg_0;
                                                            let _other = __arg_1;
                                                            {
                                                                ({
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.l1_to_l2_message_tree;
                                                                    let __arg_1 = _other.l1_to_l2_message_tree;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                    }
                                                                } & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.partial;
                                                                    let __arg_1 = _other.partial;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        (({
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.note_hash_tree;
                                                                            let __arg_1 = _other.note_hash_tree;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                            }
                                                                        } & {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.nullifier_tree;
                                                                            let __arg_1 = _other.nullifier_tree;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                            }
                                                                        }) & {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = _self.public_data_tree;
                                                                            let __arg_1 = _other.public_data_tree;
                                                                            let _self = __arg_0;
                                                                            let _other = __arg_1;
                                                                            {
                                                                                ((_self.root == _other.root) & (_self.next_available_leaf_index == _other.next_available_leaf_index))
                                                                            }
                                                                        })
                                                                    }
                                                                })
                                                            }
                                                        }) & (_self.sponge_blob_hash == _other.sponge_blob_hash)) & {
                                                            // >>> inlined call: eq;
                                                            let __arg_0 = _self.global_variables;
                                                            let __arg_1 = _other.global_variables;
                                                            let _self = __arg_0;
                                                            let _other = __arg_1;
                                                            {
                                                                ((((((((_self.chain_id == _other.chain_id) & (_self.version == _other.version)) & (_self.block_number == _other.block_number)) & (_self.slot_number == _other.slot_number)) & (_self.timestamp == _other.timestamp)) & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.coinbase;
                                                                    let __arg_1 = _other.coinbase;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        (_self.inner == _other.inner)
                                                                    }
                                                                }) & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.fee_recipient;
                                                                    let __arg_1 = _other.fee_recipient;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        (_self.inner == _other.inner)
                                                                    }
                                                                }) & {
                                                                    // >>> inlined call: eq;
                                                                    let __arg_0 = _self.gas_fees;
                                                                    let __arg_1 = _other.gas_fees;
                                                                    let _self = __arg_0;
                                                                    let _other = __arg_1;
                                                                    {
                                                                        ((_self.fee_per_da_gas == _other.fee_per_da_gas) & (_self.fee_per_l2_gas == _other.fee_per_l2_gas))
                                                                    }
                                                                })
                                                            }
                                                        }) & (_self.total_fees == _other.total_fees)) & (_self.total_mana_used == _other.total_mana_used))
                                                    }
                                                } & {
                                                    // >>> inlined call: eq;
                                                    let __arg_0 = _self.tx_context;
                                                    let __arg_1 = _other.tx_context;
                                                    let _self = __arg_0;
                                                    let _other = __arg_1;
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
                                                }) & (_self.vk_tree_root == _other.vk_tree_root)) & (_self.protocol_contracts_hash == _other.protocol_contracts_hash))
                                            }
                                        }, "mismatch constants");
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.fee_payer;
                                            let _other = self.previous_kernel.fee_payer;
                                            {
                                                (_self.inner == _other.inner)
                                            }
                                        }, "mismatch fee_payer");
                                        let max_timestamp = (self.previous_kernel.constants.anchor_block_header.global_variables.timestamp + MAX_TX_LIFETIME);
                                        let expiration_timestamp = {
                                            // >>> inlined call: min;
                                            let v1 = {
                                                // >>> inlined call: min;
                                                let v1 = self.previous_kernel.expiration_timestamp;
                                                let v2 = self.expiration_timestamp_upper_bound;
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
                                            let v2 = max_timestamp;
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
                                        assert((self.output.expiration_timestamp == expiration_timestamp), "incorrect expiration_timestamp");
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.public_teardown_call_request;
                                            let _other = self.previous_kernel.public_teardown_call_request;
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
                                        }, "mismatch public_teardown_call_request");
                                    }
                                };
                                {
                                    // >>> inlined call: validate_propagated_split_values;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        let split_counter = self.previous_kernel.min_revertible_side_effect_counter;
                                        let prev_data = self.previous_kernel.end;
                                        let output_non_revertible = self.output.non_revertible_accumulated_data;
                                        let output_revertible = self.output.revertible_accumulated_data;
                                        {
                                            // >>> inlined call: assert_split_transformed_arrays_from_sorted_padded_array;
                                            let __arg_0 = prev_data.note_hashes;
                                            let __arg_1 = output_non_revertible.note_hashes;
                                            let __arg_2 = output_revertible.note_hashes;
                                            let __arg_3 = split_counter;
                                            let __arg_4 = lambda;
                                            let __arg_5 = self.padded_side_effect_amounts.non_revertible_note_hashes;
                                            let sorted_padded_array = __arg_0;
                                            let transformed_array_lt = __arg_1;
                                            let transformed_array_gte = __arg_2;
                                            let split_counter = __arg_3;
                                            let assert_transformed = __arg_4;
                                            let num_padded_lt = __arg_5;
                                            {
                                                {
                                                    let _ = {
                                                        (unsafe { find_first_index(sorted_padded_array.array, {
                                                            let closure_variable = {
                                                                let env = (split_counter);
                                                                ((env, lambda), (env, lambda))
                                                            };
                                                            closure_variable
                                                        }) }, unsafe { find_first_index(sorted_padded_array.array, lambda) })
                                                    };
                                                    let first_after_split_index = _.0;
                                                    let first_padded_index = _.1
                                                };
                                                {
                                                    // >>> inlined call: assert_split_transformed_arrays_from_sorted_padded_array_with_hint;
                                                    let __arg_0 = sorted_padded_array;
                                                    let __arg_1 = transformed_array_lt;
                                                    let __arg_2 = transformed_array_gte;
                                                    let __arg_3 = split_counter;
                                                    let __arg_4 = assert_transformed;
                                                    let __arg_5 = num_padded_lt;
                                                    let __arg_6 = first_after_split_index;
                                                    let __arg_7 = first_padded_index;
                                                    let sorted_padded_array = __arg_0;
                                                    let transformed_array_lt = __arg_1;
                                                    let transformed_array_gte = __arg_2;
                                                    let split_counter = __arg_3;
                                                    let assert_transformed = __arg_4;
                                                    let num_padded_lt = __arg_5;
                                                    let first_after_split_index = __arg_6;
                                                    let first_padded_index = __arg_7;
                                                    {
                                                        assert((first_after_split_index <= sorted_padded_array.length), "first_after_split_index is beyond the claimed length");
                                                        if (first_after_split_index != 0) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[(first_after_split_index - 1)];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } < split_counter), "first_after_split_index is too large");
                                                        };
                                                        if (first_after_split_index != 64) {
                                                            let counter = {
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[first_after_split_index];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            };
                                                            assert(((counter == 0) | (counter >= split_counter)), "incorrect first_after_split_index");
                                                        };
                                                        if (first_padded_index != 0) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[(first_padded_index - 1)];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } != MAX_U32_VALUE), "first_padded_index is too large");
                                                        };
                                                        if (first_padded_index != 64) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[first_padded_index];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } == MAX_U32_VALUE), "incorrect first_padded_index");
                                                        };
                                                        let first_padded_gte_index = (first_padded_index + num_padded_lt);
                                                        assert((first_padded_gte_index <= 64), "num_padded_lt is too large");
                                                        let mut is_non_padded_lt = true;
                                                        let mut is_padded = false;
                                                        let mut is_padded_gte = false;
                                                        let num_non_padded_lt = first_after_split_index;
                                                        let num_non_padded_gte = (first_padded_index - first_after_split_index);
                                                        let num_lt = (num_non_padded_lt + num_padded_lt);
                                                        for i in 0 .. 64 {
                                                            is_non_padded_lt = (is_non_padded_lt & (i != first_after_split_index));
                                                            is_padded = (is_padded | (i == first_padded_index));
                                                            is_padded_gte = (is_padded_gte | (i == first_padded_gte_index));
                                                            let is_lt = (is_non_padded_lt | (is_padded & (!is_padded_gte)));
                                                            let original = sorted_padded_array.array[i];
                                                            let to_index = if is_non_padded_lt {
                                                                i
                                                            } else {
                                                                if is_padded_gte {
                                                                    (i - num_lt)
                                                                } else {
                                                                    if is_padded {
                                                                        (i - num_non_padded_gte)
                                                                    } else {
                                                                        (i - num_non_padded_lt)
                                                                    }
                                                                }
                                                            };
                                                            let transformed = if is_lt {
                                                                transformed_array_lt[to_index]
                                                            } else {
                                                                transformed_array_gte[to_index]
                                                            };
                                                            assert_transformed.0(original, transformed);
                                                            let empty_index = if is_non_padded_lt {
                                                                ((64 - i) - 1)
                                                            } else {
                                                                if is_padded_gte {
                                                                    i
                                                                } else {
                                                                    if is_padded {
                                                                        ((64 - to_index) - 1)
                                                                    } else {
                                                                        (i + num_padded_lt)
                                                                    }
                                                                }
                                                            };
                                                            let padded_empty = if is_lt {
                                                                transformed_array_gte[empty_index]
                                                            } else {
                                                                transformed_array_lt[empty_index]
                                                            };
                                                            assert({
                                                                // >>> inlined call: is_empty;
                                                                let self = padded_empty;
                                                                {
                                                                    {
                                                                        // >>> inlined call: eq;
                                                                        let __arg_0 = self;
                                                                        let __arg_1 = {
                                                                            // >>> inlined call: empty;
                                                                            {
                                                                                0
                                                                            }
                                                                        };
                                                                        let self = __arg_0;
                                                                        let other = __arg_1;
                                                                        {
                                                                            (self == other)
                                                                        }
                                                                    }
                                                                }
                                                            }, "array should be padded with empty items");
                                                        }
                                                    }
                                                };
                                            }
                                        };
                                        {
                                            // >>> inlined call: assert_split_transformed_arrays_from_sorted_padded_array;
                                            let __arg_0 = prev_data.nullifiers;
                                            let __arg_1 = output_non_revertible.nullifiers;
                                            let __arg_2 = output_revertible.nullifiers;
                                            let __arg_3 = split_counter;
                                            let __arg_4 = lambda;
                                            let __arg_5 = self.padded_side_effect_amounts.non_revertible_nullifiers;
                                            let sorted_padded_array = __arg_0;
                                            let transformed_array_lt = __arg_1;
                                            let transformed_array_gte = __arg_2;
                                            let split_counter = __arg_3;
                                            let assert_transformed = __arg_4;
                                            let num_padded_lt = __arg_5;
                                            {
                                                {
                                                    let _ = {
                                                        (unsafe { find_first_index(sorted_padded_array.array, {
                                                            let closure_variable = {
                                                                let env = (split_counter);
                                                                ((env, lambda), (env, lambda))
                                                            };
                                                            closure_variable
                                                        }) }, unsafe { find_first_index(sorted_padded_array.array, lambda) })
                                                    };
                                                    let first_after_split_index = _.0;
                                                    let first_padded_index = _.1
                                                };
                                                {
                                                    // >>> inlined call: assert_split_transformed_arrays_from_sorted_padded_array_with_hint;
                                                    let __arg_0 = sorted_padded_array;
                                                    let __arg_1 = transformed_array_lt;
                                                    let __arg_2 = transformed_array_gte;
                                                    let __arg_3 = split_counter;
                                                    let __arg_4 = assert_transformed;
                                                    let __arg_5 = num_padded_lt;
                                                    let __arg_6 = first_after_split_index;
                                                    let __arg_7 = first_padded_index;
                                                    let sorted_padded_array = __arg_0;
                                                    let transformed_array_lt = __arg_1;
                                                    let transformed_array_gte = __arg_2;
                                                    let split_counter = __arg_3;
                                                    let assert_transformed = __arg_4;
                                                    let num_padded_lt = __arg_5;
                                                    let first_after_split_index = __arg_6;
                                                    let first_padded_index = __arg_7;
                                                    {
                                                        assert((first_after_split_index <= sorted_padded_array.length), "first_after_split_index is beyond the claimed length");
                                                        if (first_after_split_index != 0) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[(first_after_split_index - 1)];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } < split_counter), "first_after_split_index is too large");
                                                        };
                                                        if (first_after_split_index != 64) {
                                                            let counter = {
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[first_after_split_index];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            };
                                                            assert(((counter == 0) | (counter >= split_counter)), "incorrect first_after_split_index");
                                                        };
                                                        if (first_padded_index != 0) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[(first_padded_index - 1)];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } != MAX_U32_VALUE), "first_padded_index is too large");
                                                        };
                                                        if (first_padded_index != 64) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[first_padded_index];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } == MAX_U32_VALUE), "incorrect first_padded_index");
                                                        };
                                                        let first_padded_gte_index = (first_padded_index + num_padded_lt);
                                                        assert((first_padded_gte_index <= 64), "num_padded_lt is too large");
                                                        let mut is_non_padded_lt = true;
                                                        let mut is_padded = false;
                                                        let mut is_padded_gte = false;
                                                        let num_non_padded_lt = first_after_split_index;
                                                        let num_non_padded_gte = (first_padded_index - first_after_split_index);
                                                        let num_lt = (num_non_padded_lt + num_padded_lt);
                                                        for i in 0 .. 64 {
                                                            is_non_padded_lt = (is_non_padded_lt & (i != first_after_split_index));
                                                            is_padded = (is_padded | (i == first_padded_index));
                                                            is_padded_gte = (is_padded_gte | (i == first_padded_gte_index));
                                                            let is_lt = (is_non_padded_lt | (is_padded & (!is_padded_gte)));
                                                            let original = sorted_padded_array.array[i];
                                                            let to_index = if is_non_padded_lt {
                                                                i
                                                            } else {
                                                                if is_padded_gte {
                                                                    (i - num_lt)
                                                                } else {
                                                                    if is_padded {
                                                                        (i - num_non_padded_gte)
                                                                    } else {
                                                                        (i - num_non_padded_lt)
                                                                    }
                                                                }
                                                            };
                                                            let transformed = if is_lt {
                                                                transformed_array_lt[to_index]
                                                            } else {
                                                                transformed_array_gte[to_index]
                                                            };
                                                            assert_transformed.0(original, transformed);
                                                            let empty_index = if is_non_padded_lt {
                                                                ((64 - i) - 1)
                                                            } else {
                                                                if is_padded_gte {
                                                                    i
                                                                } else {
                                                                    if is_padded {
                                                                        ((64 - to_index) - 1)
                                                                    } else {
                                                                        (i + num_padded_lt)
                                                                    }
                                                                }
                                                            };
                                                            let padded_empty = if is_lt {
                                                                transformed_array_gte[empty_index]
                                                            } else {
                                                                transformed_array_lt[empty_index]
                                                            };
                                                            assert({
                                                                // >>> inlined call: is_empty;
                                                                let self = padded_empty;
                                                                {
                                                                    {
                                                                        // >>> inlined call: eq;
                                                                        let __arg_0 = self;
                                                                        let __arg_1 = {
                                                                            // >>> inlined call: empty;
                                                                            {
                                                                                0
                                                                            }
                                                                        };
                                                                        let self = __arg_0;
                                                                        let other = __arg_1;
                                                                        {
                                                                            (self == other)
                                                                        }
                                                                    }
                                                                }
                                                            }, "array should be padded with empty items");
                                                        }
                                                    }
                                                };
                                            }
                                        };
                                        {
                                            // >>> inlined call: assert_split_transformed_arrays_from_sorted_padded_array;
                                            let __arg_0 = prev_data.private_logs;
                                            let __arg_1 = output_non_revertible.private_logs;
                                            let __arg_2 = output_revertible.private_logs;
                                            let __arg_3 = split_counter;
                                            let __arg_4 = lambda;
                                            let __arg_5 = self.padded_side_effect_amounts.non_revertible_private_logs;
                                            let sorted_padded_array = __arg_0;
                                            let transformed_array_lt = __arg_1;
                                            let transformed_array_gte = __arg_2;
                                            let split_counter = __arg_3;
                                            let assert_transformed = __arg_4;
                                            let num_padded_lt = __arg_5;
                                            {
                                                {
                                                    let _ = {
                                                        (unsafe { find_first_index(sorted_padded_array.array, {
                                                            let closure_variable = {
                                                                let env = (split_counter);
                                                                ((env, lambda), (env, lambda))
                                                            };
                                                            closure_variable
                                                        }) }, unsafe { find_first_index(sorted_padded_array.array, lambda) })
                                                    };
                                                    let first_after_split_index = _.0;
                                                    let first_padded_index = _.1
                                                };
                                                {
                                                    // >>> inlined call: assert_split_transformed_arrays_from_sorted_padded_array_with_hint;
                                                    let __arg_0 = sorted_padded_array;
                                                    let __arg_1 = transformed_array_lt;
                                                    let __arg_2 = transformed_array_gte;
                                                    let __arg_3 = split_counter;
                                                    let __arg_4 = assert_transformed;
                                                    let __arg_5 = num_padded_lt;
                                                    let __arg_6 = first_after_split_index;
                                                    let __arg_7 = first_padded_index;
                                                    let sorted_padded_array = __arg_0;
                                                    let transformed_array_lt = __arg_1;
                                                    let transformed_array_gte = __arg_2;
                                                    let split_counter = __arg_3;
                                                    let assert_transformed = __arg_4;
                                                    let num_padded_lt = __arg_5;
                                                    let first_after_split_index = __arg_6;
                                                    let first_padded_index = __arg_7;
                                                    {
                                                        assert((first_after_split_index <= sorted_padded_array.length), "first_after_split_index is beyond the claimed length");
                                                        if (first_after_split_index != 0) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[(first_after_split_index - 1)];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } < split_counter), "first_after_split_index is too large");
                                                        };
                                                        if (first_after_split_index != 64) {
                                                            let counter = {
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[first_after_split_index];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            };
                                                            assert(((counter == 0) | (counter >= split_counter)), "incorrect first_after_split_index");
                                                        };
                                                        if (first_padded_index != 0) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[(first_padded_index - 1)];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } != MAX_U32_VALUE), "first_padded_index is too large");
                                                        };
                                                        if (first_padded_index != 64) {
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = sorted_padded_array.array[first_padded_index];
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } == MAX_U32_VALUE), "incorrect first_padded_index");
                                                        };
                                                        let first_padded_gte_index = (first_padded_index + num_padded_lt);
                                                        assert((first_padded_gte_index <= 64), "num_padded_lt is too large");
                                                        let mut is_non_padded_lt = true;
                                                        let mut is_padded = false;
                                                        let mut is_padded_gte = false;
                                                        let num_non_padded_lt = first_after_split_index;
                                                        let num_non_padded_gte = (first_padded_index - first_after_split_index);
                                                        let num_lt = (num_non_padded_lt + num_padded_lt);
                                                        for i in 0 .. 64 {
                                                            is_non_padded_lt = (is_non_padded_lt & (i != first_after_split_index));
                                                            is_padded = (is_padded | (i == first_padded_index));
                                                            is_padded_gte = (is_padded_gte | (i == first_padded_gte_index));
                                                            let is_lt = (is_non_padded_lt | (is_padded & (!is_padded_gte)));
                                                            let original = sorted_padded_array.array[i];
                                                            let to_index = if is_non_padded_lt {
                                                                i
                                                            } else {
                                                                if is_padded_gte {
                                                                    (i - num_lt)
                                                                } else {
                                                                    if is_padded {
                                                                        (i - num_non_padded_gte)
                                                                    } else {
                                                                        (i - num_non_padded_lt)
                                                                    }
                                                                }
                                                            };
                                                            let transformed = if is_lt {
                                                                transformed_array_lt[to_index]
                                                            } else {
                                                                transformed_array_gte[to_index]
                                                            };
                                                            assert_transformed.0(original, transformed);
                                                            let empty_index = if is_non_padded_lt {
                                                                ((64 - i) - 1)
                                                            } else {
                                                                if is_padded_gte {
                                                                    i
                                                                } else {
                                                                    if is_padded {
                                                                        ((64 - to_index) - 1)
                                                                    } else {
                                                                        (i + num_padded_lt)
                                                                    }
                                                                }
                                                            };
                                                            let padded_empty = if is_lt {
                                                                transformed_array_gte[empty_index]
                                                            } else {
                                                                transformed_array_lt[empty_index]
                                                            };
                                                            assert({
                                                                // >>> inlined call: is_empty;
                                                                let self = padded_empty;
                                                                {
                                                                    {
                                                                        // >>> inlined call: eq;
                                                                        let _self = self;
                                                                        let _other = {
                                                                            // >>> inlined call: empty;
                                                                            {
                                                                                {
                                                                                    let fields = [0; 16];
                                                                                    let length = 0;
                                                                                    (fields, length)
                                                                                }
                                                                            }
                                                                        };
                                                                        {
                                                                            ({
                                                                                // >>> inlined call: eq;
                                                                                let self = _self.fields;
                                                                                let other = _other.fields;
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
                                                                            } & (_self.length == _other.length))
                                                                        }
                                                                    }
                                                                }
                                                            }, "array should be padded with empty items");
                                                        }
                                                    }
                                                };
                                            }
                                        };
                                    }
                                };
                                {
                                    // >>> inlined call: validate_propagated_sorted_values;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        let split_counter = self.previous_kernel.min_revertible_side_effect_counter;
                                        let prev_data = self.previous_kernel.end;
                                        let output_non_revertible = self.output.non_revertible_accumulated_data;
                                        let output_revertible = self.output.revertible_accumulated_data;
                                        {
                                            // >>> inlined call: assert_split_sorted_transformed_arrays;
                                            let __arg_0 = prev_data.l2_to_l1_msgs;
                                            let __arg_1 = output_non_revertible.l2_to_l1_msgs;
                                            let __arg_2 = output_revertible.l2_to_l1_msgs;
                                            let __arg_3 = split_counter;
                                            let __arg_4 = lambda;
                                            let original_array = __arg_0;
                                            let sorted_transformed_array_lt = __arg_1;
                                            let sorted_transformed_array_gte = __arg_2;
                                            let split_counter = __arg_3;
                                            let assert_transformed = __arg_4;
                                            {
                                                let hints = {
                                                    unsafe { get_split_order_hints(original_array.array, split_counter) }
                                                };
                                                {
                                                    // >>> inlined call: assert_split_sorted_transformed_arrays_with_hints;
                                                    let __arg_0 = original_array;
                                                    let __arg_1 = sorted_transformed_array_lt;
                                                    let __arg_2 = sorted_transformed_array_gte;
                                                    let __arg_3 = split_counter;
                                                    let __arg_4 = assert_transformed;
                                                    let __arg_5 = hints;
                                                    let original_array = __arg_0;
                                                    let sorted_transformed_array_lt = __arg_1;
                                                    let sorted_transformed_array_gte = __arg_2;
                                                    let split_counter = __arg_3;
                                                    let assert_transformed = __arg_4;
                                                    let hints = __arg_5;
                                                    {
                                                        let mut num_lt = 0;
                                                        let mut num_gte = 0;
                                                        let mut should_be_empty = false;
                                                        for i in 0 .. 8 {
                                                            should_be_empty = (should_be_empty | (i == original_array.length));
                                                            let original = original_array.array[i];
                                                            let sorted_index = if should_be_empty {
                                                                i
                                                            } else {
                                                                hints.sorted_indexes[i]
                                                            };
                                                            let is_lt = ({
                                                                // >>> inlined call: counter;
                                                                let self = original;
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } < split_counter);
                                                            {
                                                                let _ = if is_lt {
                                                                    (sorted_transformed_array_lt[sorted_index], hints.sorted_counters_lt[sorted_index])
                                                                } else {
                                                                    (sorted_transformed_array_gte[sorted_index], hints.sorted_counters_gte[sorted_index])
                                                                };
                                                                let sorted_value = _.0;
                                                                let sorted_counter = _.1
                                                            };
                                                            assert_transformed.0(original, sorted_value);
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = original;
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } == sorted_counter), "Mismatch counters");
                                                            if (!should_be_empty) {
                                                                if is_lt {
                                                                    num_lt = (num_lt + 1)
                                                                } else {
                                                                    num_gte = (num_gte + 1)
                                                                }
                                                            }
                                                        };
                                                        for i in 0 .. 8 {
                                                            if (i >= num_lt) {
                                                                assert({
                                                                    // >>> inlined call: is_empty;
                                                                    let self = sorted_transformed_array_lt[i];
                                                                    {
                                                                        {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self;
                                                                            let __arg_1 = {
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
                                                                            };
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                ({
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.inner;
                                                                                    let _other = other.inner;
                                                                                    {
                                                                                        ({
                                                                                            // >>> inlined call: eq;
                                                                                            let __arg_0 = _self.recipient;
                                                                                            let __arg_1 = _other.recipient;
                                                                                            let _self = __arg_0;
                                                                                            let _other = __arg_1;
                                                                                            {
                                                                                                (_self.inner == _other.inner)
                                                                                            }
                                                                                        } & (_self.content == _other.content))
                                                                                    }
                                                                                } & {
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.contract_address;
                                                                                    let _other = other.contract_address;
                                                                                    {
                                                                                        (_self.inner == _other.inner)
                                                                                    }
                                                                                })
                                                                            }
                                                                        }
                                                                    }
                                                                }, "Unexpected non-empty item in lt array");
                                                            } else {
                                                                if (i != 0) {
                                                                    let counter = hints.sorted_counters_lt[i];
                                                                    let prev_counter = hints.sorted_counters_lt[(i - 1)];
                                                                    assert((counter > prev_counter), "Transformed lt array must be sorted by counter");
                                                                }
                                                            };
                                                            if (i >= num_gte) {
                                                                assert({
                                                                    // >>> inlined call: is_empty;
                                                                    let self = sorted_transformed_array_gte[i];
                                                                    {
                                                                        {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self;
                                                                            let __arg_1 = {
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
                                                                            };
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                ({
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.inner;
                                                                                    let _other = other.inner;
                                                                                    {
                                                                                        ({
                                                                                            // >>> inlined call: eq;
                                                                                            let __arg_0 = _self.recipient;
                                                                                            let __arg_1 = _other.recipient;
                                                                                            let _self = __arg_0;
                                                                                            let _other = __arg_1;
                                                                                            {
                                                                                                (_self.inner == _other.inner)
                                                                                            }
                                                                                        } & (_self.content == _other.content))
                                                                                    }
                                                                                } & {
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.contract_address;
                                                                                    let _other = other.contract_address;
                                                                                    {
                                                                                        (_self.inner == _other.inner)
                                                                                    }
                                                                                })
                                                                            }
                                                                        }
                                                                    }
                                                                }, "Unexpected non-empty item in gte array");
                                                            } else {
                                                                if (i != 0) {
                                                                    let counter = hints.sorted_counters_gte[i];
                                                                    let prev_counter = hints.sorted_counters_gte[(i - 1)];
                                                                    assert((counter > prev_counter), "Transformed gte array must be sorted by counter");
                                                                }
                                                            }
                                                        }
                                                    }
                                                };
                                            }
                                        };
                                        {
                                            // >>> inlined call: assert_split_sorted_transformed_arrays;
                                            let __arg_0 = prev_data.contract_class_logs_hashes;
                                            let __arg_1 = output_non_revertible.contract_class_logs_hashes;
                                            let __arg_2 = output_revertible.contract_class_logs_hashes;
                                            let __arg_3 = split_counter;
                                            let __arg_4 = lambda;
                                            let original_array = __arg_0;
                                            let sorted_transformed_array_lt = __arg_1;
                                            let sorted_transformed_array_gte = __arg_2;
                                            let split_counter = __arg_3;
                                            let assert_transformed = __arg_4;
                                            {
                                                let hints = {
                                                    unsafe { get_split_order_hints(original_array.array, split_counter) }
                                                };
                                                {
                                                    // >>> inlined call: assert_split_sorted_transformed_arrays_with_hints;
                                                    let __arg_0 = original_array;
                                                    let __arg_1 = sorted_transformed_array_lt;
                                                    let __arg_2 = sorted_transformed_array_gte;
                                                    let __arg_3 = split_counter;
                                                    let __arg_4 = assert_transformed;
                                                    let __arg_5 = hints;
                                                    let original_array = __arg_0;
                                                    let sorted_transformed_array_lt = __arg_1;
                                                    let sorted_transformed_array_gte = __arg_2;
                                                    let split_counter = __arg_3;
                                                    let assert_transformed = __arg_4;
                                                    let hints = __arg_5;
                                                    {
                                                        let mut num_lt = 0;
                                                        let mut num_gte = 0;
                                                        let mut should_be_empty = false;
                                                        for i in 0 .. 1 {
                                                            should_be_empty = (should_be_empty | (i == original_array.length));
                                                            let original = original_array.array[i];
                                                            let sorted_index = if should_be_empty {
                                                                i
                                                            } else {
                                                                hints.sorted_indexes[i]
                                                            };
                                                            let is_lt = ({
                                                                // >>> inlined call: counter;
                                                                let self = original;
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } < split_counter);
                                                            {
                                                                let _ = if is_lt {
                                                                    (sorted_transformed_array_lt[sorted_index], hints.sorted_counters_lt[sorted_index])
                                                                } else {
                                                                    (sorted_transformed_array_gte[sorted_index], hints.sorted_counters_gte[sorted_index])
                                                                };
                                                                let sorted_value = _.0;
                                                                let sorted_counter = _.1
                                                            };
                                                            assert_transformed.0(original, sorted_value);
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = original;
                                                                {
                                                                    self.inner.counter
                                                                }
                                                            } == sorted_counter), "Mismatch counters");
                                                            if (!should_be_empty) {
                                                                if is_lt {
                                                                    num_lt = (num_lt + 1)
                                                                } else {
                                                                    num_gte = (num_gte + 1)
                                                                }
                                                            }
                                                        };
                                                        for i in 0 .. 1 {
                                                            if (i >= num_lt) {
                                                                assert({
                                                                    // >>> inlined call: is_empty;
                                                                    let self = sorted_transformed_array_lt[i];
                                                                    {
                                                                        {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self;
                                                                            let __arg_1 = {
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
                                                                            };
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                ({
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.inner;
                                                                                    let _other = other.inner;
                                                                                    {
                                                                                        ((_self.value == _other.value) & (_self.length == _other.length))
                                                                                    }
                                                                                } & {
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.contract_address;
                                                                                    let _other = other.contract_address;
                                                                                    {
                                                                                        (_self.inner == _other.inner)
                                                                                    }
                                                                                })
                                                                            }
                                                                        }
                                                                    }
                                                                }, "Unexpected non-empty item in lt array");
                                                            } else {
                                                                if (i != 0) {
                                                                    let counter = hints.sorted_counters_lt[i];
                                                                    let prev_counter = hints.sorted_counters_lt[(i - 1)];
                                                                    assert((counter > prev_counter), "Transformed lt array must be sorted by counter");
                                                                }
                                                            };
                                                            if (i >= num_gte) {
                                                                assert({
                                                                    // >>> inlined call: is_empty;
                                                                    let self = sorted_transformed_array_gte[i];
                                                                    {
                                                                        {
                                                                            // >>> inlined call: eq;
                                                                            let __arg_0 = self;
                                                                            let __arg_1 = {
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
                                                                            };
                                                                            let self = __arg_0;
                                                                            let other = __arg_1;
                                                                            {
                                                                                ({
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.inner;
                                                                                    let _other = other.inner;
                                                                                    {
                                                                                        ((_self.value == _other.value) & (_self.length == _other.length))
                                                                                    }
                                                                                } & {
                                                                                    // >>> inlined call: eq;
                                                                                    let _self = self.contract_address;
                                                                                    let _other = other.contract_address;
                                                                                    {
                                                                                        (_self.inner == _other.inner)
                                                                                    }
                                                                                })
                                                                            }
                                                                        }
                                                                    }
                                                                }, "Unexpected non-empty item in gte array");
                                                            } else {
                                                                if (i != 0) {
                                                                    let counter = hints.sorted_counters_gte[i];
                                                                    let prev_counter = hints.sorted_counters_gte[(i - 1)];
                                                                    assert((counter > prev_counter), "Transformed gte array must be sorted by counter");
                                                                }
                                                            }
                                                        }
                                                    }
                                                };
                                            }
                                        };
                                        {
                                            // >>> inlined call: assert_split_sorted_transformed_arrays;
                                            let __arg_0 = prev_data.public_call_requests;
                                            let __arg_1 = output_non_revertible.public_call_requests;
                                            let __arg_2 = output_revertible.public_call_requests;
                                            let __arg_3 = split_counter;
                                            let __arg_4 = lambda;
                                            let original_array = __arg_0;
                                            let sorted_transformed_array_lt = __arg_1;
                                            let sorted_transformed_array_gte = __arg_2;
                                            let split_counter = __arg_3;
                                            let assert_transformed = __arg_4;
                                            {
                                                let hints = {
                                                    unsafe { get_split_order_hints(original_array.array, split_counter) }
                                                };
                                                {
                                                    // >>> inlined call: assert_split_sorted_transformed_arrays_with_hints;
                                                    let __arg_0 = original_array;
                                                    let __arg_1 = sorted_transformed_array_lt;
                                                    let __arg_2 = sorted_transformed_array_gte;
                                                    let __arg_3 = split_counter;
                                                    let __arg_4 = assert_transformed;
                                                    let __arg_5 = hints;
                                                    let original_array = __arg_0;
                                                    let sorted_transformed_array_lt = __arg_1;
                                                    let sorted_transformed_array_gte = __arg_2;
                                                    let split_counter = __arg_3;
                                                    let assert_transformed = __arg_4;
                                                    let hints = __arg_5;
                                                    {
                                                        let mut num_lt = 0;
                                                        let mut num_gte = 0;
                                                        let mut should_be_empty = false;
                                                        for i in 0 .. 32 {
                                                            should_be_empty = (should_be_empty | (i == original_array.length));
                                                            let original = original_array.array[i];
                                                            let sorted_index = if should_be_empty {
                                                                i
                                                            } else {
                                                                hints.sorted_indexes[i]
                                                            };
                                                            let is_lt = ({
                                                                // >>> inlined call: counter;
                                                                let self = original;
                                                                {
                                                                    self.counter
                                                                }
                                                            } < split_counter);
                                                            {
                                                                let _ = if is_lt {
                                                                    (sorted_transformed_array_lt[sorted_index], hints.sorted_counters_lt[sorted_index])
                                                                } else {
                                                                    (sorted_transformed_array_gte[sorted_index], hints.sorted_counters_gte[sorted_index])
                                                                };
                                                                let sorted_value = _.0;
                                                                let sorted_counter = _.1
                                                            };
                                                            assert_transformed.0(original, sorted_value);
                                                            assert(({
                                                                // >>> inlined call: counter;
                                                                let self = original;
                                                                {
                                                                    self.counter
                                                                }
                                                            } == sorted_counter), "Mismatch counters");
                                                            if (!should_be_empty) {
                                                                if is_lt {
                                                                    num_lt = (num_lt + 1)
                                                                } else {
                                                                    num_gte = (num_gte + 1)
                                                                }
                                                            }
                                                        };
                                                        for i in 0 .. 32 {
                                                            if (i >= num_lt) {
                                                                assert({
                                                                    // >>> inlined call: is_empty;
                                                                    let self = sorted_transformed_array_lt[i];
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
                                                                }, "Unexpected non-empty item in lt array");
                                                            } else {
                                                                if (i != 0) {
                                                                    let counter = hints.sorted_counters_lt[i];
                                                                    let prev_counter = hints.sorted_counters_lt[(i - 1)];
                                                                    assert((counter > prev_counter), "Transformed lt array must be sorted by counter");
                                                                }
                                                            };
                                                            if (i >= num_gte) {
                                                                assert({
                                                                    // >>> inlined call: is_empty;
                                                                    let self = sorted_transformed_array_gte[i];
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
                                                                }, "Unexpected non-empty item in gte array");
                                                            } else {
                                                                if (i != 0) {
                                                                    let counter = hints.sorted_counters_gte[i];
                                                                    let prev_counter = hints.sorted_counters_gte[(i - 1)];
                                                                    assert((counter > prev_counter), "Transformed gte array must be sorted by counter");
                                                                }
                                                            }
                                                        }
                                                    }
                                                };
                                            }
                                        }
                                    }
                                };
                                {
                                    // >>> inlined call: validate_gas_used;
                                    let __arg_0 = self;
                                    let self = __arg_0;
                                    {
                                        let gas_used = {
                                            // >>> inlined call: meter_gas_used;
                                            let public_inputs = self.previous_kernel;
                                            let is_for_public = true;
                                            {
                                                let mut metered_da_fields = 0;
                                                let mut metered_l2_gas = 0;
                                                let data = public_inputs.end;
                                                let l2_gas = if is_for_public {
                                                    PUBLIC_TX_L2_GAS
                                                } else {
                                                    PRIVATE_ONLY_TX_L2_GAS
                                                };
                                                let num_note_hashes = data.note_hashes.length;
                                                metered_da_fields = (metered_da_fields + num_note_hashes);
                                                metered_l2_gas = (metered_l2_gas + (num_note_hashes * l2_gas.note_hash));
                                                let num_nullifiers = data.nullifiers.length;
                                                metered_da_fields = (metered_da_fields + num_nullifiers);
                                                metered_l2_gas = (metered_l2_gas + (num_nullifiers * l2_gas.nullifier));
                                                let num_l2_to_l1_msgs = data.l2_to_l1_msgs.length;
                                                metered_da_fields = (metered_da_fields + num_l2_to_l1_msgs);
                                                metered_l2_gas = (metered_l2_gas + (num_l2_to_l1_msgs * l2_gas.l2_to_l1_msg));
                                                let num_private_logs = data.private_logs.length;
                                                {
                                                    let op_rhs_0 = {
                                                        // >>> inlined call: fold;
                                                        let self = (&data.private_logs.array);
                                                        let mut accumulator = 0;
                                                        let f = lambda;
                                                        {
                                                            {
                                                                let $i0 = self;
                                                                for $i1 in 0 .. (*$i0).len() {
                                                                    let elem = (*$i0)[$i1];
                                                                    {
                                                                        accumulator = f.0(accumulator, elem)
                                                                    }
                                                                }
                                                            };
                                                            accumulator
                                                        }
                                                    };
                                                    metered_da_fields = (metered_da_fields + op_rhs_0)
                                                };
                                                metered_da_fields = (metered_da_fields + num_private_logs);
                                                metered_l2_gas = (metered_l2_gas + (num_private_logs * l2_gas.private_log));
                                                let num_contract_class_logs = data.contract_class_logs_hashes.length;
                                                {
                                                    let op_rhs_1 = {
                                                        // >>> inlined call: fold;
                                                        let self = (&data.contract_class_logs_hashes.array);
                                                        let mut accumulator = 0;
                                                        let f = lambda;
                                                        {
                                                            {
                                                                let $i0 = self;
                                                                for $i1 in 0 .. (*$i0).len() {
                                                                    let elem = (*$i0)[$i1];
                                                                    {
                                                                        accumulator = f.0(accumulator, elem)
                                                                    }
                                                                }
                                                            };
                                                            accumulator
                                                        }
                                                    };
                                                    metered_da_fields = (metered_da_fields + op_rhs_1)
                                                };
                                                metered_da_fields = (metered_da_fields + num_contract_class_logs);
                                                metered_l2_gas = (metered_l2_gas + (num_contract_class_logs * l2_gas.contract_class_log));
                                                if is_for_public {
                                                    let num_public_call_requests = data.public_call_requests.length;
                                                    metered_l2_gas = (metered_l2_gas + (num_public_call_requests * FIXED_AVM_STARTUP_L2_GAS))
                                                } else {
                                                    metered_da_fields = (metered_da_fields + PUBLIC_DATA_WRITE_LENGTH)
                                                };
                                                let teardown_gas = if ((!is_for_public) | {
                                                    // >>> inlined call: is_empty;
                                                    let self = public_inputs.public_teardown_call_request;
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
                                                    {
                                                        // >>> inlined call: empty;
                                                        {
                                                            {
                                                                // >>> inlined call: new;
                                                                let da_gas = 0;
                                                                let l2_gas = 0;
                                                                {
                                                                    {
                                                                        let da_gas = da_gas;
                                                                        let l2_gas = l2_gas;
                                                                        (da_gas, l2_gas)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    public_inputs.constants.tx_context.gas_settings.teardown_gas_limits
                                                };
                                                let metered_da_gas = (metered_da_fields * DA_GAS_PER_FIELD);
                                                let overhead = if is_for_public {
                                                    {
                                                        // >>> inlined call: public_tx_overhead;
                                                        {
                                                            {
                                                                let da_gas = TX_DA_GAS_OVERHEAD;
                                                                let l2_gas = PUBLIC_TX_L2_GAS_OVERHEAD;
                                                                (da_gas, l2_gas)
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    {
                                                        // >>> inlined call: private_tx_overhead;
                                                        {
                                                            {
                                                                let da_gas = TX_DA_GAS_OVERHEAD;
                                                                let l2_gas = PRIVATE_TX_L2_GAS_OVERHEAD;
                                                                (da_gas, l2_gas)
                                                            }
                                                        }
                                                    }
                                                };
                                                {
                                                    // >>> inlined call: add;
                                                    let self = {
                                                        // >>> inlined call: add;
                                                        let self = overhead;
                                                        let other = {
                                                            // >>> inlined call: new;
                                                            let da_gas = metered_da_gas;
                                                            let l2_gas = metered_l2_gas;
                                                            {
                                                                {
                                                                    let da_gas = da_gas;
                                                                    let l2_gas = l2_gas;
                                                                    (da_gas, l2_gas)
                                                                }
                                                            }
                                                        };
                                                        {
                                                            {
                                                                // >>> inlined call: new;
                                                                let da_gas = (self.da_gas + other.da_gas);
                                                                let l2_gas = (self.l2_gas + other.l2_gas);
                                                                {
                                                                    {
                                                                        let da_gas = da_gas;
                                                                        let l2_gas = l2_gas;
                                                                        (da_gas, l2_gas)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    };
                                                    let other = teardown_gas;
                                                    {
                                                        {
                                                            // >>> inlined call: new;
                                                            let da_gas = (self.da_gas + other.da_gas);
                                                            let l2_gas = (self.l2_gas + other.l2_gas);
                                                            {
                                                                {
                                                                    let da_gas = da_gas;
                                                                    let l2_gas = l2_gas;
                                                                    (da_gas, l2_gas)
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        };
                                        assert({
                                            // >>> inlined call: eq;
                                            let _self = self.output.gas_used;
                                            let _other = gas_used;
                                            {
                                                ((_self.da_gas == _other.da_gas) & (_self.l2_gas == _other.l2_gas))
                                            }
                                        }, "incorrect metered gas used");
                                        let gas_settings = self.output.constants.tx_context.gas_settings;
                                        assert({
                                            // >>> inlined call: within;
                                            let self = gas_used;
                                            let limits = gas_settings.gas_limits;
                                            {
                                                ((self.da_gas <= limits.da_gas) & (self.l2_gas <= limits.l2_gas))
                                            }
                                        }, "The gas used exceeds the gas limits");
                                    }
                                };
                            }
                        };
                    };
                    output
                }
            }
        }
    }
}
unconstrained fn generate_output(self: PrivateKernelResetCircuitPrivateInputs<64, 64, 64, 64, 64, 64>) -> (PrivateKernelCircuitPublicInputs, SquashedOutputArrayHints) {
    let composer = new(self.previous_kernel.public_inputs, self.padded_side_effects, self.hints.transient_data_squashing_hints, self.hints.note_hash_read_request_hints.read_request_actions, self.hints.nullifier_read_request_hints.read_request_actions);
    (finish(composer), composer.squashed_output_array_hints)
}
fn lambda(msg: Scoped<Counted<L2ToL1Message>>) -> () {
    // >>> inlined call: validate;
    let self = {
        // >>> inlined call: innermost;
        let self = msg;
        {
            self.inner.inner
        }
    }.recipient;
    {
        {
            // >>> inlined call: assert_max_bit_size;
            let __arg_0 = self.inner;
            let self = __arg_0;
            {
                static_assert((160 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
                __assert_max_bit_size(self, 160);
            }
        };
    }
}
unconstrained fn validate(self: EthAddress) -> () {
    assert_max_bit_size(self.inner);
}
unconstrained fn innermost(self: Scoped<Counted<L2ToL1Message>>) -> L2ToL1Message {
    self.inner.inner
}
unconstrained fn lambda(msg: Scoped<Counted<L2ToL1Message>>) -> () {
    validate(innermost(msg).recipient)
}
unconstrained fn generate_tail_to_public_output(previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs, padded_side_effect_amounts: PaddedSideEffectAmounts, expiration_timestamp_upper_bound: u64) -> PrivateToPublicKernelCircuitPublicInputs {
    finish(new(previous_kernel_public_inputs, padded_side_effect_amounts, expiration_timestamp_upper_bound))
}
unconstrained fn find_first_index(array: [u32; 7], find: fn[(u32,)](u32) -> bool) -> u32 {
    let mut index = 7;
    for i in 0 .. 7 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: FunctionSelector, index: u32) -> bool {
    (index == env.0)
}
unconstrained fn new(previous_kernel: PrivateKernelCircuitPublicInputs, padded_side_effects: PaddedSideEffects, transient_data_squashing_hints: [TransientDataSquashingHint; 64], note_hash_read_request_actions_hints: [ReadRequestAction; 64], nullifier_read_request_actions_hints: [ReadRequestAction; 64]) -> ResetOutputComposer {
    let squashed_output_array_hints = generate_squashed_output_array_hints(previous_kernel, transient_data_squashing_hints);
    {
        let previous_kernel = previous_kernel;
        let padded_side_effects = padded_side_effects;
        let note_hash_read_request_actions_hints = note_hash_read_request_actions_hints;
        let nullifier_read_request_actions_hints = nullifier_read_request_actions_hints;
        let squashed_output_array_hints = squashed_output_array_hints;
        (previous_kernel, padded_side_effects, note_hash_read_request_actions_hints, nullifier_read_request_actions_hints, squashed_output_array_hints)
    }
}
unconstrained fn finish(self: ResetOutputComposer) -> PrivateKernelCircuitPublicInputs {
    let mut output = self.previous_kernel;
    output.validation_requests = get_propagated_validation_requests(self);
    output.end.note_hashes = if (64 == 0) {
        self.squashed_output_array_hints.kept_note_hashes
    } else {
        get_padded_unique_siloed_sorted_kept_note_hashes(self)
    };
    output.end.nullifiers = if (64 == 0) {
        self.squashed_output_array_hints.kept_nullifiers
    } else {
        get_padded_siloed_sorted_kept_nullifiers(self)
    };
    output.end.private_logs = if (64 == 0) {
        self.squashed_output_array_hints.kept_private_logs
    } else {
        get_padded_siloed_sorted_kept_private_logs(self)
    };
    output
}
fn lambda(note_hash: ((Field, u32), (Field,))) -> bool {
    // >>> inlined call: is_empty;
    let self = {
        // >>> inlined call: innermost;
        let self = note_hash;
        {
            self.inner.inner
        }
    };
    {
        {
            // >>> inlined call: eq;
            let __arg_0 = self;
            let __arg_1 = {
                // >>> inlined call: empty;
                {
                    0
                }
            };
            let self = __arg_0;
            let other = __arg_1;
            {
                (self == other)
            }
        }
    }
}
unconstrained fn is_empty(self: Field) -> bool {
    eq(self, empty())
}
unconstrained fn innermost(self: Scoped<Counted<Field>>) -> Field {
    self.inner.inner
}
unconstrained fn lambda(note_hash: ((Field, u32), (Field,))) -> bool {
    is_empty(innermost(note_hash))
}
fn lambda(nullifier: Scoped<Counted<Nullifier>>) -> bool {
    // >>> inlined call: is_empty;
    let self = {
        // >>> inlined call: innermost;
        let self = nullifier;
        {
            self.inner.inner
        }
    }.value;
    {
        {
            // >>> inlined call: eq;
            let __arg_0 = self;
            let __arg_1 = {
                // >>> inlined call: empty;
                {
                    0
                }
            };
            let self = __arg_0;
            let other = __arg_1;
            {
                (self == other)
            }
        }
    }
}
unconstrained fn innermost(self: Scoped<Counted<Nullifier>>) -> Nullifier {
    self.inner.inner
}
unconstrained fn lambda(nullifier: Scoped<Counted<Nullifier>>) -> bool {
    is_empty(innermost(nullifier).value)
}
fn lambda(msg: Scoped<Counted<L2ToL1Message>>) -> bool {
    // >>> inlined call: is_empty;
    let self = {
        // >>> inlined call: expose_to_public;
        let self = msg;
        {
            {
                // >>> inlined call: scope;
                let __arg_0 = {
                    // >>> inlined call: innermost;
                    let __arg_0 = self;
                    let self = __arg_0;
                    {
                        self.inner.inner
                    }
                };
                let __arg_1 = self.contract_address;
                let self = __arg_0;
                let contract_address = __arg_1;
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
    {
        {
            // >>> inlined call: eq;
            let __arg_0 = self;
            let __arg_1 = {
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
            };
            let self = __arg_0;
            let other = __arg_1;
            {
                ({
                    // >>> inlined call: eq;
                    let _self = self.inner;
                    let _other = other.inner;
                    {
                        ({
                            // >>> inlined call: eq;
                            let __arg_0 = _self.recipient;
                            let __arg_1 = _other.recipient;
                            let _self = __arg_0;
                            let _other = __arg_1;
                            {
                                (_self.inner == _other.inner)
                            }
                        } & (_self.content == _other.content))
                    }
                } & {
                    // >>> inlined call: eq;
                    let _self = self.contract_address;
                    let _other = other.contract_address;
                    {
                        (_self.inner == _other.inner)
                    }
                })
            }
        }
    }
}
unconstrained fn is_empty(self: Scoped<L2ToL1Message>) -> bool {
    eq(self, empty())
}
unconstrained fn expose_to_public(self: Scoped<Counted<L2ToL1Message>>) -> Scoped<L2ToL1Message> {
    scope(innermost(self), self.contract_address)
}
unconstrained fn lambda(msg: Scoped<Counted<L2ToL1Message>>) -> bool {
    is_empty(expose_to_public(msg))
}
fn lambda(log: Scoped<Counted<PrivateLogData>>) -> bool {
    ({
        // >>> inlined call: innermost;
        let self = log;
        {
            self.inner.inner
        }
    }.log.length != 0)
}
unconstrained fn innermost(self: Scoped<Counted<PrivateLogData>>) -> PrivateLogData {
    self.inner.inner
}
unconstrained fn lambda(log: Scoped<Counted<PrivateLogData>>) -> bool {
    (innermost(log).log.length != 0)
}
fn lambda(log: Scoped<Counted<PrivateLogData>>) -> bool {
    // >>> inlined call: is_empty;
    let self = {
        // >>> inlined call: innermost;
        let self = log;
        {
            self.inner.inner
        }
    }.log;
    {
        {
            // >>> inlined call: eq;
            let _self = self;
            let _other = {
                // >>> inlined call: empty;
                {
                    {
                        let fields = [0; 16];
                        let length = 0;
                        (fields, length)
                    }
                }
            };
            {
                ({
                    // >>> inlined call: eq;
                    let self = _self.fields;
                    let other = _other.fields;
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
                } & (_self.length == _other.length))
            }
        }
    }
}
unconstrained fn is_empty(self: Log<16>) -> bool {
    eq(self, empty())
}
unconstrained fn lambda(log: Scoped<Counted<PrivateLogData>>) -> bool {
    is_empty(innermost(log).log)
}
fn lambda(log_hash: Scoped<Counted<LogHash>>) -> bool {
    ({
        // >>> inlined call: innermost;
        let self = log_hash;
        {
            self.inner.inner
        }
    }.length != 0)
}
unconstrained fn innermost(self: Scoped<Counted<LogHash>>) -> LogHash {
    self.inner.inner
}
unconstrained fn lambda(log_hash: Scoped<Counted<LogHash>>) -> bool {
    (innermost(log_hash).length != 0)
}
fn lambda(log_hash: Scoped<Counted<LogHash>>) -> bool {
    // >>> inlined call: is_empty;
    let self = log_hash;
    {
        {
            // >>> inlined call: eq;
            let __arg_0 = self;
            let __arg_1 = {
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
            };
            let self = __arg_0;
            let other = __arg_1;
            {
                ({
                    // >>> inlined call: eq;
                    let __arg_0 = self.inner;
                    let __arg_1 = other.inner;
                    let self = __arg_0;
                    let other = __arg_1;
                    {
                        ({
                            // >>> inlined call: eq;
                            let _self = self.inner;
                            let _other = other.inner;
                            {
                                ((_self.value == _other.value) & (_self.length == _other.length))
                            }
                        } & (self.counter == other.counter))
                    }
                } & {
                    // >>> inlined call: eq;
                    let _self = self.contract_address;
                    let _other = other.contract_address;
                    {
                        (_self.inner == _other.inner)
                    }
                })
            }
        }
    }
}
unconstrained fn is_empty(self: Scoped<Counted<LogHash>>) -> bool {
    eq(self, empty())
}
unconstrained fn lambda(log_hash: Scoped<Counted<LogHash>>) -> bool {
    is_empty(log_hash)
}
fn lambda(call_request: Counted<PublicCallRequest>) -> bool {
    // >>> inlined call: is_empty;
    let self = call_request.inner;
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
}
unconstrained fn is_empty(self: PublicCallRequest) -> bool {
    eq(self, empty())
}
unconstrained fn lambda(call_request: Counted<PublicCallRequest>) -> bool {
    is_empty(call_request.inner)
}
unconstrained fn assert_max_bit_size(self: Field) -> () {
    static_assert((160 < (254 as u32)), "BIT_SIZE must be less than modulus_num_bits", r#"{"kind":"string","length":43}"#, false);
    __assert_max_bit_size(self, 160);
}
unconstrained fn get_note_hash_index_for_each_nullifier(previous_kernel: PrivateKernelCircuitPublicInputs) -> [u32; 64] {
    let mut note_hash_index_for_each_nullifier = [0; 64];
    let note_hashes = previous_kernel.end.note_hashes;
    let nullifiers = previous_kernel.end.nullifiers;
    for i in 0 .. nullifiers.array.len() {
        let nullified_note_hash = innermost(nullifiers.array[i]).note_hash;
        let note_hash_index = find_first_index(note_hashes.array, {
            let closure_variable = {
                let env = (nullified_note_hash);
                ((env, lambda), (env, lambda))
            };
            closure_variable
        });
        if ((nullified_note_hash != 0) & (note_hash_index != note_hashes.array.len())) {
            note_hash_index_for_each_nullifier[i] = note_hash_index
        }
    };
    note_hash_index_for_each_nullifier
}
unconstrained fn finish(self: TailToPublicOutputComposer) -> PrivateToPublicKernelCircuitPublicInputs {
    let mut output_composer = new_from_previous_kernel(self.previous_kernel);
    sort_ordered_values((&mut output_composer));
    let source = finish(output_composer);
    {
        let _ = split_to_public(source.end, source.min_revertible_side_effect_counter, self.padded_side_effect_amounts);
        let non_revertible_accumulated_data = _.0;
        let revertible_accumulated_data = _.1
    };
    let gas_used = meter_gas_used(self.previous_kernel, true);
    let max_timestamp = (source.constants.anchor_block_header.global_variables.timestamp + MAX_TX_LIFETIME);
    let expiration_timestamp = min(min(source.expiration_timestamp, self.expiration_timestamp_upper_bound), max_timestamp);
    let output = {
        let constants = to_tx_constant_data(source.constants);
        let non_revertible_accumulated_data = non_revertible_accumulated_data;
        let revertible_accumulated_data = revertible_accumulated_data;
        let public_teardown_call_request = source.public_teardown_call_request;
        let gas_used = gas_used;
        let fee_payer = source.fee_payer;
        let expiration_timestamp = expiration_timestamp;
        (constants, non_revertible_accumulated_data, revertible_accumulated_data, public_teardown_call_request, gas_used, fee_payer, expiration_timestamp)
    };
    output
}
unconstrained fn new(previous_kernel: PrivateKernelCircuitPublicInputs, padded_side_effect_amounts: PaddedSideEffectAmounts, expiration_timestamp_upper_bound: u64) -> TailToPublicOutputComposer {
    {
        let previous_kernel = previous_kernel;
        let padded_side_effect_amounts = padded_side_effect_amounts;
        let expiration_timestamp_upper_bound = expiration_timestamp_upper_bound;
        (previous_kernel, padded_side_effect_amounts, expiration_timestamp_upper_bound)
    }
}
unconstrained fn generate_squashed_output_array_hints(previous_kernel: PrivateKernelCircuitPublicInputs, transient_data_squashing_hints: [TransientDataSquashingHint; 64]) -> SquashedOutputArrayHints {
    {
        let _ = squash_transient_data(previous_kernel.end.note_hashes, previous_kernel.end.nullifiers, previous_kernel.end.private_logs, transient_data_squashing_hints);
        let kept_note_hashes = _.0;
        let kept_nullifiers = _.1;
        let kept_private_logs = _.2
    };
    {
        let kept_note_hashes = kept_note_hashes;
        let kept_nullifiers = kept_nullifiers;
        let kept_private_logs = kept_private_logs;
        (kept_note_hashes, kept_nullifiers, kept_private_logs)
    }
}
unconstrained fn get_propagated_validation_requests(self: ResetOutputComposer) -> PrivateValidationRequests {
    let validation_requests = self.previous_kernel.validation_requests;
    let kept_note_hash_read_requests = get_propagated_read_requests(validation_requests.note_hash_read_requests, self.note_hash_read_request_actions_hints);
    let kept_nullifier_read_requests = get_propagated_read_requests(validation_requests.nullifier_read_requests, self.nullifier_read_request_actions_hints);
    let scoped_key_validation_requests_and_separators = get_propagated_key_validation_requests(validation_requests.scoped_key_validation_requests_and_separators, 64);
    {
        let note_hash_read_requests = kept_note_hash_read_requests;
        let nullifier_read_requests = kept_nullifier_read_requests;
        let scoped_key_validation_requests_and_separators = scoped_key_validation_requests_and_separators;
        (note_hash_read_requests, nullifier_read_requests, scoped_key_validation_requests_and_separators)
    }
}
unconstrained fn get_padded_unique_siloed_sorted_kept_note_hashes(self: ResetOutputComposer) -> ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64> {
    let sorted_kept_note_hashes = {
        let array = sort_by_counter(self.squashed_output_array_hints.kept_note_hashes.array);
        let length = self.squashed_output_array_hints.kept_note_hashes.length;
        (array, length)
    };
    let num_kept_note_hashes = sorted_kept_note_hashes.length;
    let padded_note_hashes = self.padded_side_effects.note_hashes;
    let num_padded_items = check_padded_items(padded_note_hashes, num_kept_note_hashes, 64);
    let mut padded_unique_siloed_sorted_kept_note_hashes = sorted_kept_note_hashes;
    for i in 0 .. (num_kept_note_hashes + num_padded_items) {
        if (i >= num_kept_note_hashes) {
            push((&mut padded_unique_siloed_sorted_kept_note_hashes), scope(new(padded_note_hashes[i], MAX_U32_VALUE), SIDE_EFFECT_MASKING_ADDRESS));
        };
        let note_hash = padded_unique_siloed_sorted_kept_note_hashes.array[i];
        let siloed_note_hash = silo_note_hash(note_hash);
        let unique_siloed_note_hash = uniquify_siloed_note_hash(siloed_note_hash, self.previous_kernel.claimed_first_nullifier, i);
        let is_non_revertible = is_non_revertible(note_hash, self.previous_kernel.is_private_only, self.previous_kernel.claimed_revertible_counter);
        padded_unique_siloed_sorted_kept_note_hashes.array[i] = if is_non_revertible {
            unique_siloed_note_hash
        } else {
            siloed_note_hash
        }
    };
    padded_unique_siloed_sorted_kept_note_hashes
}
unconstrained fn get_padded_siloed_sorted_kept_nullifiers(self: ResetOutputComposer) -> ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64> {
    let sorted_kept_nullifiers = {
        let array = sort_by_counter(self.squashed_output_array_hints.kept_nullifiers.array);
        let length = self.squashed_output_array_hints.kept_nullifiers.length;
        (array, length)
    };
    let num_kept_nullifiers = sorted_kept_nullifiers.length;
    let padded_nullifiers = self.padded_side_effects.nullifiers;
    let num_padded_items = check_padded_items(padded_nullifiers, num_kept_nullifiers, 64);
    let mut padded_siloed_sorted_kept_nullifiers = sorted_kept_nullifiers;
    for i in 0 .. (num_kept_nullifiers + num_padded_items) {
        if (i >= num_kept_nullifiers) {
            push((&mut padded_siloed_sorted_kept_nullifiers), scope(count({
                let value = padded_nullifiers[i];
                let note_hash = 0;
                (value, note_hash)
            }, MAX_U32_VALUE), SIDE_EFFECT_MASKING_ADDRESS));
        };
        let nullifier = padded_siloed_sorted_kept_nullifiers.array[i];
        padded_siloed_sorted_kept_nullifiers.array[i] = silo_nullifier(nullifier)
    };
    padded_siloed_sorted_kept_nullifiers
}
unconstrained fn get_padded_siloed_sorted_kept_private_logs(self: ResetOutputComposer) -> ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64> {
    let sorted_kept_private_logs = {
        let array = sort_by_counter(self.squashed_output_array_hints.kept_private_logs.array);
        let length = self.squashed_output_array_hints.kept_private_logs.length;
        (array, length)
    };
    let num_kept_private_logs = sorted_kept_private_logs.length;
    let padded_private_logs = self.padded_side_effects.private_logs;
    let num_padded_items = check_padded_items(padded_private_logs, num_kept_private_logs, 64);
    let mut padded_siloed_sorted_kept_private_logs = sorted_kept_private_logs;
    for i in 0 .. (num_kept_private_logs + num_padded_items) {
        if (i >= num_kept_private_logs) {
            push((&mut padded_siloed_sorted_kept_private_logs), scope(count({
                let log = padded_private_logs[i];
                let note_hash_counter = 0;
                (log, note_hash_counter)
            }, MAX_U32_VALUE), SIDE_EFFECT_MASKING_ADDRESS));
        };
        let private_log = padded_siloed_sorted_kept_private_logs.array[i];
        padded_siloed_sorted_kept_private_logs.array[i] = silo_private_log(private_log)
    };
    padded_siloed_sorted_kept_private_logs
}
fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}
unconstrained fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}
fn nullifier_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__NULLIFIER_MERKLE)
}
unconstrained fn nullifier_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__NULLIFIER_MERKLE)
}
unconstrained fn find_first_index(array: [Scoped<Counted<Field>>; 64], find: fn[(Scoped<Counted<PrivateLogData>>,)](Scoped<Counted<Field>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: (Scoped<Counted<PrivateLogData>>,), n: ((Field, u32), (Field,))) -> bool {
    (counter(n) == innermost(env.0).note_hash_counter)
}
unconstrained fn counter(self: Scoped<Counted<Field>>) -> u32 {
    self.inner.counter
}
unconstrained fn eq(self: Field, other: Field) -> bool {
    (self == other)
}
#[inline_always]
unconstrained fn empty() -> Field {
    0
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
unconstrained fn scope(self: L2ToL1Message, contract_address: AztecAddress) -> Scoped<L2ToL1Message> {
    new(self, contract_address)
}
unconstrained fn eq(_self: Log<16>, _other: Log<16>) -> bool {
    (eq(_self.fields, _other.fields) & (_self.length == _other.length))
}
unconstrained fn empty() -> Log<16> {
    {
        let fields = [0; 16];
        let length = 0;
        (fields, length)
    }
}
unconstrained fn eq(self: Scoped<Counted<LogHash>>, other: Scoped<Counted<LogHash>>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
unconstrained fn empty() -> Scoped<Counted<LogHash>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
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
unconstrained fn find_first_index(array: [Scoped<Counted<Field>>; 64], find: fn[(Field,)](Scoped<Counted<Field>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: (Field,), n: ((Field, u32), (Field,))) -> bool {
    (innermost(n) == env.0)
}
unconstrained fn new_from_previous_kernel(previous_kernel: PrivateKernelCircuitPublicInputs) -> PrivateKernelCircuitOutputComposer {
    let public_inputs = {
        let constants = previous_kernel.constants;
        let min_revertible_side_effect_counter = previous_kernel.min_revertible_side_effect_counter;
        let validation_requests = previous_kernel.validation_requests;
        let end = previous_kernel.end;
        let public_teardown_call_request = previous_kernel.public_teardown_call_request;
        let fee_payer = previous_kernel.fee_payer;
        let expiration_timestamp = previous_kernel.expiration_timestamp;
        let is_private_only = previous_kernel.is_private_only;
        let claimed_first_nullifier = previous_kernel.claimed_first_nullifier;
        let claimed_revertible_counter = previous_kernel.claimed_revertible_counter;
        (constants, min_revertible_side_effect_counter, validation_requests, end, public_teardown_call_request, fee_payer, expiration_timestamp, is_private_only, claimed_first_nullifier, claimed_revertible_counter)
    };
    {
        let public_inputs = public_inputs;
        (public_inputs)
    }
}
unconstrained fn sort_ordered_values(self: &mut PrivateKernelCircuitOutputComposer) -> () {
    (*self).public_inputs.end.l2_to_l1_msgs = transform_array((*self.public_inputs.end).l2_to_l1_msgs, (sort_by_counter, sort_by_counter));
    (*self).public_inputs.end.contract_class_logs_hashes = transform_array((*self.public_inputs.end).contract_class_logs_hashes, (sort_by_counter, sort_by_counter));
    (*self).public_inputs.end.public_call_requests = transform_array((*self.public_inputs.end).public_call_requests, (sort_by_counter, sort_by_counter))
}
unconstrained fn finish(self: PrivateKernelCircuitOutputComposer) -> PrivateKernelCircuitPublicInputs {
    self.public_inputs
}
unconstrained fn split_to_public(data: PrivateAccumulatedData, min_revertible_side_effect_counter: u32, padded_side_effect_amounts: PaddedSideEffectAmounts) -> (PrivateToPublicAccumulatedData, PrivateToPublicAccumulatedData) {
    let mut non_revertible_data = empty();
    let mut revertible_data = empty();
    let note_hashes = data.note_hashes;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_note_hashes;
    let mut padded_revertible = padded_side_effect_amounts.revertible_note_hashes;
    for i in 0 .. note_hashes.length {
        let note_hash = note_hashes.array[i];
        let is_padding = (counter(note_hash) == MAX_U32_VALUE);
        if ((counter(note_hash) < min_revertible_side_effect_counter) | (is_padding & (padded_non_revertible != 0))) {
            push((&mut non_revertible_data.note_hashes), note_hash);
            padded_non_revertible = (padded_non_revertible - (1 * (is_padding as u32)))
        } else {
            push((&mut revertible_data.note_hashes), note_hash);
            assert(((!is_padding) | (padded_revertible != 0)), "padded note hash amount is too small");
            padded_revertible = (padded_revertible - (1 * (is_padding as u32)))
        }
    };
    assert((padded_non_revertible == 0), "padded non-revertible note hash amount is too large");
    assert((padded_revertible == 0), "padded revertible note hash amount is too large");
    let nullifiers = data.nullifiers;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_nullifiers;
    let mut padded_revertible = padded_side_effect_amounts.revertible_nullifiers;
    for i in 0 .. nullifiers.length {
        let nullifier = nullifiers.array[i];
        let is_padding = (counter(nullifier) == MAX_U32_VALUE);
        if ((counter(nullifier) < min_revertible_side_effect_counter) | (is_padding & (padded_non_revertible != 0))) {
            push((&mut non_revertible_data.nullifiers), nullifier);
            padded_non_revertible = (padded_non_revertible - (1 * (is_padding as u32)))
        } else {
            push((&mut revertible_data.nullifiers), nullifier);
            assert(((!is_padding) | (padded_revertible != 0)), "padded nullifier amount is too small");
            padded_revertible = (padded_revertible - (1 * (is_padding as u32)))
        }
    };
    assert((padded_non_revertible == 0), "padded non-revertible nullifier amount is too large");
    assert((padded_revertible == 0), "padded revertible nullifier amount is too large");
    let l2_to_l1_msgs = data.l2_to_l1_msgs;
    for i in 0 .. l2_to_l1_msgs.length {
        let msg = l2_to_l1_msgs.array[i];
        if (counter(msg) < min_revertible_side_effect_counter) {
            push((&mut non_revertible_data.l2_to_l1_msgs), msg);
        } else {
            push((&mut revertible_data.l2_to_l1_msgs), msg);
        }
    };
    let private_logs = data.private_logs;
    let mut padded_non_revertible = padded_side_effect_amounts.non_revertible_private_logs;
    let mut padded_revertible = padded_side_effect_amounts.revertible_private_logs;
    for i in 0 .. private_logs.length {
        let private_log = private_logs.array[i];
        let is_padding = (counter(private_log) == MAX_U32_VALUE);
        if ((counter(private_log) < min_revertible_side_effect_counter) | (is_padding & (padded_non_revertible != 0))) {
            push((&mut non_revertible_data.private_logs), private_log);
            padded_non_revertible = (padded_non_revertible - (1 * (is_padding as u32)))
        } else {
            push((&mut revertible_data.private_logs), private_log);
            assert(((!is_padding) | (padded_revertible != 0)), "padded private log amount is too small");
            padded_revertible = (padded_revertible - (1 * (is_padding as u32)))
        }
    };
    assert((padded_non_revertible == 0), "padded non-revertible private log amount is too large");
    assert((padded_revertible == 0), "padded revertible private log amount is too large");
    let contract_class_logs_hashes = data.contract_class_logs_hashes;
    for i in 0 .. contract_class_logs_hashes.length {
        let contract_class_log_hash = contract_class_logs_hashes.array[i];
        if (counter(contract_class_log_hash) < min_revertible_side_effect_counter) {
            push((&mut non_revertible_data.contract_class_logs_hashes), contract_class_log_hash);
        } else {
            push((&mut revertible_data.contract_class_logs_hashes), contract_class_log_hash);
        }
    };
    let public_call_requests = data.public_call_requests;
    for i in 0 .. public_call_requests.length {
        let call_request = public_call_requests.array[i];
        if (counter(call_request) < min_revertible_side_effect_counter) {
            push((&mut non_revertible_data.public_call_requests), call_request);
        } else {
            push((&mut revertible_data.public_call_requests), call_request);
        }
    };
    (expose_to_public(non_revertible_data), expose_to_public(revertible_data))
}
unconstrained fn meter_gas_used(public_inputs: PrivateKernelCircuitPublicInputs, is_for_public: bool) -> Gas {
    let mut metered_da_fields = 0;
    let mut metered_l2_gas = 0;
    let data = public_inputs.end;
    let l2_gas = if is_for_public {
        PUBLIC_TX_L2_GAS
    } else {
        PRIVATE_ONLY_TX_L2_GAS
    };
    let num_note_hashes = data.note_hashes.length;
    metered_da_fields = (metered_da_fields + num_note_hashes);
    metered_l2_gas = (metered_l2_gas + (num_note_hashes * l2_gas.note_hash));
    let num_nullifiers = data.nullifiers.length;
    metered_da_fields = (metered_da_fields + num_nullifiers);
    metered_l2_gas = (metered_l2_gas + (num_nullifiers * l2_gas.nullifier));
    let num_l2_to_l1_msgs = data.l2_to_l1_msgs.length;
    metered_da_fields = (metered_da_fields + num_l2_to_l1_msgs);
    metered_l2_gas = (metered_l2_gas + (num_l2_to_l1_msgs * l2_gas.l2_to_l1_msg));
    let num_private_logs = data.private_logs.length;
    {
        let op_rhs_0 = fold((&data.private_logs.array), 0, lambda);
        metered_da_fields = (metered_da_fields + op_rhs_0)
    };
    metered_da_fields = (metered_da_fields + num_private_logs);
    metered_l2_gas = (metered_l2_gas + (num_private_logs * l2_gas.private_log));
    let num_contract_class_logs = data.contract_class_logs_hashes.length;
    {
        let op_rhs_1 = fold((&data.contract_class_logs_hashes.array), 0, lambda);
        metered_da_fields = (metered_da_fields + op_rhs_1)
    };
    metered_da_fields = (metered_da_fields + num_contract_class_logs);
    metered_l2_gas = (metered_l2_gas + (num_contract_class_logs * l2_gas.contract_class_log));
    if is_for_public {
        let num_public_call_requests = data.public_call_requests.length;
        metered_l2_gas = (metered_l2_gas + (num_public_call_requests * FIXED_AVM_STARTUP_L2_GAS))
    } else {
        metered_da_fields = (metered_da_fields + PUBLIC_DATA_WRITE_LENGTH)
    };
    let teardown_gas = if ((!is_for_public) | is_empty(public_inputs.public_teardown_call_request)) {
        empty()
    } else {
        public_inputs.constants.tx_context.gas_settings.teardown_gas_limits
    };
    let metered_da_gas = (metered_da_fields * DA_GAS_PER_FIELD);
    let overhead = if is_for_public {
        public_tx_overhead()
    } else {
        private_tx_overhead()
    };
    add(add(overhead, new(metered_da_gas, metered_l2_gas)), teardown_gas)
}
unconstrained fn min(v1: u64, v2: u64) -> u64 {
    if (cmp(v1, v2).0 == 2) {
        v2
    } else {
        v1
    }
}
unconstrained fn to_tx_constant_data(self: PrivateTxConstantData) -> TxConstantData {
    {
        let anchor_block_header = self.anchor_block_header;
        let tx_context = self.tx_context;
        let vk_tree_root = self.vk_tree_root;
        let protocol_contracts_hash = hash(self.protocol_contracts);
        (anchor_block_header, tx_context, vk_tree_root, protocol_contracts_hash)
    }
}
fn lambda(prev: ((Field, u32), (Field,)), out: Field) -> () {
    assert((out == {
        // >>> inlined call: expose_to_public;
        let self = prev;
        {
            {
                // >>> inlined call: innermost;
                let __arg_0 = self;
                let self = __arg_0;
                {
                    self.inner.inner
                }
            }
        }
    }), "incorrect output note_hashes")
}
unconstrained fn expose_to_public(self: Scoped<Counted<Field>>) -> Field {
    innermost(self)
}
unconstrained fn lambda(prev: ((Field, u32), (Field,)), out: Field) -> () {
    assert((out == expose_to_public(prev)), "incorrect output note_hashes")
}
fn lambda(prev: Scoped<Counted<Nullifier>>, out: Field) -> () {
    assert((out == {
        // >>> inlined call: expose_to_public;
        let self = prev;
        {
            {
                // >>> inlined call: innermost;
                let __arg_0 = self;
                let self = __arg_0;
                {
                    self.inner.inner
                }
            }.value
        }
    }), "incorrect output nullifiers")
}
unconstrained fn expose_to_public(self: Scoped<Counted<Nullifier>>) -> Field {
    innermost(self).value
}
unconstrained fn lambda(prev: Scoped<Counted<Nullifier>>, out: Field) -> () {
    assert((out == expose_to_public(prev)), "incorrect output nullifiers")
}
fn lambda(prev: Scoped<Counted<PrivateLogData>>, out: Log<16>) -> () {
    assert({
        // >>> inlined call: eq;
        let _self = out;
        let _other = {
            // >>> inlined call: expose_to_public;
            let self = prev;
            {
                {
                    // >>> inlined call: innermost;
                    let __arg_0 = self;
                    let self = __arg_0;
                    {
                        self.inner.inner
                    }
                }.log
            }
        };
        {
            ({
                // >>> inlined call: eq;
                let self = _self.fields;
                let other = _other.fields;
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
            } & (_self.length == _other.length))
        }
    }, "incorrect output private_logs")
}
unconstrained fn expose_to_public(self: Scoped<Counted<PrivateLogData>>) -> PrivateLog {
    innermost(self).log
}
unconstrained fn lambda(prev: Scoped<Counted<PrivateLogData>>, out: Log<16>) -> () {
    assert(eq(out, expose_to_public(prev)), "incorrect output private_logs")
}
fn lambda(prev: Scoped<Counted<L2ToL1Message>>, out: Scoped<L2ToL1Message>) -> () {
    assert({
        // >>> inlined call: eq;
        let self = out;
        let other = {
            // >>> inlined call: expose_to_public;
            let self = prev;
            {
                {
                    // >>> inlined call: scope;
                    let __arg_0 = {
                        // >>> inlined call: innermost;
                        let __arg_0 = self;
                        let self = __arg_0;
                        {
                            self.inner.inner
                        }
                    };
                    let __arg_1 = self.contract_address;
                    let self = __arg_0;
                    let contract_address = __arg_1;
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
        {
            ({
                // >>> inlined call: eq;
                let _self = self.inner;
                let _other = other.inner;
                {
                    ({
                        // >>> inlined call: eq;
                        let __arg_0 = _self.recipient;
                        let __arg_1 = _other.recipient;
                        let _self = __arg_0;
                        let _other = __arg_1;
                        {
                            (_self.inner == _other.inner)
                        }
                    } & (_self.content == _other.content))
                }
            } & {
                // >>> inlined call: eq;
                let _self = self.contract_address;
                let _other = other.contract_address;
                {
                    (_self.inner == _other.inner)
                }
            })
        }
    }, "incorrect output l2_to_l1_msg")
}
unconstrained fn lambda(prev: Scoped<Counted<L2ToL1Message>>, out: Scoped<L2ToL1Message>) -> () {
    assert(eq(out, expose_to_public(prev)), "incorrect output l2_to_l1_msg")
}
fn lambda(prev: Scoped<Counted<LogHash>>, out: ((Field, u32), (Field,))) -> () {
    assert({
        // >>> inlined call: eq;
        let self = out;
        let other = {
            // >>> inlined call: expose_to_public;
            let self = prev;
            {
                {
                    // >>> inlined call: scope;
                    let __arg_0 = self.inner.inner;
                    let __arg_1 = self.contract_address;
                    let self = __arg_0;
                    let contract_address = __arg_1;
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
        {
            ({
                // >>> inlined call: eq;
                let _self = self.inner;
                let _other = other.inner;
                {
                    ((_self.value == _other.value) & (_self.length == _other.length))
                }
            } & {
                // >>> inlined call: eq;
                let _self = self.contract_address;
                let _other = other.contract_address;
                {
                    (_self.inner == _other.inner)
                }
            })
        }
    }, "incorrect output contract_class_log_hash")
}
unconstrained fn expose_to_public(self: Scoped<Counted<LogHash>>) -> Scoped<LogHash> {
    scope(self.inner.inner, self.contract_address)
}
unconstrained fn eq(self: Scoped<LogHash>, other: Scoped<LogHash>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
unconstrained fn lambda(prev: Scoped<Counted<LogHash>>, out: ((Field, u32), (Field,))) -> () {
    assert(eq(out, expose_to_public(prev)), "incorrect output contract_class_log_hash")
}
fn lambda(prev: Counted<PublicCallRequest>, out: PublicCallRequest) -> () {
    assert({
        // >>> inlined call: eq;
        let _self = out;
        let _other = {
            // >>> inlined call: expose_to_public;
            let self = prev;
            {
                self.inner
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
    }, "incorrect output public_call_request")
}
unconstrained fn expose_to_public(self: Counted<PublicCallRequest>) -> PublicCallRequest {
    self.inner
}
unconstrained fn lambda(prev: Counted<PublicCallRequest>, out: PublicCallRequest) -> () {
    assert(eq(out, expose_to_public(prev)), "incorrect output public_call_request")
}
unconstrained fn squash_transient_data(previous_kernel_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64>, previous_kernel_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, previous_kernel_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, transient_data_squashing_hints: [TransientDataSquashingHint; 64]) -> (ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64>, ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>) {
    let num_active_squashing_hints = get_num_active_squashing_hints(transient_data_squashing_hints, previous_kernel_nullifiers);
    let note_hash_squash_flags = build_note_hash_squash_flags(transient_data_squashing_hints, num_active_squashing_hints);
    let nullifier_squash_flags = build_nullifier_squash_flags(transient_data_squashing_hints, num_active_squashing_hints);
    let mut kept_note_hashes = empty();
    for i in 0 .. previous_kernel_note_hashes.length {
        if (!note_hash_squash_flags[i]) {
            push((&mut kept_note_hashes), previous_kernel_note_hashes.array[i]);
        }
    };
    let mut kept_nullifiers = empty();
    for i in 0 .. previous_kernel_nullifiers.length {
        if (!nullifier_squash_flags[i]) {
            push((&mut kept_nullifiers), previous_kernel_nullifiers.array[i]);
        }
    };
    let mut kept_logs = empty();
    for i in 0 .. previous_kernel_logs.length {
        let log = previous_kernel_logs.array[i];
        let note_hash_counter = innermost(log).note_hash_counter;
        if (note_hash_counter == 0) {
            push((&mut kept_logs), log);
        } else {
            let is_linked_to_kept_note_hash = any((&kept_note_hashes.array), {
                let closure_variable = {
                    let env = (note_hash_counter);
                    ((env, lambda), (env, lambda))
                };
                closure_variable
            });
            if is_linked_to_kept_note_hash {
                push((&mut kept_logs), log);
            }
        }
    };
    (kept_note_hashes, kept_nullifiers, kept_logs)
}
unconstrained fn get_propagated_read_requests(read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, 64>, read_request_actions_hints: [ReadRequestAction; 64]) -> ClaimedLengthArray<Scoped<Counted<Field>>, 64> {
    let mut propagated_read_requests = empty();
    for i in 0 .. read_requests.length {
        let read_request = read_requests.array[i];
        if (read_request_actions_hints[i].action == ReadRequestActions.SKIP) {
            push((&mut propagated_read_requests), read_request);
        }
    };
    propagated_read_requests
}
unconstrained fn get_propagated_key_validation_requests(key_validation_requests: ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64>, key_validation_amount: u32) -> ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64> {
    let mut propagated = empty();
    for i in key_validation_amount .. key_validation_requests.length {
        propagated.array[(i - key_validation_amount)] = key_validation_requests.array[i]
    };
    propagated.length = if (key_validation_requests.length > key_validation_amount) {
        (key_validation_requests.length - key_validation_amount)
    } else {
        0
    };
    propagated
}
unconstrained fn sort_by_counter(array: [Scoped<Counted<Field>>; 64]) -> [Scoped<Counted<Field>>; 64] {
    sort_via((&array), (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding))
}
unconstrained fn check_padded_items(padded_items: [Field; 64], num_original_items: u32, capped_size: u32) -> u32 {
    let mut seen_empty = false;
    let mut num_padded_items = 0;
    for i in 0 .. 64 {
        let item_is_empty = is_empty(padded_items[i]);
        if ((i < num_original_items) | (i >= capped_size)) {
            assert(item_is_empty, "padded items should be empty outside of the range [num_original_items, capped_size)");
        } else {
            assert((item_is_empty | (!seen_empty)), "non-empty padded items should be consecutive within the range [num_original_items, capped_size)");
            seen_empty = (seen_empty | item_is_empty);
            num_padded_items = (num_padded_items + (1 * ((!item_is_empty) as u32)))
        }
    };
    num_padded_items
}
unconstrained fn push(self: &mut ClaimedLengthArray<Scoped<Counted<Field>>, 64>, item: Scoped<Counted<Field>>) -> () {
    assert(((*self).length != 64), "Array full");
    let next_index = (*self).length;
    (*self).array[next_index] = item;
    (*self).length = ((*self).length + 1)
}
unconstrained fn scope(self: Counted<Field>, contract_address: AztecAddress) -> Scoped<Counted<Field>> {
    new(self, contract_address)
}
unconstrained fn new(inner: Field, counter: u32) -> Counted<Field> {
    {
        let inner = inner;
        let counter = counter;
        (inner, counter)
    }
}
unconstrained fn silo_note_hash(note_hash: Scoped<Counted<NoteHash>>) -> Scoped<Counted<NoteHash>> {
    let mut siloed = note_hash;
    siloed.inner.inner = compute_siloed_note_hash(note_hash.contract_address, innermost(note_hash));
    siloed.contract_address = zero();
    siloed
}
unconstrained fn uniquify_siloed_note_hash(siloed_note_hash: Scoped<Counted<NoteHash>>, first_nullifier: Field, index_in_tx: u32) -> Scoped<Counted<NoteHash>> {
    let mut uniquified = siloed_note_hash;
    uniquified.inner.inner = compute_note_nonce_and_unique_note_hash(siloed_note_hash.inner.inner, first_nullifier, index_in_tx);
    uniquified
}
unconstrained fn is_non_revertible(self: Scoped<Counted<Field>>, is_private_only: bool, claimed_revertible_counter: u32) -> bool {
    is_non_revertible(self.inner, is_private_only, claimed_revertible_counter)
}
unconstrained fn sort_by_counter(array: [Scoped<Counted<Nullifier>>; 64]) -> [Scoped<Counted<Nullifier>>; 64] {
    sort_via((&array), (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding))
}
unconstrained fn push(self: &mut ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, item: Scoped<Counted<Nullifier>>) -> () {
    assert(((*self).length != 64), "Array full");
    let next_index = (*self).length;
    (*self).array[next_index] = item;
    (*self).length = ((*self).length + 1)
}
unconstrained fn scope(self: Counted<Nullifier>, contract_address: AztecAddress) -> Scoped<Counted<Nullifier>> {
    new(self, contract_address)
}
unconstrained fn count(self: Nullifier, counter: u32) -> Counted<Nullifier> {
    new(self, counter)
}
unconstrained fn silo_nullifier(nullifier: Scoped<Counted<Nullifier>>) -> Scoped<Counted<Nullifier>> {
    let mut siloed = nullifier;
    siloed.inner.inner.value = compute_siloed_nullifier(nullifier.contract_address, innermost(nullifier).value);
    siloed.contract_address = zero();
    siloed
}
unconstrained fn sort_by_counter(array: [Scoped<Counted<PrivateLogData>>; 64]) -> [Scoped<Counted<PrivateLogData>>; 64] {
    sort_via((&array), (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding))
}
unconstrained fn check_padded_items(padded_items: [Log<16>; 64], num_original_items: u32, capped_size: u32) -> u32 {
    let mut seen_empty = false;
    let mut num_padded_items = 0;
    for i in 0 .. 64 {
        let item_is_empty = is_empty(padded_items[i]);
        if ((i < num_original_items) | (i >= capped_size)) {
            assert(item_is_empty, "padded items should be empty outside of the range [num_original_items, capped_size)");
        } else {
            assert((item_is_empty | (!seen_empty)), "non-empty padded items should be consecutive within the range [num_original_items, capped_size)");
            seen_empty = (seen_empty | item_is_empty);
            num_padded_items = (num_padded_items + (1 * ((!item_is_empty) as u32)))
        }
    };
    num_padded_items
}
unconstrained fn push(self: &mut ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, item: Scoped<Counted<PrivateLogData>>) -> () {
    assert(((*self).length != 64), "Array full");
    let next_index = (*self).length;
    (*self).array[next_index] = item;
    (*self).length = ((*self).length + 1)
}
unconstrained fn scope(self: Counted<PrivateLogData>, contract_address: AztecAddress) -> Scoped<Counted<PrivateLogData>> {
    new(self, contract_address)
}
unconstrained fn count(self: PrivateLogData, counter: u32) -> Counted<PrivateLogData> {
    new(self, counter)
}
unconstrained fn silo_private_log(private_log: Scoped<Counted<PrivateLogData>>) -> Scoped<Counted<PrivateLogData>> {
    let mut siloed = private_log;
    siloed.inner.inner.log = compute_siloed_private_log(private_log.contract_address, innermost(private_log).log);
    siloed.contract_address = zero();
    siloed
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
#[no_predicates]
unconstrained fn poseidon2_hash_with_separator(inputs: [Field; 2], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
unconstrained fn build_derived_hints(note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64>, nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>, logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, expected_kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64>, transient_data_squashing_hints: [TransientDataSquashingHint; 64]) -> DerivedHints<64, 64, 64, 64> {
    let num_active_squashing_hints = get_num_active_squashing_hints(transient_data_squashing_hints, nullifiers);
    let nullifier_index_sorted_tuples = build_nullifier_index_sorted_tuples(transient_data_squashing_hints);
    let note_hash_squash_flags = build_note_hash_squash_flags(transient_data_squashing_hints, num_active_squashing_hints);
    let nullifier_squash_flags = build_nullifier_squash_flags(transient_data_squashing_hints, num_active_squashing_hints);
    let note_log_linked_source_indices = build_note_log_linked_source_indices(logs, note_hashes, expected_kept_note_hashes, transient_data_squashing_hints);
    {
        let num_active_squashing_hints = num_active_squashing_hints;
        let nullifier_index_sorted_tuples = nullifier_index_sorted_tuples;
        let note_hash_squash_flags = note_hash_squash_flags;
        let nullifier_squash_flags = nullifier_squash_flags;
        let note_log_linked_source_indices = note_log_linked_source_indices;
        (num_active_squashing_hints, nullifier_index_sorted_tuples, note_hash_squash_flags, nullifier_squash_flags, note_log_linked_source_indices)
    }
}
fn lambda(value: Field) -> ((Field, u32), (Field,)) {
    {
        let _ = if (value != 0) {
            (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
        } else {
            (0, {
                // >>> inlined call: zero;
                {
                    {
                        let inner = 0;
                        (inner)
                    }
                }
            })
        };
        let counter = _.0;
        let contract_address = _.1
    };
    {
        // >>> inlined call: scope;
        let __arg_0 = {
            // >>> inlined call: new;
            let __arg_0 = value;
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
        };
        let __arg_1 = contract_address;
        let self = __arg_0;
        let contract_address = __arg_1;
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
unconstrained fn zero() -> AztecAddress {
    {
        let inner = 0;
        (inner)
    }
}
unconstrained fn lambda(value: Field) -> ((Field, u32), (Field,)) {
    {
        let _ = if (value != 0) {
            (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
        } else {
            (0, zero())
        };
        let counter = _.0;
        let contract_address = _.1
    };
    scope(new(value, counter), contract_address)
}
fn lambda(mut env: (ResetOutputValidator<64, 64, 64, 64, 64, 64>,), prev: ((Field, u32), (Field,)), out: ((Field, u32), (Field,)), index: u32) -> () {
    {
        // >>> inlined call: assert_correctly_siloed_note_hash;
        let __arg_0 = {
            // >>> inlined call: innermost;
            let self = out;
            {
                self.inner.inner
            }
        };
        let __arg_1 = prev;
        let __arg_2 = index;
        let __arg_3 = env.0.output.claimed_first_nullifier;
        let __arg_4 = env.0.output.is_private_only;
        let __arg_5 = env.0.output.claimed_revertible_counter;
        let out_note_hash = __arg_0;
        let prev = __arg_1;
        let index = __arg_2;
        let claimed_first_nullifier = __arg_3;
        let is_private_only = __arg_4;
        let claimed_revertible_counter = __arg_5;
        {
            {
                let _ = if {
                    // >>> inlined call: is_zero;
                    let self = prev.contract_address;
                    {
                        (self.inner == 0)
                    }
                } {
                    (0, 0)
                } else {
                    let siloed = {
                        // >>> inlined call: compute_siloed_note_hash;
                        let contract_address = prev.contract_address;
                        let note_hash = {
                            // >>> inlined call: innermost;
                            let self = prev;
                            {
                                self.inner.inner
                            }
                        };
                        {
                            poseidon2_hash_with_separator([{
                                // >>> inlined call: to_field;
                                let self = contract_address;
                                {
                                    self.inner
                                }
                            }, note_hash], DOM_SEP__SILOED_NOTE_HASH)
                        }
                    };
                    let unique = {
                        // >>> inlined call: compute_note_nonce_and_unique_note_hash;
                        let siloed_note_hash = siloed;
                        let first_nullifier = claimed_first_nullifier;
                        let note_index_in_tx = index;
                        {
                            let note_nonce = {
                                // >>> inlined call: compute_note_hash_nonce;
                                let __arg_0 = first_nullifier;
                                let __arg_1 = note_index_in_tx;
                                let first_nullifier_in_tx = __arg_0;
                                let note_index_in_tx = __arg_1;
                                {
                                    poseidon2_hash_with_separator([first_nullifier_in_tx, (note_index_in_tx as Field)], DOM_SEP__NOTE_HASH_NONCE)
                                }
                            };
                            {
                                // >>> inlined call: compute_unique_note_hash;
                                let __arg_0 = note_nonce;
                                let __arg_1 = siloed_note_hash;
                                let note_nonce = __arg_0;
                                let siloed_note_hash = __arg_1;
                                {
                                    let inputs = [note_nonce, siloed_note_hash];
                                    poseidon2_hash_with_separator(inputs, DOM_SEP__UNIQUE_NOTE_HASH)
                                }
                            }
                        }
                    };
                    (siloed, unique)
                };
                let siloed_note_hash = _.0;
                let unique_siloed_note_hash = _.1
            };
            let computed_note_hash = if {
                // >>> inlined call: is_non_revertible;
                let __arg_0 = prev;
                let __arg_1 = is_private_only;
                let __arg_2 = claimed_revertible_counter;
                let self = __arg_0;
                let is_private_only = __arg_1;
                let claimed_revertible_counter = __arg_2;
                {
                    {
                        // >>> inlined call: is_non_revertible;
                        let __arg_0 = self.inner;
                        let __arg_1 = is_private_only;
                        let __arg_2 = claimed_revertible_counter;
                        let self = __arg_0;
                        let is_private_only = __arg_1;
                        let claimed_revertible_counter = __arg_2;
                        {
                            (is_private_only | (self.counter < claimed_revertible_counter))
                        }
                    }
                }
            } {
                unique_siloed_note_hash
            } else {
                siloed_note_hash
            };
            assert((out_note_hash == computed_note_hash), "Output note hash does not match correctly-siloed note hash");
        }
    };
    assert({
        // >>> inlined call: is_zero;
        let self = out.contract_address;
        {
            (self.inner == 0)
        }
    }, "The contract_address of a siloed note hash should be set to 0");
}
unconstrained fn lambda(mut env: (ResetOutputValidator<64, 64, 64, 64, 64, 64>,), prev: ((Field, u32), (Field,)), out: ((Field, u32), (Field,)), index: u32) -> () {
    assert_correctly_siloed_note_hash(innermost(out), prev, index, env.0.output.claimed_first_nullifier, env.0.output.is_private_only, env.0.output.claimed_revertible_counter);
    assert(is_zero(out.contract_address), "The contract_address of a siloed note hash should be set to 0");
}
unconstrained fn assert_correctly_siloed_note_hash(out_note_hash: Field, prev: Scoped<Counted<NoteHash>>, index: u32, claimed_first_nullifier: Field, is_private_only: bool, claimed_revertible_counter: u32) -> () {
    {
        let _ = if is_zero(prev.contract_address) {
            (0, 0)
        } else {
            let siloed = compute_siloed_note_hash(prev.contract_address, innermost(prev));
            let unique = compute_note_nonce_and_unique_note_hash(siloed, claimed_first_nullifier, index);
            (siloed, unique)
        };
        let siloed_note_hash = _.0;
        let unique_siloed_note_hash = _.1
    };
    let computed_note_hash = if is_non_revertible(prev, is_private_only, claimed_revertible_counter) {
        unique_siloed_note_hash
    } else {
        siloed_note_hash
    };
    assert((out_note_hash == computed_note_hash), "Output note hash does not match correctly-siloed note hash");
}
unconstrained fn is_zero(self: AztecAddress) -> bool {
    (self.inner == 0)
}
fn lambda(value: Field) -> Scoped<Counted<Nullifier>> {
    {
        let _ = if (value != 0) {
            (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
        } else {
            (0, {
                // >>> inlined call: zero;
                {
                    {
                        let inner = 0;
                        (inner)
                    }
                }
            })
        };
        let counter = _.0;
        let contract_address = _.1
    };
    {
        // >>> inlined call: scope;
        let __arg_0 = {
            // >>> inlined call: count;
            let __arg_0 = {
                let value = value;
                let note_hash = 0;
                (value, note_hash)
            };
            let __arg_1 = counter;
            let self = __arg_0;
            let counter = __arg_1;
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
        let __arg_1 = contract_address;
        let self = __arg_0;
        let contract_address = __arg_1;
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
unconstrained fn lambda(value: Field) -> Scoped<Counted<Nullifier>> {
    {
        let _ = if (value != 0) {
            (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
        } else {
            (0, zero())
        };
        let counter = _.0;
        let contract_address = _.1
    };
    scope(count({
        let value = value;
        let note_hash = 0;
        (value, note_hash)
    }, counter), contract_address)
}
fn lambda(prev: Scoped<Counted<Nullifier>>, out: Scoped<Counted<Nullifier>>) -> () {
    {
        // >>> inlined call: assert_correctly_siloed_nullifier;
        let __arg_0 = {
            // >>> inlined call: innermost;
            let self = out;
            {
                self.inner.inner
            }
        }.value;
        let __arg_1 = prev;
        let out_nullifier = __arg_0;
        let prev = __arg_1;
        {
            let siloed_nullifier = if {
                // >>> inlined call: is_zero;
                let self = prev.contract_address;
                {
                    (self.inner == 0)
                }
            } {
                0
            } else {
                {
                    // >>> inlined call: compute_siloed_nullifier;
                    let contract_address = prev.contract_address;
                    let nullifier = {
                        // >>> inlined call: innermost;
                        let self = prev;
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
                }
            };
            assert((out_nullifier == siloed_nullifier), "Output nullifier does not match correctly-siloed nullifier");
        }
    };
    assert(({
        // >>> inlined call: innermost;
        let self = out;
        {
            self.inner.inner
        }
    }.note_hash == {
        // >>> inlined call: innermost;
        let self = prev;
        {
            self.inner.inner
        }
    }.note_hash), "Linked note hash not copied correctly");
    assert({
        // >>> inlined call: is_zero;
        let self = out.contract_address;
        {
            (self.inner == 0)
        }
    }, "The contract_address of a siloed nullifier should be set to 0");
}
unconstrained fn assert_correctly_siloed_nullifier(out_nullifier: Field, prev: Scoped<Counted<Nullifier>>) -> () {
    let siloed_nullifier = if is_zero(prev.contract_address) {
        0
    } else {
        compute_siloed_nullifier(prev.contract_address, innermost(prev).value)
    };
    assert((out_nullifier == siloed_nullifier), "Output nullifier does not match correctly-siloed nullifier");
}
unconstrained fn lambda(prev: Scoped<Counted<Nullifier>>, out: Scoped<Counted<Nullifier>>) -> () {
    assert_correctly_siloed_nullifier(innermost(out).value, prev);
    assert((innermost(out).note_hash == innermost(prev).note_hash), "Linked note hash not copied correctly");
    assert(is_zero(out.contract_address), "The contract_address of a siloed nullifier should be set to 0");
}
fn lambda(log: Log<16>) -> Scoped<Counted<PrivateLogData>> {
    {
        let _ = if (log.length != 0) {
            (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
        } else {
            (0, {
                // >>> inlined call: zero;
                {
                    {
                        let inner = 0;
                        (inner)
                    }
                }
            })
        };
        let counter = _.0;
        let contract_address = _.1
    };
    {
        // >>> inlined call: scope;
        let __arg_0 = {
            // >>> inlined call: count;
            let __arg_0 = {
                let log = log;
                let note_hash_counter = 0;
                (log, note_hash_counter)
            };
            let __arg_1 = counter;
            let self = __arg_0;
            let counter = __arg_1;
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
        let __arg_1 = contract_address;
        let self = __arg_0;
        let contract_address = __arg_1;
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
unconstrained fn lambda(log: Log<16>) -> Scoped<Counted<PrivateLogData>> {
    {
        let _ = if (log.length != 0) {
            (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
        } else {
            (0, zero())
        };
        let counter = _.0;
        let contract_address = _.1
    };
    scope(count({
        let log = log;
        let note_hash_counter = 0;
        (log, note_hash_counter)
    }, counter), contract_address)
}
fn lambda(prev: Scoped<Counted<PrivateLogData>>, out: Scoped<Counted<PrivateLogData>>) -> () {
    {
        // >>> inlined call: assert_valid_siloed_private_log;
        let __arg_0 = {
            // >>> inlined call: innermost;
            let self = out;
            {
                self.inner.inner
            }
        }.log;
        let __arg_1 = prev;
        let out = __arg_0;
        let prev = __arg_1;
        {
            let prev_log_fields = {
                // >>> inlined call: innermost;
                let self = prev;
                {
                    self.inner.inner
                }
            }.log.fields;
            let expected_first_field = if {
                // >>> inlined call: is_zero;
                let self = prev.contract_address;
                {
                    (self.inner == 0)
                }
            } {
                0
            } else {
                {
                    // >>> inlined call: compute_siloed_private_log_first_field;
                    let contract_address = prev.contract_address;
                    let field = prev_log_fields[0];
                    {
                        poseidon2_hash_with_separator([{
                            // >>> inlined call: to_field;
                            let self = contract_address;
                            {
                                self.inner
                            }
                        }, field], DOM_SEP__PRIVATE_LOG_FIRST_FIELD)
                    }
                }
            };
            assert((out.fields[0] == expected_first_field), "Output private log first field does not match correctly-siloed private log first field");
            for i in 1 .. out.fields.len() {
                assert((out.fields[i] == prev_log_fields[i]), "Fields of the private log not copied correctly");
            };
            assert((out.length == {
                // >>> inlined call: innermost;
                let self = prev;
                {
                    self.inner.inner
                }
            }.log.length), "Length of the private log not copied correctly");
        }
    };
    assert(({
        // >>> inlined call: innermost;
        let self = out;
        {
            self.inner.inner
        }
    }.note_hash_counter == {
        // >>> inlined call: innermost;
        let self = prev;
        {
            self.inner.inner
        }
    }.note_hash_counter), "Linked note_hash_counter of the private log not copied correctly");
    assert({
        // >>> inlined call: is_zero;
        let self = out.contract_address;
        {
            (self.inner == 0)
        }
    }, "The contract_address of a siloed private log should be set to 0");
}
unconstrained fn assert_valid_siloed_private_log(out: PrivateLog, prev: Scoped<Counted<PrivateLogData>>) -> () {
    let prev_log_fields = innermost(prev).log.fields;
    let expected_first_field = if is_zero(prev.contract_address) {
        0
    } else {
        compute_siloed_private_log_first_field(prev.contract_address, prev_log_fields[0])
    };
    assert((out.fields[0] == expected_first_field), "Output private log first field does not match correctly-siloed private log first field");
    for i in 1 .. out.fields.len() {
        assert((out.fields[i] == prev_log_fields[i]), "Fields of the private log not copied correctly");
    };
    assert((out.length == innermost(prev).log.length), "Length of the private log not copied correctly");
}
unconstrained fn lambda(prev: Scoped<Counted<PrivateLogData>>, out: Scoped<Counted<PrivateLogData>>) -> () {
    assert_valid_siloed_private_log(innermost(out).log, prev);
    assert((innermost(out).note_hash_counter == innermost(prev).note_hash_counter), "Linked note_hash_counter of the private log not copied correctly");
    assert(is_zero(out.contract_address), "The contract_address of a siloed private log should be set to 0");
}
unconstrained fn eq(_self: L2ToL1Message, _other: L2ToL1Message) -> bool {
    (eq(_self.recipient, _other.recipient) & (_self.content == _other.content))
}
unconstrained fn eq(_self: AztecAddress, _other: AztecAddress) -> bool {
    (_self.inner == _other.inner)
}
unconstrained fn empty() -> L2ToL1Message {
    {
        let recipient = empty();
        let content = 0;
        (recipient, content)
    }
}
unconstrained fn empty() -> AztecAddress {
    {
        let inner = 0;
        (inner)
    }
}
unconstrained fn new(inner: L2ToL1Message, contract_address: AztecAddress) -> Scoped<L2ToL1Message> {
    {
        let inner = inner;
        let contract_address = contract_address;
        (inner, contract_address)
    }
}
unconstrained fn eq(self: [Field; 16], other: [Field; 16]) -> bool {
    let mut result = true;
    for i in 0 .. self.len() {
        {
            let op_rhs_0 = eq(self[i], other[i]);
            result = (result & op_rhs_0)
        }
    };
    result
}
unconstrained fn eq(self: Counted<LogHash>, other: Counted<LogHash>) -> bool {
    (eq(self.inner, other.inner) & (self.counter == other.counter))
}
unconstrained fn empty() -> Counted<LogHash> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
unconstrained fn transform_array(array: ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8>, f: unconstrained fn[()]([Scoped<Counted<L2ToL1Message>>; 8]) -> [Scoped<Counted<L2ToL1Message>>; 8]) -> ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8> {
    let len = array.length;
    let transformed = f.1(array.array);
    let mut transformed_array = array;
    for i in 0 .. 8 {
        if (i < len) {
            transformed_array.array[i] = transformed[i]
        }
    };
    transformed_array
}
unconstrained fn sort_by_counter(array: [Scoped<Counted<L2ToL1Message>>; 8]) -> [Scoped<Counted<L2ToL1Message>>; 8] {
    sort_via((&array), (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding))
}
unconstrained fn transform_array(array: ClaimedLengthArray<Scoped<Counted<LogHash>>, 1>, f: unconstrained fn[()]([Scoped<Counted<LogHash>>; 1]) -> [Scoped<Counted<LogHash>>; 1]) -> ClaimedLengthArray<Scoped<Counted<LogHash>>, 1> {
    let len = array.length;
    let transformed = f.1(array.array);
    let mut transformed_array = array;
    for i in 0 .. 1 {
        if (i < len) {
            transformed_array.array[i] = transformed[i]
        }
    };
    transformed_array
}
unconstrained fn sort_by_counter(array: [Scoped<Counted<LogHash>>; 1]) -> [Scoped<Counted<LogHash>>; 1] {
    sort_via((&array), (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding))
}
unconstrained fn transform_array(array: ClaimedLengthArray<Counted<PublicCallRequest>, 32>, f: unconstrained fn[()]([Counted<PublicCallRequest>; 32]) -> [Counted<PublicCallRequest>; 32]) -> ClaimedLengthArray<Counted<PublicCallRequest>, 32> {
    let len = array.length;
    let transformed = f.1(array.array);
    let mut transformed_array = array;
    for i in 0 .. 32 {
        if (i < len) {
            transformed_array.array[i] = transformed[i]
        }
    };
    transformed_array
}
unconstrained fn sort_by_counter(array: [Counted<PublicCallRequest>; 32]) -> [Counted<PublicCallRequest>; 32] {
    sort_via((&array), (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding))
}
unconstrained fn empty() -> PrivateAccumulatedData {
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
unconstrained fn counter(self: Scoped<Counted<Nullifier>>) -> u32 {
    self.inner.counter
}
unconstrained fn counter(self: Scoped<Counted<L2ToL1Message>>) -> u32 {
    self.inner.counter
}
unconstrained fn push(self: &mut ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8>, item: Scoped<Counted<L2ToL1Message>>) -> () {
    assert(((*self).length != 8), "Array full");
    let next_index = (*self).length;
    (*self).array[next_index] = item;
    (*self).length = ((*self).length + 1)
}
unconstrained fn counter(self: Scoped<Counted<PrivateLogData>>) -> u32 {
    self.inner.counter
}
unconstrained fn counter(self: Scoped<Counted<LogHash>>) -> u32 {
    self.inner.counter
}
unconstrained fn push(self: &mut ClaimedLengthArray<Scoped<Counted<LogHash>>, 1>, item: Scoped<Counted<LogHash>>) -> () {
    assert(((*self).length != 1), "Array full");
    let next_index = (*self).length;
    (*self).array[next_index] = item;
    (*self).length = ((*self).length + 1)
}
unconstrained fn counter(self: Counted<PublicCallRequest>) -> u32 {
    self.counter
}
unconstrained fn push(self: &mut ClaimedLengthArray<Counted<PublicCallRequest>, 32>, item: Counted<PublicCallRequest>) -> () {
    assert(((*self).length != 32), "Array full");
    let next_index = (*self).length;
    (*self).array[next_index] = item;
    (*self).length = ((*self).length + 1)
}
unconstrained fn expose_to_public(data: PrivateAccumulatedData) -> PrivateToPublicAccumulatedData {
    {
        let note_hashes = map((&data.note_hashes.array), lambda);
        let nullifiers = map((&data.nullifiers.array), lambda);
        let l2_to_l1_msgs = map((&data.l2_to_l1_msgs.array), lambda);
        let private_logs = map((&data.private_logs.array), lambda);
        let contract_class_logs_hashes = map((&data.contract_class_logs_hashes.array), lambda);
        let public_call_requests = map((&data.public_call_requests.array), lambda);
        (note_hashes, nullifiers, l2_to_l1_msgs, private_logs, contract_class_logs_hashes, public_call_requests)
    }
}
unconstrained fn fold(self: &[Scoped<Counted<PrivateLogData>>; 64], mut accumulator: u32, f: fn[()](u32, Scoped<Counted<PrivateLogData>>) -> u32) -> u32 {
    {
        let $i0 = self;
        for $i1 in 0 .. (*$i0).len() {
            let elem = (*$i0)[$i1];
            {
                accumulator = f.1(accumulator, elem)
            }
        }
    };
    accumulator
}
unconstrained fn lambda(acc: u32, l: Scoped<Counted<PrivateLogData>>) -> u32 {
    (acc + innermost(l).log.length)
}
unconstrained fn lambda(acc: u32, l: Scoped<Counted<PrivateLogData>>) -> u32 {
    (acc + innermost(l).log.length)
}
unconstrained fn fold(self: &[Scoped<Counted<LogHash>>; 1], mut accumulator: u32, f: fn[()](u32, Scoped<Counted<LogHash>>) -> u32) -> u32 {
    {
        let $i0 = self;
        for $i1 in 0 .. (*$i0).len() {
            let elem = (*$i0)[$i1];
            {
                accumulator = f.1(accumulator, elem)
            }
        }
    };
    accumulator
}
unconstrained fn lambda(acc: u32, l: Scoped<Counted<LogHash>>) -> u32 {
    (acc + innermost(l).length)
}
unconstrained fn lambda(acc: u32, l: Scoped<Counted<LogHash>>) -> u32 {
    (acc + innermost(l).length)
}
unconstrained fn empty() -> Gas {
    new(0, 0)
}
unconstrained fn public_tx_overhead() -> Gas {
    {
        let da_gas = TX_DA_GAS_OVERHEAD;
        let l2_gas = PUBLIC_TX_L2_GAS_OVERHEAD;
        (da_gas, l2_gas)
    }
}
unconstrained fn private_tx_overhead() -> Gas {
    {
        let da_gas = TX_DA_GAS_OVERHEAD;
        let l2_gas = PRIVATE_TX_L2_GAS_OVERHEAD;
        (da_gas, l2_gas)
    }
}
unconstrained fn new(da_gas: u32, l2_gas: u32) -> Gas {
    {
        let da_gas = da_gas;
        let l2_gas = l2_gas;
        (da_gas, l2_gas)
    }
}
unconstrained fn add(self: Gas, other: Gas) -> Gas {
    new((self.da_gas + other.da_gas), (self.l2_gas + other.l2_gas))
}
unconstrained fn cmp(self: u64, other: u64) -> Ordering {
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
unconstrained fn hash(self: ProtocolContracts) -> Field {
    poseidon2_hash_with_separator(map((&self.derived_addresses), lambda), DOM_SEP__PROTOCOL_CONTRACTS)
}
unconstrained fn find_first_index(array: [Scoped<Counted<Field>>; 64], find: fn[(u32,)](Scoped<Counted<Field>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: FunctionSelector, n: ((Field, u32), (Field,))) -> bool {
    ((counter(n) >= env.0) | (counter(n) == 0))
}
unconstrained fn counter(self: Scoped<Counted<Field>>) -> u32 {
    self.inner.counter
}
unconstrained fn find_first_index(array: [Scoped<Counted<Field>>; 64], find: fn[()](Scoped<Counted<Field>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(n: ((Field, u32), (Field,))) -> bool {
    (counter(n) == MAX_U32_VALUE)
}
unconstrained fn lambda(n: ((Field, u32), (Field,))) -> bool {
    (counter(n) == MAX_U32_VALUE)
}
unconstrained fn find_first_index(array: [Scoped<Counted<Nullifier>>; 64], find: fn[(u32,)](Scoped<Counted<Nullifier>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: FunctionSelector, n: Scoped<Counted<Nullifier>>) -> bool {
    ((counter(n) >= env.0) | (counter(n) == 0))
}
unconstrained fn counter(self: Scoped<Counted<Nullifier>>) -> u32 {
    self.inner.counter
}
unconstrained fn find_first_index(array: [Scoped<Counted<Nullifier>>; 64], find: fn[()](Scoped<Counted<Nullifier>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(n: Scoped<Counted<Nullifier>>) -> bool {
    (counter(n) == MAX_U32_VALUE)
}
unconstrained fn lambda(n: Scoped<Counted<Nullifier>>) -> bool {
    (counter(n) == MAX_U32_VALUE)
}
unconstrained fn find_first_index(array: [Scoped<Counted<PrivateLogData>>; 64], find: fn[(u32,)](Scoped<Counted<PrivateLogData>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: FunctionSelector, n: Scoped<Counted<PrivateLogData>>) -> bool {
    ((counter(n) >= env.0) | (counter(n) == 0))
}
unconstrained fn counter(self: Scoped<Counted<PrivateLogData>>) -> u32 {
    self.inner.counter
}
unconstrained fn find_first_index(array: [Scoped<Counted<PrivateLogData>>; 64], find: fn[()](Scoped<Counted<PrivateLogData>>) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(n: Scoped<Counted<PrivateLogData>>) -> bool {
    (counter(n) == MAX_U32_VALUE)
}
unconstrained fn lambda(n: Scoped<Counted<PrivateLogData>>) -> bool {
    (counter(n) == MAX_U32_VALUE)
}
unconstrained fn get_split_order_hints(original_array: [Scoped<Counted<L2ToL1Message>>; 8], split_counter: u32) -> SplitOrderHints<8> {
    let sorted_tuples = get_sorted_tuples(original_array, (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding));
    let mut sorted_counters_lt = [0; 8];
    let mut sorted_counters_gte = [0; 8];
    let mut sorted_indexes = [0; 8];
    let mut num_lt = 0;
    let mut num_gte = 0;
    let mut found_split = false;
    for i in 0 .. 8 {
        let elem = sorted_tuples[i].elem;
        if (!is_empty(elem)) {
            let is_gte = ((counter(elem) >= split_counter) & (counter(elem) != 0));
            found_split = (found_split | is_gte);
            if (!found_split) {
                sorted_counters_lt[num_lt] = counter(elem);
                num_lt = (num_lt + 1)
            } else {
                sorted_counters_gte[num_gte] = counter(elem);
                num_gte = (num_gte + 1)
            };
            let original_index = sorted_tuples[i].original_index;
            sorted_indexes[original_index] = if (!found_split) {
                i
            } else {
                (i - num_lt)
            }
        }
    };
    {
        let sorted_counters_lt = sorted_counters_lt;
        let sorted_counters_gte = sorted_counters_gte;
        let sorted_indexes = sorted_indexes;
        (sorted_counters_lt, sorted_counters_gte, sorted_indexes)
    }
}
unconstrained fn get_split_order_hints(original_array: [Scoped<Counted<LogHash>>; 1], split_counter: u32) -> SplitOrderHints<1> {
    let sorted_tuples = get_sorted_tuples(original_array, (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding));
    let mut sorted_counters_lt = [0; 1];
    let mut sorted_counters_gte = [0; 1];
    let mut sorted_indexes = [0; 1];
    let mut num_lt = 0;
    let mut num_gte = 0;
    let mut found_split = false;
    for i in 0 .. 1 {
        let elem = sorted_tuples[i].elem;
        if (!is_empty(elem)) {
            let is_gte = ((counter(elem) >= split_counter) & (counter(elem) != 0));
            found_split = (found_split | is_gte);
            if (!found_split) {
                sorted_counters_lt[num_lt] = counter(elem);
                num_lt = (num_lt + 1)
            } else {
                sorted_counters_gte[num_gte] = counter(elem);
                num_gte = (num_gte + 1)
            };
            let original_index = sorted_tuples[i].original_index;
            sorted_indexes[original_index] = if (!found_split) {
                i
            } else {
                (i - num_lt)
            }
        }
    };
    {
        let sorted_counters_lt = sorted_counters_lt;
        let sorted_counters_gte = sorted_counters_gte;
        let sorted_indexes = sorted_indexes;
        (sorted_counters_lt, sorted_counters_gte, sorted_indexes)
    }
}
unconstrained fn scope(self: LogHash, contract_address: AztecAddress) -> Scoped<LogHash> {
    new(self, contract_address)
}
unconstrained fn eq(_self: LogHash, _other: LogHash) -> bool {
    ((_self.value == _other.value) & (_self.length == _other.length))
}
unconstrained fn get_split_order_hints(original_array: [Counted<PublicCallRequest>; 32], split_counter: u32) -> SplitOrderHints<32> {
    let sorted_tuples = get_sorted_tuples(original_array, (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding));
    let mut sorted_counters_lt = [0; 32];
    let mut sorted_counters_gte = [0; 32];
    let mut sorted_indexes = [0; 32];
    let mut num_lt = 0;
    let mut num_gte = 0;
    let mut found_split = false;
    for i in 0 .. 32 {
        let elem = sorted_tuples[i].elem;
        if (!is_empty(elem)) {
            let is_gte = ((counter(elem) >= split_counter) & (counter(elem) != 0));
            found_split = (found_split | is_gte);
            if (!found_split) {
                sorted_counters_lt[num_lt] = counter(elem);
                num_lt = (num_lt + 1)
            } else {
                sorted_counters_gte[num_gte] = counter(elem);
                num_gte = (num_gte + 1)
            };
            let original_index = sorted_tuples[i].original_index;
            sorted_indexes[original_index] = if (!found_split) {
                i
            } else {
                (i - num_lt)
            }
        }
    };
    {
        let sorted_counters_lt = sorted_counters_lt;
        let sorted_counters_gte = sorted_counters_gte;
        let sorted_indexes = sorted_indexes;
        (sorted_counters_lt, sorted_counters_gte, sorted_indexes)
    }
}
fn lambda(acc: u32, l: Scoped<Counted<PrivateLogData>>) -> u32 {
    (acc + {
        // >>> inlined call: innermost;
        let self = l;
        {
            self.inner.inner
        }
    }.log.length)
}
unconstrained fn lambda(acc: u32, l: Scoped<Counted<PrivateLogData>>) -> u32 {
    (acc + innermost(l).log.length)
}
fn lambda(acc: u32, l: Scoped<Counted<LogHash>>) -> u32 {
    (acc + {
        // >>> inlined call: innermost;
        let self = l;
        {
            self.inner.inner
        }
    }.length)
}
unconstrained fn lambda(acc: u32, l: Scoped<Counted<LogHash>>) -> u32 {
    (acc + innermost(l).length)
}
unconstrained fn get_num_active_squashing_hints(transient_data_squashing_hints: [TransientDataSquashingHint; 64], _nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64>) -> u32 {
    find_first_index(transient_data_squashing_hints, lambda)
}
unconstrained fn build_note_hash_squash_flags(transient_data_squashing_hints: [TransientDataSquashingHint; 64], num_active_squashing_hints: u32) -> [bool; 64] {
    let mut note_hash_squash_flags = [false; 64];
    for i in 0 .. num_active_squashing_hints {
        let note_hash_index = transient_data_squashing_hints[i].note_hash_index;
        note_hash_squash_flags[note_hash_index] = true
    };
    note_hash_squash_flags
}
unconstrained fn build_nullifier_squash_flags(transient_data_squashing_hints: [TransientDataSquashingHint; 64], num_active_squashing_hints: u32) -> [bool; 64] {
    let mut nullifier_squash_flags = [false; 64];
    for i in 0 .. num_active_squashing_hints {
        let nullifier_index = transient_data_squashing_hints[i].nullifier_index;
        nullifier_squash_flags[nullifier_index] = true
    };
    nullifier_squash_flags
}
unconstrained fn empty() -> ClaimedLengthArray<Scoped<Counted<Field>>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
unconstrained fn empty() -> ClaimedLengthArray<Scoped<Counted<Nullifier>>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
unconstrained fn empty() -> ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
unconstrained fn any(self: &[Scoped<Counted<Field>>; 64], predicate: fn[(u32,)](Scoped<Counted<Field>>) -> bool) -> bool {
    let mut ret = false;
    {
        let $i0 = self;
        for $i1 in 0 .. (*$i0).len() {
            let elem = (*$i0)[$i1];
            {
                {
                    let op_rhs_0 = {
                        let tmp = predicate.1;
                        tmp.1(tmp.0, elem)
                    };
                    ret = (ret | op_rhs_0)
                }
            }
        }
    };
    ret
}
unconstrained fn lambda(mut env: FunctionSelector, n: ((Field, u32), (Field,))) -> bool {
    (counter(n) == env.0)
}
unconstrained fn empty() -> ClaimedLengthArray<Scoped<KeyValidationRequestAndSeparator>, 64> {
    {
        let array = [empty(); 64];
        let length = 0;
        (array, length)
    }
}
unconstrained fn sort_via(self: &[Scoped<Counted<Field>>; 64], ordering: fn[()](Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool) -> [Scoped<Counted<Field>>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn compare_for_ascending_sort_with_empty_padding(a: Scoped<Counted<Field>>, b: Scoped<Counted<Field>>) -> bool {
    ((!is_empty(a)) & (is_empty(b) | (counter(a) < counter(b))))
}
unconstrained fn new(inner: Counted<Field>, contract_address: AztecAddress) -> Scoped<Counted<Field>> {
    {
        let inner = inner;
        let contract_address = contract_address;
        (inner, contract_address)
    }
}
unconstrained fn compute_siloed_note_hash(contract_address: AztecAddress, note_hash: Field) -> Field {
    poseidon2_hash_with_separator([to_field(contract_address), note_hash], DOM_SEP__SILOED_NOTE_HASH)
}
unconstrained fn compute_note_nonce_and_unique_note_hash(siloed_note_hash: Field, first_nullifier: Field, note_index_in_tx: u32) -> Field {
    let note_nonce = compute_note_hash_nonce(first_nullifier, note_index_in_tx);
    compute_unique_note_hash(note_nonce, siloed_note_hash)
}
unconstrained fn is_non_revertible(self: Counted<Field>, is_private_only: bool, claimed_revertible_counter: u32) -> bool {
    (is_private_only | (self.counter < claimed_revertible_counter))
}
unconstrained fn sort_via(self: &[Scoped<Counted<Nullifier>>; 64], ordering: fn[()](Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool) -> [Scoped<Counted<Nullifier>>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn compare_for_ascending_sort_with_empty_padding(a: Scoped<Counted<Nullifier>>, b: Scoped<Counted<Nullifier>>) -> bool {
    ((!is_empty(a)) & (is_empty(b) | (counter(a) < counter(b))))
}
unconstrained fn new(inner: Counted<Nullifier>, contract_address: AztecAddress) -> Scoped<Counted<Nullifier>> {
    {
        let inner = inner;
        let contract_address = contract_address;
        (inner, contract_address)
    }
}
unconstrained fn new(inner: Nullifier, counter: u32) -> Counted<Nullifier> {
    {
        let inner = inner;
        let counter = counter;
        (inner, counter)
    }
}
unconstrained fn compute_siloed_nullifier(contract_address: AztecAddress, nullifier: Field) -> Field {
    poseidon2_hash_with_separator([to_field(contract_address), nullifier], DOM_SEP__SILOED_NULLIFIER)
}
unconstrained fn sort_via(self: &[Scoped<Counted<PrivateLogData>>; 64], ordering: fn[()](Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool) -> [Scoped<Counted<PrivateLogData>>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn compare_for_ascending_sort_with_empty_padding(a: Scoped<Counted<PrivateLogData>>, b: Scoped<Counted<PrivateLogData>>) -> bool {
    ((!is_empty(a)) & (is_empty(b) | (counter(a) < counter(b))))
}
unconstrained fn new(inner: Counted<PrivateLogData>, contract_address: AztecAddress) -> Scoped<Counted<PrivateLogData>> {
    {
        let inner = inner;
        let contract_address = contract_address;
        (inner, contract_address)
    }
}
unconstrained fn new(inner: PrivateLogData, counter: u32) -> Counted<PrivateLogData> {
    {
        let inner = inner;
        let counter = counter;
        (inner, counter)
    }
}
unconstrained fn compute_siloed_private_log(contract_address: AztecAddress, log: PrivateLog) -> PrivateLog {
    let mut fields = log.fields;
    fields[0] = compute_siloed_private_log_first_field(contract_address, fields[0]);
    new(fields, log.length)
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
unconstrained fn build_nullifier_index_sorted_tuples(transient_data_squashing_hints: [TransientDataSquashingHint; 64]) -> [SortedTuple<u32>; 64] {
    let nullifier_indices = map((&transient_data_squashing_hints), lambda);
    get_sorted_tuples(nullifier_indices, lambda)
}
unconstrained fn build_note_log_linked_source_indices(logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, 64>, note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64>, kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, 64>, transient_data_squashing_hints: [TransientDataSquashingHint; 64]) -> [NoteLogLinkedSourceIndices; 64] {
    let mut linked_source_indices = [{
        let transient_data_squashing_hint_index = 0;
        let kept_note_hash_index = 0;
        (transient_data_squashing_hint_index, kept_note_hash_index)
    }; 64];
    for i in 0 .. logs.length {
        let log_note_hash_counter = innermost(logs.array[i]).note_hash_counter;
        if (log_note_hash_counter != 0) {
            let mut is_kept = false;
            for j in 0 .. kept_note_hashes.length {
                if (counter(kept_note_hashes.array[j]) == log_note_hash_counter) {
                    linked_source_indices[i].kept_note_hash_index = j;
                    is_kept = true;
                    break
                }
            };
            if (!is_kept) {
                let squashed_note_hash_index = find_first_index(note_hashes.array, {
                    let closure_variable = {
                        let env = (log_note_hash_counter);
                        ((env, lambda), (env, lambda))
                    };
                    closure_variable
                });
                let transient_data_squashing_hint_index = find_first_index(transient_data_squashing_hints, {
                    let closure_variable = {
                        let env = (squashed_note_hash_index);
                        ((env, lambda), (env, lambda))
                    };
                    closure_variable
                });
                linked_source_indices[i].transient_data_squashing_hint_index = transient_data_squashing_hint_index
            }
        }
    };
    linked_source_indices
}
unconstrained fn get_sorted_indexes(original_array: [Scoped<Counted<Field>>; 64]) -> [u32; 64] {
    get_order_hints(original_array).sorted_indexes
}
unconstrained fn get_num_padded_items(padded_items: [Scoped<Counted<Field>>; 64], original_array_length: u32, capped_size: u32) -> u32 {
    let mut num_padded_items = 0;
    for i in original_array_length .. capped_size {
        if (counter(padded_items[i]) == MAX_U32_VALUE) {
            num_padded_items = (num_padded_items + 1)
        }
    };
    num_padded_items
}
fn lambda(mut env: ((fn((((Field, Field), u32), (Field,)), (((Field, Field), u32), (Field,))) -> (), unconstrained fn((((Field, Field), u32), (Field,)), (((Field, Field), u32), (Field,))) -> ()),), prev: Scoped<Counted<Nullifier>>, out: Scoped<Counted<Nullifier>>, _i: u32) -> () {
    env.0.0(prev, out)
}
unconstrained fn lambda(mut env: ((fn((((Field, Field), u32), (Field,)), (((Field, Field), u32), (Field,))) -> (), unconstrained fn((((Field, Field), u32), (Field,)), (((Field, Field), u32), (Field,))) -> ()),), prev: Scoped<Counted<Nullifier>>, out: Scoped<Counted<Nullifier>>, _i: u32) -> () {
    env.0.1(prev, out)
}
fn lambda(mut env: ((fn((((([Field; 16], u32), u32), u32), (Field,)), (((([Field; 16], u32), u32), u32), (Field,))) -> (), unconstrained fn((((([Field; 16], u32), u32), u32), (Field,)), (((([Field; 16], u32), u32), u32), (Field,))) -> ()),), prev: Scoped<Counted<PrivateLogData>>, out: Scoped<Counted<PrivateLogData>>, _i: u32) -> () {
    env.0.0(prev, out)
}
unconstrained fn lambda(mut env: ((fn((((([Field; 16], u32), u32), u32), (Field,)), (((([Field; 16], u32), u32), u32), (Field,))) -> (), unconstrained fn((((([Field; 16], u32), u32), u32), (Field,)), (((([Field; 16], u32), u32), u32), (Field,))) -> ()),), prev: Scoped<Counted<PrivateLogData>>, out: Scoped<Counted<PrivateLogData>>, _i: u32) -> () {
    env.0.1(prev, out)
}
unconstrained fn compute_siloed_private_log_first_field(contract_address: AztecAddress, field: Field) -> Field {
    poseidon2_hash_with_separator([to_field(contract_address), field], DOM_SEP__PRIVATE_LOG_FIRST_FIELD)
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
unconstrained fn empty() -> LogHash {
    {
        let value = 0;
        let length = 0;
        (value, length)
    }
}
unconstrained fn sort_via(self: &[Scoped<Counted<L2ToL1Message>>; 8], ordering: fn[()](Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool) -> [Scoped<Counted<L2ToL1Message>>; 8] {
    if (8 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (8 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn compare_for_ascending_sort_with_empty_padding(a: Scoped<Counted<L2ToL1Message>>, b: Scoped<Counted<L2ToL1Message>>) -> bool {
    ((!is_empty(a)) & (is_empty(b) | (counter(a) < counter(b))))
}
unconstrained fn sort_via(self: &[Scoped<Counted<LogHash>>; 1], ordering: fn[()](Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool) -> [Scoped<Counted<LogHash>>; 1] {
    if (1 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (1 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn compare_for_ascending_sort_with_empty_padding(a: Scoped<Counted<LogHash>>, b: Scoped<Counted<LogHash>>) -> bool {
    ((!is_empty(a)) & (is_empty(b) | (counter(a) < counter(b))))
}
unconstrained fn sort_via(self: &[Counted<PublicCallRequest>; 32], ordering: fn[()](Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool) -> [Counted<PublicCallRequest>; 32] {
    if (32 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (32 - 1) {
                assert(ordering.1(sorted[i], sorted[(i + 1)]), "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn compare_for_ascending_sort_with_empty_padding(a: Counted<PublicCallRequest>, b: Counted<PublicCallRequest>) -> bool {
    ((!is_empty(a)) & (is_empty(b) | (counter(a) < counter(b))))
}
unconstrained fn empty() -> ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, 8> {
    {
        let array = [empty(); 8];
        let length = 0;
        (array, length)
    }
}
unconstrained fn empty() -> ClaimedLengthArray<Scoped<Counted<LogHash>>, 1> {
    {
        let array = [empty(); 1];
        let length = 0;
        (array, length)
    }
}
unconstrained fn empty() -> ClaimedLengthArray<Counted<PublicCallRequest>, 32> {
    {
        let array = [empty(); 32];
        let length = 0;
        (array, length)
    }
}
unconstrained fn empty() -> ClaimedLengthArray<PrivateCallRequest, 16> {
    {
        let array = [empty(); 16];
        let length = 0;
        (array, length)
    }
}
unconstrained fn map(self: &[Scoped<Counted<Field>>; 64], f: fn[()](Scoped<Counted<Field>>) -> Field) -> [Field; 64] {
    let uninitialized = 0;
    let mut ret = [uninitialized; 64];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(note_hash: ((Field, u32), (Field,))) -> Field {
    expose_to_public(note_hash)
}
unconstrained fn lambda(note_hash: ((Field, u32), (Field,))) -> Field {
    expose_to_public(note_hash)
}
unconstrained fn map(self: &[Scoped<Counted<Nullifier>>; 64], f: fn[()](Scoped<Counted<Nullifier>>) -> Field) -> [Field; 64] {
    let uninitialized = 0;
    let mut ret = [uninitialized; 64];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(nullifier: Scoped<Counted<Nullifier>>) -> Field {
    expose_to_public(nullifier)
}
unconstrained fn lambda(nullifier: Scoped<Counted<Nullifier>>) -> Field {
    expose_to_public(nullifier)
}
unconstrained fn map(self: &[Scoped<Counted<L2ToL1Message>>; 8], f: fn[()](Scoped<Counted<L2ToL1Message>>) -> Scoped<L2ToL1Message>) -> [Scoped<L2ToL1Message>; 8] {
    let uninitialized = (((0), 0), (0));
    let mut ret = [uninitialized; 8];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(l2_to_l1_msg: Scoped<Counted<L2ToL1Message>>) -> Scoped<L2ToL1Message> {
    expose_to_public(l2_to_l1_msg)
}
unconstrained fn lambda(l2_to_l1_msg: Scoped<Counted<L2ToL1Message>>) -> Scoped<L2ToL1Message> {
    expose_to_public(l2_to_l1_msg)
}
unconstrained fn map(self: &[Scoped<Counted<PrivateLogData>>; 64], f: fn[()](Scoped<Counted<PrivateLogData>>) -> Log<16>) -> [Log<16>; 64] {
    let uninitialized = ([0; 16], 0);
    let mut ret = [uninitialized; 64];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(private_log: Scoped<Counted<PrivateLogData>>) -> Log<16> {
    expose_to_public(private_log)
}
unconstrained fn lambda(private_log: Scoped<Counted<PrivateLogData>>) -> Log<16> {
    expose_to_public(private_log)
}
unconstrained fn map(self: &[Scoped<Counted<LogHash>>; 1], f: fn[()](Scoped<Counted<LogHash>>) -> Scoped<LogHash>) -> [Scoped<LogHash>; 1] {
    let uninitialized = ((0, 0), (0));
    let mut ret = [uninitialized; 1];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(contract_class_log_hash: Scoped<Counted<LogHash>>) -> ((Field, u32), (Field,)) {
    expose_to_public(contract_class_log_hash)
}
unconstrained fn lambda(contract_class_log_hash: Scoped<Counted<LogHash>>) -> ((Field, u32), (Field,)) {
    expose_to_public(contract_class_log_hash)
}
unconstrained fn map(self: &[Counted<PublicCallRequest>; 32], f: fn[()](Counted<PublicCallRequest>) -> PublicCallRequest) -> [PublicCallRequest; 32] {
    let uninitialized = ((0), (0), false, 0);
    let mut ret = [uninitialized; 32];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(public_call_request: Counted<PublicCallRequest>) -> PublicCallRequest {
    expose_to_public(public_call_request)
}
unconstrained fn lambda(public_call_request: Counted<PublicCallRequest>) -> PublicCallRequest {
    expose_to_public(public_call_request)
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
#[no_predicates]
unconstrained fn poseidon2_hash_with_separator(inputs: [Field; 11], separator: u32) -> Field {
    let inputs_with_separator = concat((&[to_field(separator)]), inputs);
    poseidon2_hash(inputs_with_separator)
}
unconstrained fn map(self: &[AztecAddress; 11], f: fn[()](AztecAddress) -> Field) -> [Field; 11] {
    let uninitialized = 0;
    let mut ret = [uninitialized; 11];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn to_field(self: AztecAddress) -> Field {
    self.inner
}
unconstrained fn lambda(address: (Field,)) -> Field {
    to_field(address)
}
unconstrained fn lambda(address: (Field,)) -> Field {
    to_field(address)
}
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 11], separator: u32) -> Field {
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
            let mut result = [0; 12];
            for i in 0 .. 1 {
                result[i] = (*self)[i]
            };
            for i in 0 .. 11 {
                result[(i + 1)] = array2[i]
            };
            result
        }
    };
    {
        // >>> inlined call: poseidon2_hash;
        let inputs = inputs_with_separator;
        {
            hash(inputs, 12)
        }
    }
}
fn lambda(address: (Field,)) -> Field {
    // >>> inlined call: to_field;
    let self = address;
    {
        self.inner
    }
}
unconstrained fn lambda(address: (Field,)) -> Field {
    to_field(address)
}
unconstrained fn get_sorted_tuples(array: [Scoped<Counted<L2ToL1Message>>; 8], ordering: fn[()](Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool) -> [SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8] {
    static_assert((8 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 8];
    for i in 0 .. 8 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn is_empty(self: Scoped<Counted<L2ToL1Message>>) -> bool {
    eq(self, empty())
}
unconstrained fn counter(self: Scoped<Counted<L2ToL1Message>>) -> u32 {
    self.inner.counter
}
unconstrained fn get_sorted_tuples(array: [Scoped<Counted<LogHash>>; 1], ordering: fn[()](Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool) -> [SortedTuple<Scoped<Counted<LogHash>>>; 1] {
    static_assert((1 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 1];
    for i in 0 .. 1 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn counter(self: Scoped<Counted<LogHash>>) -> u32 {
    self.inner.counter
}
unconstrained fn new(inner: LogHash, contract_address: AztecAddress) -> Scoped<LogHash> {
    {
        let inner = inner;
        let contract_address = contract_address;
        (inner, contract_address)
    }
}
unconstrained fn get_sorted_tuples(array: [Counted<PublicCallRequest>; 32], ordering: fn[()](Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool) -> [SortedTuple<Counted<PublicCallRequest>>; 32] {
    static_assert((32 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 32];
    for i in 0 .. 32 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn is_empty(self: Counted<PublicCallRequest>) -> bool {
    eq(self, empty())
}
unconstrained fn counter(self: Counted<PublicCallRequest>) -> u32 {
    self.counter
}
unconstrained fn find_first_index(array: [TransientDataSquashingHint; 64], find: fn[()](TransientDataSquashingHint) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if find.1(array[i]) {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(hint: (u32, u32)) -> bool {
    (hint.nullifier_index == 64)
}
unconstrained fn lambda(hint: (u32, u32)) -> bool {
    (hint.nullifier_index == 64)
}
unconstrained fn empty() -> Scoped<Counted<Field>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
unconstrained fn empty() -> Scoped<Counted<Nullifier>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
unconstrained fn empty() -> Scoped<Counted<PrivateLogData>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
unconstrained fn empty() -> Scoped<KeyValidationRequestAndSeparator> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
unconstrained fn quicksort(arr: &[Scoped<Counted<Field>>; 64], sortfn: unconstrained fn[()](Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool) -> [Scoped<Counted<Field>>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[Scoped<Counted<Field>>; 64], rhs: &[Scoped<Counted<Field>>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn is_empty(self: Scoped<Counted<Field>>) -> bool {
    eq(self, empty())
}
unconstrained fn compute_note_hash_nonce(first_nullifier_in_tx: Field, note_index_in_tx: u32) -> Field {
    poseidon2_hash_with_separator([first_nullifier_in_tx, (note_index_in_tx as Field)], DOM_SEP__NOTE_HASH_NONCE)
}
unconstrained fn compute_unique_note_hash(note_nonce: Field, siloed_note_hash: Field) -> Field {
    let inputs = [note_nonce, siloed_note_hash];
    poseidon2_hash_with_separator(inputs, DOM_SEP__UNIQUE_NOTE_HASH)
}
unconstrained fn quicksort(arr: &[Scoped<Counted<Nullifier>>; 64], sortfn: unconstrained fn[()](Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool) -> [Scoped<Counted<Nullifier>>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[Scoped<Counted<Nullifier>>; 64], rhs: &[Scoped<Counted<Nullifier>>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn is_empty(self: Scoped<Counted<Nullifier>>) -> bool {
    eq(self, empty())
}
unconstrained fn quicksort(arr: &[Scoped<Counted<PrivateLogData>>; 64], sortfn: unconstrained fn[()](Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool) -> [Scoped<Counted<PrivateLogData>>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[Scoped<Counted<PrivateLogData>>; 64], rhs: &[Scoped<Counted<PrivateLogData>>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn is_empty(self: Scoped<Counted<PrivateLogData>>) -> bool {
    eq(self, empty())
}
unconstrained fn new(fields: [Field; 16], length: u32) -> Log<16> {
    {
        let fields = fields;
        let length = length;
        (fields, length)
    }
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
#[no_predicates]
unconstrained fn hash(input: [Field; 3], message_size: u32) -> Field {
    hash_internal(input, message_size)
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
#[no_predicates]
fn poseidon2_hash_with_separator(inputs: [Field; 3], separator: Field) -> Field {
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
unconstrained fn map(self: &[TransientDataSquashingHint; 64], f: fn[()](TransientDataSquashingHint) -> u32) -> [u32; 64] {
    let uninitialized = 0;
    let mut ret = [uninitialized; 64];
    for i in 0 .. (*self).len() {
        ret[i] = f.1((*self)[i])
    };
    ret
}
unconstrained fn lambda(hint: (u32, u32)) -> u32 {
    hint.nullifier_index
}
unconstrained fn lambda(hint: (u32, u32)) -> u32 {
    hint.nullifier_index
}
unconstrained fn get_sorted_tuples(array: [u32; 64], ordering: fn[()](u32, u32) -> bool) -> [SortedTuple<u32>; 64] {
    static_assert((64 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 64];
    for i in 0 .. 64 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn lambda(a: u32, b: u32) -> bool {
    (a < b)
}
unconstrained fn lambda(a: u32, b: u32) -> bool {
    (a < b)
}
unconstrained fn lambda(mut env: FunctionSelector, note_hash: ((Field, u32), (Field,))) -> bool {
    (counter(note_hash) == env.0)
}
unconstrained fn find_first_index(array: [TransientDataSquashingHint; 64], find: fn[(u32,)](TransientDataSquashingHint) -> bool) -> u32 {
    let mut index = 64;
    for i in 0 .. 64 {
        if {
            let tmp = find.1;
            tmp.1(tmp.0, array[i])
        } {
            index = i;
            break
        }
    };
    index
}
unconstrained fn lambda(mut env: FunctionSelector, hint: (u32, u32)) -> bool {
    (hint.note_hash_index == env.0)
}
unconstrained fn get_order_hints(original_array: [Scoped<Counted<Field>>; 64]) -> OrderHints<64> {
    let sorted_tuples = get_sorted_tuples(original_array, (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding));
    let mut sorted_counters = [0; 64];
    let mut sorted_indexes = [0; 64];
    for i in 0 .. 64 {
        let elem = sorted_tuples[i].elem;
        sorted_counters[i] = counter(elem);
        let original_index = if (counter(elem) == 0) {
            i
        } else {
            sorted_tuples[i].original_index
        };
        sorted_indexes[original_index] = i
    };
    {
        let sorted_counters = sorted_counters;
        let sorted_indexes = sorted_indexes;
        (sorted_counters, sorted_indexes)
    }
}
unconstrained fn get_sorted_indexes(original_array: [Scoped<Counted<Nullifier>>; 64]) -> [u32; 64] {
    get_order_hints(original_array).sorted_indexes
}
unconstrained fn get_num_padded_items(padded_items: [Scoped<Counted<Nullifier>>; 64], original_array_length: u32, capped_size: u32) -> u32 {
    let mut num_padded_items = 0;
    for i in original_array_length .. capped_size {
        if (counter(padded_items[i]) == MAX_U32_VALUE) {
            num_padded_items = (num_padded_items + 1)
        }
    };
    num_padded_items
}
unconstrained fn get_sorted_indexes(original_array: [Scoped<Counted<PrivateLogData>>; 64]) -> [u32; 64] {
    get_order_hints(original_array).sorted_indexes
}
unconstrained fn get_num_padded_items(padded_items: [Scoped<Counted<PrivateLogData>>; 64], original_array_length: u32, capped_size: u32) -> u32 {
    let mut num_padded_items = 0;
    for i in original_array_length .. capped_size {
        if (counter(padded_items[i]) == MAX_U32_VALUE) {
            num_padded_items = (num_padded_items + 1)
        }
    };
    num_padded_items
}
unconstrained fn quicksort(arr: &[Scoped<Counted<L2ToL1Message>>; 8], sortfn: unconstrained fn[()](Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool) -> [Scoped<Counted<L2ToL1Message>>; 8] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[Scoped<Counted<L2ToL1Message>>; 8], rhs: &[Scoped<Counted<L2ToL1Message>>; 8]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 8 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 8 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn quicksort(arr: &[Scoped<Counted<LogHash>>; 1], sortfn: unconstrained fn[()](Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool) -> [Scoped<Counted<LogHash>>; 1] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[Scoped<Counted<LogHash>>; 1], rhs: &[Scoped<Counted<LogHash>>; 1]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 1 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 1 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn quicksort(arr: &[Counted<PublicCallRequest>; 32], sortfn: unconstrained fn[()](Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool) -> [Counted<PublicCallRequest>; 32] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[Counted<PublicCallRequest>; 32], rhs: &[Counted<PublicCallRequest>; 32]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 32 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 32 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn empty() -> Scoped<Counted<L2ToL1Message>> {
    {
        let inner = empty();
        let contract_address = empty();
        (inner, contract_address)
    }
}
unconstrained fn empty() -> Counted<PublicCallRequest> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
unconstrained fn empty() -> PrivateCallRequest {
    {
        let call_context = empty();
        let args_hash = 0;
        let returns_hash = 0;
        let start_side_effect_counter = 0;
        let end_side_effect_counter = 0;
        (call_context, args_hash, returns_hash, start_side_effect_counter, end_side_effect_counter)
    }
}
unconstrained fn concat(self: &[Field; 1], array2: [Field; 11]) -> [Field; 12] {
    let mut result = [0; 12];
    for i in 0 .. 1 {
        result[i] = (*self)[i]
    };
    for i in 0 .. 11 {
        result[(i + 1)] = array2[i]
    };
    result
}
unconstrained fn poseidon2_hash(inputs: [Field; 12]) -> Field {
    hash(inputs, 12)
}
unconstrained fn sort_via(self: &[SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8], ordering: fn[(fn(Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool,)](SortedTuple<Scoped<Counted<L2ToL1Message>>>, SortedTuple<Scoped<Counted<L2ToL1Message>>>) -> bool) -> [SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8] {
    if (8 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (8 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn(((((Field,), Field), u32), (Field,)), ((((Field,), Field), u32), (Field,))) -> bool, unconstrained fn(((((Field,), Field), u32), (Field,)), ((((Field,), Field), u32), (Field,))) -> bool),), a: SortedTuple<Scoped<Counted<L2ToL1Message>>>, b: SortedTuple<Scoped<Counted<L2ToL1Message>>>) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn eq(self: Scoped<Counted<L2ToL1Message>>, other: Scoped<Counted<L2ToL1Message>>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
unconstrained fn sort_via(self: &[SortedTuple<Scoped<Counted<LogHash>>>; 1], ordering: fn[(fn(Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool,)](SortedTuple<Scoped<Counted<LogHash>>>, SortedTuple<Scoped<Counted<LogHash>>>) -> bool) -> [SortedTuple<Scoped<Counted<LogHash>>>; 1] {
    if (1 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (1 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn((((Field, u32), u32), (Field,)), (((Field, u32), u32), (Field,))) -> bool, unconstrained fn((((Field, u32), u32), (Field,)), (((Field, u32), u32), (Field,))) -> bool),), a: SortedTuple<Scoped<Counted<LogHash>>>, b: SortedTuple<Scoped<Counted<LogHash>>>) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn sort_via(self: &[SortedTuple<Counted<PublicCallRequest>>; 32], ordering: fn[(fn(Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool,)](SortedTuple<Counted<PublicCallRequest>>, SortedTuple<Counted<PublicCallRequest>>) -> bool) -> [SortedTuple<Counted<PublicCallRequest>>; 32] {
    if (32 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (32 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn((((Field,), (Field,), bool, Field), u32), (((Field,), (Field,), bool, Field), u32)) -> bool, unconstrained fn((((Field,), (Field,), bool, Field), u32), (((Field,), (Field,), bool, Field), u32)) -> bool),), a: SortedTuple<Counted<PublicCallRequest>>, b: SortedTuple<Counted<PublicCallRequest>>) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn eq(self: Counted<PublicCallRequest>, other: Counted<PublicCallRequest>) -> bool {
    (eq(self.inner, other.inner) & (self.counter == other.counter))
}
unconstrained fn empty() -> Counted<Field> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
unconstrained fn empty() -> Counted<Nullifier> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
unconstrained fn empty() -> Counted<PrivateLogData> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
unconstrained fn empty() -> KeyValidationRequestAndSeparator {
    {
        let request = empty();
        let key_type_domain_separator = 0;
        (request, key_type_domain_separator)
    }
}
unconstrained fn quicksort_loop(arr: &mut [Scoped<Counted<Field>>; 64], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[Scoped<Counted<Field>>; 64], rhs: &[Scoped<Counted<Field>>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn __get_index(indices: &[u32; 64], idx: u32) -> u32 {
    let mut result = 0;
    for i in 0 .. 64 {
        if ((*indices)[i] == idx) {
            result = i;
            break
        }
    };
    result
}
unconstrained fn eq(self: Scoped<Counted<Field>>, other: Scoped<Counted<Field>>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
unconstrained fn quicksort_loop(arr: &mut [Scoped<Counted<Nullifier>>; 64], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[Scoped<Counted<Nullifier>>; 64], rhs: &[Scoped<Counted<Nullifier>>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn eq(self: Scoped<Counted<Nullifier>>, other: Scoped<Counted<Nullifier>>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
}
unconstrained fn quicksort_loop(arr: &mut [Scoped<Counted<PrivateLogData>>; 64], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[Scoped<Counted<PrivateLogData>>; 64], rhs: &[Scoped<Counted<PrivateLogData>>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn eq(self: Scoped<Counted<PrivateLogData>>, other: Scoped<Counted<PrivateLogData>>) -> bool {
    (eq(self.inner, other.inner) & eq(self.contract_address, other.contract_address))
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
fn serialize(self: NullifierLeafPreimage) -> [Field; 3] {
    let mut writer = {
        // >>> inlined call: new;
        {
            {
                let data = [0; 3];
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
unconstrained fn sort_via(self: &[SortedTuple<u32>; 64], ordering: fn[(fn(u32, u32) -> bool,)](SortedTuple<u32>, SortedTuple<u32>) -> bool) -> [SortedTuple<u32>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn(u32, u32) -> bool, unconstrained fn(u32, u32) -> bool),), a: (u32, u32), b: (u32, u32)) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn get_sorted_tuples(array: [Scoped<Counted<Field>>; 64], ordering: fn[()](Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool) -> [SortedTuple<Scoped<Counted<Field>>>; 64] {
    static_assert((64 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 64];
    for i in 0 .. 64 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn get_order_hints(original_array: [Scoped<Counted<Nullifier>>; 64]) -> OrderHints<64> {
    let sorted_tuples = get_sorted_tuples(original_array, (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding));
    let mut sorted_counters = [0; 64];
    let mut sorted_indexes = [0; 64];
    for i in 0 .. 64 {
        let elem = sorted_tuples[i].elem;
        sorted_counters[i] = counter(elem);
        let original_index = if (counter(elem) == 0) {
            i
        } else {
            sorted_tuples[i].original_index
        };
        sorted_indexes[original_index] = i
    };
    {
        let sorted_counters = sorted_counters;
        let sorted_indexes = sorted_indexes;
        (sorted_counters, sorted_indexes)
    }
}
unconstrained fn get_order_hints(original_array: [Scoped<Counted<PrivateLogData>>; 64]) -> OrderHints<64> {
    let sorted_tuples = get_sorted_tuples(original_array, (compare_for_ascending_sort_with_empty_padding, compare_for_ascending_sort_with_empty_padding));
    let mut sorted_counters = [0; 64];
    let mut sorted_indexes = [0; 64];
    for i in 0 .. 64 {
        let elem = sorted_tuples[i].elem;
        sorted_counters[i] = counter(elem);
        let original_index = if (counter(elem) == 0) {
            i
        } else {
            sorted_tuples[i].original_index
        };
        sorted_indexes[original_index] = i
    };
    {
        let sorted_counters = sorted_counters;
        let sorted_indexes = sorted_indexes;
        (sorted_counters, sorted_indexes)
    }
}
unconstrained fn quicksort_loop(arr: &mut [Scoped<Counted<L2ToL1Message>>; 8], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 8) {
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
unconstrained fn __get_shuffle_indices(lhs: &[Scoped<Counted<L2ToL1Message>>; 8], rhs: &[Scoped<Counted<L2ToL1Message>>; 8]) -> [u32; 8] {
    let mut shuffle_indices = [0; 8];
    let mut shuffle_mask = [false; 8];
    for i in 0 .. 8 {
        let mut found = false;
        for j in 0 .. 8 {
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
unconstrained fn __get_index(indices: &[u32; 8], idx: u32) -> u32 {
    let mut result = 0;
    for i in 0 .. 8 {
        if ((*indices)[i] == idx) {
            result = i;
            break
        }
    };
    result
}
unconstrained fn quicksort_loop(arr: &mut [Scoped<Counted<LogHash>>; 1], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 1) {
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
unconstrained fn __get_shuffle_indices(lhs: &[Scoped<Counted<LogHash>>; 1], rhs: &[Scoped<Counted<LogHash>>; 1]) -> [u32; 1] {
    let mut shuffle_indices = [0; 1];
    let mut shuffle_mask = [false; 1];
    for i in 0 .. 1 {
        let mut found = false;
        for j in 0 .. 1 {
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
unconstrained fn __get_index(indices: &[u32; 1], idx: u32) -> u32 {
    let mut result = 0;
    for i in 0 .. 1 {
        if ((*indices)[i] == idx) {
            result = i;
            break
        }
    };
    result
}
unconstrained fn quicksort_loop(arr: &mut [Counted<PublicCallRequest>; 32], low: u32, high: u32, sortfn: unconstrained fn[()](Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 32) {
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
unconstrained fn __get_shuffle_indices(lhs: &[Counted<PublicCallRequest>; 32], rhs: &[Counted<PublicCallRequest>; 32]) -> [u32; 32] {
    let mut shuffle_indices = [0; 32];
    let mut shuffle_mask = [false; 32];
    for i in 0 .. 32 {
        let mut found = false;
        for j in 0 .. 32 {
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
unconstrained fn __get_index(indices: &[u32; 32], idx: u32) -> u32 {
    let mut result = 0;
    for i in 0 .. 32 {
        if ((*indices)[i] == idx) {
            result = i;
            break
        }
    };
    result
}
unconstrained fn empty() -> Counted<L2ToL1Message> {
    {
        let inner = empty();
        let counter = 0;
        (inner, counter)
    }
}
unconstrained fn empty() -> CallContext {
    {
        let msg_sender = empty();
        let contract_address = empty();
        let function_selector = empty();
        let is_static_call = false;
        (msg_sender, contract_address, function_selector, is_static_call)
    }
}
#[no_predicates]
unconstrained fn hash(input: [Field; 12], message_size: u32) -> Field {
    hash_internal(input, message_size)
}
#[no_predicates]
fn hash(input: [Field; 12], message_size: u32) -> Field {
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
                let mut states = [[0; 4]; 5];
                states[0] = state;
                for chunk_idx in 0 .. (12 / RATE) {
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
unconstrained fn quicksort(arr: &[SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8], sortfn: unconstrained fn[(fn(Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool,)](SortedTuple<Scoped<Counted<L2ToL1Message>>>, SortedTuple<Scoped<Counted<L2ToL1Message>>>) -> bool) -> [SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8], rhs: &[SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 8 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 8 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn eq(self: Counted<L2ToL1Message>, other: Counted<L2ToL1Message>) -> bool {
    (eq(self.inner, other.inner) & (self.counter == other.counter))
}
unconstrained fn quicksort(arr: &[SortedTuple<Scoped<Counted<LogHash>>>; 1], sortfn: unconstrained fn[(fn(Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool,)](SortedTuple<Scoped<Counted<LogHash>>>, SortedTuple<Scoped<Counted<LogHash>>>) -> bool) -> [SortedTuple<Scoped<Counted<LogHash>>>; 1] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<Scoped<Counted<LogHash>>>; 1], rhs: &[SortedTuple<Scoped<Counted<LogHash>>>; 1]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 1 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 1 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn quicksort(arr: &[SortedTuple<Counted<PublicCallRequest>>; 32], sortfn: unconstrained fn[(fn(Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool,)](SortedTuple<Counted<PublicCallRequest>>, SortedTuple<Counted<PublicCallRequest>>) -> bool) -> [SortedTuple<Counted<PublicCallRequest>>; 32] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<Counted<PublicCallRequest>>; 32], rhs: &[SortedTuple<Counted<PublicCallRequest>>; 32]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 32 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 32 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn empty() -> Nullifier {
    {
        let value = 0;
        let note_hash = 0;
        (value, note_hash)
    }
}
unconstrained fn empty() -> PrivateLogData {
    {
        let log = empty();
        let note_hash_counter = 0;
        (log, note_hash_counter)
    }
}
unconstrained fn empty() -> KeyValidationRequest {
    {
        let pk_m_hash = 0;
        let sk_app = 0;
        (pk_m_hash, sk_app)
    }
}
unconstrained fn partition(arr: &mut [Scoped<Counted<Field>>; 64], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool) -> u32 {
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
unconstrained fn eq(self: Counted<Field>, other: Counted<Field>) -> bool {
    (eq(self.inner, other.inner) & (self.counter == other.counter))
}
unconstrained fn partition(arr: &mut [Scoped<Counted<Nullifier>>; 64], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool) -> u32 {
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
unconstrained fn eq(self: Counted<Nullifier>, other: Counted<Nullifier>) -> bool {
    (eq(self.inner, other.inner) & (self.counter == other.counter))
}
unconstrained fn partition(arr: &mut [Scoped<Counted<PrivateLogData>>; 64], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool) -> u32 {
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
unconstrained fn eq(self: Counted<PrivateLogData>, other: Counted<PrivateLogData>) -> bool {
    (eq(self.inner, other.inner) & (self.counter == other.counter))
}
unconstrained fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
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
#[inline_always]
fn stream_serialize(self: NullifierLeafPreimage, writer: &mut Writer<3>) -> () {
    stream_serialize(self.nullifier, writer);
    stream_serialize(self.next_nullifier, writer);
    stream_serialize(self.next_index, writer);
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
unconstrained fn quicksort(arr: &[SortedTuple<u32>; 64], sortfn: unconstrained fn[(fn(u32, u32) -> bool,)](SortedTuple<u32>, SortedTuple<u32>) -> bool) -> [SortedTuple<u32>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<u32>; 64], rhs: &[SortedTuple<u32>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn sort_via(self: &[SortedTuple<Scoped<Counted<Field>>>; 64], ordering: fn[(fn(Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool,)](SortedTuple<Scoped<Counted<Field>>>, SortedTuple<Scoped<Counted<Field>>>) -> bool) -> [SortedTuple<Scoped<Counted<Field>>>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn(((Field, u32), (Field,)), ((Field, u32), (Field,))) -> bool, unconstrained fn(((Field, u32), (Field,)), ((Field, u32), (Field,))) -> bool),), a: SortedTuple<Scoped<Counted<Field>>>, b: SortedTuple<Scoped<Counted<Field>>>) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn get_sorted_tuples(array: [Scoped<Counted<Nullifier>>; 64], ordering: fn[()](Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool) -> [SortedTuple<Scoped<Counted<Nullifier>>>; 64] {
    static_assert((64 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 64];
    for i in 0 .. 64 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn get_sorted_tuples(array: [Scoped<Counted<PrivateLogData>>; 64], ordering: fn[()](Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool) -> [SortedTuple<Scoped<Counted<PrivateLogData>>>; 64] {
    static_assert((64 != 0), "Input array must not be zero-length", r#"{"kind":"string","length":35}"#, false);
    let mut tuples = [{
        let elem = array[0];
        let original_index = 0;
        (elem, original_index)
    }; 64];
    for i in 0 .. 64 {
        tuples[i] = {
            let elem = array[i];
            let original_index = i;
            (elem, original_index)
        }
    };
    sort_via((&tuples), {
        let closure_variable = {
            let env = (ordering);
            ((env, lambda), (env, lambda))
        };
        closure_variable
    })
}
unconstrained fn partition(arr: &mut [Scoped<Counted<L2ToL1Message>>; 8], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool) -> u32 {
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
unconstrained fn partition(arr: &mut [Scoped<Counted<LogHash>>; 1], low: u32, high: u32, sortfn: unconstrained fn[()](Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool) -> u32 {
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
unconstrained fn partition(arr: &mut [Counted<PublicCallRequest>; 32], low: u32, high: u32, sortfn: unconstrained fn[()](Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool) -> u32 {
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
unconstrained fn empty() -> FunctionSelector {
    {
        let inner = (0 as u32);
        (inner)
    }
}
unconstrained fn hash_internal(input: [Field; 12], in_len: u32) -> Field {
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
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool,)](SortedTuple<Scoped<Counted<L2ToL1Message>>>, SortedTuple<Scoped<Counted<L2ToL1Message>>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 8) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8], rhs: &[SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8]) -> [u32; 8] {
    let mut shuffle_indices = [0; 8];
    let mut shuffle_mask = [false; 8];
    for i in 0 .. 8 {
        let mut found = false;
        for j in 0 .. 8 {
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
unconstrained fn eq(self: SortedTuple<Scoped<Counted<L2ToL1Message>>>, other: SortedTuple<Scoped<Counted<L2ToL1Message>>>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<Scoped<Counted<LogHash>>>; 1], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool,)](SortedTuple<Scoped<Counted<LogHash>>>, SortedTuple<Scoped<Counted<LogHash>>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 1) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<Scoped<Counted<LogHash>>>; 1], rhs: &[SortedTuple<Scoped<Counted<LogHash>>>; 1]) -> [u32; 1] {
    let mut shuffle_indices = [0; 1];
    let mut shuffle_mask = [false; 1];
    for i in 0 .. 1 {
        let mut found = false;
        for j in 0 .. 1 {
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
unconstrained fn eq(self: SortedTuple<Scoped<Counted<LogHash>>>, other: SortedTuple<Scoped<Counted<LogHash>>>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<Counted<PublicCallRequest>>; 32], low: u32, high: u32, sortfn: unconstrained fn[(fn(Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool,)](SortedTuple<Counted<PublicCallRequest>>, SortedTuple<Counted<PublicCallRequest>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 32) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<Counted<PublicCallRequest>>; 32], rhs: &[SortedTuple<Counted<PublicCallRequest>>; 32]) -> [u32; 32] {
    let mut shuffle_indices = [0; 32];
    let mut shuffle_mask = [false; 32];
    for i in 0 .. 32 {
        let mut found = false;
        for j in 0 .. 32 {
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
unconstrained fn eq(self: SortedTuple<Counted<PublicCallRequest>>, other: SortedTuple<Counted<PublicCallRequest>>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn empty() -> Log<16> {
    {
        let fields = [0; 16];
        let length = 0;
        (fields, length)
    }
}
unconstrained fn eq(_self: Nullifier, _other: Nullifier) -> bool {
    ((_self.value == _other.value) & (_self.note_hash == _other.note_hash))
}
unconstrained fn eq(_self: PrivateLogData, _other: PrivateLogData) -> bool {
    (eq(_self.log, _other.log) & (_self.note_hash_counter == _other.note_hash_counter))
}
#[inline_always]
fn stream_serialize(self: Field, writer: &mut Writer<3>) -> () {
    write(writer, self);
}
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<u32>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(u32, u32) -> bool,)](SortedTuple<u32>, SortedTuple<u32>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<u32>; 64], rhs: &[SortedTuple<u32>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn eq(self: SortedTuple<u32>, other: SortedTuple<u32>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn quicksort(arr: &[SortedTuple<Scoped<Counted<Field>>>; 64], sortfn: unconstrained fn[(fn(Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool,)](SortedTuple<Scoped<Counted<Field>>>, SortedTuple<Scoped<Counted<Field>>>) -> bool) -> [SortedTuple<Scoped<Counted<Field>>>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<Scoped<Counted<Field>>>; 64], rhs: &[SortedTuple<Scoped<Counted<Field>>>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn sort_via(self: &[SortedTuple<Scoped<Counted<Nullifier>>>; 64], ordering: fn[(fn(Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool,)](SortedTuple<Scoped<Counted<Nullifier>>>, SortedTuple<Scoped<Counted<Nullifier>>>) -> bool) -> [SortedTuple<Scoped<Counted<Nullifier>>>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn((((Field, Field), u32), (Field,)), (((Field, Field), u32), (Field,))) -> bool, unconstrained fn((((Field, Field), u32), (Field,)), (((Field, Field), u32), (Field,))) -> bool),), a: SortedTuple<Scoped<Counted<Nullifier>>>, b: SortedTuple<Scoped<Counted<Nullifier>>>) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn sort_via(self: &[SortedTuple<Scoped<Counted<PrivateLogData>>>; 64], ordering: fn[(fn(Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool,)](SortedTuple<Scoped<Counted<PrivateLogData>>>, SortedTuple<Scoped<Counted<PrivateLogData>>>) -> bool) -> [SortedTuple<Scoped<Counted<PrivateLogData>>>; 64] {
    if (64 != 0) {
        let sorted = {
            quicksort(self, ordering)
        };
        if (!is_unconstrained()) {
            for i in 0 .. (64 - 1) {
                assert({
                    let tmp = ordering.1;
                    tmp.1(tmp.0, sorted[i], sorted[(i + 1)])
                }, "Array has not been sorted correctly according to `ordering`.");
            };
            check_shuffle(self, (&sorted));
        };
        sorted
    } else {
        (*self)
    }
}
unconstrained fn lambda(mut env: ((fn((((([Field; 16], u32), u32), u32), (Field,)), (((([Field; 16], u32), u32), u32), (Field,))) -> bool, unconstrained fn((((([Field; 16], u32), u32), u32), (Field,)), (((([Field; 16], u32), u32), u32), (Field,))) -> bool),), a: SortedTuple<Scoped<Counted<PrivateLogData>>>, b: SortedTuple<Scoped<Counted<PrivateLogData>>>) -> bool {
    env.0.1(a.elem, b.elem)
}
unconstrained fn partition(arr: &mut [SortedTuple<Scoped<Counted<L2ToL1Message>>>; 8], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<L2ToL1Message>>, Scoped<Counted<L2ToL1Message>>) -> bool,)](SortedTuple<Scoped<Counted<L2ToL1Message>>>, SortedTuple<Scoped<Counted<L2ToL1Message>>>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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
unconstrained fn partition(arr: &mut [SortedTuple<Scoped<Counted<LogHash>>>; 1], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<LogHash>>, Scoped<Counted<LogHash>>) -> bool,)](SortedTuple<Scoped<Counted<LogHash>>>, SortedTuple<Scoped<Counted<LogHash>>>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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
unconstrained fn partition(arr: &mut [SortedTuple<Counted<PublicCallRequest>>; 32], low: u32, high: u32, sortfn: unconstrained fn[(fn(Counted<PublicCallRequest>, Counted<PublicCallRequest>) -> bool,)](SortedTuple<Counted<PublicCallRequest>>, SortedTuple<Counted<PublicCallRequest>>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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
fn write(self: &mut Writer<3>, value: Field) -> () {
    (*self).data[(*self).offset] = value;
    (*self).offset = ((*self).offset + 1)
}
unconstrained fn partition(arr: &mut [SortedTuple<u32>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(u32, u32) -> bool,)](SortedTuple<u32>, SortedTuple<u32>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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
unconstrained fn eq(self: u32, other: u32) -> bool {
    (self == other)
}
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<Scoped<Counted<Field>>>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool,)](SortedTuple<Scoped<Counted<Field>>>, SortedTuple<Scoped<Counted<Field>>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<Scoped<Counted<Field>>>; 64], rhs: &[SortedTuple<Scoped<Counted<Field>>>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn eq(self: SortedTuple<Scoped<Counted<Field>>>, other: SortedTuple<Scoped<Counted<Field>>>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn quicksort(arr: &[SortedTuple<Scoped<Counted<Nullifier>>>; 64], sortfn: unconstrained fn[(fn(Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool,)](SortedTuple<Scoped<Counted<Nullifier>>>, SortedTuple<Scoped<Counted<Nullifier>>>) -> bool) -> [SortedTuple<Scoped<Counted<Nullifier>>>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<Scoped<Counted<Nullifier>>>; 64], rhs: &[SortedTuple<Scoped<Counted<Nullifier>>>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn quicksort(arr: &[SortedTuple<Scoped<Counted<PrivateLogData>>>; 64], sortfn: unconstrained fn[(fn(Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool,)](SortedTuple<Scoped<Counted<PrivateLogData>>>, SortedTuple<Scoped<Counted<PrivateLogData>>>) -> bool) -> [SortedTuple<Scoped<Counted<PrivateLogData>>>; 64] {
    let mut arr = (*arr);
    if (arr.len() > 1) {
        quicksort_loop((&mut arr), 0, (arr.len() - 1), sortfn);
    };
    arr
}
unconstrained fn check_shuffle(lhs: &[SortedTuple<Scoped<Counted<PrivateLogData>>>; 64], rhs: &[SortedTuple<Scoped<Counted<PrivateLogData>>>; 64]) -> () {
    {
        let shuffle_indices = __get_shuffle_indices(lhs, rhs);
        for i in 0 .. 64 {
            let idx = __get_index((&shuffle_indices), i);
            assert((shuffle_indices[idx] == i));
        };
        for i in 0 .. 64 {
            let idx = shuffle_indices[i];
            let expected = (*rhs)[idx];
            let result = (*lhs)[i];
            assert(eq(expected, result));
        }
    }
}
unconstrained fn partition(arr: &mut [SortedTuple<Scoped<Counted<Field>>>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<Field>>, Scoped<Counted<Field>>) -> bool,)](SortedTuple<Scoped<Counted<Field>>>, SortedTuple<Scoped<Counted<Field>>>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<Scoped<Counted<Nullifier>>>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool,)](SortedTuple<Scoped<Counted<Nullifier>>>, SortedTuple<Scoped<Counted<Nullifier>>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<Scoped<Counted<Nullifier>>>; 64], rhs: &[SortedTuple<Scoped<Counted<Nullifier>>>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn eq(self: SortedTuple<Scoped<Counted<Nullifier>>>, other: SortedTuple<Scoped<Counted<Nullifier>>>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn quicksort_loop(arr: &mut [SortedTuple<Scoped<Counted<PrivateLogData>>>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool,)](SortedTuple<Scoped<Counted<PrivateLogData>>>, SortedTuple<Scoped<Counted<PrivateLogData>>>) -> bool) -> () {
    let mut stack = as_vector([(low, high)]);
    for _ in 0 .. (2 * 64) {
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
unconstrained fn __get_shuffle_indices(lhs: &[SortedTuple<Scoped<Counted<PrivateLogData>>>; 64], rhs: &[SortedTuple<Scoped<Counted<PrivateLogData>>>; 64]) -> [u32; 64] {
    let mut shuffle_indices = [0; 64];
    let mut shuffle_mask = [false; 64];
    for i in 0 .. 64 {
        let mut found = false;
        for j in 0 .. 64 {
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
unconstrained fn eq(self: SortedTuple<Scoped<Counted<PrivateLogData>>>, other: SortedTuple<Scoped<Counted<PrivateLogData>>>) -> bool {
    (eq(self.elem, other.elem) & (self.original_index == other.original_index))
}
unconstrained fn partition(arr: &mut [SortedTuple<Scoped<Counted<Nullifier>>>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<Nullifier>>, Scoped<Counted<Nullifier>>) -> bool,)](SortedTuple<Scoped<Counted<Nullifier>>>, SortedTuple<Scoped<Counted<Nullifier>>>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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
unconstrained fn partition(arr: &mut [SortedTuple<Scoped<Counted<PrivateLogData>>>; 64], low: u32, high: u32, sortfn: unconstrained fn[(fn(Scoped<Counted<PrivateLogData>>, Scoped<Counted<PrivateLogData>>) -> bool,)](SortedTuple<Scoped<Counted<PrivateLogData>>>, SortedTuple<Scoped<Counted<PrivateLogData>>>) -> bool) -> u32 {
    let pivot = high;
    let mut i = low;
    for j in low .. high {
        if {
            let tmp = sortfn.1;
            tmp.1(tmp.0, (*arr)[j], (*arr)[pivot])
        } {
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

