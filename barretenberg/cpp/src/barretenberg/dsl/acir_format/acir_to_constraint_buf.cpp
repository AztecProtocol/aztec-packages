// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
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

void update_max_witness_index(uint32_t witness_idx, AcirFormat& af)
{
    if (witness_idx != stdlib::IS_CONSTANT) {
        af.max_witness_index = std::max(af.max_witness_index, witness_idx);
    }
}

WitnessOrConstant<bb::fr> parse_input(Acir::FunctionInput input, [[maybe_unused]] AcirFormat& af)
{
    WitnessOrConstant<bb::fr> result = std::visit(
        [&](auto&& e) {
            using T = std::decay_t<decltype(e)>;
            if constexpr (std::is_same_v<T, Acir::FunctionInput::Witness>) {
                update_max_witness_index(e.value.value, af);
                return WitnessOrConstant<bb::fr>{
                    .index = e.value.value,
                    .value = bb::fr::zero(),
                    .is_constant = false,
                };
            } else if constexpr (std::is_same_v<T, Acir::FunctionInput::Constant>) {
                return WitnessOrConstant<bb::fr>{
                    .index = bb::stdlib::IS_CONSTANT,
                    .value = fr::serialize_from_buffer(&e.value[0]),
                    .is_constant = true,
                };
            } else {
                bb::assert_failure("acir_format::parse_input: unrecognized Acir::FunctionInput variant.");
            }
        },
        input.value);
    return result;
}

uint32_t get_witness_from_function_input(Acir::FunctionInput input, AcirFormat& af)
{
    BB_ASSERT(std::holds_alternative<Acir::FunctionInput::Witness>(input.value),
              "get_witness_from_function_input: input must be a Witness variant");
    uint32_t witness_idx = std::get<Acir::FunctionInput::Witness>(input.value).value.value;
    update_max_witness_index(witness_idx, af);

    return witness_idx;
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
                    BB_ASSERT(false, "Msgpack is not currently supported.");
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
    AcirFormat af;
    af.num_acir_opcodes = static_cast<uint32_t>(circuit.opcodes.size());
    af.public_inputs = join({
        transform::map(circuit.public_parameters.value,
                       [&](auto e) {
                           update_max_witness_index(e.value, af);
                           return e.value;
                       }),
        transform::map(circuit.return_values.value,
                       [&](auto e) {
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
        std::visit(
            [&](auto&& arg) {
                using T = std::decay_t<decltype(arg)>;
                if constexpr (std::is_same_v<T, Acir::Opcode::AssertZero>) {
                    handle_arithmetic(arg, af, i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::BlackBoxFuncCall>) {
                    handle_blackbox_func_call(arg, af, i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryInit>) {
                    auto block = handle_memory_init(arg, af);
                    uint32_t block_id = arg.block_id.value;
                    block_id_to_block_constraint[block_id] = { block, /*opcode_indices=*/{ i } };
                } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryOp>) {
                    auto block = block_id_to_block_constraint.find(arg.block_id.value);
                    if (block == block_id_to_block_constraint.end()) {
                        bb::assert_failure("unitialized MemoryOp");
                    }
                    handle_memory_op(arg, block->second.first, af);
                    block->second.second.push_back(i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::BrilligCall>) {
                    handle_brillig_call(arg, af);
                } else {
                    bb::assert_failure("circuit_serde_to_acir_format: Unrecognized Acir Opcode.");
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
                bb::assert_failure("failed to convert msgpack data to Program");
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
                bb::assert_failure("failed to convert msgpack data to WitnessStack");
            }
            return witness_stack;
        },
        &Witnesses::WitnessStack::bincodeDeserialize);
    BB_ASSERT_EQ(
        witness_stack.stack.size(), 1U, "witness_buf_to_witness_vector: expected single WitnessMap in WitnessStack");

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
        witness_vector.emplace_back(fr::serialize_from_buffer(&e.second[0]));
        index++;
    }

    return witness_vector;
}

/// ========= ACIR OPCODE HANDLERS ========= ///

void handle_brillig_call(Acir::Opcode::BrilligCall const& arg, AcirFormat& af)
{
    // Process inputs
    for (const auto& input : arg.inputs) {
        std::visit(
            [&](auto&& e) {
                using T = std::decay_t<decltype(e)>;
                if constexpr (std::is_same_v<T, Acir::BrilligInputs::Single>) {
                    update_max_witness_index_from_expression(e.value, af);
                } else if constexpr (std::is_same_v<T, Acir::BrilligInputs::Array>) {
                    for (const auto& expr : e.value) {
                        update_max_witness_index_from_expression(expr, af);
                    }
                } else if constexpr (std::is_same_v<T, Acir::BrilligInputs::MemoryArray>) {
                    // MemoryArray contains a BlockId, no direct witnesses to track
                }
            },
            input.value);
    }

    // Process outputs
    for (const auto& output : arg.outputs) {
        std::visit(
            [&](auto&& e) {
                using T = std::decay_t<decltype(e)>;
                if constexpr (std::is_same_v<T, Acir::BrilligOutputs::Simple>) {
                    update_max_witness_index(e.value.value, af);
                } else if constexpr (std::is_same_v<T, Acir::BrilligOutputs::Array>) {
                    for (const auto& witness : e.value) {
                        update_max_witness_index(witness.value, af);
                    }
                }
            },
            output.value);
    }

    // Process optional predicate
    if (arg.predicate.has_value()) {
        update_max_witness_index_from_expression(arg.predicate.value(), af);
    }
}

std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg,
                                                     std::map<uint32_t, bb::fr>& linear_terms,
                                                     AcirFormat& af)
{
    // Lambda to add next linear term from linear_terms to the mul_quad_ gate and erase it from linear_terms
    auto add_linear_term_and_erase = [](uint32_t& idx, fr& scaling, std::map<uint32_t, fr>& linear_terms) {
        BB_ASSERT_EQ(
            idx, bb::stdlib::IS_CONSTANT, "Attempting to override a non-constant witness index in mul_quad_ gate");
        idx = linear_terms.begin()->first;
        scaling += linear_terms.begin()->second;
        linear_terms.erase(idx);
    };

    // Lambda to update the witness indices with the acir offset
    auto update_max_witness_index_from_mul_quad_gate = [&](mul_quad_<fr>& gate) {
        update_max_witness_index(gate.a, af);
        update_max_witness_index(gate.b, af);
        update_max_witness_index(gate.c, af);
        update_max_witness_index(gate.d, af);
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
            .mul_scaling = fr::serialize_from_buffer(&(std::get<0>(mul_term)[0])),
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
            mul_quad.const_scaling = fr::serialize_from_buffer(&arg.q_c[0]);
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
            mul_quad.const_scaling = fr::serialize_from_buffer(&arg.q_c[0]);
            if (!linear_terms.empty()) {
                add_linear_term_and_erase(mul_quad.d, mul_quad.d_scaling, linear_terms);
            }
            is_first_gate = false;
        }

        result.emplace_back(mul_quad);
    }

    BB_ASSERT(!result.empty(), "split_into_mul_quad_gates: resulted in zero gates.");
    result.shrink_to_fit();

    for (auto& mul_quad : result) {
        update_max_witness_index_from_mul_quad_gate(mul_quad);
    }
    return result;
}

void handle_arithmetic(Acir::Opcode::AssertZero const& arg, AcirFormat& af, size_t opcode_index)
{
    // Lambda to detect zero gates
    auto is_zero_gate = [](const mul_quad_<fr>& gate) {
        return ((gate.mul_scaling == fr(0)) && (gate.a_scaling == fr(0)) && (gate.b_scaling == fr(0)) &&
                (gate.c_scaling == fr(0)) && (gate.d_scaling == fr(0)) && (gate.const_scaling == fr(0)));
    };

    auto linear_terms = process_linear_terms(arg.value);
    bool is_single_gate = is_single_arithmetic_gate(arg.value, linear_terms);
    std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms, af);

    if (is_single_gate) {
        BB_ASSERT_EQ(mul_quads.size(), 1U, "acir_format::handle_arithmetic: expected a single gate.");
        auto mul_quad = mul_quads[0];

        af.quad_constraints.push_back(mul_quad);
        af.original_opcode_indices.quad_constraints.push_back(opcode_index);
    } else {
        BB_ASSERT_GT(mul_quads.size(), 1U, "acir_format::handle_arithmetic: expected multiple gates but found one.");
        af.big_quad_constraints.push_back(mul_quads);
        af.original_opcode_indices.big_quad_constraints.push_back(opcode_index);
    }

    for (auto const& mul_quad : mul_quads) {
        BB_ASSERT(!is_zero_gate(mul_quad), "acir_format::handle_arithmetic: produced an arithmetic zero gate.");
    }
}

void handle_blackbox_func_call(Acir::Opcode::BlackBoxFuncCall const& arg, AcirFormat& af, size_t opcode_index)
{
    auto to_witness_or_constant = [&](auto& e) { return parse_input(e, af); };
    auto to_witness = [&](auto& e) {
        update_max_witness_index(e.value, af);
        return e.value;
    };
    auto to_witness_from_input = [&](auto& e) { return get_witness_from_function_input(e, af); };

    std::visit(
        [&](auto&& arg) {
            using T = std::decay_t<decltype(arg)>;
            if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::AND>) {
                af.logic_constraints.push_back(LogicConstraint{
                    .a = parse_input(arg.lhs, af),
                    .b = parse_input(arg.rhs, af),
                    .result = to_witness(arg.output),
                    .num_bits = arg.num_bits,
                    .is_xor_gate = false,
                });
                af.original_opcode_indices.logic_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::XOR>) {
                af.logic_constraints.push_back(LogicConstraint{
                    .a = parse_input(arg.lhs, af),
                    .b = parse_input(arg.rhs, af),
                    .result = to_witness(arg.output),
                    .num_bits = arg.num_bits,
                    .is_xor_gate = true,
                });
                af.original_opcode_indices.logic_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::RANGE>) {
                af.range_constraints.push_back(RangeConstraint{
                    .witness = get_witness_from_function_input(arg.input, af),
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
                                                     .blackbox_input = parse_input(e, af),
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
                        [&](auto& e) { return Blake3Input{ .blackbox_input = parse_input(e, af), .num_bits = 8 }; }),
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
                    .predicate = parse_input(arg.predicate, af),
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
                    .predicate = parse_input(arg.predicate, af),
                    .result = to_witness(arg.output),
                });
                af.original_opcode_indices.ecdsa_r1_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::MultiScalarMul>) {
                af.multi_scalar_mul_constraints.push_back(MultiScalarMul{
                    .points = transform::map(arg.points, to_witness_or_constant),
                    .scalars = transform::map(arg.scalars, to_witness_or_constant),
                    .predicate = parse_input(arg.predicate, af),
                    .out_point_x = to_witness((*arg.outputs)[0]),
                    .out_point_y = to_witness((*arg.outputs)[1]),
                    .out_point_is_infinite = to_witness((*arg.outputs)[2]),
                });
                af.original_opcode_indices.multi_scalar_mul_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EmbeddedCurveAdd>) {
                af.ec_add_constraints.push_back(EcAdd{
                    .input1_x = parse_input((*arg.input1)[0], af),
                    .input1_y = parse_input((*arg.input1)[1], af),
                    .input1_infinite = parse_input((*arg.input1)[2], af),
                    .input2_x = parse_input((*arg.input2)[0], af),
                    .input2_y = parse_input((*arg.input2)[1], af),
                    .input2_infinite = parse_input((*arg.input2)[2], af),
                    .predicate = parse_input(arg.predicate, af),
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
                auto predicate = parse_input(arg.predicate, af);
                if (predicate.is_constant && predicate.value.is_zero()) {
                    // No constraint if the recursion is disabled
                    return;
                }
                auto c = RecursionConstraint{
                    .key = transform::map(arg.verification_key, to_witness_from_input),
                    .proof = transform::map(arg.proof, to_witness_from_input),
                    .public_inputs = transform::map(arg.public_inputs, to_witness_from_input),
                    .key_hash = get_witness_from_function_input(arg.key_hash, af),
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
                    bb::assert_failure("Invalid PROOF_TYPE in RecursionConstraint!");
                }
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Poseidon2Permutation>) {
                af.poseidon2_constraints.push_back(Poseidon2Constraint{
                    .state = transform::map(arg.inputs, to_witness_or_constant),
                    .result = transform::map(arg.outputs, to_witness),
                });
                af.original_opcode_indices.poseidon2_constraints.push_back(opcode_index);
            } else {
                bb::assert_failure("handle_blackbox_func_call: Unrecognized BlackBoxFuncCall variant.");
            }
        },
        arg.value.value);
}

BlockConstraint handle_memory_init(Acir::Opcode::MemoryInit const& mem_init, AcirFormat& af)
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
        update_max_witness_index(init.value, af);
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

void handle_memory_op(Acir::Opcode::MemoryOp const& mem_op, BlockConstraint& block, AcirFormat& af)
{
    // Lambda to convert an Acir::Expression to a witness index
    auto acir_expression_to_witness_or_constant = [&](const Acir::Expression& expr) {
        std::map<uint32_t, bb::fr> linear_terms = process_linear_terms(expr);
        std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(expr, linear_terms, af);

        BB_ASSERT_EQ(mul_quads.size(), 1U, "MemoryOp expression should result in a single mul_quad_ gate");
        mul_quad_<fr> quad = mul_quads.front();

        // Noir gives us witnesses or constants for read/write operations. We use the following assertions to ensure
        // that the data coming from Noir is in the correct form.
        BB_ASSERT_EQ(quad.mul_scaling, fr::zero(), "MemoryOp should not have a mul term");
        BB_ASSERT_EQ(quad.b_scaling, fr::zero(), "MemoryOp should only have one linear term");
        BB_ASSERT_EQ(quad.c_scaling, fr::zero(), "MemoryOp should only have one linear term");
        BB_ASSERT_EQ(quad.d_scaling, fr::zero(), "MemoryOp should only have one linear term");

        bool is_witness = quad.a_scaling == fr::one() && quad.const_scaling == fr::zero();
        bool is_constant = quad.a_scaling == fr::zero();
        BB_ASSERT(is_witness || is_constant, "MemoryOp expression must be a witness or a constant");

        return WitnessOrConstant<bb::fr>{
            .index = is_witness ? quad.a : bb::stdlib::IS_CONSTANT,
            .value = is_constant ? quad.const_scaling : bb::fr::zero(),
            .is_constant = is_constant,
        };
    };

    // Lambda to determine whether a memory operation is a read or write operation
    auto is_read_operation = [&](const Acir::Expression& expr) {
        BB_ASSERT(expr.mul_terms.empty(), "MemoryOp expression should not have multiplication terms");
        BB_ASSERT(expr.linear_combinations.empty(), "MemoryOp expression should not have linear terms");

        const fr const_term = fr::serialize_from_buffer(&expr.q_c[0]);

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
        fr selector_value = fr::serialize_from_buffer(&(std::get<0>(linear_term)[0]));
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
