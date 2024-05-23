#include "acir_to_constraint_buf.hpp"
#ifndef __wasm__
#include "barretenberg/bb/get_bytecode.hpp"
#endif
namespace acir_format {
/**
 * @brief Construct a poly_tuple for a standard width-3 arithmetic gate from its acir representation
 *
 * @param arg acir representation of an 3-wire arithmetic operation
 * @return poly_triple
 * @note In principle Program::Expression can accommodate arbitrarily many quadratic and linear terms but in practice
 * the ones processed here have a max of 1 and 3 respectively, in accordance with the standard width-3 arithmetic gate.
 */
poly_triple serialize_arithmetic_gate(Program::Expression const& arg)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/816): The initialization of the witness indices a,b,c
    // to 0 is implicitly assuming that (builder.zero_idx == 0) which is no longer the case. Now, witness idx 0 in
    // general will correspond to some non-zero value and some witnesses which are not explicitly set below will be
    // erroneously populated with this value. This does not cause failures however because the corresponding selector
    // will indeed be 0 so the gate will be satisfied. Still, its a bad idea to have erroneous wire values
    // even if they dont break the relation. They'll still add cost in commitments, for example.
    poly_triple pt{
        .a = 0,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 0,
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    };

    // Flags indicating whether each witness index for the present poly_tuple has been set
    bool a_set = false;
    bool b_set = false;
    bool c_set = false;

    // If necessary, set values for quadratic term (q_m * w_l * w_r)
    ASSERT(arg.mul_terms.size() <= 1); // We can only accommodate 1 quadratic term
    // Note: mul_terms are tuples of the form {selector_value, witness_idx_1, witness_idx_2}
    if (!arg.mul_terms.empty()) {
        const auto& mul_term = arg.mul_terms[0];
        pt.q_m = uint256_t(std::get<0>(mul_term));
        pt.a = std::get<1>(mul_term).value;
        pt.b = std::get<2>(mul_term).value;
        a_set = true;
        b_set = true;
    }

    // If necessary, set values for linears terms q_l * w_l, q_r * w_r and q_o * w_o
    ASSERT(arg.linear_combinations.size() <= 3); // We can only accommodate 3 linear terms
    for (const auto& linear_term : arg.linear_combinations) {
        bb::fr selector_value(uint256_t(std::get<0>(linear_term)));
        uint32_t witness_idx = std::get<1>(linear_term).value;

        // If the witness index has not yet been set or if the corresponding linear term is active, set the witness
        // index and the corresponding selector value.
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/816): May need to adjust the pt.a == witness_idx
        // check (and the others like it) since we initialize a,b,c with 0 but 0 is a valid witness index once the
        // +1 offset is removed from noir.
        if (!a_set || pt.a == witness_idx) { // q_l * w_l
            pt.a = witness_idx;
            pt.q_l = selector_value;
            a_set = true;
        } else if (!b_set || pt.b == witness_idx) { // q_r * w_r
            pt.b = witness_idx;
            pt.q_r = selector_value;
            b_set = true;
        } else if (!c_set || pt.c == witness_idx) { // q_o * w_o
            pt.c = witness_idx;
            pt.q_o = selector_value;
            c_set = true;
        } else {
            return poly_triple{
                .a = 0,
                .b = 0,
                .c = 0,
                .q_m = 0,
                .q_l = 0,
                .q_r = 0,
                .q_o = 0,
                .q_c = 0,
            };
        }
    }

    // Set constant value q_c
    pt.q_c = uint256_t(arg.q_c);
    return pt;
}
mul_quad_<bb::fr> serialize_mul_quad_gate(Program::Expression const& arg)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/816): The initialization of the witness indices a,b,c
    // to 0 is implicitly assuming that (builder.zero_idx == 0) which is no longer the case. Now, witness idx 0 in
    // general will correspond to some non-zero value and some witnesses which are not explicitly set below will be
    // erroneously populated with this value. This does not cause failures however because the corresponding selector
    // will indeed be 0 so the gate will be satisfied. Still, its a bad idea to have erroneous wire values
    // even if they dont break the relation. They'll still add cost in commitments, for example.
    mul_quad_<bb::fr> quad{ .a = 0,
                            .b = 0,
                            .c = 0,
                            .d = 0,
                            .mul_scaling = 0,
                            .a_scaling = 0,
                            .b_scaling = 0,
                            .c_scaling = 0,
                            .d_scaling = 0,
                            .const_scaling = 0 };

    // Flags indicating whether each witness index for the present mul_quad has been set
    bool a_set = false;
    bool b_set = false;
    bool c_set = false;
    bool d_set = false;
    ASSERT(arg.mul_terms.size() <= 1); // We can only accommodate 1 quadratic term
    // Note: mul_terms are tuples of the form {selector_value, witness_idx_1, witness_idx_2}
    if (!arg.mul_terms.empty()) {
        const auto& mul_term = arg.mul_terms[0];
        quad.mul_scaling = uint256_t(std::get<0>(mul_term));
        quad.a = std::get<1>(mul_term).value;
        quad.b = std::get<2>(mul_term).value;
        a_set = true;
        b_set = true;
    }
    // If necessary, set values for linears terms q_l * w_l, q_r * w_r and q_o * w_o
    ASSERT(arg.linear_combinations.size() <= 4); // We can only accommodate 4 linear terms
    for (const auto& linear_term : arg.linear_combinations) {
        bb::fr selector_value(uint256_t(std::get<0>(linear_term)));
        uint32_t witness_idx = std::get<1>(linear_term).value;

        // If the witness index has not yet been set or if the corresponding linear term is active, set the witness
        // index and the corresponding selector value.
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/816): May need to adjust the quad.a == witness_idx
        // check (and the others like it) since we initialize a,b,c with 0 but 0 is a valid witness index once the
        // +1 offset is removed from noir.
        if (!a_set || quad.a == witness_idx) {
            quad.a = witness_idx;
            quad.a_scaling = selector_value;
            a_set = true;
        } else if (!b_set || quad.b == witness_idx) {
            quad.b = witness_idx;
            quad.b_scaling = selector_value;
            b_set = true;
        } else if (!c_set || quad.c == witness_idx) {
            quad.c = witness_idx;
            quad.c_scaling = selector_value;
            c_set = true;
        } else if (!d_set || quad.d == witness_idx) {
            quad.d = witness_idx;
            quad.d_scaling = selector_value;
            d_set = true;
        } else {
            throw_or_abort("Cannot assign linear term to a constraint of width 4");
        }
    }

    // Set constant value q_c
    quad.const_scaling = uint256_t(arg.q_c);
    return quad;
}

void handle_arithmetic(Program::Opcode::AssertZero const& arg, AcirFormat& af)
{
    if (arg.value.linear_combinations.size() <= 3) {
        poly_triple pt = serialize_arithmetic_gate(arg.value);
        // Even if the number of linear terms is less than 3, we might not be able to fit it into a width-3 arithmetic
        // gate. This is the case if the linear terms are all disctinct witness from the multiplication term. In that
        // case, the serialize_arithmetic_gate() function will return a poly_triple with all 0's, and we use a width-4
        // gate instead. We could probably always use a width-4 gate in fact.
        if (pt == poly_triple{ 0, 0, 0, 0, 0, 0, 0, 0 }) {
            af.quad_constraints.push_back(serialize_mul_quad_gate(arg.value));
        } else {
            af.poly_triple_constraints.push_back(pt);
        }
    } else {
        af.quad_constraints.push_back(serialize_mul_quad_gate(arg.value));
    }
}

void handle_blackbox_func_call(Program::Opcode::BlackBoxFuncCall const& arg, AcirFormat& af)
{
    std::visit(
        [&](auto&& arg) {
            using T = std::decay_t<decltype(arg)>;
            if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::AND>) {
                af.logic_constraints.push_back(LogicConstraint{
                    .a = arg.lhs.witness.value,
                    .b = arg.rhs.witness.value,
                    .result = arg.output.value,
                    .num_bits = arg.lhs.num_bits,
                    .is_xor_gate = false,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::XOR>) {
                af.logic_constraints.push_back(LogicConstraint{
                    .a = arg.lhs.witness.value,
                    .b = arg.rhs.witness.value,
                    .result = arg.output.value,
                    .num_bits = arg.lhs.num_bits,
                    .is_xor_gate = true,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::RANGE>) {
                af.range_constraints.push_back(RangeConstraint{
                    .witness = arg.input.witness.value,
                    .num_bits = arg.input.num_bits,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::AES128Encrypt>) {
                af.aes128_constraints.push_back(AES128Constraint{
                    .inputs = map(arg.inputs,
                                  [](auto& e) {
                                      return AES128Input{
                                          .witness = e.witness.value,
                                          .num_bits = e.num_bits,
                                      };
                                  }),
                    .iv = map(arg.iv,
                              [](auto& e) {
                                  return AES128Input{
                                      .witness = e.witness.value,
                                      .num_bits = e.num_bits,
                                  };
                              }),
                    .key = map(arg.key,
                               [](auto& e) {
                                   return AES128Input{
                                       .witness = e.witness.value,
                                       .num_bits = e.num_bits,
                                   };
                               }),
                    .outputs = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::SHA256>) {
                af.sha256_constraints.push_back(Sha256Constraint{
                    .inputs = map(arg.inputs,
                                  [](auto& e) {
                                      return Sha256Input{
                                          .witness = e.witness.value,
                                          .num_bits = e.num_bits,
                                      };
                                  }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::Sha256Compression>) {
                af.sha256_compression.push_back(Sha256Compression{
                    .inputs = map(arg.inputs,
                                  [](auto& e) {
                                      return Sha256Input{
                                          .witness = e.witness.value,
                                          .num_bits = e.num_bits,
                                      };
                                  }),
                    .hash_values = map(arg.hash_values,
                                       [](auto& e) {
                                           return Sha256Input{
                                               .witness = e.witness.value,
                                               .num_bits = e.num_bits,
                                           };
                                       }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::Blake2s>) {
                af.blake2s_constraints.push_back(Blake2sConstraint{
                    .inputs = map(arg.inputs,
                                  [](auto& e) {
                                      return Blake2sInput{
                                          .witness = e.witness.value,
                                          .num_bits = e.num_bits,
                                      };
                                  }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::Blake3>) {
                af.blake3_constraints.push_back(Blake3Constraint{
                    .inputs = map(arg.inputs,
                                  [](auto& e) {
                                      return Blake3Input{
                                          .witness = e.witness.value,
                                          .num_bits = e.num_bits,
                                      };
                                  }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::SchnorrVerify>) {
                af.schnorr_constraints.push_back(SchnorrConstraint{
                    .message = map(arg.message, [](auto& e) { return e.witness.value; }),
                    .public_key_x = arg.public_key_x.witness.value,
                    .public_key_y = arg.public_key_y.witness.value,
                    .result = arg.output.value,
                    .signature = map(arg.signature, [](auto& e) { return e.witness.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::PedersenCommitment>) {
                af.pedersen_constraints.push_back(PedersenConstraint{
                    .scalars = map(arg.inputs, [](auto& e) { return e.witness.value; }),
                    .hash_index = arg.domain_separator,
                    .result_x = arg.outputs[0].value,
                    .result_y = arg.outputs[1].value,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::PedersenHash>) {
                af.pedersen_hash_constraints.push_back(PedersenHashConstraint{
                    .scalars = map(arg.inputs, [](auto& e) { return e.witness.value; }),
                    .hash_index = arg.domain_separator,
                    .result = arg.output.value,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::EcdsaSecp256k1>) {
                af.ecdsa_k1_constraints.push_back(EcdsaSecp256k1Constraint{
                    .hashed_message = map(arg.hashed_message, [](auto& e) { return e.witness.value; }),
                    .signature = map(arg.signature, [](auto& e) { return e.witness.value; }),
                    .pub_x_indices = map(arg.public_key_x, [](auto& e) { return e.witness.value; }),
                    .pub_y_indices = map(arg.public_key_y, [](auto& e) { return e.witness.value; }),
                    .result = arg.output.value,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::EcdsaSecp256r1>) {
                af.ecdsa_r1_constraints.push_back(EcdsaSecp256r1Constraint{
                    .hashed_message = map(arg.hashed_message, [](auto& e) { return e.witness.value; }),
                    .pub_x_indices = map(arg.public_key_x, [](auto& e) { return e.witness.value; }),
                    .pub_y_indices = map(arg.public_key_y, [](auto& e) { return e.witness.value; }),
                    .result = arg.output.value,
                    .signature = map(arg.signature, [](auto& e) { return e.witness.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::MultiScalarMul>) {
                af.multi_scalar_mul_constraints.push_back(MultiScalarMul{
                    .points = map(arg.points, [](auto& e) { return e.witness.value; }),
                    .scalars = map(arg.scalars, [](auto& e) { return e.witness.value; }),
                    .out_point_x = arg.outputs[0].value,
                    .out_point_y = arg.outputs[1].value,
                    .out_point_is_infinite = arg.outputs[2].value,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::EmbeddedCurveAdd>) {
                af.ec_add_constraints.push_back(EcAdd{
                    .input1_x = arg.input1[0].witness.value,
                    .input1_y = arg.input1[1].witness.value,
                    .input1_infinite = arg.input1[2].witness.value,
                    .input2_x = arg.input2[0].witness.value,
                    .input2_y = arg.input2[1].witness.value,
                    .input2_infinite = arg.input2[2].witness.value,
                    .result_x = arg.outputs[0].value,
                    .result_y = arg.outputs[1].value,
                    .result_infinite = arg.outputs[2].value,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::Keccak256>) {
                af.keccak_constraints.push_back(KeccakConstraint{
                    .inputs = map(arg.inputs,
                                  [](auto& e) {
                                      return HashInput{
                                          .witness = e.witness.value,
                                          .num_bits = e.num_bits,
                                      };
                                  }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                    .var_message_size = arg.var_message_size.witness.value,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::Keccakf1600>) {
                af.keccak_permutations.push_back(Keccakf1600{
                    .state = map(arg.inputs, [](auto& e) { return e.witness.value; }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::RecursiveAggregation>) {
                auto c = RecursionConstraint{
                    .key = map(arg.verification_key, [](auto& e) { return e.witness.value; }),
                    .proof = map(arg.proof, [](auto& e) { return e.witness.value; }),
                    .public_inputs = map(arg.public_inputs, [](auto& e) { return e.witness.value; }),
                    .key_hash = arg.key_hash.witness.value,
                };
                af.recursion_constraints.push_back(c);
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::BigIntFromLeBytes>) {
                af.bigint_from_le_bytes_constraints.push_back(BigIntFromLeBytes{
                    .inputs = map(arg.inputs, [](auto& e) { return e.witness.value; }),
                    .modulus = map(arg.modulus, [](auto& e) -> uint32_t { return e; }),
                    .result = arg.output,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::BigIntToLeBytes>) {
                af.bigint_to_le_bytes_constraints.push_back(BigIntToLeBytes{
                    .input = arg.input,
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::BigIntAdd>) {
                af.bigint_operations.push_back(BigIntOperation{
                    .lhs = arg.lhs,
                    .rhs = arg.rhs,
                    .result = arg.output,
                    .opcode = BigIntOperationType::Add,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::BigIntSub>) {
                af.bigint_operations.push_back(BigIntOperation{
                    .lhs = arg.lhs,
                    .rhs = arg.rhs,
                    .result = arg.output,
                    .opcode = BigIntOperationType::Sub,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::BigIntMul>) {
                af.bigint_operations.push_back(BigIntOperation{
                    .lhs = arg.lhs,
                    .rhs = arg.rhs,
                    .result = arg.output,
                    .opcode = BigIntOperationType::Mul,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::BigIntDiv>) {
                af.bigint_operations.push_back(BigIntOperation{
                    .lhs = arg.lhs,
                    .rhs = arg.rhs,
                    .result = arg.output,
                    .opcode = BigIntOperationType::Div,
                });
            } else if constexpr (std::is_same_v<T, Program::BlackBoxFuncCall::Poseidon2Permutation>) {
                af.poseidon2_constraints.push_back(Poseidon2Constraint{
                    .state = map(arg.inputs, [](auto& e) { return e.witness.value; }),
                    .result = map(arg.outputs, [](auto& e) { return e.value; }),
                    .len = arg.len,
                });
            }
        },
        arg.value.value);
}

BlockConstraint handle_memory_init(Program::Opcode::MemoryInit const& mem_init)
{
    BlockConstraint block{ .init = {}, .trace = {}, .type = BlockType::ROM };
    std::vector<poly_triple> init;
    std::vector<MemOp> trace;

    auto len = mem_init.init.size();
    for (size_t i = 0; i < len; ++i) {
        block.init.push_back(poly_triple{
            .a = mem_init.init[i].value,
            .b = 0,
            .c = 0,
            .q_m = 0,
            .q_l = 1,
            .q_r = 0,
            .q_o = 0,
            .q_c = 0,
        });
    }

    // Databus is only supported for Goblin, non Goblin builders will treat call_data and return_data as normal array.
    if (IsGoblinUltraBuilder<Builder>) {
        if (std::holds_alternative<Program::BlockType::CallData>(mem_init.block_type.value)) {
            block.type = BlockType::CallData;
        } else if (std::holds_alternative<Program::BlockType::ReturnData>(mem_init.block_type.value)) {
            block.type = BlockType::ReturnData;
        }
    }

    return block;
}

bool is_rom(Program::MemOp const& mem_op)
{
    return mem_op.operation.mul_terms.size() == 0 && mem_op.operation.linear_combinations.size() == 0 &&
           uint256_t(mem_op.operation.q_c) == 0;
}

void handle_memory_op(Program::Opcode::MemoryOp const& mem_op, BlockConstraint& block)
{
    uint8_t access_type = 1;
    if (is_rom(mem_op.op)) {
        access_type = 0;
    }
    if (access_type == 1) {
        // We are not allowed to write on the databus
        ASSERT((block.type != BlockType::CallData) && (block.type != BlockType::ReturnData));
        block.type = BlockType::RAM;
    }

    MemOp acir_mem_op = MemOp{ .access_type = access_type,
                               .index = serialize_arithmetic_gate(mem_op.op.index),
                               .value = serialize_arithmetic_gate(mem_op.op.value) };
    block.trace.push_back(acir_mem_op);
}

AcirFormat circuit_serde_to_acir_format(Program::Circuit const& circuit)
{
    AcirFormat af;
    // `varnum` is the true number of variables, thus we add one to the index which starts at zero
    af.varnum = circuit.current_witness_index + 1;
    af.recursive = circuit.recursive;
    af.num_acir_opcodes = static_cast<uint32_t>(circuit.opcodes.size());
    af.public_inputs = join({ map(circuit.public_parameters.value, [](auto e) { return e.value; }),
                              map(circuit.return_values.value, [](auto e) { return e.value; }) });
    std::map<uint32_t, BlockConstraint> block_id_to_block_constraint;
    for (auto gate : circuit.opcodes) {
        std::visit(
            [&](auto&& arg) {
                using T = std::decay_t<decltype(arg)>;
                if constexpr (std::is_same_v<T, Program::Opcode::AssertZero>) {
                    handle_arithmetic(arg, af);
                } else if constexpr (std::is_same_v<T, Program::Opcode::BlackBoxFuncCall>) {
                    handle_blackbox_func_call(arg, af);
                } else if constexpr (std::is_same_v<T, Program::Opcode::MemoryInit>) {
                    auto block = handle_memory_init(arg);
                    uint32_t block_id = arg.block_id.value;
                    block_id_to_block_constraint[block_id] = block;
                } else if constexpr (std::is_same_v<T, Program::Opcode::MemoryOp>) {
                    auto block = block_id_to_block_constraint.find(arg.block_id.value);
                    if (block == block_id_to_block_constraint.end()) {
                        throw_or_abort("unitialized MemoryOp");
                    }
                    handle_memory_op(arg, block->second);
                }
            },
            gate.value);
    }
    for (const auto& [block_id, block] : block_id_to_block_constraint) {
        if (!block.trace.empty()) {
            af.block_constraints.push_back(block);
        }
    }
    return af;
}

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t> const& buf)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/927): Move to using just `program_buf_to_acir_format`
    // once Honk fully supports all ACIR test flows
    // For now the backend still expects to work with a single ACIR function
    auto circuit = Program::Program::bincodeDeserialize(buf).functions[0];

    return circuit_serde_to_acir_format(circuit);
}

/**
 * @brief Converts from the ACIR-native `WitnessMap` format to Barretenberg's internal `WitnessVector` format.
 *
 * @param witness_map ACIR-native `WitnessMap` deserialized from a buffer
 * @return A `WitnessVector` equivalent to the passed `WitnessMap`.
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
 *       Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_map_to_witness_vector(WitnessStack::WitnessMap const& witness_map)
{
    WitnessVector wv;
    size_t index = 0;
    for (auto& e : witness_map.value) {
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned.
        // To ensure that witnesses sit at the correct indices in the `WitnessVector`, we fill any indices
        // which do not exist within the `WitnessMap` with the dummy value of zero.
        while (index < e.first.value) {
            wv.push_back(bb::fr(0));
            index++;
        }
        wv.push_back(bb::fr(uint256_t(e.second)));
        index++;
    }
    return wv;
}

/**
 * @brief Converts from the ACIR-native `WitnessMap` format to Barretenberg's internal `WitnessVector` format.
 *
 * @param buf Serialized representation of a `WitnessMap`.
 * @return A `WitnessVector` equivalent to the passed `WitnessMap`.
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
 *       Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_buf_to_witness_data(std::vector<uint8_t> const& buf)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/927): Move to using just `witness_buf_to_witness_stack`
    // once Honk fully supports all ACIR test flows.
    // For now the backend still expects to work with the stop of the `WitnessStack`.
    auto witness_stack = WitnessStack::WitnessStack::bincodeDeserialize(buf);
    auto w = witness_stack.stack[witness_stack.stack.size() - 1].witness;

    return witness_map_to_witness_vector(w);
}

std::vector<AcirFormat> program_buf_to_acir_format(std::vector<uint8_t> const& buf)
{
    auto program = Program::Program::bincodeDeserialize(buf);

    std::vector<AcirFormat> constraint_systems;
    constraint_systems.reserve(program.functions.size());
    for (auto const& function : program.functions) {
        constraint_systems.emplace_back(circuit_serde_to_acir_format(function));
    }

    return constraint_systems;
}

WitnessVectorStack witness_buf_to_witness_stack(std::vector<uint8_t> const& buf)
{
    auto witness_stack = WitnessStack::WitnessStack::bincodeDeserialize(buf);
    WitnessVectorStack witness_vector_stack;
    witness_vector_stack.reserve(witness_stack.stack.size());
    for (auto const& stack_item : witness_stack.stack) {
        witness_vector_stack.emplace_back(
            std::make_pair(stack_item.index, witness_map_to_witness_vector(stack_item.witness)));
    }
    return witness_vector_stack;
}

#ifndef __wasm__
AcirProgramStack get_acir_program_stack(std::string const& bytecode_path, std::string const& witness_path)
{
    auto bytecode = get_bytecode(bytecode_path);
    auto constraint_systems = program_buf_to_acir_format(bytecode);

    auto witness_data = get_bytecode(witness_path);
    auto witness_stack = witness_buf_to_witness_stack(witness_data);

    return { constraint_systems, witness_stack };
}
#endif
} // namespace acir_format