// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "acir_to_constraint_buf.hpp"

#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <tuple>
#include <utility>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace acir_format {

using namespace bb;

// Cap on `WitnessMap` indices: bounds the gap-fill allocation in `witness_map_to_witness_vector`.
static constexpr uint32_t MAX_WITNESS_INDEX = 1U << 28;

template <class... Ts> struct overloaded : Ts... {
    using Ts::operator()...;
};

bb::fr from_buffer_with_bound_checks(const std::vector<uint8_t>& buffer)
{
    BB_ASSERT_EQ(buffer.size(), 32U, "acir_format::from_buffer_with_bound_checks: buffer size must be 32 bytes.");
    return fr::serialize_from_buffer(buffer.data());
}

WitnessOrConstant<bb::fr> parse_input(const Acir::FunctionInput& input)
{
    WitnessOrConstant<bb::fr> result = std::visit(overloaded{ [](const Acir::FunctionInput::Witness& e) {
                                                                 return WitnessOrConstant<bb::fr>{
                                                                     .index = e.value.value,
                                                                     .value = bb::fr::zero(),
                                                                     .is_constant = false,
                                                                 };
                                                             },
                                                              [](const Acir::FunctionInput::Constant& e) {
                                                                  return WitnessOrConstant<bb::fr>{
                                                                      .index = bb::stdlib::IS_CONSTANT,
                                                                      .value = from_buffer_with_bound_checks(e.value),
                                                                      .is_constant = true,
                                                                  };
                                                              } },
                                                  input.value);
    return result;
}

uint32_t get_witness_from_function_input(const Acir::FunctionInput& input)
{
    BB_ASSERT(std::holds_alternative<Acir::FunctionInput::Witness>(input.value),
              "acir_format::get_witness_from_function_input: input must be a Witness variant. An error here means "
              "there was a serialization error.");

    return std::get<Acir::FunctionInput::Witness>(input.value).value.value;
}

void update_max_witness_index(const uint32_t witness_idx, AcirFormat& af)
{
    if (witness_idx != stdlib::IS_CONSTANT) {
        af.max_witness_index = std::max(af.max_witness_index, witness_idx);
    }
}

void update_max_witness_index_from_expression(Acir::Expression const& expr, AcirFormat& af)
{
    // Process multiplication terms: each term has two witness indices
    for (const auto& mul_term : expr.mul_terms) {
        update_max_witness_index(std::get<1>(mul_term).value, af);
        update_max_witness_index(std::get<2>(mul_term).value, af);
    }

    // Process linear combinations: each term has one witness index
    for (const auto& linear_term : expr.linear_combinations) {
        update_max_witness_index(std::get<1>(linear_term).value, af);
    }
}

void update_max_witness_index_from_opcode(Acir::Opcode const& opcode, AcirFormat& af)
{
    auto update_max_witness_index_from_function_input = [&](const Acir::FunctionInput& input) {
        if (std::holds_alternative<Acir::FunctionInput::Witness>(input.value)) {
            update_max_witness_index(std::get<Acir::FunctionInput::Witness>(input.value).value.value, af);
        }
    };

    auto update_max_witness_index_from_witness = [&](const Acir::Witness& witness) {
        update_max_witness_index(witness.value, af);
    };

    std::visit(
        overloaded{
            [&](const Acir::Opcode::AssertZero& arg) { update_max_witness_index_from_expression(arg.value, af); },
            [&](const Acir::Opcode::BlackBoxFuncCall& arg) {
                std::visit(overloaded{ [&](const Acir::BlackBoxFuncCall::AND& bb_arg) {
                                          update_max_witness_index_from_function_input(bb_arg.lhs);
                                          update_max_witness_index_from_function_input(bb_arg.rhs);
                                          update_max_witness_index_from_witness(bb_arg.output);
                                      },
                                       [&](const Acir::BlackBoxFuncCall::XOR& bb_arg) {
                                           update_max_witness_index_from_function_input(bb_arg.lhs);
                                           update_max_witness_index_from_function_input(bb_arg.rhs);
                                           update_max_witness_index_from_witness(bb_arg.output);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::RANGE& bb_arg) {
                                           update_max_witness_index_from_function_input(bb_arg.input);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::AES128Encrypt& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.iv) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.key) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Sha256Compression& bb_arg) {
                                           for (const auto& input : *bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.hash_values) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Blake2s& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Blake3& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::EcdsaSecp256k1& bb_arg) {
                                           for (const auto& input : *bb_arg.public_key_x) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.public_key_y) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.signature) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.hashed_message) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           update_max_witness_index_from_witness(bb_arg.output);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::EcdsaSecp256r1& bb_arg) {
                                           for (const auto& input : *bb_arg.public_key_x) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.public_key_y) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.signature) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.hashed_message) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           update_max_witness_index_from_witness(bb_arg.output);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::MultiScalarMul& bb_arg) {
                                           for (const auto& input : bb_arg.points) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : bb_arg.scalars) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::EmbeddedCurveAdd& bb_arg) {
                                           for (const auto& input : *bb_arg.input1) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.input2) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Keccakf1600& bb_arg) {
                                           for (const auto& input : *bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::RecursiveAggregation& bb_arg) {
                                           for (const auto& input : bb_arg.verification_key) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : bb_arg.proof) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : bb_arg.public_inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.key_hash);
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Poseidon2Permutation& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       } },
                           arg.value.value);
            },
            [&](const Acir::Opcode::MemoryInit& arg) {
                for (const auto& init : arg.init) {
                    update_max_witness_index_from_witness(init);
                }
            },
            [&](const Acir::Opcode::MemoryOp& arg) {
                update_max_witness_index_from_witness(arg.op.index);
                update_max_witness_index_from_witness(arg.op.value);
            },
            [&](const Acir::Opcode::BrilligCall& arg) {
                for (const auto& input : arg.inputs) {
                    std::visit(overloaded{
                                   [&](const Acir::BrilligInputs::Single& e) {
                                       update_max_witness_index_from_expression(e.value, af);
                                   },
                                   [&](const Acir::BrilligInputs::Array& e) {
                                       for (const auto& expr : e.value) {
                                           update_max_witness_index_from_expression(expr, af);
                                       }
                                   },
                                   [&](const Acir::BrilligInputs::MemoryArray&) {
                                       // MemoryArray does not contain witnesses directly, so nothing to do here.
                                   },
                               },
                               input.value);
                }
                for (const auto& output : arg.outputs) {
                    std::visit(overloaded{
                                   [&](const Acir::BrilligOutputs::Simple& e) {
                                       update_max_witness_index_from_witness(e.value);
                                   },
                                   [&](const Acir::BrilligOutputs::Array& e) {
                                       for (const auto& witness : e.value) {
                                           update_max_witness_index_from_witness(witness);
                                       }
                                   },
                               },
                               output.value);
                }
                update_max_witness_index_from_expression(arg.predicate, af);
            },
            [&](const Acir::Opcode::Call&) {
                bb::assert_failure("acir_format::update_max_witness_index_from_opcode: Call opcode is not supported.");
            },
        },
        opcode.value);
}

/// ========= BYTES TO BARRETENBERG'S REPRESENTATION  ========= ///

template <typename T>
T deserialize_msgpack_compact(std::vector<uint8_t>&& buf, std::function<T(msgpack::object const&)> decode_msgpack)
{
    BB_ASSERT(!buf.empty(), "deserialize_msgpack_compact: buffer is empty");

    // Expect format marker for msgpack, msgpack-compact or msgpack-tagged
    const uint8_t FORMAT_MSGPACK = 2;
    const uint8_t FORMAT_MSGPACK_COMPACT = 3;
    const uint8_t FORMAT_MSGPACK_TAGGED = 4;
    uint8_t format_u8 = buf[0];
    BB_ASSERT(format_u8 == FORMAT_MSGPACK || format_u8 == FORMAT_MSGPACK_COMPACT || format_u8 == FORMAT_MSGPACK_TAGGED,
              "deserialize_msgpack_compact: expected msgpack format marker (2, 3 or 4), got " +
                  std::to_string(format_u8));

    // Skip the format marker to get the data.
    const char* buffer = &reinterpret_cast<const char*>(buf.data())[1];
    size_t size = buf.size() - 1;

    auto oh = msgpack::unpack(buffer, size);
    auto o = oh.get();

    // Expect ARRAY type for msgpack-compact format
    if (format_u8 == FORMAT_MSGPACK_COMPACT) {
        BB_ASSERT(o.type == msgpack::type::ARRAY,
                  "deserialize_msgpack_compact: expected ARRAY type, got " + std::to_string(o.type));
    }

    return decode_msgpack(o);
}

AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit, bool is_mega)
{
    BB_ASSERT_LT(
        circuit.opcodes.size(), UINT32_MAX, "acir_format::circuit_serde_to_acir_format: too many opcodes in circuit.");

    AcirFormat af;
    af.num_acir_opcodes = static_cast<uint32_t>(circuit.opcodes.size());
    af.public_inputs = join({
        transform::map(circuit.public_parameters.value,
                       [&](const Acir::Witness& e) {
                           update_max_witness_index(e.value, af);
                           return e.value;
                       }),
        transform::map(circuit.return_values.value,
                       [&](const Acir::Witness& e) {
                           update_max_witness_index(e.value, af);
                           return e.value;
                       }),
    });
    // Map to a pair of: BlockConstraint, and list of opcodes associated with that BlockConstraint
    // Block constraints are built as we process the opcodes, so we store them in this map and we add them to the
    // AcirFormat struct at the end
    // NOTE: We want to deterministically visit this map, so unordered_map should not be used.
    std::map<uint32_t, std::pair<BlockConstraint, std::vector<size_t>>> block_id_to_block_constraint;

    // Linear AssertZeros that can be batched into one rows
    // They are batched later via the function batched_eq_assert_zeros_into_constraints
    std::vector<BatchedEqEntry> batched_eq_assert_zeros;

    for (size_t i = 0; i < circuit.opcodes.size(); ++i) {
        const auto& gate = circuit.opcodes[i];
        update_max_witness_index_from_opcode(gate, af);
        std::visit(
            overloaded{
                [&](const Acir::Opcode::AssertZero& arg) {
                    assert_zero_to_constraints(arg, af, i, batched_eq_assert_zeros, is_mega);
                },
                [&](const Acir::Opcode::BlackBoxFuncCall& arg) { add_blackbox_func_call_to_acir_format(arg, af, i); },
                [&](const Acir::Opcode::MemoryInit& arg) {
                    auto block = memory_init_to_block_constraint(arg);
                    uint32_t block_id = arg.block_id.value;
                    block_id_to_block_constraint[block_id] = { block, /*opcode_indices=*/{ i } };
                },
                [&](const Acir::Opcode::MemoryOp& arg) {
                    auto block = block_id_to_block_constraint.find(arg.block_id.value);
                    if (block == block_id_to_block_constraint.end()) {
                        bb::assert_failure("acir_format::circuit_serde_to_acir_format: unitialized MemoryOp.");
                    }
                    add_memory_op_to_block_constraint(arg, block->second.first);
                    block->second.second.push_back(i);
                },
                [&](const Acir::Opcode::BrilligCall&) {},
                [&](const Acir::Opcode::Call&) {
                    bb::assert_failure("acir_format::circuit_serde_to_acir_format: Call opcode is not supported.");
                },
            },
            gate.value);
    }
    // Pair any buffered batched-eq AssertZeros (≤2-witness linear opcodes) into BATCHED_EQ rows.
    batched_eq_assert_zeros_into_constraints(af, batched_eq_assert_zeros);

    // Add the block constraints to the AcirFormat struct
    for (const auto& [_, block] : block_id_to_block_constraint) {
        af.block_constraints.push_back(block.first);
        af.original_opcode_indices.block_constraints.push_back(block.second);
    }

    BB_ASSERT_LT(af.max_witness_index,
                 UINT32_MAX,
                 "Max witness index above UINT32_MAX, this value is reserved for unset witnesses that will be replaced "
                 "with the zero index.");

    return af;
}

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf, bool is_mega)
{
    // We need to deserialize into Acir::Program first because the buffer returned by Noir has this structure
    auto program = deserialize_msgpack_compact<Acir::ProgramWithoutBrillig>(
        std::move(buf), [](auto o) -> Acir::ProgramWithoutBrillig {
            Acir::ProgramWithoutBrillig program_wob;
            try {
                // Deserialize into a partial structure that ignores the Brillig parts,
                // so that new opcodes can be added without breaking Barretenberg.
                o.convert(program_wob);
            } catch (const msgpack::type_error&) {
                std::cerr << o << std::endl;
                bb::assert_failure(
                    "acir_format::circuit_buf_to_acir_format: failed to convert msgpack data to Program");
            }
            return program_wob;
        });
    BB_ASSERT_EQ(program.functions.size(), 1U, "circuit_buf_to_acir_format: expected single function in ACIR program");

    return circuit_serde_to_acir_format(program.functions[0], is_mega);
}

AcirFormat circuit_buf_to_mega_acir_format(std::vector<uint8_t>&& buf)
{
    return circuit_buf_to_acir_format(std::move(buf), true);
}

WitnessVector witness_buf_to_witness_vector(std::vector<uint8_t>&& buf)
{
    // We need to deserialize into WitnessStack first because the buffer returned by Noir has this structure
    auto witness_stack = deserialize_msgpack_compact<Witnesses::WitnessStack>(std::move(buf), [](auto o) {
        Witnesses::WitnessStack witness_stack;
        try {
            o.convert(witness_stack);
        } catch (const msgpack::type_error&) {
            std::cerr << o << std::endl;
            bb::assert_failure(
                "acir_format::witness_buf_to_witness_vector: failed to convert msgpack data to WitnessStack");
        }
        return witness_stack;
    });
    BB_ASSERT_EQ(witness_stack.stack.size(),
                 1U,
                 "acir_format::witness_buf_to_witness_vector: expected single WitnessMap in WitnessStack");

    return witness_map_to_witness_vector(witness_stack.stack[0].witness);
}

WitnessVector witness_map_to_witness_vector(Witnesses::WitnessMap const& witness_map)
{
    // Note that the WitnessMap is in increasing order of witness indices because the comparator for the Acir::Witness
    // is defined in terms of the witness index.

    if (!witness_map.value.empty()) {
        const uint32_t max_index = witness_map.value.rbegin()->first.value;
        if (max_index > MAX_WITNESS_INDEX) {
            throw_or_abort("acir_format::witness_map_to_witness_vector: witness index " +
                           std::to_string(max_index) + " exceeds the maximum allowed (" +
                           std::to_string(MAX_WITNESS_INDEX) + ").");
        }
    }

    WitnessVector witness_vector;
    for (size_t index = 0; const auto& e : witness_map.value) {
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned.
        // To ensure that witnesses sit at the correct indices in the `WitnessVector`, we fill any indices
        // which do not exist within the `WitnessMap` with the random values. We use random values instead of zero
        // because unassigned witnesses indices are not supposed to be used in any constraint, so filling them with a
        // random value helps catching bugs.
        while (index < e.first.value) {
            witness_vector.emplace_back(fr::random_element());
            index++;
        }
        witness_vector.emplace_back(from_buffer_with_bound_checks(e.second));
        index++;
    }

    return witness_vector;
}

/// ========= ACIR OPCODE HANDLERS ========= ///

std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg,
                                                     std::map<uint32_t, bb::fr>& linear_terms)
{
    // Lambda to add next linear term from linear_terms to the mul_quad_ gate and erase it from linear_terms
    auto add_linear_term_and_erase = [](uint32_t& idx, fr& scaling, std::map<uint32_t, fr>& linear_terms) {
        BB_ASSERT_EQ(
            idx, bb::stdlib::IS_CONSTANT, "Attempting to override a non-constant witness index in mul_quad_ gate");
        idx = linear_terms.begin()->first;
        scaling += linear_terms.begin()->second;
        linear_terms.erase(idx);
    };

    std::vector<mul_quad_<fr>> result;
    // We cannot precompute the exact number of gates that will result from the expression. Therefore, we reserve the
    // maximum number of gates that could ever be needed: one per multiplication term plus one per linear term. The real
    // number of gates will in general be lower than this.
    BB_ASSERT_LTE(arg.mul_terms.size(),
                  SIZE_MAX - linear_terms.size(),
                  "split_into_mul_quad_gates: overflow when reserving space for mul_quad_ gates.");
    result.reserve(arg.mul_terms.size() + linear_terms.size());

    // Step 1. Add multiplication terms and linear terms with the same witness index
    for (const auto& mul_term : arg.mul_terms) {
        result.emplace_back(mul_quad_<fr>{
            .a = std::get<1>(mul_term).value,
            .b = std::get<2>(mul_term).value,
            .c = bb::stdlib::IS_CONSTANT,
            .d = bb::stdlib::IS_CONSTANT,
            .mul_scaling = from_buffer_with_bound_checks(std::get<0>(mul_term)),
            .a_scaling = fr::zero(),
            .b_scaling = fr::zero(),
            .c_scaling = fr::zero(),
            .d_scaling = fr::zero(),
            .const_scaling = fr::zero(),
        });

        // Add linear terms corresponding to the witnesses involved in the multiplication term
        auto& mul_quad = result.back();
        if (linear_terms.contains(mul_quad.a)) {
            mul_quad.a_scaling += linear_terms.at(mul_quad.a);
            linear_terms.erase(mul_quad.a); // Remove it as the linear term for a has been processed
        }
        if (linear_terms.contains(mul_quad.b)) {
            // Note that we enter here only if b is different from a
            mul_quad.b_scaling += linear_terms.at(mul_quad.b);
            linear_terms.erase(mul_quad.b); // Remove it as the linear term for b has been processed
        }
    }

    // Step 2. Add linear terms to existing gates
    bool is_first_gate = true;
    for (auto& mul_quad : result) {
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.c, mul_quad.c_scaling, linear_terms);
        }

        if (is_first_gate) {
            // First gate contains the constant term and uses all four wires
            mul_quad.const_scaling = from_buffer_with_bound_checks(arg.q_c);
            if (!linear_terms.empty()) {
                add_linear_term_and_erase(mul_quad.d, mul_quad.d_scaling, linear_terms);
            }
            is_first_gate = false;
        }
    }

    // Step 3. Add remaining linear terms
    while (!linear_terms.empty()) {
        // We need to create new mul_quad_ gates to accomodate the remaining linear terms
        mul_quad_<fr> mul_quad = {
            .a = bb::stdlib::IS_CONSTANT,
            .b = bb::stdlib::IS_CONSTANT,
            .c = bb::stdlib::IS_CONSTANT,
            .d = bb::stdlib::IS_CONSTANT,
            .mul_scaling = fr::zero(),
            .a_scaling = fr::zero(),
            .b_scaling = fr::zero(),
            .c_scaling = fr::zero(),
            .d_scaling = fr::zero(),
            .const_scaling = fr::zero(),
        };
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.a, mul_quad.a_scaling, linear_terms);
        }
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.b, mul_quad.b_scaling, linear_terms);
        }
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.c, mul_quad.c_scaling, linear_terms);
        }
        if (is_first_gate) {
            // First gate contains the constant term and uses all four wires
            mul_quad.const_scaling = from_buffer_with_bound_checks(arg.q_c);
            if (!linear_terms.empty()) {
                add_linear_term_and_erase(mul_quad.d, mul_quad.d_scaling, linear_terms);
            }
            is_first_gate = false;
        }

        result.emplace_back(mul_quad);
    }

    BB_ASSERT(!result.empty(),
              "split_into_mul_quad_gates: resulted in zero gates. This means that there is an expression with no  "
              "multiplication terms and no linear terms.");
    result.shrink_to_fit();

    return result;
}

bool resolve_shared_wire_products(Acir::Expression const& arg, uint32_t& w_l, uint32_t& w_r, uint32_t& w_o)
{
    // Two products: a * b, c * d
    const uint32_t a = std::get<1>(arg.mul_terms[0]).value;
    const uint32_t b = std::get<2>(arg.mul_terms[0]).value;
    const uint32_t c = std::get<1>(arg.mul_terms[1]).value;
    const uint32_t d = std::get<2>(arg.mul_terms[1]).value;

    uint32_t shared_index = bb::stdlib::IS_CONSTANT;
    size_t num_shared_indices = 0;

    // Lambda to check whether the witness index matches one of the witness indices from the pair (c,d)
    auto process_witness_index = [&](uint32_t w) {
        if (w == c || w == d) {
            shared_index = w;
            ++num_shared_indices;
        }
    };

    process_witness_index(a);
    if (a != b) {
        // If a != b, we need to check b as well
        process_witness_index(b);
    }

    // The condition we are looking for is num_shared_indices == 1
    // num_shared_indices == 0 means two disjoint products
    // num_shared_indices == 2 is the same wire-pair, which should not happen
    if (num_shared_indices != 1) {
        return false;
    }

    BB_ASSERT_NEQ(
        shared_index, bb::stdlib::IS_CONSTANT, "acir_format::resolve_shared_wire_products: no matched shared_index.");
    w_l = shared_index;
    w_r = (a == shared_index) ? b : a;
    w_o = (c == shared_index) ? d : c;
    return true;
}

bool is_bilinear(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    if (arg.mul_terms.size() != 2) {
        return false;
    }
    uint32_t w_l = bb::stdlib::IS_CONSTANT;
    uint32_t w_r = bb::stdlib::IS_CONSTANT;
    uint32_t w_o = bb::stdlib::IS_CONSTANT;
    if (!resolve_shared_wire_products(arg, w_l, w_r, w_o)) {
        return false;
    }
    // Linear terms must lie on the three product wires plus at most one extra witness, which becomes the
    // linear-only fourth wire w_4.
    bool extra_seen = false;
    for (const auto& [witness, coeff] : linear_terms) {
        if (witness == w_l || witness == w_r || witness == w_o) {
            continue;
        }
        if (extra_seen) {
            return false;
        }
        extra_seen = true;
    }
    return true;
}

bool is_batched_eq(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    return arg.mul_terms.empty() && !linear_terms.empty() && linear_terms.size() <= 2;
}

BilinearConstraint build_bilinear_constraint(Acir::Expression const& arg,
                                             const std::map<uint32_t, bb::fr>& linear_terms)
{
    uint32_t w_l = bb::stdlib::IS_CONSTANT;
    uint32_t w_r = bb::stdlib::IS_CONSTANT;
    uint32_t w_o = bb::stdlib::IS_CONSTANT;
    bool resolved = resolve_shared_wire_products(arg, w_l, w_r, w_o);
    BB_ASSERT(resolved, "acir_format::build_bilinear_constraint: the two products must share exactly one wire.");

    // The fourth wire carries only a linear term; default to the IS_CONSTANT sentinel and bind it to the
    // single linear witness outside {w_l, w_r, w_o} if one is present.
    uint32_t w_4 = bb::stdlib::IS_CONSTANT;

    fr q_l = fr::zero();
    fr q_r = fr::zero();
    fr q_o = fr::zero();
    fr q_4 = fr::zero();
    // The following loop is safe because linear_terms has distinct witnesses
    for (const auto& [w, c] : linear_terms) {
        if (w == w_l) {
            q_l = c;
        } else if (w == w_r) {
            q_r = c;
        } else if (w == w_o) {
            q_o = c;
        } else {
            // Guaranteed by is_bilinear: at most one linear-only witness, which becomes the fourth wire.
            BB_ASSERT(w_4 == bb::stdlib::IS_CONSTANT,
                      "acir_format::build_bilinear_constraint: more than one linear-only witness.");
            w_4 = w;
            q_4 = c;
        }
    }

    return BilinearConstraint{
        .a = w_l,
        .b = w_r,
        .c = w_o,
        .d = w_4,
        .q_m = from_buffer_with_bound_checks(std::get<0>(arg.mul_terms[0])),
        .q_l = q_l,
        .q_r = q_r,
        .q_o = q_o,
        .q_4 = q_4,
        .q_5 = from_buffer_with_bound_checks(std::get<0>(arg.mul_terms[1])),
        .q_c = from_buffer_with_bound_checks(arg.q_c),
    };
}

BatchedEqEntry build_batched_eq_entry(Acir::Expression const& arg,
                                      const std::map<uint32_t, bb::fr>& linear_terms,
                                      size_t opcode_index)
{
    BB_ASSERT(!linear_terms.empty() && linear_terms.size() <= 2, "BatchedEq gate requires at most two linear terms.");
    BatchedEqEntry entry{
        .w1 = bb::stdlib::IS_CONSTANT,
        .w2 = bb::stdlib::IS_CONSTANT,
        .c1 = fr::zero(),
        .c2 = fr::zero(),
        .q_c = from_buffer_with_bound_checks(arg.q_c),
        .opcode_index = opcode_index,
    };
    auto it = linear_terms.begin();
    entry.w1 = it->first;
    entry.c1 = it->second;
    if (++it != linear_terms.end()) {
        entry.w2 = it->first;
        entry.c2 = it->second;
    }
    return entry;
}

BatchedEqCheckConstraint build_batched_eq_check_constraint(const BatchedEqEntry& entry1,
                                                           const std::optional<BatchedEqEntry>& entry2)
{
    bool entry2_has_value = entry2.has_value();
    return BatchedEqCheckConstraint{
        .a = entry1.w1,
        .b = entry1.w2,
        .c = entry2_has_value ? entry2->w1 : bb::stdlib::IS_CONSTANT,
        .d = entry2_has_value ? entry2->w2 : bb::stdlib::IS_CONSTANT,
        .q_l = entry1.c1,
        .q_r = entry1.c2,
        .q_o = entry2_has_value ? entry2->c1 : fr::zero(),
        .q_4 = entry2_has_value ? entry2->c2 : fr::zero(),
        .q_c = entry1.q_c,
        .q_m = entry2_has_value ? entry2->q_c : fr::zero(),
    };
}

void batched_eq_assert_zeros_into_constraints(AcirFormat& af, std::vector<BatchedEqEntry>& pending)
{
    for (size_t i = 0; i + 1 < pending.size(); i += 2) {
        af.batched_eq_check_constraints.push_back(build_batched_eq_check_constraint(pending[i], pending[i + 1]));
        af.original_opcode_indices.batched_eq_check_constraints.push_back(
            { pending[i].opcode_index, pending[i + 1].opcode_index });
    }
    if (pending.size() % 2 == 1) {
        af.batched_eq_check_constraints.push_back(build_batched_eq_check_constraint(pending.back(), std::nullopt));
        af.original_opcode_indices.batched_eq_check_constraints.push_back({ pending.back().opcode_index, SIZE_MAX });
    }
    pending.clear();
}

void assert_zero_to_constraints(Acir::Opcode::AssertZero const& arg,
                                AcirFormat& af,
                                size_t opcode_index,
                                std::vector<BatchedEqEntry>& batched_eq_assert_zeros,
                                bool is_mega)
{
    // Lambda to detect zero gates in mul_quad
    auto is_zero_gate = [](const mul_quad_<fr>& gate) {
        return ((gate.mul_scaling == fr(0)) && (gate.a_scaling == fr(0)) && (gate.b_scaling == fr(0)) &&
                (gate.c_scaling == fr(0)) && (gate.d_scaling == fr(0)) && (gate.const_scaling == fr(0)));
    };

    // Lambda to detect zero gates in batched_eq
    auto is_zero_batched_eq_gate = [](const BatchedEqEntry& gate) {
        return (gate.c1 == fr(0) && gate.c2 == fr(0) && gate.q_c == fr(0));
    };

    auto linear_terms = process_linear_terms(arg.value);

    // Check for unsatisfiable constraint: no variables but a non-zero constant means the circuit requires
    // `constant == 0` which can never be satisfied.
    if (arg.value.mul_terms.empty() && linear_terms.empty()) {
        fr constant = from_buffer_with_bound_checks(arg.value.q_c);
        BB_ASSERT_EQ(constant,
                     fr::zero(),
                     "circuit is unsatisfiable. An AssertZero opcode contains no variables but has a non-zero "
                     "constant, which can never equal zero.");
    }

    // Classify the opcode, then route it to the matching handler. The bilinear / batched-eq gate is Mega-only, so
    // classify_assert_zero only returns Bilinear/BatchedEq when is_mega is true.
    AssertZeroGate gate = classify_assert_zero(arg.value, linear_terms, is_mega);

    switch (gate) {
    case AssertZeroGate::Bilinear: {
        if (!is_mega) {
            throw_or_abort("acir_format::assert_zero_to_constraint: selected AssertZeroGate::Bilinear variant "
                           "when using UltraCircuitBuilder.");
        }
        af.bilinear_constraints.push_back(build_bilinear_constraint(arg.value, linear_terms));
        af.original_opcode_indices.bilinear_constraints.push_back(opcode_index);
        break;
    }
    case AssertZeroGate::BatchedEq: {
        if (!is_mega) {
            throw_or_abort("acir_format::assert_zero_to_constraint: selected AssertZeroGate::BatchedEq variant "
                           "when using UltraCircuitBuilder.");
        }
        batched_eq_assert_zeros.push_back(build_batched_eq_entry(arg.value, linear_terms, opcode_index));
        BB_ASSERT(!is_zero_batched_eq_gate(batched_eq_assert_zeros.back()),
                  "acir_format::asser_zero_to_constraints: produced a BatcheqEq zero gate");
        break;
    }
    case AssertZeroGate::SingleArithmetic: {
        std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms);
        BB_ASSERT_EQ(mul_quads.size(), 1U, "acir_format::assert_zero_to_constraints: expected a single gate.");
        BB_ASSERT(!is_zero_gate(mul_quads[0]),
                  "acir_format::assert_zero_to_constraints: produced a SingleArithmetic zero gate.");
        af.quad_constraints.push_back(mul_quads[0]);
        af.original_opcode_indices.quad_constraints.push_back(opcode_index);
        break;
    }
    case AssertZeroGate::MultiArithmetic: {
        std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms);
        BB_ASSERT_GT(
            mul_quads.size(), 1U, "acir_format::assert_zero_to_constraints: expected multiple gates but found one.");
        for (auto const& mul_quad : mul_quads) {
            BB_ASSERT(!is_zero_gate(mul_quad),
                      "acir_format::assert_zero_to_constraints: produced a MultiArithmetic zero gate.");
        }
        af.big_quad_constraints.push_back(BigQuadConstraint(mul_quads));
        af.original_opcode_indices.big_quad_constraints.push_back(opcode_index);
        break;
    }
    }
}

void add_blackbox_func_call_to_acir_format(Acir::Opcode::BlackBoxFuncCall const& arg,
                                           AcirFormat& af,
                                           size_t opcode_index)
{
    auto to_witness_or_constant = [](const Acir::FunctionInput& e) { return parse_input(e); };
    auto to_witness = [](const Acir::Witness& e) { return e.value; };
    auto to_witness_from_input = [](const Acir::FunctionInput& e) { return get_witness_from_function_input(e); };

    std::visit(
        overloaded{ [&](const Acir::BlackBoxFuncCall::AND& arg) {
                       af.logic_constraints.push_back(LogicConstraint{
                           .a = parse_input(arg.lhs),
                           .b = parse_input(arg.rhs),
                           .result = to_witness(arg.output),
                           .num_bits = arg.num_bits,
                           .is_xor_gate = false,
                       });
                       af.original_opcode_indices.logic_constraints.push_back(opcode_index);
                   },
                    [&](const Acir::BlackBoxFuncCall::XOR& arg) {
                        af.logic_constraints.push_back(LogicConstraint{
                            .a = parse_input(arg.lhs),
                            .b = parse_input(arg.rhs),
                            .result = to_witness(arg.output),
                            .num_bits = arg.num_bits,
                            .is_xor_gate = true,
                        });
                        af.original_opcode_indices.logic_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::RANGE& arg) {
                        af.range_constraints.push_back(RangeConstraint{
                            .witness = get_witness_from_function_input(arg.input),
                            .num_bits = arg.num_bits,
                        });
                        af.original_opcode_indices.range_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::AES128Encrypt& arg) {
                        af.aes128_constraints.push_back(AES128Constraint{
                            .inputs = transform::map(arg.inputs, to_witness_or_constant),
                            .iv = transform::map(*arg.iv, to_witness_or_constant),
                            .key = transform::map(*arg.key, to_witness_or_constant),
                            .outputs = transform::map(arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.aes128_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Sha256Compression& arg) {
                        af.sha256_compression.push_back(Sha256Compression{
                            .inputs = transform::map(*arg.inputs, to_witness_or_constant),
                            .hash_values = transform::map(*arg.hash_values, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.sha256_compression.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Blake2s& arg) {
                        af.blake2s_constraints.push_back(Blake2sConstraint{
                            .inputs = transform::map(arg.inputs, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.blake2s_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Blake3& arg) {
                        af.blake3_constraints.push_back(Blake3Constraint{
                            .inputs = transform::map(arg.inputs, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.blake3_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::EcdsaSecp256k1& arg) {
                        af.ecdsa_k1_constraints.push_back(EcdsaConstraint{
                            .type = bb::CurveType::SECP256K1,
                            .hashed_message = transform::map(*arg.hashed_message, to_witness_from_input),
                            .signature = transform::map(*arg.signature, to_witness_from_input),
                            .pub_x_indices = transform::map(*arg.public_key_x, to_witness_from_input),
                            .pub_y_indices = transform::map(*arg.public_key_y, to_witness_from_input),
                            .predicate = parse_input(arg.predicate),
                            .result = to_witness(arg.output),
                        });
                        af.original_opcode_indices.ecdsa_k1_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::EcdsaSecp256r1& arg) {
                        af.ecdsa_r1_constraints.push_back(EcdsaConstraint{
                            .type = bb::CurveType::SECP256R1,
                            .hashed_message = transform::map(*arg.hashed_message, to_witness_from_input),
                            .signature = transform::map(*arg.signature, to_witness_from_input),
                            .pub_x_indices = transform::map(*arg.public_key_x, to_witness_from_input),
                            .pub_y_indices = transform::map(*arg.public_key_y, to_witness_from_input),
                            .predicate = parse_input(arg.predicate),
                            .result = to_witness(arg.output),
                        });
                        af.original_opcode_indices.ecdsa_r1_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::MultiScalarMul& arg) {
                        af.multi_scalar_mul_constraints.push_back(MultiScalarMul{
                            .points = transform::map(arg.points, to_witness_or_constant),
                            .scalars = transform::map(arg.scalars, to_witness_or_constant),
                            .predicate = parse_input(arg.predicate),
                            .out_point_x = to_witness((*arg.outputs)[0]),
                            .out_point_y = to_witness((*arg.outputs)[1]),
                        });
                        af.original_opcode_indices.multi_scalar_mul_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::EmbeddedCurveAdd& arg) {
                        af.ec_add_constraints.push_back(EcAdd{
                            .input1_x = parse_input((*arg.input1)[0]),
                            .input1_y = parse_input((*arg.input1)[1]),
                            .input2_x = parse_input((*arg.input2)[0]),
                            .input2_y = parse_input((*arg.input2)[1]),
                            .predicate = parse_input(arg.predicate),
                            .result_x = to_witness((*arg.outputs)[0]),
                            .result_y = to_witness((*arg.outputs)[1]),
                        });
                        af.original_opcode_indices.ec_add_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Keccakf1600& arg) {
                        af.keccak_permutations.push_back(Keccakf1600{
                            .state = transform::map(*arg.inputs, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.keccak_permutations.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::RecursiveAggregation& arg) {
                        auto predicate = parse_input(arg.predicate);
                        if (predicate.is_constant && predicate.value.is_zero()) {
                            // No constraint if the recursion is disabled
                            return;
                        }
                        auto c = RecursionConstraint{
                            .key = transform::map(arg.verification_key, to_witness_from_input),
                            .proof = transform::map(arg.proof, to_witness_from_input),
                            .public_inputs = transform::map(arg.public_inputs, to_witness_from_input),
                            .key_hash = get_witness_from_function_input(arg.key_hash),
                            .proof_type = arg.proof_type,
                            .predicate = predicate,
                        };

                        // Add the recursion constraint to the appropriate container based on proof type
                        switch (c.proof_type) {
                        case HONK_ZK:
                        case HONK:
                        case ROLLUP_HONK:
                        case ROOT_ROLLUP_HONK:
                            af.honk_recursion_constraints.push_back(c);
                            af.original_opcode_indices.honk_recursion_constraints.push_back(opcode_index);
                            break;
                        case OINK:
                        case HN:
                        case HN_FINAL:
                            af.hn_recursion_constraints.push_back(c);
                            af.original_opcode_indices.hn_recursion_constraints.push_back(opcode_index);
                            break;
                        case AVM:
                            af.avm_recursion_constraints.push_back(c);
                            af.original_opcode_indices.avm_recursion_constraints.push_back(opcode_index);
                            break;
                        case CHONK:
                            af.chonk_recursion_constraints.push_back(c);
                            af.original_opcode_indices.chonk_recursion_constraints.push_back(opcode_index);
                            break;
                        default:
                            bb::assert_failure(
                                "acir_format::handle_black_box_fun_call: Invalid PROOF_TYPE in RecursionConstraint.");
                        }
                    },
                    [&](const Acir::BlackBoxFuncCall::Poseidon2Permutation& arg) {
                        af.poseidon2_constraints.push_back(Poseidon2Constraint{
                            .state = transform::map(arg.inputs, to_witness_or_constant),
                            .result = transform::map(arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.poseidon2_constraints.push_back(opcode_index);
                    } },
        arg.value.value);
}

BlockConstraint memory_init_to_block_constraint(Acir::Opcode::MemoryInit const& mem_init)
{
    // Noir doesn't distinguish between ROM and RAM table. Therefore, we initialize every table as a ROM table, and
    // then we make it a RAM table if there is at least one write operation
    BlockConstraint block{
        .init = {},
        .trace = {},
        .type = BlockType::ROM,
        .calldata_id = CallDataType::None,
    };

    for (const auto& init : mem_init.init) {
        block.init.push_back(init.value);
    }

    // Databus is only supported for Goblin, non Goblin builders will treat call_data and return_data as normal
    // array.
    if (std::holds_alternative<Acir::BlockType::CallData>(mem_init.block_type.value)) {
        uint32_t calldata_id = std::get<Acir::BlockType::CallData>(mem_init.block_type.value).value;
        BB_ASSERT_LTE(calldata_id,
                      MAX_APPS_PER_KERNEL,
                      "acir_format::handle_memory_init: calldata id exceeds kernel + MAX_APPS_PER_KERNEL app columns");

        block.type = BlockType::CallData;
        block.calldata_id = static_cast<CallDataType>(calldata_id);
    } else if (std::holds_alternative<Acir::BlockType::ReturnData>(mem_init.block_type.value)) {
        block.type = BlockType::ReturnData;
    }

    return block;
}

void add_memory_op_to_block_constraint(Acir::Opcode::MemoryOp const& mem_op, BlockConstraint& block)
{
    // Acir::MemOp::read is the serialized MemOpKind bool: false = Read, true = Write.
    AccessType access_type = mem_op.op.read ? AccessType::Write : AccessType::Read;
    if (access_type == AccessType::Write) {
        // We are not allowed to write on the databus
        BB_ASSERT((block.type != BlockType::CallData) && (block.type != BlockType::ReturnData));
        // Mark the table as a RAM table
        block.type = BlockType::RAM;
    }

    MemOp acir_mem_op = MemOp{
        .access_type = access_type,
        .index = mem_op.op.index.value,
        .value = mem_op.op.value.value,
    };
    block.trace.push_back(acir_mem_op);
}

bool is_single_arithmetic_gate(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    // If there are more than NUM_WIRES distinct witnesses in the linear terms, then we need multiple arithmetic gates
    if (linear_terms.size() > NUM_WIRES) {
        return false;
    }

    if (arg.mul_terms.size() > 1) {
        // If there is more than one multiplication gate, then we need multiple arithmetic gates
        return false;
    }

    if (arg.mul_terms.size() == 1) {
        // In this case we have two witnesses coming from the multiplication term plus the linear terms.
        // We proceed as follows:
        //  0. Start from the assumption that all witnesses (from linear terms and multiplication) are distinct
        //  1. Check if the lhs and rhs witness in the multiplication are already contained in the linear terms
        //  2. Check if the lhs witness and the rhs witness are equal
        //     2.a If they are distinct, update the total number of witnesses to be added to wires according to result
        //         of the check at step 1: each distinct witness already in the linear terms subtracts one from the
        //         total
        //     2.b If they are equal, update the total number of witnesses to be added to wires according to result of
        //         the check at step 1: if the witness is already in the linear terms, it removes one from the total

        // Number of witnesses to be put in wires if the witnesses from the linear terms and the multiplication term are
        // all different
        size_t num_witnesses_to_be_put_in_wires = 2 + linear_terms.size();

        uint32_t witness_idx_lhs = std::get<1>(arg.mul_terms[0]).value;
        uint32_t witness_idx_rhs = std::get<2>(arg.mul_terms[0]).value;

        bool lhs_is_distinct_from_linear_terms = !linear_terms.contains(witness_idx_lhs);
        bool rhs_is_distinct_from_linear_terms = !linear_terms.contains(witness_idx_rhs);

        if (witness_idx_lhs != witness_idx_rhs) {
            num_witnesses_to_be_put_in_wires -= lhs_is_distinct_from_linear_terms ? 0U : 1U;
            num_witnesses_to_be_put_in_wires -= rhs_is_distinct_from_linear_terms ? 0U : 1U;
        } else {
            num_witnesses_to_be_put_in_wires -= lhs_is_distinct_from_linear_terms ? 0U : 1U;
        }

        return num_witnesses_to_be_put_in_wires <= NUM_WIRES;
    }

    return linear_terms.size() <= NUM_WIRES;
}

AssertZeroGate classify_assert_zero(Acir::Expression const& arg,
                                    const std::map<uint32_t, bb::fr>& linear_terms,
                                    bool is_mega)
{
    // The bilinear / batched-eq gate is Mega-only; prefer it over the standard arithmetic path when
    // the opcode fits.
    if (is_mega) {
        if (is_bilinear(arg, linear_terms)) {
            return AssertZeroGate::Bilinear;
        }
        if (is_batched_eq(arg, linear_terms)) {
            return AssertZeroGate::BatchedEq;
        }
    }
    return is_single_arithmetic_gate(arg, linear_terms) ? AssertZeroGate::SingleArithmetic
                                                        : AssertZeroGate::MultiArithmetic;
}

std::map<uint32_t, bb::fr> process_linear_terms(Acir::Expression const& expr)
{
    std::map<uint32_t, bb::fr> linear_terms;
    for (const auto& linear_term : expr.linear_combinations) {
        fr selector_value = from_buffer_with_bound_checks(std::get<0>(linear_term));
        uint32_t witness_idx = std::get<1>(linear_term).value;
        if (linear_terms.contains(witness_idx)) {
            linear_terms[witness_idx] += selector_value; // Accumulate coefficients for duplicate witnesses
        } else {
            linear_terms[witness_idx] = selector_value;
        }
    }
    return linear_terms;
}

} // namespace acir_format
