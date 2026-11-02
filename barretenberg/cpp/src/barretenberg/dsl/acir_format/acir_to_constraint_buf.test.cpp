#include <gtest/gtest.h>
#include <utility>
#include <vector>

#include "acir_serde_test_utils.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"

using namespace acir_format;

namespace {

Acir::Circuit single_assert_zero_circuit()
{
    Acir::Expression expr{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 0 } },
                                                    { bb::fr(-1).to_buffer(), Acir::Witness{ 1 } } },
                           .q_c = bb::fr::zero().to_buffer() };
    return Acir::Circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters = {},
        .return_values = {},
    };
}

} // namespace

/**
 * @brief The serialized program is released as soon as it has been unpacked, not when the caller's vector dies
 */
TEST(AcirToConstraintBuf, ParsingConsumesTheSerializedProgram)
{
    auto buf = test::serialize_program_with_circuit(single_assert_zero_circuit());
    auto constraints = circuit_buf_to_acir_format(std::move(buf), /*is_mega=*/false);
    EXPECT_EQ(constraints.num_acir_opcodes, 1U);
    EXPECT_EQ(buf.capacity(), 0U); // NOLINT(bugprone-use-after-move)
}

namespace {

Acir::Expression linear(std::initializer_list<std::pair<int, uint32_t>> terms, int constant)
{
    Acir::Expression expr{ .q_c = bb::fr(constant).to_buffer() };
    for (const auto& [coefficient, witness] : terms) {
        expr.linear_combinations.emplace_back(bb::fr(coefficient).to_buffer(), Acir::Witness{ witness });
    }
    return expr;
}

/**
 * @brief A circuit exercising each opcode-handling path whose result depends on
 * state carried across opcodes: batched linear AssertZeros, memory blocks and
 * their operations, plus a black-box call and public inputs.
 */
Acir::Circuit mixed_circuit()
{
    Acir::Expression product = linear({ { 1, 2 } }, 0);
    product.mul_terms.emplace_back(bb::fr(-1).to_buffer(), Acir::Witness{ 0 }, Acir::Witness{ 1 });

    Acir::Circuit circuit{
      .function_name = "mixed",
      .opcodes =
          {
              Acir::Opcode{Acir::Opcode::AssertZero{.value = product}},
              Acir::Opcode{Acir::Opcode::AssertZero{
                  .value = linear({{1, 3}, {-1, 4}}, 0)}},
              Acir::Opcode{Acir::Opcode::AssertZero{
                  .value = linear({{1, 5}, {-1, 6}}, 7)}},
              Acir::Opcode{
                  Acir::Opcode::BlackBoxFuncCall{
                      .value =
                          Acir::BlackBoxFuncCall{
                              .value =
                                  Acir::BlackBoxFuncCall::RANGE{
                                      .input = Acir::FunctionInput{.value = Acir::FunctionInput::Witness{.value =
                                                                                                             Acir::Witness{
                                                                                                                 2}}},
                                      .num_bits = 32}}}},
              Acir::
                  Opcode{
                      Acir::
                          Opcode::MemoryInit{.block_id = Acir::BlockId{0},
                                             .init = {Acir::Witness{3}, Acir::Witness{5}},
                                             .block_type =
                                                 Acir::BlockType{.value = Acir::BlockType::Memory{}}}},
              Acir::
                  Opcode{
                      Acir::Opcode::MemoryOp{.block_id = Acir::BlockId{0},
                                             .op = Acir::MemOp{.read = true,
                                                               .index = Acir::Witness{7},
                                                               .value =
                                                                   Acir::Witness{
                                                                       8}}}},
              Acir::
                  Opcode{
                      Acir::Opcode::AssertZero{.value =
                                                   linear(
                                                       {{2, 8}, {-1, 9}}, 0)}},
          },
      .private_parameters = {Acir::Witness{0}, Acir::Witness{1}},
      .public_parameters = Acir::PublicInputs{.value = {Acir::Witness{9}}},
      .return_values = Acir::PublicInputs{.value = {Acir::Witness{2}}},
  };
    return circuit;
}

enum class Layout { IntKeyedMap, StringKeyedMap };

void pack_key(msgpack::packer<msgpack::sbuffer>& packer, Layout layout, uint32_t index, const char* name)
{
    if (layout == Layout::IntKeyedMap) {
        packer.pack(index);
    } else {
        packer.pack(std::string(name));
    }
}

/**
 * @brief Serialize a single-function program with the program and circuit as
 * maps in the given layout (the generated msgpack_pack only emits arrays).
 */
std::vector<uint8_t> serialize_program_as_maps(const Acir::Circuit& circuit, Layout layout)
{
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);

    packer.pack_map(1);
    pack_key(packer, layout, 0, "functions");
    packer.pack_array(1);
    packer.pack_map(6);
    pack_key(packer, layout, 0, "function_name");
    packer.pack(circuit.function_name);
    pack_key(packer, layout, 1, "opcodes");
    packer.pack(circuit.opcodes);
    pack_key(packer, layout, 2, "private_parameters");
    packer.pack(circuit.private_parameters);
    pack_key(packer, layout, 3, "public_parameters");
    packer.pack(circuit.public_parameters);
    pack_key(packer, layout, 4, "return_values");
    packer.pack(circuit.return_values);
    pack_key(packer, layout, 5, "assert_messages");
    packer.pack(circuit.assert_messages);

    std::vector<uint8_t> buf{ 0x02 }; // FORMAT_MSGPACK
    buf.insert(buf.end(), sbuf.data(), sbuf.data() + sbuf.size());
    return buf;
}

} // namespace

/**
 * @brief Converting opcodes one at a time from the msgpack tree gives the
 * AcirFormat of the fully converted circuit
 */
TEST(AcirToConstraintBuf, ArrayLayoutMatchesCircuitConversion)
{
    const Acir::Circuit circuit = mixed_circuit();
    for (bool is_mega : { false, true }) {
        const AcirFormat expected = circuit_serde_to_acir_format(circuit, is_mega);
        EXPECT_EQ(circuit_buf_to_acir_format(test::serialize_program_with_circuit(circuit), is_mega), expected);
    }
}

TEST(AcirToConstraintBuf, MapLayoutsMatchCircuitConversion)
{
    const Acir::Circuit circuit = mixed_circuit();
    const AcirFormat expected = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);
    for (Layout layout : { Layout::IntKeyedMap, Layout::StringKeyedMap }) {
        EXPECT_EQ(circuit_buf_to_acir_format(serialize_program_as_maps(circuit, layout), /*is_mega=*/true), expected);
    }
}

TEST(AcirToConstraintBuf, MissingOpcodesFieldIsRejected)
{
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);
    packer.pack_map(1);
    packer.pack(std::string("functions"));
    packer.pack_array(1);
    packer.pack_map(1);
    packer.pack(std::string("function_name"));
    packer.pack(std::string("f"));
    std::vector<uint8_t> buf{ 0x02 };
    buf.insert(buf.end(), sbuf.data(), sbuf.data() + sbuf.size());

    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(std::move(buf), /*is_mega=*/true),
                              "missing field 'opcodes' in Circuit");
}

namespace {

std::vector<uint8_t> with_marker(uint8_t marker, const msgpack::sbuffer& sbuf)
{
    std::vector<uint8_t> buf{ marker };
    buf.insert(buf.end(), sbuf.data(), sbuf.data() + sbuf.size());
    return buf;
}

} // namespace

/**
 * @brief In a map layout the circuit header may follow the opcodes; the streaming reader must still see it.
 */
TEST(AcirToConstraintBuf, HeaderFieldsAfterOpcodesMatchCircuitConversion)
{
    const Acir::Circuit circuit = mixed_circuit();
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);
    packer.pack_map(1);
    packer.pack(std::string("functions"));
    packer.pack_array(1);
    packer.pack_map(6);
    packer.pack(std::string("assert_messages"));
    packer.pack(circuit.assert_messages);
    packer.pack(std::string("return_values"));
    packer.pack(circuit.return_values);
    packer.pack(std::string("opcodes"));
    packer.pack(circuit.opcodes);
    packer.pack(std::string("public_parameters"));
    packer.pack(circuit.public_parameters);
    packer.pack(std::string("private_parameters"));
    packer.pack(circuit.private_parameters);
    packer.pack(std::string("function_name"));
    packer.pack(circuit.function_name);

    EXPECT_EQ(circuit_buf_to_acir_format(with_marker(0x02, sbuf), /*is_mega=*/true),
              circuit_serde_to_acir_format(circuit, /*is_mega=*/true));
}

/**
 * @brief The Brillig bytecode of a full Program is skipped, whatever it contains.
 */
TEST(AcirToConstraintBuf, BrilligBytecodeIsSkipped)
{
    const Acir::Circuit circuit = mixed_circuit();
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);
    packer.pack_array(2);
    packer.pack_array(1);
    packer.pack(circuit);
    // unconstrained_functions: one BrilligBytecode whose opcodes use variants this build does not know.
    packer.pack_array(1);
    packer.pack_array(2);
    packer.pack(std::string("brillig_main"));
    packer.pack_array(3);
    for (uint32_t i = 0; i < 3; ++i) {
        packer.pack_map(1);
        packer.pack(std::string("FutureOpcode"));
        packer.pack_bin(64);
        packer.pack_bin_body(std::string(64, static_cast<char>(i)).data(), 64);
    }

    EXPECT_EQ(circuit_buf_to_acir_format(with_marker(0x03, sbuf), /*is_mega=*/true),
              circuit_serde_to_acir_format(circuit, /*is_mega=*/true));
}

TEST(AcirToConstraintBuf, TruncatedProgramIsRejected)
{
    auto buf = test::serialize_program_with_circuit(mixed_circuit());
    buf.resize(buf.size() / 2);
    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(std::move(buf), /*is_mega=*/true), "malformed msgpack");
}

namespace {

Witnesses::WitnessStack dense_witness_stack(uint32_t num_witnesses)
{
    Witnesses::StackItem item{ .index = 0 };
    for (uint32_t i = 0; i < num_witnesses; ++i) {
        item.witness.value.emplace(Witnesses::Witness{ i }, bb::fr(i * 7 + 1).to_buffer());
    }
    return Witnesses::WitnessStack{ .stack = { item } };
}

} // namespace

/**
 * @brief The streamed witness equals the conversion of the fully deserialized WitnessMap in every wire layout.
 */
TEST(AcirToConstraintBuf, WitnessLayoutsMatchWitnessMapConversion)
{
    const Witnesses::WitnessStack stack = dense_witness_stack(37);
    const WitnessVector expected = witness_map_to_witness_vector(stack.stack[0].witness);
    ASSERT_EQ(expected.size(), 37U);

    msgpack::sbuffer array_layout;
    msgpack::packer<msgpack::sbuffer> array_packer(array_layout);
    array_packer.pack(stack);
    EXPECT_EQ(witness_buf_to_witness_vector(with_marker(0x03, array_layout)), expected);

    for (Layout layout : { Layout::IntKeyedMap, Layout::StringKeyedMap }) {
        msgpack::sbuffer sbuf;
        msgpack::packer<msgpack::sbuffer> packer(sbuf);
        packer.pack_map(1);
        pack_key(packer, layout, 0, "stack");
        packer.pack_array(1);
        packer.pack_map(2);
        pack_key(packer, layout, 1, "witness");
        packer.pack(stack.stack[0].witness);
        pack_key(packer, layout, 0, "index");
        packer.pack(stack.stack[0].index);
        EXPECT_EQ(witness_buf_to_witness_vector(with_marker(0x02, sbuf)), expected);
    }
}

/**
 * @brief Entries out of wire order, with a repeated index, give what the whole-tree path gives for the same bytes:
 * sorted by index, and the last of two values for an index wins (msgpack's std::map conversion assigns each entry in
 * turn).
 */
TEST(AcirToConstraintBuf, UnorderedWitnessEntriesMatchTreeConversion)
{
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);
    packer.pack_array(1);
    packer.pack_array(1);
    packer.pack_array(2);
    packer.pack(uint32_t{ 0 });
    packer.pack_map(6);
    for (const auto& [index, value] : std::initializer_list<std::pair<uint32_t, int>>{
             { 3, 22 }, { 1, 8 }, { 0, 1 }, { 1, 999 }, { 2, 15 }, { 2, 16 } }) {
        packer.pack(index);
        packer.pack(bb::fr(value).to_buffer());
    }
    const std::vector<uint8_t> bytes = with_marker(0x03, sbuf);

    auto tree_bytes = bytes;
    const auto stack =
        deserialize_msgpack_compact<Witnesses::WitnessStack>(std::move(tree_bytes), [](msgpack::object const& o) {
            Witnesses::WitnessStack witness_stack;
            o.convert(witness_stack);
            return witness_stack;
        });
    const WitnessVector from_tree = witness_map_to_witness_vector(stack.stack[0].witness);
    ASSERT_EQ(from_tree.size(), 4U);
    ASSERT_EQ(from_tree[1], bb::fr(999));

    EXPECT_EQ(witness_buf_to_witness_vector(std::vector<uint8_t>(bytes)), from_tree);
}

/**
 * @brief The constraint vectors come back without the slack of push_back growth, which would otherwise stay resident
 * through circuit construction.
 */
TEST(AcirToConstraintBuf, ConstraintVectorsCarryNoGrowthSlack)
{
    Acir::Circuit circuit;
    for (uint32_t i = 0; i < 3; ++i) {
        Acir::Expression expr = linear({ { 1, 2 * i }, { -1, 2 * i + 1 } }, 0);
        expr.mul_terms.emplace_back(bb::fr(1).to_buffer(), Acir::Witness{ 2 * i }, Acir::Witness{ 2 * i + 1 });
        circuit.opcodes.emplace_back(Acir::Opcode::AssertZero{ .value = expr });
        circuit.opcodes.emplace_back(Acir::Opcode::BlackBoxFuncCall{
            .value = Acir::BlackBoxFuncCall{
                .value = Acir::BlackBoxFuncCall::RANGE{
                    .input =
                        Acir::FunctionInput{ .value = Acir::FunctionInput::Witness{ .value = Acir::Witness{ 2 * i } } },
                    .num_bits = 8 } } });
    }
    for (bool is_mega : { false, true }) {
        const AcirFormat af = circuit_buf_to_acir_format(test::serialize_program_with_circuit(circuit), is_mega);
        ASSERT_EQ(af.quad_constraints.size(), 3U);
        ASSERT_EQ(af.range_constraints.size(), 3U);
        EXPECT_EQ(af.quad_constraints.capacity(), af.quad_constraints.size());
        EXPECT_EQ(af.range_constraints.capacity(), af.range_constraints.size());
        EXPECT_EQ(af.original_opcode_indices.quad_constraints.capacity(), af.quad_constraints.size());
    }
}
