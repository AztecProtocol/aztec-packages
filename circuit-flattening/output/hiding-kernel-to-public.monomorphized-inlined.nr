// Legend: source-level names of monomorphized struct/enum/alias types.
// A type claimed by several distinct names is printed structurally
// wherever it appears, to avoid guessing which name applies.
type AppendOnlyTreeSnapshot = (Field, Field);
type AztecAddress = (Field,);
type BlockHeader = (AppendOnlyTreeSnapshot, StateReference, Field, GlobalVariables, Field, Field);
type EthAddress = (Field,);
type Gas = (u32, u32);
type GasFees = (u128, u128);
type GasSettings = (Gas, Gas, GasFees, GasFees);
type GlobalVariables = (Field, Field, u32, Field, u64, (Field,), (Field,), GasFees);
type HidingKernelToPublicPrivateInputs = (PrivateToPublicKernelCircuitPublicInputs, VkData<163>);
type L2ToL1Message = ((Field,), Field);
type Log<16> = ([Field; 16], u32);
type LogHash = (Field, u32);
type MembershipWitness<7> = (Field, [Field; 7]);
type PartialStateReference = (AppendOnlyTreeSnapshot, AppendOnlyTreeSnapshot, AppendOnlyTreeSnapshot);
type PrivateToPublicAccumulatedData = ([Field; 64], [Field; 64], [Scoped<L2ToL1Message>; 8], [Log<16>; 64], [Scoped<LogHash>; 1], [PublicCallRequest; 32]);
type PrivateToPublicKernelCircuitPublicInputs = (TxConstantData, PrivateToPublicAccumulatedData, PrivateToPublicAccumulatedData, PublicCallRequest, Gas, (Field,), u64);
type PublicCallRequest = ((Field,), (Field,), bool, Field);
type Scoped<L2ToL1Message> = (L2ToL1Message, (Field,));
type Scoped<LogHash> = (LogHash, (Field,));
type StateReference = (AppendOnlyTreeSnapshot, PartialStateReference);
type TxConstantData = (BlockHeader, TxContext, Field, Field);
type TxContext = (Field, Field, GasSettings);
type VerificationKey<163> = ([Field; 163], Field);
type VkData<163> = (VerificationKey<163>, u32, [Field; 7]);

global PROOF_TYPE_HN_FINAL: u32 = 7;
global PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX: u32 = 37;
global PRIVATE_KERNEL_RESET_BLOCK_END: u32 = 43;
global DOM_SEP__MERKLE_HASH: u32 = 2982624097;
global RATE: u32 = 3;
global POSEIDON2_CONFIG_STATE_SIZE: u32 = 4;
fn main(previous_kernel_public_inputs: call_data(0) PrivateToPublicKernelCircuitPublicInputs, previous_kernel_vk_data: VkData<163>) -> pub PrivateToPublicKernelCircuitPublicInputs {
    let inputs = {
        let previous_kernel_public_inputs = previous_kernel_public_inputs;
        let previous_kernel_vk_data = previous_kernel_vk_data;
        (previous_kernel_public_inputs, previous_kernel_vk_data)
    };
    {
        // >>> inlined call: execute;
        let __arg_0 = inputs;
        let inputs = __arg_0;
        {
            if (!is_unconstrained()) {
                {
                    // >>> inlined call: verify_proof_with_type;
                    let verification_key = inputs.previous_kernel_vk_data.vk.key;
                    let proof = [];
                    let public_inputs = [];
                    let key_hash = inputs.previous_kernel_vk_data.vk.hash;
                    let proof_type = PROOF_TYPE_HN_FINAL;
                    {
                        if (!is_unconstrained()) {
                            assert_constant(proof_type);
                        };
                        verify_proof_internal(verification_key, proof, public_inputs, key_hash, proof_type);
                    }
                };
            };
            {
                // >>> inlined call: assert_previous_kernel_is_reset_tail_to_public;
                let leaf = inputs.previous_kernel_vk_data.leaf_index;
                {
                    assert(((leaf >= PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX) & (leaf < PRIVATE_KERNEL_RESET_BLOCK_END)), "previous kernel must be a private_kernel_reset_tail_to_public variant");
                }
            };
            {
                // >>> inlined call: validate_in_vk_tree;
                let self = inputs.previous_kernel_vk_data;
                let vk_tree_root = inputs.previous_kernel_public_inputs.constants.vk_tree_root;
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
            inputs.previous_kernel_public_inputs
        }
    }
}
fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}
unconstrained fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
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
unconstrained fn poseidon2_permutation(input: [Field; 4]) -> [Field; 4] {
    static_assert((4 == POSEIDON2_CONFIG_STATE_SIZE), f"the input length must equal the state size in the Poseidon2 config; expected {POSEIDON2_CONFIG_STATE_SIZE}, got {N}", r#"{"kind":"unsignedinteger","width":32}"#, r#"{"kind":"unsignedinteger","width":32}"#, true);
    poseidon2_permutation_internal(input)
}

