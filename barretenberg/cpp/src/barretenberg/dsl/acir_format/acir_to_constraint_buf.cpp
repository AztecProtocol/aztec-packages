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

uint256_t from_big_endian_bytes(std::vector<uint8_t> const& bytes)
{
    BB_ASSERT_EQ(bytes.size(), 32U, "uint256 constructed from bytes array with invalid length");
    uint256_t result = 0;
    for (uint8_t byte : bytes) {
        result <<= 8;
        result |= byte;
    }
    return result;
}

WitnessOrConstant<bb::fr> parse_input(Acir::FunctionInput input)
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
                    .value = from_big_endian_bytes(e.value),
                    .is_constant = true,
                };
            } else {
                bb::assert_failure("acir_format::parse_input: unrecognized Acir::FunctionInput variant.");
            }
        },
        input.value);
    return result;
}

uint32_t get_witness_from_function_input(Acir::FunctionInput input)
{
    BB_ASSERT(std::holds_alternative<Acir::FunctionInput::Witness>(input.value),
              "get_witness_from_function_input: input must be a Witness variant");

    auto input_witness = std::get<Acir::FunctionInput::Witness>(input.value);
    return input_witness.value.value;
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
    // `varnum` is the true number of variables, thus we add one to the index which starts at zero
    af.varnum = circuit.current_witness_index + 1;
    af.num_acir_opcodes = static_cast<uint32_t>(circuit.opcodes.size());
    af.public_inputs = join({ transform::map(circuit.public_parameters.value, [](auto e) { return e.value; }),
                              transform::map(circuit.return_values.value, [](auto e) { return e.value; }) });
    // Map to a pair of: BlockConstraint, and list of opcodes associated with that BlockConstraint
    // NOTE: We want to deterministically visit this map, so unordered_map should not be used.
    std::map<uint32_t, std::pair<BlockConstraint, std::vector<size_t>>> block_id_to_block_constraint;

    bool has_brillig = false;
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
                    auto block = handle_memory_init(arg);
                    uint32_t block_id = arg.block_id.value;
                    block_id_to_block_constraint[block_id] = { block, /*opcode_indices=*/{ i } };
                } else if constexpr (std::is_same_v<T, Acir::Opcode::MemoryOp>) {
                    auto block = block_id_to_block_constraint.find(arg.block_id.value);
                    if (block == block_id_to_block_constraint.end()) {
                        throw_or_abort("unitialized MemoryOp");
                    }
                    handle_memory_op(arg, af, block->second.first);
                    block->second.second.push_back(i);
                } else if constexpr (std::is_same_v<T, Acir::Opcode::BrilligCall>) {
                    has_brillig = true;
                } else {
                    bb::assert_failure("circuit_serde_to_acir_format: Unrecognized Acir Opcode.");
                }
            },
            gate.value);
    }
    for (const auto& [block_id, block] : block_id_to_block_constraint) {
        // Note: the trace will always be empty for ReturnData since it cannot be explicitly read from in noir
        if (!block.first.trace.empty() || block.first.type == BlockType::ReturnData ||
            block.first.type == BlockType::CallData) {
            af.block_constraints.push_back(block.first);
            af.original_opcode_indices.block_constraints.push_back(block.second);
        }
    }

    if (has_brillig) {
        vinfo("acir_format:circuit_serde_to_acir_format: Encountered unhadled BrilligCall during circuit "
              "deserialization. Barretenberg treats this as a no-op.");
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
                throw_or_abort("failed to convert msgpack data to Program");
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
                throw_or_abort("failed to convert msgpack data to WitnessStack");
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
        witness_vector.emplace_back(from_big_endian_bytes(e.second));
        index++;
    }

    return witness_vector;
}

/// ========= ACIR OPCODE HANDLERS ========= ///

/**
 * @brief Construct a poly_tuple for a standard width-3 arithmetic gate from its acir representation
 *
 * @param arg acir representation of an 3-wire arithmetic operation
 * @return arithmetic_triple
 * @note In principle Acir::Expression can accommodate arbitrarily many quadratic and linear terms but in practice
 * the ones processed here have a max of 1 and 3 respectively, in accordance with the standard width-3 arithmetic gate.
 */
arithmetic_triple serialize_arithmetic_gate(Acir::Expression const& arg)
{
    arithmetic_triple pt{
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
    BB_ASSERT_LTE(arg.mul_terms.size(), 1U, "We can only accommodate 1 quadratic term");
    // Note: mul_terms are tuples of the form {selector_value, witness_idx_1, witness_idx_2}
    if (!arg.mul_terms.empty()) {
        const auto& mul_term = arg.mul_terms[0];
        pt.q_m = from_big_endian_bytes(std::get<0>(mul_term));
        pt.a = std::get<1>(mul_term).value;
        pt.b = std::get<2>(mul_term).value;
        a_set = true;
        b_set = true;
    }

    // If necessary, set values for linears terms q_l * w_l, q_r * w_r and q_o * w_o
    BB_ASSERT_LTE(arg.linear_combinations.size(), 3U, "We can only accommodate 3 linear terms");
    for (const auto& linear_term : arg.linear_combinations) {
        fr selector_value(from_big_endian_bytes(std::get<0>(linear_term)));
        uint32_t witness_idx = std::get<1>(linear_term).value;

        // If the witness index has not yet been set or if the corresponding linear term is active, set the witness
        // index and the corresponding selector value.
        if (!a_set || pt.a == witness_idx) { // q_l * w_l
            pt.a = witness_idx;
            pt.q_l += selector_value; // Accumulate coefficients for duplicate witnesses
            a_set = true;
        } else if (!b_set || pt.b == witness_idx) { // q_r * w_r
            pt.b = witness_idx;
            pt.q_r += selector_value; // Accumulate coefficients for duplicate witnesses
            b_set = true;
        } else if (!c_set || pt.c == witness_idx) { // q_o * w_o
            pt.c = witness_idx;
            pt.q_o += selector_value; // Accumulate coefficients for duplicate witnesses
            c_set = true;
        } else {
            return arithmetic_triple{
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
    pt.q_c = from_big_endian_bytes(arg.q_c);
    return pt;
}

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
            .mul_scaling = fr(from_big_endian_bytes(std::get<0>(mul_term))),
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
            mul_quad.const_scaling = fr(from_big_endian_bytes(arg.q_c));
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
            mul_quad.const_scaling = fr(from_big_endian_bytes(arg.q_c));
            if (!linear_terms.empty()) {
                add_linear_term_and_erase(mul_quad.d, mul_quad.d_scaling, linear_terms);
            }
            is_first_gate = false;
        }
        result.emplace_back(mul_quad);
    }

    return result;
}

bool is_assert_equal(mul_quad_<fr> const& mul_quad)
{
    return mul_quad.mul_scaling == bb::fr::zero() && mul_quad.a_scaling == -mul_quad.b_scaling &&
           mul_quad.a_scaling != bb::fr::zero() && mul_quad.const_scaling == bb::fr::zero() &&
           mul_quad.c_scaling == bb::fr::zero() && mul_quad.d_scaling == bb::fr::zero();
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
    std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms);

    if (is_single_gate) {
        BB_ASSERT_EQ(mul_quads.size(), 1U, "acir_format::handle_arithmetic: expected a single gate.");
        auto mul_quad = mul_quads[0];

        // AUDITTODO(federico): evaluate this logic and if it is needed
        if (is_assert_equal(mul_quad) && (mul_quad.a != 0)) {
            if (mul_quad.a != mul_quad.b) {
                // minimal_range of a witness is the smallest range of the witness and the witness that are
                // 'assert_equal' to it
                if (af.minimal_range.contains(mul_quad.b) && af.minimal_range.contains(mul_quad.a)) {
                    if (af.minimal_range[mul_quad.a] < af.minimal_range[mul_quad.b]) {
                        af.minimal_range[mul_quad.a] = af.minimal_range[mul_quad.b];
                    } else {
                        af.minimal_range[mul_quad.b] = af.minimal_range[mul_quad.a];
                    }
                } else if (af.minimal_range.contains(mul_quad.b)) {
                    af.minimal_range[mul_quad.a] = af.minimal_range[mul_quad.b];
                } else if (af.minimal_range.contains(mul_quad.a)) {
                    af.minimal_range[mul_quad.b] = af.minimal_range[mul_quad.a];
                }
            }
        }

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
    std::visit(
        [&](auto&& arg) {
            using T = std::decay_t<decltype(arg)>;
            if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::AND>) {
                auto lhs_input = parse_input(arg.lhs);
                auto rhs_input = parse_input(arg.rhs);
                af.logic_constraints.push_back(LogicConstraint{
                    .a = lhs_input,
                    .b = rhs_input,
                    .result = arg.output.value,
                    .num_bits = arg.num_bits,
                    .is_xor_gate = false,
                });
                af.original_opcode_indices.logic_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::XOR>) {
                auto lhs_input = parse_input(arg.lhs);
                auto rhs_input = parse_input(arg.rhs);
                af.logic_constraints.push_back(LogicConstraint{
                    .a = lhs_input,
                    .b = rhs_input,
                    .result = arg.output.value,
                    .num_bits = arg.num_bits,
                    .is_xor_gate = true,
                });
                af.original_opcode_indices.logic_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::RANGE>) {
                auto witness_input = get_witness_from_function_input(arg.input);
                af.range_constraints.push_back(RangeConstraint{
                    .witness = witness_input,
                    .num_bits = arg.num_bits,
                });
                af.original_opcode_indices.range_constraints.push_back(opcode_index);
                if (af.minimal_range.contains(witness_input)) {
                    if (af.minimal_range[witness_input] > arg.num_bits) {
                        af.minimal_range[witness_input] = arg.num_bits;
                    }
                } else {
                    af.minimal_range[witness_input] = arg.num_bits;
                }
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::AES128Encrypt>) {
                af.aes128_constraints.push_back(AES128Constraint{
                    .inputs = transform::map(arg.inputs, [](auto& e) { return parse_input(e); }),
                    .iv = transform::map(*arg.iv, [](auto& e) { return parse_input(e); }),
                    .key = transform::map(*arg.key, [](auto& e) { return parse_input(e); }),
                    .outputs = transform::map(arg.outputs, [](auto& e) { return e.value; }),
                });
                af.original_opcode_indices.aes128_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Sha256Compression>) {
                af.sha256_compression.push_back(Sha256Compression{
                    .inputs = transform::map(*arg.inputs, [](auto& e) { return parse_input(e); }),
                    .hash_values = transform::map(*arg.hash_values, [](auto& e) { return parse_input(e); }),
                    .result = transform::map(*arg.outputs, [](auto& e) { return e.value; }),
                });
                af.original_opcode_indices.sha256_compression.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Blake2s>) {
                af.blake2s_constraints.push_back(Blake2sConstraint{
                    .inputs = transform::map(arg.inputs,
                                             [](auto& e) {
                                                 return Blake2sInput{
                                                     .blackbox_input = parse_input(e),
                                                     .num_bits = 8,
                                                 };
                                             }),
                    .result = transform::map(*arg.outputs, [](auto& e) { return e.value; }),
                });
                af.original_opcode_indices.blake2s_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Blake3>) {
                af.blake3_constraints.push_back(Blake3Constraint{
                    .inputs = transform::map(
                        arg.inputs,
                        [](auto& e) { return Blake3Input{ .blackbox_input = parse_input(e), .num_bits = 8 }; }),
                    .result = transform::map(*arg.outputs, [](auto& e) { return e.value; }),
                });
                af.original_opcode_indices.blake3_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EcdsaSecp256k1>) {
                af.ecdsa_k1_constraints.push_back(EcdsaConstraint{
                    .type = bb::CurveType::SECP256K1,
                    .hashed_message =
                        transform::map(*arg.hashed_message, [](auto& e) { return get_witness_from_function_input(e); }),
                    .signature =
                        transform::map(*arg.signature, [](auto& e) { return get_witness_from_function_input(e); }),
                    .pub_x_indices =
                        transform::map(*arg.public_key_x, [](auto& e) { return get_witness_from_function_input(e); }),
                    .pub_y_indices =
                        transform::map(*arg.public_key_y, [](auto& e) { return get_witness_from_function_input(e); }),
                    .predicate = parse_input(arg.predicate),
                    .result = arg.output.value,
                });
                af.original_opcode_indices.ecdsa_k1_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EcdsaSecp256r1>) {
                af.ecdsa_r1_constraints.push_back(EcdsaConstraint{
                    .type = bb::CurveType::SECP256R1,
                    .hashed_message =
                        transform::map(*arg.hashed_message, [](auto& e) { return get_witness_from_function_input(e); }),
                    .signature =
                        transform::map(*arg.signature, [](auto& e) { return get_witness_from_function_input(e); }),
                    .pub_x_indices =
                        transform::map(*arg.public_key_x, [](auto& e) { return get_witness_from_function_input(e); }),
                    .pub_y_indices =
                        transform::map(*arg.public_key_y, [](auto& e) { return get_witness_from_function_input(e); }),
                    .predicate = parse_input(arg.predicate),
                    .result = arg.output.value,
                });
                af.original_opcode_indices.ecdsa_r1_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::MultiScalarMul>) {
                af.multi_scalar_mul_constraints.push_back(MultiScalarMul{
                    .points = transform::map(arg.points, [](auto& e) { return parse_input(e); }),
                    .scalars = transform::map(arg.scalars, [](auto& e) { return parse_input(e); }),
                    .predicate = parse_input(arg.predicate),
                    .out_point_x = (*arg.outputs)[0].value,
                    .out_point_y = (*arg.outputs)[1].value,
                    .out_point_is_infinite = (*arg.outputs)[2].value,
                });
                af.original_opcode_indices.multi_scalar_mul_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::EmbeddedCurveAdd>) {
                auto input_1_x = parse_input((*arg.input1)[0]);
                auto input_1_y = parse_input((*arg.input1)[1]);
                auto input_1_infinite = parse_input((*arg.input1)[2]);
                auto input_2_x = parse_input((*arg.input2)[0]);
                auto input_2_y = parse_input((*arg.input2)[1]);
                auto input_2_infinite = parse_input((*arg.input2)[2]);
                auto predicate = parse_input(arg.predicate);

                af.ec_add_constraints.push_back(EcAdd{
                    .input1_x = input_1_x,
                    .input1_y = input_1_y,
                    .input1_infinite = input_1_infinite,
                    .input2_x = input_2_x,
                    .input2_y = input_2_y,
                    .input2_infinite = input_2_infinite,
                    .predicate = predicate,
                    .result_x = (*arg.outputs)[0].value,
                    .result_y = (*arg.outputs)[1].value,
                    .result_infinite = (*arg.outputs)[2].value,
                });
                af.original_opcode_indices.ec_add_constraints.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Keccakf1600>) {
                af.keccak_permutations.push_back(Keccakf1600{
                    .state = transform::map(*arg.inputs, [](auto& e) { return parse_input(e); }),
                    .result = transform::map(*arg.outputs, [](auto& e) { return e.value; }),
                });
                af.original_opcode_indices.keccak_permutations.push_back(opcode_index);
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::RecursiveAggregation>) {

                auto input_key = get_witness_from_function_input(arg.key_hash);

                auto proof_type_in = arg.proof_type;
                auto predicate = parse_input(arg.predicate);
                if (predicate.is_constant && predicate.value.is_zero()) {
                    // No constraint if the recursion is disabled
                    return;
                }
                auto c = RecursionConstraint{
                    .key = transform::map(arg.verification_key,
                                          [](auto& e) { return get_witness_from_function_input(e); }),
                    .proof = transform::map(arg.proof, [](auto& e) { return get_witness_from_function_input(e); }),
                    .public_inputs =
                        transform::map(arg.public_inputs, [](auto& e) { return get_witness_from_function_input(e); }),
                    .key_hash = input_key,
                    .proof_type = proof_type_in,
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
                    throw_or_abort("Invalid PROOF_TYPE in RecursionConstraint!");
                }
            } else if constexpr (std::is_same_v<T, Acir::BlackBoxFuncCall::Poseidon2Permutation>) {
                af.poseidon2_constraints.push_back(Poseidon2Constraint{
                    .state = transform::map(arg.inputs, [](auto& e) { return parse_input(e); }),
                    .result = transform::map(arg.outputs, [](auto& e) { return e.value; }),
                });
                af.original_opcode_indices.poseidon2_constraints.push_back(opcode_index);
            } else {
                bb::assert_failure("handle_blackbox_func_call: Unrecognized BlackBoxFuncCall variant.");
            }
        },
        arg.value.value);
}

BlockConstraint handle_memory_init(Acir::Opcode::MemoryInit const& mem_init)
{
    BlockConstraint block{ .init = {}, .trace = {}, .type = BlockType::ROM };
    std::vector<arithmetic_triple> init;
    std::vector<MemOp> trace;

    auto len = mem_init.init.size();
    for (size_t i = 0; i < len; ++i) {
        block.init.push_back(arithmetic_triple{
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

    // Databus is only supported for Goblin, non Goblin builders will treat call_data and return_data as normal
    // array.
    if (std::holds_alternative<Acir::BlockType::CallData>(mem_init.block_type.value)) {
        block.type = BlockType::CallData;
        block.calldata_id = std::get<Acir::BlockType::CallData>(mem_init.block_type.value).value;
    } else if (std::holds_alternative<Acir::BlockType::ReturnData>(mem_init.block_type.value)) {
        block.type = BlockType::ReturnData;
    }

    return block;
}

bool is_rom(Acir::MemOp const& mem_op)
{
    return mem_op.operation.mul_terms.empty() && mem_op.operation.linear_combinations.empty() &&
           from_big_endian_bytes(mem_op.operation.q_c) == 0;
}

uint32_t poly_to_witness(const arithmetic_triple poly)
{
    if (poly.q_m == 0 && poly.q_r == 0 && poly.q_o == 0 && poly.q_l == 1 && poly.q_c == 0) {
        return poly.a;
    }
    return 0;
}

void handle_memory_op(Acir::Opcode::MemoryOp const& mem_op, AcirFormat& af, BlockConstraint& block)
{
    uint8_t access_type = 1;
    if (is_rom(mem_op.op)) {
        access_type = 0;
    }
    if (access_type == 1) {
        // We are not allowed to write on the databus
        BB_ASSERT((block.type != BlockType::CallData) && (block.type != BlockType::ReturnData));
        block.type = BlockType::RAM;
    }

    // Update the ranges of the index using the array length
    arithmetic_triple index = serialize_arithmetic_gate(mem_op.op.index);
    int bit_range = std::bit_width(block.init.size());
    uint32_t index_witness = poly_to_witness(index);
    if (index_witness != 0 && bit_range > 0) {
        unsigned int u_bit_range = static_cast<unsigned int>(bit_range);
        // Updates both af.minimal_range and af.index_range with u_bit_range when it is lower.
        // By doing so, we keep these invariants:
        // - minimal_range contains the smallest possible range for a witness
        // - index_range constains the smallest range for a witness implied by any array operation
        if (af.minimal_range.contains(index_witness)) {
            if (af.minimal_range[index_witness] > u_bit_range) {
                af.minimal_range[index_witness] = u_bit_range;
            }
        } else {
            af.minimal_range[index_witness] = u_bit_range;
        }
        if (af.index_range.contains(index_witness)) {
            if (af.index_range[index_witness] > u_bit_range) {
                af.index_range[index_witness] = u_bit_range;
            }
        } else {
            af.index_range[index_witness] = u_bit_range;
        }
    }

    MemOp acir_mem_op =
        MemOp{ .access_type = access_type, .index = index, .value = serialize_arithmetic_gate(mem_op.op.value) };
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
        fr selector_value = from_big_endian_bytes(std::get<0>(linear_term));
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
