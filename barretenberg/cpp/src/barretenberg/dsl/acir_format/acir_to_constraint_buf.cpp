// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], date: 2025-12-04 }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "acir_to_constraint_buf.hpp"

#include <cstddef>
#include <cstdint>
#include <map>
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

/// ========= HELPERS ========= ///

bb::fr from_buffer_with_bound_checks(const std::vector<uint8_t>& buffer)
{
    BB_ASSERT_EQ(buffer.size(), 32U, "acir_format::from_buffer_with_bound_checks: buffer size must be 32 bytes.");
    return fr::serialize_from_buffer(buffer.data());
}

WitnessOrConstant<bb::fr> parse_input(const Acir::FunctionInput& input)
{
    WitnessOrConstant<bb::fr> result = std::visit(
        [&](auto&& e) {
            using T = std::decay_t<decltype(e)>;
            if constexpr (std::is_same_v<T, Acir::FunctionInput::Witness>) {
                return WitnessOrConstant<bb::fr>{
                    .index = e.value.value,
                    .value = bb::fr::zero(),
                    .is_constant = false,
                };
            } else if constexpr (std::is_same_v<T, Acir::FunctionInput::Constant>) {
                return WitnessOrConstant<bb::fr>{
                    .index = bb::stdlib::IS_CONSTANT,
                    .value = from_buffer_with_bound_checks(e.value),
                    .is_constant = true,
                };
            } else {
                bb::assert_failure("acir_format::parse_input: unrecognized Acir::FunctionInput variant. An error here "
                                   "means there was a serialization error.");
            }
        },
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
        [&](auto&& arg) {
            using T = std::decay_t<decltype(arg)>;
            if constexpr (std::is_same_v<T, Acir::Opcode::AssertZero>) {
                update_max_witness_index_from_expression(arg.value, af);
            } else if constexpr (std::is_same_v<T, Acir::Opcode::BlackBoxFuncCall>) {
                std::visit(
                    [&](auto&& bb_arg) {
                        using BBT = std::decay_t<decltype(bb_arg)>;
                        if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::AND> ||
                                      std::is_same_v<BBT, Acir::BlackBoxFuncCall::XOR>) {
                            update_max_witness_index_from_function_input(bb_arg.lhs);
                            update_max_witness_index_from_function_input(bb_arg.rhs);
                            update_max_witness_index_from_witness(bb_arg.output);
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::RANGE>) {
                            update_max_witness_index_from_function_input(bb_arg.input);
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::AES128Encrypt>) {
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
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::Sha256Compression>) {
                            for (const auto& input : *bb_arg.inputs) {
                                update_max_witness_index_from_function_input(input);
                            }
                            for (const auto& input : *bb_arg.hash_values) {
                                update_max_witness_index_from_function_input(input);
                            }
                            for (const auto& output : *bb_arg.outputs) {
                                update_max_witness_index_from_witness(output);
                            }
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::Blake2s> ||
                                             std::is_same_v<BBT, Acir::BlackBoxFuncCall::Blake3>) {
                            for (const auto& input : bb_arg.inputs) {
                                update_max_witness_index_from_function_input(input);
                            }
                            for (const auto& output : *bb_arg.outputs) {
                                update_max_witness_index_from_witness(output);
                            }
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::EcdsaSecp256k1> ||
                                             std::is_same_v<BBT, Acir::BlackBoxFuncCall::EcdsaSecp256r1>) {
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
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::MultiScalarMul>) {
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
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::EmbeddedCurveAdd>) {
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
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::Keccakf1600>) {
                            for (const auto& input : *bb_arg.inputs) {
                                update_max_witness_index_from_function_input(input);
                            }
                            for (const auto& output : *bb_arg.outputs) {
                                update_max_witness_index_from_witness(output);
                            }
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::RecursiveAggregation>) {
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
                        } else if constexpr (std::is_same_v<BBT, Acir::BlackBoxFuncCall::Poseidon2Permutation>) {
                            for (const auto& input : bb_arg.inputs) {
                                update_max_witness_index_from_function_input(input);
                            }
                            for (const auto& output : bb_arg.outputs) {
                                update_max_witness_index_from_witness(output);
                            }
                        }
                    },
                    arg.value.value);
            } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryInit>) {
                for (const auto& init : arg.init) {
                    update_max_witness_index_from_witness(init);
                }
            } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryOp>) {
                update_max_witness_index_from_expression(arg.op.index, af);
                update_max_witness_index_from_expression(arg.op.value, af);
                update_max_witness_index_from_expression(arg.op.operation, af);
            } else if constexpr (std::is_same_v<T, Acir::Opcode::BrilligCall>) {
                // Process inputs
                for (const auto& input : arg.inputs) {
                    std::visit(
                        [&](auto&& e) {
                            using IT = std::decay_t<decltype(e)>;
                            if constexpr (std::is_same_v<IT, Acir::BrilligInputs::Single>) {
                                update_max_witness_index_from_expression(e.value, af);
                            } else if constexpr (std::is_same_v<IT, Acir::BrilligInputs::Array>) {
                                for (const auto& expr : e.value) {
                                    update_max_witness_index_from_expression(expr, af);
                                }
                            }
                            // MemoryArray contains a BlockId, no direct witnesses to track
                        },
                        input.value);
                }
                // Process outputs
                for (const auto& output : arg.outputs) {
                    std::visit(
                        [&](auto&& e) {
                            using OT = std::decay_t<decltype(e)>;
                            if constexpr (std::is_same_v<OT, Acir::BrilligOutputs::Simple>) {
                                update_max_witness_index_from_witness(e.value);
                            } else if constexpr (std::is_same_v<OT, Acir::BrilligOutputs::Array>) {
                                for (const auto& witness : e.value) {
                                    update_max_witness_index_from_witness(witness);
                                }
                            }
                        },
                        output.value);
                }
                // Process optional predicate
                if (arg.predicate.has_value()) {
                    update_max_witness_index_from_expression(arg.predicate.value(), af);
                }
            } else {
                bb::assert_failure("acir_format::update_max_witness_index_from_opcode: Unrecognized opcode.");
            }
        },
        opcode.value);
}

/// ========= BYTES TO BARRETENBERG'S REPRESENTATION  ========= ///

template <typename T>
T deserialize_any_format(std::vector<uint8_t>&& buf,
                         std::function<T(msgpack::object const&)> decode_msgpack,
                         std::function<T(std::vector<uint8_t>)> decode_bincode)
{
    // We can't rely on exceptions to try to deserialize binpack, falling back to
    // msgpack if it fails, because exceptions are (or were) not supported in Wasm
    // and they are turned off in arch.cmake.
    //
    // For now our other option is to check if the data is valid msgpack,
    // which slows things down, but we can't tell if the first byte of
    // the data accidentally matches one of our format values.
    //
    // Unfortunately this doesn't seem to work either: `msgpack::parse`
    // returns true for a `bincode` encoded program, and we have to check
    // whether the value parsed is plausible.

    if (!buf.empty()) {
        // Once we remove support for legacy bincode format, we should expect to always
        // have a format marker corresponding to acir::serialization::Format::Msgpack,
        // but until then a match could be pure coincidence.
        if (buf[0] == 2) {
            // Skip the format marker to get the data.
            const char* buffer = &reinterpret_cast<const char*>(buf.data())[1];
            size_t size = buf.size() - 1;
            msgpack::null_visitor probe;
            if (msgpack::parse(buffer, size, probe)) {
                auto oh = msgpack::unpack(buffer, size);
                // This has to be on a separate line, see
                // https://github.com/msgpack/msgpack-c/issues/695#issuecomment-393035172
                auto o = oh.get();
                // In experiments bincode data was parsed as 0.
                // All the top level formats we look for are MAP types.
                if (o.type == msgpack::type::MAP) {
                    BB_ASSERT(false, "acir_format::deserialize_any_format: Msgpack is not currently supported.");
                    return decode_msgpack(o);
                }
            }
        }
        // `buf[0] == 1` would indicate bincode starting with a format byte,
        // but if it's a coincidence and it fails to parse then we can't recover
        // from it, so let's just acknowledge that for now we don't want to
        // exercise this code path and treat the whole data as bincode.
    }
    return decode_bincode(std::move(buf));
}

AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit)
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

    for (size_t i = 0; i < circuit.opcodes.size(); ++i) {
        const auto& gate = circuit.opcodes[i];
        update_max_witness_index_from_opcode(gate, af);
        std::visit(
            [&](auto&& arg) {
                using T = std::decay_t<decltype(arg)>;
                if constexpr (std::is_same_v<T, Acir::Opcode::AssertZero>) {
                    assert_zero_to_quad_constraints(arg, af, i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::BlackBoxFuncCall>) {
                    add_blackbox_func_call_to_acir_format(arg, af, i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryInit>) {
                    auto block = memory_init_to_block_constraint(arg);
                    uint32_t block_id = arg.block_id.value;
                    block_id_to_block_constraint[block_id] = { block, /*opcode_indices=*/{ i } };
                } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryOp>) {
                    auto block = block_id_to_block_constraint.find(arg.block_id.value);
                    if (block == block_id_to_block_constraint.end()) {
                        bb::assert_failure("acir_format::circuit_serder_to_acir_format: unitialized MemoryOp.");
                    }
                    add_memory_op_to_block_constraint(arg, block->second.first);
                    block->second.second.push_back(i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::BrilligCall>) {
                    // This is a no-op in barretenberg
                } else {
                    bb::assert_failure("acir_format::circuit_serde_to_acir_format: Unrecognized Acir Opcode. An error "
                                       "here means there was a serialization error.");
                }
            },
            gate.value);
    }
    // Add the block constraints to the AcirFormat struct
    for (const auto& [_, block] : block_id_to_block_constraint) {
        af.block_constraints.push_back(block.first);
        af.original_opcode_indices.block_constraints.push_back(block.second);
    }

    return af;
}

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf)
{
    // We need to deserialize into Acir::Program first because the buffer returned by Noir has this structure
    auto program = deserialize_any_format<Acir::Program>(
        std::move(buf),
        [](auto o) -> Acir::Program {
            Acir::Program program;
            try {
                // Deserialize into a partial structure that ignores the Brillig parts,
                // so that new opcodes can be added without breaking Barretenberg.
                Acir::ProgramWithoutBrillig program_wob;
                o.convert(program_wob);
                program.functions = program_wob.functions;
            } catch (const msgpack::type_error&) {
                std::cerr << o << std::endl;
                bb::assert_failure(
                    "acir_format::circuit_buf_to_acir_format: failed to convert msgpack data to Program");
            }
            return program;
        },
        &Acir::Program::bincodeDeserialize);
    BB_ASSERT_EQ(program.functions.size(), 1U, "circuit_buf_to_acir_format: expected single function in ACIR program");

    return circuit_serde_to_acir_format(program.functions[0]);
}

WitnessVector witness_buf_to_witness_vector(std::vector<uint8_t>&& buf)
{
    // We need to deserialize into WitnessStack first because the buffer returned by Noir has this structure
    auto witness_stack = deserialize_any_format<Witnesses::WitnessStack>(
        std::move(buf),
        [](auto o) {
            Witnesses::WitnessStack witness_stack;
            try {
                o.convert(witness_stack);
            } catch (const msgpack::type_error&) {
                std::cerr << o << std::endl;
                bb::assert_failure(
                    "acir_format::witness_buf_to_witness_vector: failed to convert msgpack data to WitnessStack");
            }
            return witness_stack;
        },
        &Witnesses::WitnessStack::bincodeDeserialize);
    BB_ASSERT_EQ(witness_stack.stack.size(),
                 1U,
                 "acir_format::witness_buf_to_witness_vector: expected single WitnessMap in WitnessStack");

    return witness_map_to_witness_vector(witness_stack.stack[0].witness);
}

WitnessVector witness_map_to_witness_vector(Witnesses::WitnessMap const& witness_map)
{
    // Note that the WitnessMap is in increasing order of witness indices because the comparator for the Acir::Witness
    // is defined in terms of the witness index.

    WitnessVector witness_vector;
    for (size_t index = 0; const auto& e : witness_map.value) {
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned.
        // To ensure that witnesses sit at the correct indices in the `WitnessVector`, we fill any indices
        // which do not exist within the `WitnessMap` with the dummy value of zero.
        while (index < e.first.value) {
            witness_vector.emplace_back(0);
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

void assert_zero_to_quad_constraints(Acir::Opcode::AssertZero const& arg, AcirFormat& af, size_t opcode_index)
{
    // Lambda to detect zero gates
    auto is_zero_gate = [](const mul_quad_<fr>& gate) {
        return ((gate.mul_scaling == fr(0)) && (gate.a_scaling == fr(0)) && (gate.b_scaling == fr(0)) &&
                (gate.c_scaling == fr(0)) && (gate.d_scaling == fr(0)) && (gate.const_scaling == fr(0)));
    };

    auto linear_terms = process_linear_terms(arg.value);
    bool is_single_gate = is_single_arithmetic_gate(arg.value, linear_terms);
    std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms);

    if (is_single_gate) {
        BB_ASSERT_EQ(mul_quads.size(), 1U, "acir_format::assert_zero_to_quad_constraints: expected a single gate.");
        auto mul_quad = mul_quads[0];

        af.quad_constraints.push_back(mul_quad);
        af.original_opcode_indices.quad_constraints.push_back(opcode_index);
    } else {
        BB_ASSERT_GT(mul_quads.size(),
                     1U,
                     "acir_format::assert_zero_to_quad_constraints: expected multiple gates but found one.");
        af.big_quad_constraints.push_back(BigQuadConstraint(mul_quads));
        af.original_opcode_indices.big_quad_constraints.push_back(opcode_index);
    }

    for (auto const& mul_quad : mul_quads) {
        BB_ASSERT(!is_zero_gate(mul_quad),
                  "acir_format::assert_zero_to_quad_constraints: produced an arithmetic zero gate.");
    }
}

void add_blackbox_func_call_to_acir_format(Acir::Opcode::BlackBoxFuncCall const& arg,
                                           AcirFormat& af,
                                           size_t opcode_index)
{
    auto to_witness_or_constant = [&](const Acir::FunctionInput& e) { return parse_input(e); };
    auto to_witness = [&](const Acir::Witness& e) { return e.value; };
    auto to_witness_from_input = [&](const Acir::FunctionInput& e) { return get_witness_from_function_input(e); };

    std::visit(
        [&](auto&& arg) {
            using T = std::decay_t<decltype(arg)>;
            if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::AND>) {
                af.logic_constraints.push_back(LogicConstraint{
                    .a = parse_input(arg.lhs),
                    .b = parse_input(arg.rhs),
                    .result = to_witness(arg.output),
                    .num_bits = arg.num_bits,
                    .is_xor_gate = false,
                });
                af.original_opcode_indices.logic_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::XOR>) {
                af.logic_constraints.push_back(LogicConstraint{
                    .a = parse_input(arg.lhs),
                    .b = parse_input(arg.rhs),
                    .result = to_witness(arg.output),
                    .num_bits = arg.num_bits,
                    .is_xor_gate = true,
                });
                af.original_opcode_indices.logic_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::RANGE>) {
                af.range_constraints.push_back(RangeConstraint{
                    .witness = get_witness_from_function_input(arg.input),
                    .num_bits = arg.num_bits,
                });
                af.original_opcode_indices.range_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::AES128Encrypt>) {
                af.aes128_constraints.push_back(AES128Constraint{
                    .inputs = transform::map(arg.inputs, to_witness_or_constant),
                    .iv = transform::map(*arg.iv, to_witness_or_constant),
                    .key = transform::map(*arg.key, to_witness_or_constant),
                    .outputs = transform::map(arg.outputs, to_witness),
                });
                af.original_opcode_indices.aes128_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Sha256Compression>) {
                af.sha256_compression.push_back(Sha256Compression{
                    .inputs = transform::map(*arg.inputs, to_witness_or_constant),
                    .hash_values = transform::map(*arg.hash_values, to_witness_or_constant),
                    .result = transform::map(*arg.outputs, to_witness),
                });
                af.original_opcode_indices.sha256_compression.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Blake2s>) {
                af.blake2s_constraints.push_back(Blake2sConstraint{
                    .inputs = transform::map(arg.inputs,
                                             [&](auto& e) {
                                                 return Blake2sInput{
                                                     .blackbox_input = parse_input(e),
                                                     .num_bits = 8,
                                                 };
                                             }),
                    .result = transform::map(*arg.outputs, to_witness),
                });
                af.original_opcode_indices.blake2s_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Blake3>) {
                af.blake3_constraints.push_back(Blake3Constraint{
                    .inputs = transform::map(
                        arg.inputs,
                        [&](auto& e) { return Blake3Input{ .blackbox_input = parse_input(e), .num_bits = 8 }; }),
                    .result = transform::map(*arg.outputs, to_witness),
                });
                af.original_opcode_indices.blake3_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EcdsaSecp256k1>) {
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
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EcdsaSecp256r1>) {
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
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::MultiScalarMul>) {
                af.multi_scalar_mul_constraints.push_back(MultiScalarMul{
                    .points = transform::map(arg.points, to_witness_or_constant),
                    .scalars = transform::map(arg.scalars, to_witness_or_constant),
                    .predicate = parse_input(arg.predicate),
                    .out_point_x = to_witness((*arg.outputs)[0]),
                    .out_point_y = to_witness((*arg.outputs)[1]),
                    .out_point_is_infinite = to_witness((*arg.outputs)[2]),
                });
                af.original_opcode_indices.multi_scalar_mul_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EmbeddedCurveAdd>) {
                af.ec_add_constraints.push_back(EcAdd{
                    .input1_x = parse_input((*arg.input1)[0]),
                    .input1_y = parse_input((*arg.input1)[1]),
                    .input1_infinite = parse_input((*arg.input1)[2]),
                    .input2_x = parse_input((*arg.input2)[0]),
                    .input2_y = parse_input((*arg.input2)[1]),
                    .input2_infinite = parse_input((*arg.input2)[2]),
                    .predicate = parse_input(arg.predicate),
                    .result_x = to_witness((*arg.outputs)[0]),
                    .result_y = to_witness((*arg.outputs)[1]),
                    .result_infinite = to_witness((*arg.outputs)[2]),
                });
                af.original_opcode_indices.ec_add_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Keccakf1600>) {
                af.keccak_permutations.push_back(Keccakf1600{
                    .state = transform::map(*arg.inputs, to_witness_or_constant),
                    .result = transform::map(*arg.outputs, to_witness),
                });
                af.original_opcode_indices.keccak_permutations.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::RecursiveAggregation>) {
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
                case HN_TAIL:
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
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Poseidon2Permutation>) {
                af.poseidon2_constraints.push_back(Poseidon2Constraint{
                    .state = transform::map(arg.inputs, to_witness_or_constant),
                    .result = transform::map(arg.outputs, to_witness),
                });
                af.original_opcode_indices.poseidon2_constraints.push_back(opcode_index);
            } else {
                bb::assert_failure("acir_format::handle_blackbox_func_call: Unrecognized BlackBoxFuncCall variant. An "
                                   "error here means there was a serialization error.");
            }
        },
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
        BB_ASSERT(calldata_id == 0 || calldata_id == 1, "acir_format::handle_memory_init: Unsupported calldata id");

        block.type = BlockType::CallData;
        block.calldata_id = calldata_id == 0 ? CallDataType::Primary : CallDataType::Secondary;
    } else if (std::holds_alternative<Acir::BlockType::ReturnData>(mem_init.block_type.value)) {
        block.type = BlockType::ReturnData;
    }

    return block;
}

void add_memory_op_to_block_constraint(Acir::Opcode::MemoryOp const& mem_op, BlockConstraint& block)
{
    // Lambda to convert an Acir::Expression to a witness index
    auto acir_expression_to_witness_or_constant = [&](const Acir::Expression& expr) {
        // Noir gives us witnesses or constants for read/write operations. We use the following assertions to ensure
        // that the data coming from Noir is in the correct form.
        BB_ASSERT(expr.mul_terms.empty(), "MemoryOp should not have multiplication terms");
        BB_ASSERT_LTE(expr.linear_combinations.size(), 1U, "MemoryOp should have at most one linear term");

        const fr a_scaling = expr.linear_combinations.size() == 1
                                 ? from_buffer_with_bound_checks(std::get<0>(expr.linear_combinations[0]))
                                 : fr::zero();
        const fr constant_term = from_buffer_with_bound_checks(expr.q_c);

        bool is_witness = a_scaling == fr::one() && constant_term == fr::zero();
        bool is_constant = a_scaling == fr::zero();
        BB_ASSERT(is_witness || is_constant, "MemoryOp expression must be a witness or a constant");

        return WitnessOrConstant<bb::fr>{
            .index = is_witness ? std::get<1>(expr.linear_combinations[0]).value : bb::stdlib::IS_CONSTANT,
            .value = is_constant ? constant_term : fr::zero(),
            .is_constant = is_constant,
        };
    };

    // Lambda to determine whether a memory operation is a read or write operation
    auto is_read_operation = [&](const Acir::Expression& expr) {
        BB_ASSERT(expr.mul_terms.empty(), "MemoryOp expression should not have multiplication terms");
        BB_ASSERT(expr.linear_combinations.empty(), "MemoryOp expression should not have linear terms");

        const fr const_term = from_buffer_with_bound_checks(expr.q_c);

        BB_ASSERT((const_term == fr::one()) || (const_term == fr::zero()),
                  "MemoryOp expression should be either zero or one");

        // A read operation is given by a zero Expression
        return const_term == fr::zero();
    };

    AccessType access_type = is_read_operation(mem_op.op.operation) ? AccessType::Read : AccessType::Write;
    if (access_type == AccessType::Write) {
        // We are not allowed to write on the databus
        BB_ASSERT((block.type != BlockType::CallData) && (block.type != BlockType::ReturnData));
        // Mark the table as a RAM table
        block.type = BlockType::RAM;
    }

    // Update the ranges of the index using the array length
    WitnessOrConstant<bb::fr> index = acir_expression_to_witness_or_constant(mem_op.op.index);
    WitnessOrConstant<bb::fr> value = acir_expression_to_witness_or_constant(mem_op.op.value);

    MemOp acir_mem_op = MemOp{ .access_type = access_type, .index = index, .value = value };
    block.trace.push_back(acir_mem_op);
}

bool is_single_arithmetic_gate(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    static constexpr size_t NUM_WIRES = 4; // Equal to the number of wires in the arithmetization

    // If there are more than 4 distinct witnesses in the linear terms, then we need multiple arithmetic gates
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
