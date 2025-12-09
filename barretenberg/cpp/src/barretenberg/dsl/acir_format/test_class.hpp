// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/index.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "gtest/gtest.h"
#include <type_traits>
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

// Type trait to detect std::vector
template <typename T> struct is_std_vector : std::false_type {};

template <typename T, typename Alloc> struct is_std_vector<std::vector<T, Alloc>> : std::true_type {};

template <typename T> inline constexpr bool is_std_vector_v = is_std_vector<T>::value;

/**
 * @brief Convert a WitnessOrConstant back to an Acir::FunctionInput.
 */
inline Acir::FunctionInput witness_or_constant_to_function_input(const WitnessOrConstant<bb::fr>& input)
{
    if (input.is_constant) {
        return Acir::FunctionInput{ .value = Acir::FunctionInput::Constant{ .value = input.value.to_buffer() } };
    }
    return Acir::FunctionInput{ .value =
                                    Acir::FunctionInput::Witness{ .value = Acir::Witness{ .value = input.index } } };
}

/**
 * @brief Convert a witness index to an Acir::FunctionInput (witness variant).
 */
inline Acir::FunctionInput witness_to_function_input(uint32_t witness_index)
{
    return Acir::FunctionInput{ .value =
                                    Acir::FunctionInput::Witness{ .value = Acir::Witness{ .value = witness_index } } };
}

/**
 * @brief Convert a WitnessOrConstant to an Acir::Expression.
 *
 * @details For a witness, creates an expression with a single linear term (coefficient 1).
 * For a constant, creates an expression with only the constant term.
 */
inline Acir::Expression witness_or_constant_to_expression(const WitnessOrConstant<bb::fr>& input)
{
    Acir::Expression expr{
        .mul_terms = {},
        .linear_combinations = {},
        .q_c = bb::fr::zero().to_buffer(),
    };

    if (input.is_constant) {
        expr.q_c = input.value.to_buffer();
    } else {
        // Linear term with coefficient 1
        expr.linear_combinations.push_back(
            std::make_tuple(bb::fr::one().to_buffer(), Acir::Witness{ .value = input.index }));
    }

    return expr;
}

/**
 * @brief Convert an AccessType to an Acir::Expression representing the operation type.
 *
 * @details Read operations are represented by Expression with constant 0,
 * Write operations are represented by Expression with constant 1.
 */
inline Acir::Expression access_type_to_expression(AccessType access_type)
{
    bb::fr value = (access_type == AccessType::Write) ? bb::fr::one() : bb::fr::zero();
    return Acir::Expression{
        .mul_terms = {},
        .linear_combinations = {},
        .q_c = value.to_buffer(),
    };
}

/**
 * @brief Convert an acir_format::MemOp to an Acir::MemOp.
 */
inline Acir::MemOp mem_op_to_acir_mem_op(const MemOp& mem_op)
{
    return Acir::MemOp{
        .operation = access_type_to_expression(mem_op.access_type),
        .index = witness_or_constant_to_expression(mem_op.index),
        .value = witness_or_constant_to_expression(mem_op.value),
    };
}

/**
 * @brief Convert an acir_format::BlockType to an Acir::BlockType.
 */
inline Acir::BlockType block_type_to_acir_block_type(BlockType type, CallDataType calldata_id)
{
    switch (type) {
    case BlockType::ROM:
    case BlockType::RAM:
        // ROM and RAM both map to Memory in ACIR
        return Acir::BlockType{ .value = Acir::BlockType::Memory{} };
    case BlockType::CallData: {
        uint32_t id = (calldata_id == CallDataType::Primary) ? 0 : 1;
        return Acir::BlockType{ .value = Acir::BlockType::CallData{ .value = id } };
    }
    case BlockType::ReturnData:
        return Acir::BlockType{ .value = Acir::BlockType::ReturnData{} };
    default:
        throw_or_abort("Unknown BlockType");
    }
}

/**
 * @brief Convert a BlockConstraint to a vector of Acir::Opcodes.
 *
 * @details A BlockConstraint generates:
 * 1. One MemoryInit opcode containing the initial values and block type
 * 2. Multiple MemoryOp opcodes, one for each memory operation in the trace
 *
 * @param constraint The BlockConstraint to convert
 * @param block_id The block ID to use for the memory operations
 * @return std::vector<Acir::Opcode> The corresponding ACIR opcodes
 */
inline std::vector<Acir::Opcode> block_constraint_to_acir_opcodes(const BlockConstraint& constraint,
                                                                  uint32_t block_id = 0)
{
    std::vector<Acir::Opcode> opcodes;

    // Create the MemoryInit opcode
    std::vector<Acir::Witness> init_witnesses;
    init_witnesses.reserve(constraint.init.size());
    for (const auto& init_val : constraint.init) {
        init_witnesses.push_back(Acir::Witness{ .value = init_val });
    }

    Acir::Opcode::MemoryInit mem_init{
        .block_id = Acir::BlockId{ .value = block_id },
        .init = std::move(init_witnesses),
        .block_type = block_type_to_acir_block_type(constraint.type, constraint.calldata_id),
    };
    opcodes.push_back(Acir::Opcode{ .value = mem_init });

    // Create MemoryOp opcodes for each operation in the trace
    for (const auto& mem_op : constraint.trace) {
        Acir::Opcode::MemoryOp acir_mem_op{
            .block_id = Acir::BlockId{ .value = block_id },
            .op = mem_op_to_acir_mem_op(mem_op),
        };
        opcodes.push_back(Acir::Opcode{ .value = acir_mem_op });
    }

    return opcodes;
}

/**
 * @brief Add terms for a mul_quad_ gate to an Acir::Expression
 *
 */
inline void add_terms_to_expression(Acir::Expression& expr, const mul_quad_<bb::fr>& mul_quad)
{
    // Add multiplication term if both a and b are not constants
    if (mul_quad.a != bb::stdlib::IS_CONSTANT && mul_quad.b != bb::stdlib::IS_CONSTANT &&
        !mul_quad.mul_scaling.is_zero()) {
        expr.mul_terms.push_back(std::make_tuple(mul_quad.mul_scaling.to_buffer(),
                                                 Acir::Witness{ .value = mul_quad.a },
                                                 Acir::Witness{ .value = mul_quad.b }));
    }

    // Add linear terms for each non-constant witness with non-zero scaling
    if (mul_quad.a != bb::stdlib::IS_CONSTANT && !mul_quad.a_scaling.is_zero()) {
        expr.linear_combinations.push_back(
            std::make_tuple(mul_quad.a_scaling.to_buffer(), Acir::Witness{ .value = mul_quad.a }));
    }
    if (mul_quad.b != bb::stdlib::IS_CONSTANT && !mul_quad.b_scaling.is_zero()) {
        expr.linear_combinations.push_back(
            std::make_tuple(mul_quad.b_scaling.to_buffer(), Acir::Witness{ .value = mul_quad.b }));
    }
    if (mul_quad.c != bb::stdlib::IS_CONSTANT && !mul_quad.c_scaling.is_zero()) {
        expr.linear_combinations.push_back(
            std::make_tuple(mul_quad.c_scaling.to_buffer(), Acir::Witness{ .value = mul_quad.c }));
    }
    if (mul_quad.d != bb::stdlib::IS_CONSTANT && !mul_quad.d_scaling.is_zero()) {
        expr.linear_combinations.push_back(
            std::make_tuple(mul_quad.d_scaling.to_buffer(), Acir::Witness{ .value = mul_quad.d }));
    }
}

/**
 * @brief Convert a constraint to a vector of Acir::Opcodes.
 *
 * @details This function converts barretenberg constraint types back to their corresponding Acir::Opcode
 * representation. This enables testing the full ACIR flow by going through circuit_serde_to_acir_format.
 * Most constraint types produce a single opcode, but BlockConstraint produces multiple opcodes
 * (one MemoryInit and multiple MemoryOp opcodes).
 *
 * @param constraint The constraint to convert
 * @return std::vector<Acir::Opcode> The corresponding ACIR opcodes
 */
template <typename ConstraintType> std::vector<Acir::Opcode> constraint_to_acir_opcode(const ConstraintType& constraint)
{
    if constexpr (std::is_same_v<ConstraintType, LogicConstraint>) {
        // LogicConstraint maps to either AND or XOR BlackBoxFuncCall
        if (constraint.is_xor_gate) {
            return { Acir::Opcode{
                .value = Acir::Opcode::BlackBoxFuncCall{
                    .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::XOR{
                                                         .lhs = witness_or_constant_to_function_input(constraint.a),
                                                         .rhs = witness_or_constant_to_function_input(constraint.b),
                                                         .num_bits = constraint.num_bits,
                                                         .output = Acir::Witness{ .value = constraint.result },
                                                     } } } } };
        }
        return { Acir::Opcode{
            .value = Acir::Opcode::BlackBoxFuncCall{
                .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::AND{
                                                     .lhs = witness_or_constant_to_function_input(constraint.a),
                                                     .rhs = witness_or_constant_to_function_input(constraint.b),
                                                     .num_bits = constraint.num_bits,
                                                     .output = Acir::Witness{ .value = constraint.result },
                                                 } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, RangeConstraint>) {
        return { Acir::Opcode{
            .value = Acir::Opcode::BlackBoxFuncCall{
                .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::RANGE{
                                                     .input = witness_to_function_input(constraint.witness),
                                                     .num_bits = constraint.num_bits,
                                                 } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, AES128Constraint>) {
        std::vector<Acir::FunctionInput> inputs;
        for (const auto& input : constraint.inputs) {
            inputs.push_back(witness_or_constant_to_function_input(input));
        }
        auto iv = std::make_shared<std::array<Acir::FunctionInput, 16>>();
        for (size_t i = 0; i < 16; ++i) {
            (*iv)[i] = witness_or_constant_to_function_input(constraint.iv[i]);
        }
        auto key = std::make_shared<std::array<Acir::FunctionInput, 16>>();
        for (size_t i = 0; i < 16; ++i) {
            (*key)[i] = witness_or_constant_to_function_input(constraint.key[i]);
        }
        std::vector<Acir::Witness> outputs;
        for (const auto& out : constraint.outputs) {
            outputs.push_back(Acir::Witness{ .value = out });
        }
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::AES128Encrypt{
                                                                        .inputs = std::move(inputs),
                                                                        .iv = iv,
                                                                        .key = key,
                                                                        .outputs = std::move(outputs),
                                                                    } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, Sha256Compression>) {
        auto inputs = std::make_shared<std::array<Acir::FunctionInput, 16>>();
        for (size_t i = 0; i < 16; ++i) {
            (*inputs)[i] = witness_or_constant_to_function_input(constraint.inputs[i]);
        }
        auto hash_values = std::make_shared<std::array<Acir::FunctionInput, 8>>();
        for (size_t i = 0; i < 8; ++i) {
            (*hash_values)[i] = witness_or_constant_to_function_input(constraint.hash_values[i]);
        }
        auto outputs = std::make_shared<std::array<Acir::Witness, 8>>();
        for (size_t i = 0; i < 8; ++i) {
            (*outputs)[i] = Acir::Witness{ .value = constraint.result[i] };
        }
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::Sha256Compression{
                                                                        .inputs = inputs,
                                                                        .hash_values = hash_values,
                                                                        .outputs = outputs,
                                                                    } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, EcdsaConstraint>) {
        auto hashed_message = std::make_shared<std::array<Acir::FunctionInput, 32>>();
        for (size_t i = 0; i < 32; ++i) {
            (*hashed_message)[i] = witness_to_function_input(constraint.hashed_message[i]);
        }
        auto signature = std::make_shared<std::array<Acir::FunctionInput, 64>>();
        for (size_t i = 0; i < 64; ++i) {
            (*signature)[i] = witness_to_function_input(constraint.signature[i]);
        }
        auto public_key_x = std::make_shared<std::array<Acir::FunctionInput, 32>>();
        for (size_t i = 0; i < 32; ++i) {
            (*public_key_x)[i] = witness_to_function_input(constraint.pub_x_indices[i]);
        }
        auto public_key_y = std::make_shared<std::array<Acir::FunctionInput, 32>>();
        for (size_t i = 0; i < 32; ++i) {
            (*public_key_y)[i] = witness_to_function_input(constraint.pub_y_indices[i]);
        }
        auto predicate = witness_or_constant_to_function_input(constraint.predicate);
        if (constraint.type == bb::CurveType::SECP256K1) {
            return { Acir::Opcode{
                .value = Acir::Opcode::BlackBoxFuncCall{
                    .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::EcdsaSecp256k1{
                                                         .public_key_x = public_key_x,
                                                         .public_key_y = public_key_y,
                                                         .signature = signature,
                                                         .hashed_message = hashed_message,
                                                         .predicate = predicate,
                                                         .output = Acir::Witness{ .value = constraint.result },
                                                     } } } } };
        }
        return { Acir::Opcode{
            .value = Acir::Opcode::BlackBoxFuncCall{
                .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::EcdsaSecp256r1{
                                                     .public_key_x = public_key_x,
                                                     .public_key_y = public_key_y,
                                                     .signature = signature,
                                                     .hashed_message = hashed_message,
                                                     .predicate = predicate,
                                                     .output = Acir::Witness{ .value = constraint.result },
                                                 } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, Blake2sConstraint>) {
        std::vector<Acir::FunctionInput> inputs;
        for (const auto& input : constraint.inputs) {
            inputs.push_back(witness_or_constant_to_function_input(input.blackbox_input));
        }
        auto outputs = std::make_shared<std::array<Acir::Witness, 32>>();
        for (size_t i = 0; i < 32; ++i) {
            (*outputs)[i] = Acir::Witness{ .value = constraint.result[i] };
        }
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::Blake2s{
                                                                        .inputs = std::move(inputs),
                                                                        .outputs = outputs,
                                                                    } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, Blake3Constraint>) {
        std::vector<Acir::FunctionInput> inputs;
        for (const auto& input : constraint.inputs) {
            inputs.push_back(witness_or_constant_to_function_input(input.blackbox_input));
        }
        auto outputs = std::make_shared<std::array<Acir::Witness, 32>>();
        for (size_t i = 0; i < 32; ++i) {
            (*outputs)[i] = Acir::Witness{ .value = constraint.result[i] };
        }
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::Blake3{
                                                                        .inputs = std::move(inputs),
                                                                        .outputs = outputs,
                                                                    } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, Keccakf1600>) {
        auto inputs = std::make_shared<std::array<Acir::FunctionInput, 25>>();
        for (size_t i = 0; i < 25; ++i) {
            (*inputs)[i] = witness_or_constant_to_function_input(constraint.state[i]);
        }
        auto outputs = std::make_shared<std::array<Acir::Witness, 25>>();
        for (size_t i = 0; i < 25; ++i) {
            (*outputs)[i] = Acir::Witness{ .value = constraint.result[i] };
        }
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::Keccakf1600{
                                                                        .inputs = inputs,
                                                                        .outputs = outputs,
                                                                    } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, Poseidon2Constraint>) {
        std::vector<Acir::FunctionInput> inputs;
        for (const auto& input : constraint.state) {
            inputs.push_back(witness_or_constant_to_function_input(input));
        }
        std::vector<Acir::Witness> outputs;
        for (const auto& out : constraint.result) {
            outputs.push_back(Acir::Witness{ .value = out });
        }
        return { Acir::Opcode{
            .value = Acir::Opcode::BlackBoxFuncCall{
                .value = Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::Poseidon2Permutation{
                                                     .inputs = std::move(inputs),
                                                     .outputs = std::move(outputs),
                                                 } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, MultiScalarMul>) {
        std::vector<Acir::FunctionInput> points;
        for (const auto& pt : constraint.points) {
            points.push_back(witness_or_constant_to_function_input(pt));
        }
        std::vector<Acir::FunctionInput> scalars;
        for (const auto& sc : constraint.scalars) {
            scalars.push_back(witness_or_constant_to_function_input(sc));
        }
        auto outputs = std::make_shared<std::array<Acir::Witness, 3>>();
        (*outputs)[0] = Acir::Witness{ .value = constraint.out_point_x };
        (*outputs)[1] = Acir::Witness{ .value = constraint.out_point_y };
        (*outputs)[2] = Acir::Witness{ .value = constraint.out_point_is_infinite };
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{
                                       .value = Acir::BlackBoxFuncCall::MultiScalarMul{
                                           .points = std::move(points),
                                           .scalars = std::move(scalars),
                                           .predicate = witness_or_constant_to_function_input(constraint.predicate),
                                           .outputs = outputs,
                                       } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, EcAdd>) {
        auto input1 = std::make_shared<std::array<Acir::FunctionInput, 3>>();
        (*input1)[0] = witness_or_constant_to_function_input(constraint.input1_x);
        (*input1)[1] = witness_or_constant_to_function_input(constraint.input1_y);
        (*input1)[2] = witness_or_constant_to_function_input(constraint.input1_infinite);
        auto input2 = std::make_shared<std::array<Acir::FunctionInput, 3>>();
        (*input2)[0] = witness_or_constant_to_function_input(constraint.input2_x);
        (*input2)[1] = witness_or_constant_to_function_input(constraint.input2_y);
        (*input2)[2] = witness_or_constant_to_function_input(constraint.input2_infinite);
        auto outputs = std::make_shared<std::array<Acir::Witness, 3>>();
        (*outputs)[0] = Acir::Witness{ .value = constraint.result_x };
        (*outputs)[1] = Acir::Witness{ .value = constraint.result_y };
        (*outputs)[2] = Acir::Witness{ .value = constraint.result_infinite };
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{
                                       .value = Acir::BlackBoxFuncCall::EmbeddedCurveAdd{
                                           .input1 = input1,
                                           .input2 = input2,
                                           .predicate = witness_or_constant_to_function_input(constraint.predicate),
                                           .outputs = outputs,
                                       } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, RecursionConstraint>) {
        std::vector<Acir::FunctionInput> verification_key;
        for (const auto& key_idx : constraint.key) {
            verification_key.push_back(witness_to_function_input(key_idx));
        }
        std::vector<Acir::FunctionInput> proof;
        for (const auto& proof_idx : constraint.proof) {
            proof.push_back(witness_to_function_input(proof_idx));
        }
        std::vector<Acir::FunctionInput> public_inputs;
        for (const auto& pub_input_idx : constraint.public_inputs) {
            public_inputs.push_back(witness_to_function_input(pub_input_idx));
        }
        return { Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                                   .value = Acir::BlackBoxFuncCall{
                                       .value = Acir::BlackBoxFuncCall::RecursiveAggregation{
                                           .verification_key = std::move(verification_key),
                                           .proof = std::move(proof),
                                           .public_inputs = std::move(public_inputs),
                                           .key_hash = witness_to_function_input(constraint.key_hash),
                                           .proof_type = constraint.proof_type,
                                           .predicate = witness_or_constant_to_function_input(constraint.predicate),
                                       } } } } };
    } else if constexpr (std::is_same_v<ConstraintType, BlockConstraint>) {
        return block_constraint_to_acir_opcodes(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, bb::mul_quad_<bb::curve::BN254::ScalarField>>) {
        // Convert a single mul_quad_ to an AssertZero opcode
        Acir::Expression expr{
            .mul_terms = {},
            .linear_combinations = {},
            .q_c = constraint.const_scaling.to_buffer(),
        };

        add_terms_to_expression(expr, constraint);

        return { Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = expr } } };
    } else if constexpr (std::is_same_v<ConstraintType, std::vector<bb::mul_quad_<bb::curve::BN254::ScalarField>>>) {
        // Convert a vector of mul_quad_ (big_quad_constraints) to an AssertZero opcode
        Acir::Expression expr{
            .mul_terms = {},
            .linear_combinations = {},
            .q_c = constraint[0].const_scaling.to_buffer(),
        };

        for (const auto& mul_quad : constraint) {
            add_terms_to_expression(expr, mul_quad);
        }

        return { Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = expr } } };
    } else {
        throw_or_abort("Unsupported constraint type");
    }
}

/**
 * @brief Build an Acir::Circuit from opcodes and witness count.
 *
 * @param opcodes The ACIR opcodes to include in the circuit
 * @param max_witness_index The maximum witness index in the circuit
 * @return Acir::Circuit The constructed circuit
 *
 * @note max_witness_index is not used by circuit_serde_to_acir_format, but we pass it for completeness
 */
inline Acir::Circuit build_acir_circuit(const std::vector<Acir::Opcode>& opcodes, uint32_t max_witness_index)
{
    return Acir::Circuit{
        .function_name = "test_circuit",
        .current_witness_index = max_witness_index,
        .opcodes = opcodes,
        .private_parameters = {},
        .public_parameters = Acir::PublicInputs{ .value = {} },
        .return_values = Acir::PublicInputs{ .value = {} },
        .assert_messages = {},
    };
}

/**
 * @brief Convert an AcirConstraint (single or vector) to AcirFormat by going through the full ACIR serde flow.
 *
 * @details This function:
 * 1. Converts the constraint(s) to Acir::Opcodes
 * 2. Builds an Acir::Circuit with those opcodes
 * 3. Passes the circuit through circuit_serde_to_acir_format
 *
 * When ConstraintType is a std::vector, iterates over all constraints and collects their opcodes.
 *
 * @param constraint The constraint (or vector of constraints) to convert
 * @param varnum The number of witnesses
 * @return AcirFormat The resulting AcirFormat
 */
template <typename ConstraintType>
AcirFormat constraint_to_acir_format(const ConstraintType& constraint, uint32_t varnum)
{
    std::vector<Acir::Opcode> opcodes;

    if constexpr (is_std_vector_v<ConstraintType>) {
        // Handle vector of constraints - collect all opcodes
        for (const auto& c : constraint) {
            auto c_opcodes = constraint_to_acir_opcode(c);
            opcodes.insert(opcodes.end(), c_opcodes.begin(), c_opcodes.end());
        }
    } else {
        // Handle single constraint
        opcodes = constraint_to_acir_opcode(constraint);
    }

    Acir::Circuit circuit = build_acir_circuit(opcodes, varnum);
    return circuit_serde_to_acir_format(circuit);
}

/**
 * @brief Concept defining the requirements for the Base template parameter of TestClass
 *
 * @details Base must provide:
 * - A class InvalidWitness, which specifies how to invalidate witness values to make the constraints
 *   unsatisfied. InvalidWitness must specify an enum class Target, which details the different invalidation targets,
 *   and two functions get_all() and get_labels() to iterate over all the possible invalidation targets.
 * - Type aliases: Builder and AcirConstraint, specifying the Builder and constraint we are working with.
 * - Static methods: generate_constraints (to generate valid constraints), invalidate_witness
 *   (to invalidate witness values to produce unsatisfied constraints).
 */
template <typename T>
concept TestBase = requires {
    // Required type aliases
    typename T::Builder;
    typename T::AcirConstraint;
    typename T::InvalidWitness;
    typename T::InvalidWitness::Target;

    // Ensure InvalidWitness::Target is enum
    requires std::is_enum_v<typename T::InvalidWitness::Target>;

    // Ensure that InvalidWitness::Target has a None value
    { T::InvalidWitness::Target::None };

    // InvalidWitness must provide static methods for test iteration
    { T::InvalidWitness::get_all() } -> std::same_as<std::vector<typename T::InvalidWitness::Target>>;
    { T::InvalidWitness::get_labels() } -> std::same_as<std::vector<std::string>>;

    // Required constraint manipulation methods (can be static or non-static)
    requires requires(T& instance,
                      typename T::AcirConstraint& constraint,
                      WitnessVector& witness_values,
                      const typename T::InvalidWitness::Target& invalid_witness_target) {
        /**
         * @brief Generate valid constraints.
         *
         */
        { instance.generate_constraints(constraint, witness_values) } -> std::same_as<void>;

        /**
         * @brief Invalidate witness values to test that invalid witnesses produce unsatisfied constraints.
         *
         */
        { instance.invalidate_witness(constraint, witness_values, invalid_witness_target) } -> std::same_as<void>;

        /**
         * @brief Method to generate ProgramMetadata to feed to create_circuit
         *
         */
        { T::generate_metadata() } -> std::same_as<ProgramMetadata>;
    };
};

template <TestBase Base> class TestClass {
  public:
    using Builder = Base::Builder;
    using AcirConstraint = Base::AcirConstraint;
    using InvalidWitness = Base::InvalidWitness;
    using InvalidWitnessTarget = Base::InvalidWitness::Target;

    /**
     * @brief Generate constraints and witness values based on the invalidation target.
     */
    static std::pair<AcirConstraint, WitnessVector> generate_constraints(
        const InvalidWitnessTarget& invalid_witness_target = InvalidWitnessTarget::None)
    {
        AcirConstraint constraint;
        WitnessVector witness_values;

        // Create an instance to allow for non-static methods
        Base base_instance;
        base_instance.generate_constraints(constraint, witness_values);
        base_instance.invalidate_witness(constraint, witness_values, invalid_witness_target);

        return { constraint, witness_values };
    }

    /**
     * @brief General purpose testing function. It generates the test based on the predicate and invalidation target.
     *
     * @details In a real flow, we have:
     *          Noir --> ACIR --> Bytes --> AcirFormat (via circuit_buf_to_acir_format) --> Builder
     * We simulate the above flow by generating an AcirConstraint (one of the constraints stored in an AcirFormat
     * struct), rewinding it into its Acir::Opcode form (which is the output of the byte deserialization step in the
     * diagram above), and then feeding it into circuit_serde_to_acir_format as an Acir::Circuit with a single opcode.
     * The function circuit_buf_to_acir_format internally calls circuit_serde_to_acir_format after having deserialized
     * the byte buffer to an Acir::Circuit, so the flow in this test is the same as the real flow, minus the byte
     * serialization/deserialization. The rationale for doing the rewinding is ensuring that barretenberg internally
     * tests circuit_serde_to_acir_format, which would otherwise only be tested via the tests in acir_tests.
     *
     */
    static std::tuple<bool, bool, std::string> test_constraints(const InvalidWitnessTarget& invalid_witness_target)
    {
        auto [constraint, witness_values] = generate_constraints(invalid_witness_target);

        // Use the full ACIR flow: constraint -> Acir::Opcode -> Acir::Circuit -> circuit_serde_to_acir_format
        AcirFormat constraint_system = constraint_to_acir_format(
            constraint, /*max_witness_index=*/static_cast<uint32_t>(witness_values.size()) - 1);

        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program, Base::generate_metadata());

        return { CircuitChecker::check(builder), builder.failed(), builder.err() };
    }

    /**
     * @brief Test vk generation is independent of the witness values supplied.
     *
     * @details This function tests that the verification key is deterministic and independent
     * of the witness values by going through the full ACIR flow.
     *
     * @tparam Flavor
     */
    template <typename Flavor> static size_t test_vk_independence()
    {
        using ProverInstance = ProverInstance_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        size_t num_gates = 0;

        // Generate the constraint system
        auto [constraint, witness_values] = generate_constraints();

        // Use the full ACIR flow: constraint -> Acir::Opcode -> Acir::Circuit -> circuit_serde_to_acir_format
        AcirFormat constraint_system = constraint_to_acir_format(
            constraint, /*max_witness_index=*/static_cast<uint32_t>(witness_values.size()) - 1);

        // Construct the vks
        std::shared_ptr<VerificationKey> vk_from_witness;
        {
            AcirProgram program{ constraint_system, witness_values };
            auto builder = create_circuit<Builder>(program, Base::generate_metadata());
            num_gates = builder.get_num_finalized_gates_inefficient();

            auto prover_instance = std::make_shared<ProverInstance>(builder);
            vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

            // Validate the builder
            EXPECT_TRUE(CircuitChecker::check(builder));
        }

        std::shared_ptr<VerificationKey> vk_from_constraint;
        {
            AcirProgram program{ constraint_system, /*witness=*/{} };
            auto builder = create_circuit<Builder>(program, Base::generate_metadata());
            auto prover_instance = std::make_shared<ProverInstance>(builder);
            vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        }

        EXPECT_EQ(*vk_from_witness, *vk_from_constraint) << "Mismatch in the vks";

        return num_gates;
    }

    /**
     * @brief Test all invalid witness targets.
     *
     * @return std::vector<std::string> List of error messages from the builder for each invalid witness target.
     */
    static std::vector<std::string> test_tampering()
    {
        std::vector<std::string> error_msgs;
        for (auto [target, label] : zip_view(InvalidWitness::get_all(), InvalidWitness::get_labels())) {
            auto [circuit_checker_result, builder_failed, builder_err] = test_constraints(target);
            error_msgs.emplace_back(builder_err);

            if (target != InvalidWitness::Target::None) {
                bool circuit_check_failed = !circuit_checker_result;
                bool assert_eq_error_present = (builder_err.find("assert_eq") != std::string::npos);
                EXPECT_TRUE(circuit_check_failed || assert_eq_error_present)
                    << "Circuit checker succeeded unexpectedly and no assert_eq failure for invalid witness target " +
                           label;
                EXPECT_TRUE(builder_failed) << "Builder succeeded for invalid witness target " + label;
            } else {
                EXPECT_TRUE(circuit_checker_result)
                    << "Circuit checker failed unexpectedly for invalid witness target " + label;
                EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for invalid witness target " + label;
            }
        }

        return error_msgs;
    }
};

} // namespace acir_format
