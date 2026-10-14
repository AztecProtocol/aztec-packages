/**
 * @file acir_compact_decoder.test.cpp
 * @brief The streaming msgpack-compact program decoder (circuit_buf_to_acir_format) must produce the same AcirFormat
 * as converting the Acir::Circuit it encodes (circuit_serde_to_acir_format).
 */

#include <gtest/gtest.h>
#include <vector>

#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "serde/acir.hpp"

using namespace acir_format;

namespace {

std::vector<uint8_t> coefficient(const bb::fr& value)
{
    std::vector<uint8_t> bytes(32);
    bb::fr::serialize_to_buffer(value, bytes.data());
    return bytes;
}

Acir::Expression expression(const std::vector<std::tuple<uint64_t, uint32_t, uint32_t>>& mul_terms,
                            const std::vector<std::pair<uint64_t, uint32_t>>& linear_terms,
                            uint64_t constant)
{
    Acir::Expression expr;
    for (const auto& [scaling, lhs, rhs] : mul_terms) {
        expr.mul_terms.emplace_back(coefficient(bb::fr(scaling)), Acir::Witness{ lhs }, Acir::Witness{ rhs });
    }
    for (const auto& [scaling, witness] : linear_terms) {
        expr.linear_combinations.emplace_back(coefficient(-bb::fr(scaling)), Acir::Witness{ witness });
    }
    expr.q_c = coefficient(bb::fr(constant));
    return expr;
}

Acir::Opcode assert_zero(Acir::Expression expr)
{
    return Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = std::move(expr) } };
}

Acir::Opcode range(Acir::FunctionInput input, uint32_t num_bits)
{
    return Acir::Opcode{ .value = Acir::Opcode::BlackBoxFuncCall{
                             .value =
                                 Acir::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall::RANGE{
                                                             .input = std::move(input), .num_bits = num_bits } } } };
}

Acir::Opcode memory_op(uint32_t block_id, bool is_write, uint32_t index, uint32_t value)
{
    return Acir::Opcode{ .value = Acir::Opcode::MemoryOp{
                             .block_id = Acir::BlockId{ block_id },
                             .op = Acir::MemOp{ .read = is_write, .index = { index }, .value = { value } } } };
}

std::vector<uint8_t> serialize_program(const Acir::Circuit& circuit)
{
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);
    // Program = [functions, unconstrained_functions]
    packer.pack_array(2);
    packer.pack_array(1);
    packer.pack(circuit);
    packer.pack_array(0);

    std::vector<uint8_t> buf;
    buf.push_back(0x03); // FORMAT_MSGPACK_COMPACT
    buf.insert(buf.end(), sbuf.data(), sbuf.data() + sbuf.size());
    return buf;
}

Acir::Circuit test_circuit()
{
    Acir::Circuit circuit;
    auto& ops = circuit.opcodes;

    // AssertZero opcodes of every gate shape, with growing and shrinking term counts (exercises buffer reuse),
    // duplicate linear witnesses and witness indices in every msgpack integer width.
    ops.push_back(assert_zero(expression({}, { { 1, 1 }, { 1, 2 } }, 0)));
    ops.push_back(assert_zero(expression({ { 1, 1, 2 } }, { { 1, 3 } }, 5)));
    ops.push_back(assert_zero(expression({ { 2, 1, 2 }, { 3, 2, 4 } }, { { 1, 1 }, { 1, 4 }, { 1, 5 } }, 0)));
    ops.push_back(assert_zero(expression(
        { { 2, 1, 2 }, { 3, 3, 4 }, { 4, 5, 6 } }, { { 1, 7 }, { 1, 8 }, { 1, 9 }, { 1, 10 }, { 1, 11 } }, 7)));
    ops.push_back(assert_zero(expression({}, { { 1, 200 } }, 3)));
    ops.push_back(assert_zero(expression({ { 1, 300, 300 } }, { { 1, 300 }, { 2, 300 }, { 1, 70000 } }, 0)));
    ops.push_back(assert_zero(expression({}, { { 1, 12 }, { 1, 13 }, { 1, 14 }, { 1, 15 }, { 1, 16 }, { 1, 17 } }, 1)));
    ops.push_back(assert_zero(expression({ { 5, 18, 19 } }, {}, 0)));
    ops.push_back(assert_zero(expression({}, { { 1, 20 }, { 1, 21 } }, 9)));

    // Range constraints on witnesses in different msgpack integer widths.
    ops.push_back(range(Acir::FunctionInput{ .value = Acir::FunctionInput::Witness{ .value = { 22 } } }, 32));
    ops.push_back(range(Acir::FunctionInput{ .value = Acir::FunctionInput::Witness{ .value = { 100000 } } }, 254));

    // Memory: MemoryInit goes through the generic decoder, MemoryOp reads and writes are decoded directly.
    ops.push_back(Acir::Opcode{
        .value = Acir::Opcode::MemoryInit{ .block_id = { 0 },
                                           .init = { { 23 }, { 24 }, { 25 } },
                                           .block_type = Acir::BlockType{ .value = Acir::BlockType::Memory{} } } });
    ops.push_back(memory_op(0, false, 26, 27));
    ops.push_back(memory_op(0, true, 28, 29));

    // Brillig calls only contribute their witness indices; the largest index of the circuit is in one.
    ops.push_back(Acir::Opcode{
        .value = Acir::Opcode::BrilligCall{
            .id = 3,
            .inputs = { Acir::BrilligInputs{ .value =
                                                 Acir::BrilligInputs::Single{
                                                     .value = expression({ { 1, 30, 31 } }, { { 1, 32 } }, 0) } },
                        Acir::BrilligInputs{
                            .value = Acir::BrilligInputs::Array{ .value = { expression({}, { { 1, 33 } }, 0),
                                                                            expression(
                                                                                {}, { { 1, 34 }, { 1, 35 } }, 1) } } },
                        Acir::BrilligInputs{ .value = Acir::BrilligInputs::MemoryArray{ .value = { 0 } } } },
            .outputs = { Acir::BrilligOutputs{ .value = Acir::BrilligOutputs::Simple{ .value = { 36 } } },
                         Acir::BrilligOutputs{ .value =
                                                   Acir::BrilligOutputs::Array{ .value = { { 37 }, { 5000000 } } } } },
            .predicate = expression({}, {}, 1) } });
    ops.push_back(Acir::Opcode{ .value = Acir::Opcode::BrilligCall{
                                    .id = 0, .inputs = {}, .outputs = {}, .predicate = expression({}, {}, 1) } });

    // An AssertZero after the generic and Brillig paths.
    ops.push_back(assert_zero(expression({ { 1, 38, 39 } }, { { 1, 40 } }, 0)));

    // Skipped fields: a str8 function name, uint64 error selectors and nested expressions in the assert messages.
    circuit.function_name = std::string(40, 'f');
    circuit.assert_messages.emplace_back(
        Acir::OpcodeLocation{ .value = Acir::OpcodeLocation::Acir{ .value = 3 } },
        Acir::AssertionPayload{
            .error_selector = 14990209321349310352ULL,
            .payload = {
                Acir::ExpressionOrMemory{
                    .value = Acir::ExpressionOrMemory::Expression{ .value = expression({}, { { 1, 2 } }, 0) } },
                Acir::ExpressionOrMemory{ .value = Acir::ExpressionOrMemory::Memory{ .value = { 0 } } } } });
    circuit.assert_messages.emplace_back(Acir::OpcodeLocation{ .value = Acir::OpcodeLocation::Acir{ .value = 70000 } },
                                         Acir::AssertionPayload{ .error_selector = 1, .payload = {} });
    circuit.private_parameters = { { 1 }, { 2 }, { 300 }, { 70000 } };
    circuit.public_parameters = Acir::PublicInputs{ .value = { { 3 }, { 4 } } };
    circuit.return_values = Acir::PublicInputs{ .value = { { 40 } } };
    return circuit;
}

// mul_quad_, MemOp and BlockConstraint have no operator==, so AcirFormat's defaulted one is not usable.
auto quad_fields(const QuadConstraint& q)
{
    return std::make_tuple(
        q.a, q.b, q.c, q.d, q.mul_scaling, q.a_scaling, q.b_scaling, q.c_scaling, q.d_scaling, q.const_scaling);
}

void expect_same_quads(const std::vector<QuadConstraint>& lhs, const std::vector<QuadConstraint>& rhs)
{
    ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t i = 0; i < lhs.size(); ++i) {
        EXPECT_EQ(quad_fields(lhs[i]), quad_fields(rhs[i]));
    }
}

void expect_same_acir_format(const AcirFormat& lhs, const AcirFormat& rhs)
{
    EXPECT_EQ(lhs.max_witness_index, rhs.max_witness_index);
    EXPECT_EQ(lhs.num_acir_opcodes, rhs.num_acir_opcodes);
    EXPECT_EQ(lhs.public_inputs, rhs.public_inputs);
    EXPECT_EQ(lhs.range_constraints, rhs.range_constraints);
    expect_same_quads(lhs.quad_constraints, rhs.quad_constraints);
    ASSERT_EQ(lhs.big_quad_constraints.size(), rhs.big_quad_constraints.size());
    for (size_t i = 0; i < lhs.big_quad_constraints.size(); ++i) {
        expect_same_quads(lhs.big_quad_constraints[i], rhs.big_quad_constraints[i]);
    }
    EXPECT_EQ(lhs.bilinear_constraints, rhs.bilinear_constraints);
    EXPECT_EQ(lhs.batched_eq_check_constraints, rhs.batched_eq_check_constraints);
    ASSERT_EQ(lhs.block_constraints.size(), rhs.block_constraints.size());
    for (size_t i = 0; i < lhs.block_constraints.size(); ++i) {
        const auto& lhs_block = lhs.block_constraints[i];
        const auto& rhs_block = rhs.block_constraints[i];
        EXPECT_EQ(lhs_block.init, rhs_block.init);
        EXPECT_EQ(lhs_block.type, rhs_block.type);
        EXPECT_EQ(lhs_block.calldata_id, rhs_block.calldata_id);
        ASSERT_EQ(lhs_block.trace.size(), rhs_block.trace.size());
        for (size_t j = 0; j < lhs_block.trace.size(); ++j) {
            EXPECT_EQ(lhs_block.trace[j].access_type, rhs_block.trace[j].access_type);
            EXPECT_EQ(lhs_block.trace[j].index, rhs_block.trace[j].index);
            EXPECT_EQ(lhs_block.trace[j].value, rhs_block.trace[j].value);
        }
    }
    EXPECT_EQ(lhs.original_opcode_indices, rhs.original_opcode_indices);
}

} // namespace

TEST(AcirCompactDecoder, MatchesCircuitConversion)
{
    const Acir::Circuit circuit = test_circuit();
    for (const bool is_mega : { false, true }) {
        const AcirFormat expected = circuit_serde_to_acir_format(circuit, is_mega);
        const AcirFormat decoded = circuit_buf_to_acir_format(serialize_program(circuit), is_mega);
        expect_same_acir_format(decoded, expected);
        EXPECT_EQ(decoded.max_witness_index, 5000000U);
        EXPECT_EQ(decoded.num_acir_opcodes, circuit.opcodes.size());
        EXPECT_FALSE(decoded.quad_constraints.empty());
        EXPECT_FALSE(decoded.big_quad_constraints.empty());
        EXPECT_EQ(decoded.range_constraints.size(), 2U);
        EXPECT_EQ(decoded.block_constraints.size(), 1U);
    }
}

TEST(AcirCompactDecoder, RejectsTruncatedAssertMessages)
{
    std::vector<uint8_t> buf = serialize_program(test_circuit());
    // The assert messages are the last field of the circuit; the empty unconstrained function list follows them.
    buf.resize(buf.size() - 2);
    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(std::move(buf), /*is_mega=*/true), "malformed msgpack data");
}
