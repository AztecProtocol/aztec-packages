/**
 * @file components_check.test.cpp
 * @brief Regression tests: small hand-built `Acir::Circuit` values through serde, `create_circuit`,
 *        and `ComponentsChecker` (same path as the `acir_components_check` binary minus file I/O).
 */
#include "components_check.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <array>
#include <gtest/gtest.h>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>

using namespace acir_format;

namespace {

using AcirComponentsCheckBuilder = UltraCircuitBuilder;

Acir::Witness make_witness(uint32_t witness_idx)
{
    return Acir::Witness{ .value = witness_idx };
}

Acir::FunctionInput make_witness_input(uint32_t witness_idx)
{
    return Acir::FunctionInput{ .value =
                                    Acir::FunctionInput::Witness{ .value = Acir::Witness{ .value = witness_idx } } };
}

Acir::FunctionInput make_constant_input(const bb::fr& value)
{
    return Acir::FunctionInput{ .value = Acir::FunctionInput::Constant{ .value = value.to_buffer() } };
}

Acir::Expression make_constant_expression(const bb::fr& value)
{
    return Acir::Expression{
        .mul_terms = {},
        .linear_combinations = {},
        .q_c = value.to_buffer(),
    };
}

Acir::Expression make_witness_expression(uint32_t witness_idx)
{
    return Acir::Expression{
        .mul_terms = {},
        .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ .value = witness_idx } } },
        .q_c = bb::fr::zero().to_buffer(),
    };
}

Acir::Circuit make_circuit(std::vector<Acir::Opcode> opcodes)
{
    return Acir::Circuit{
        .opcodes = std::move(opcodes),
        .public_parameters = {},
        .return_values = {},
    };
}

class WitnessFactory {
  public:
    explicit WitnessFactory(uint32_t start = 0)
        : next_(start)
    {}

    uint32_t next_index() { return next_++; }

    Acir::Witness next_witness() { return make_witness(next_index()); }

    Acir::FunctionInput next_input() { return make_witness_input(next_index()); }

    std::vector<Acir::Witness> next_witnesses(size_t count)
    {
        std::vector<Acir::Witness> witnesses;
        witnesses.reserve(count);
        for (size_t i = 0; i < count; ++i) {
            witnesses.push_back(next_witness());
        }
        return witnesses;
    }

    std::vector<Acir::FunctionInput> next_inputs(size_t count)
    {
        std::vector<Acir::FunctionInput> inputs;
        inputs.reserve(count);
        for (size_t i = 0; i < count; ++i) {
            inputs.push_back(next_input());
        }
        return inputs;
    }

    template <size_t N> std::shared_ptr<std::array<Acir::FunctionInput, N>> next_input_array()
    {
        auto inputs = std::make_shared<std::array<Acir::FunctionInput, N>>();
        for (auto& input : *inputs) {
            input = next_input();
        }
        return inputs;
    }

    template <size_t N> std::shared_ptr<std::array<Acir::Witness, N>> next_witness_array()
    {
        auto outputs = std::make_shared<std::array<Acir::Witness, N>>();
        for (auto& output : *outputs) {
            output = next_witness();
        }
        return outputs;
    }

  private:
    uint32_t next_;
};

std::vector<acir_components_check::Error> run_components_check(const Acir::Circuit& circuit)
{
    auto constraints = circuit_serde_to_acir_format(circuit, IsMegaBuilder<AcirComponentsCheckBuilder>);
    AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = create_circuit<AcirComponentsCheckBuilder>(program);
    acir_components_check::ComponentsChecker checker(circuit, builder);
    return checker.check();
}

void expect_no_component_errors(const std::vector<acir_components_check::Error>& errors)
{
    if (errors.empty()) {
        return;
    }
    std::string msg;
    for (const auto& err : errors) {
        msg += err.message;
        msg += '\n';
    }
    FAIL() << msg;
}

void expect_single_error_type(const std::vector<acir_components_check::Error>& errors,
                              acir_components_check::Error::Type type)
{
    ASSERT_EQ(errors.size(), 1U);
    EXPECT_EQ(errors[0].type, type) << errors[0].message;
}

size_t count_acir_components_for_witnesses(const Acir::Circuit& circuit, const std::vector<uint32_t>& witnesses)
{
    acir_components_check::AcirGraph graph;
    graph.process_acir_circuit(circuit);
    auto witness_to_component = graph.get_witness_component_map();

    std::unordered_set<size_t> components;
    for (auto witness : witnesses) {
        auto it = witness_to_component.find(witness);
        if (it != witness_to_component.end()) {
            components.insert(it->second);
        }
    }
    return components.size();
}

size_t count_circuit_components_for_witnesses(const Acir::Circuit& circuit, const std::vector<uint32_t>& witnesses)
{
    auto constraints = circuit_serde_to_acir_format(circuit, IsMegaBuilder<AcirComponentsCheckBuilder>);
    AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = create_circuit<AcirComponentsCheckBuilder>(program);

    cdg::UltraStaticAnalyzer analyzer(builder);
    auto connected_components = analyzer.find_connected_components();

    std::unordered_map<uint32_t, size_t> real_variable_to_component;
    for (size_t component_id = 0; component_id < connected_components.size(); ++component_id) {
        for (auto real_var : connected_components[component_id].vars()) {
            real_variable_to_component[real_var] = component_id;
        }
    }

    std::unordered_set<size_t> components;
    for (auto witness : witnesses) {
        if (witness >= builder.real_variable_index.size()) {
            continue;
        }
        auto real_var = builder.real_variable_index[witness];
        auto it = real_variable_to_component.find(real_var);
        if (it != real_variable_to_component.end()) {
            components.insert(it->second);
        }
    }
    return components.size();
}

} // namespace

class AcirComponentsCheckTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(AcirComponentsCheckTest, SingleLinearConstraintLinksTwoWitnesses)
{
    Acir::Expression expr{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 0 } },
                                                    { bb::fr(-1).to_buffer(), Acir::Witness{ 1 } } },
                           .q_c = bb::fr::zero().to_buffer() };
    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters = {},
        .return_values = {},
    };

    expect_no_component_errors(run_components_check(circuit));
}

TEST_F(AcirComponentsCheckTest, AllBlackBoxFunctionOpcodesPassComponentsCheck)
{
    WitnessFactory witnesses;

    auto sha256_inputs = witnesses.next_input_array<16>();
    auto sha256_hash_values = witnesses.next_input_array<8>();
    auto sha256_outputs = witnesses.next_witness_array<8>();

    auto k1_public_key_x = witnesses.next_input_array<32>();
    auto k1_public_key_y = witnesses.next_input_array<32>();
    auto k1_signature = witnesses.next_input_array<64>();
    auto k1_hashed_message = witnesses.next_input_array<32>();

    auto r1_public_key_x = witnesses.next_input_array<32>();
    auto r1_public_key_y = witnesses.next_input_array<32>();
    auto r1_signature = witnesses.next_input_array<64>();
    auto r1_hashed_message = witnesses.next_input_array<32>();

    auto msm_outputs = witnesses.next_witness_array<2>();
    auto ec_add_input1 = witnesses.next_input_array<2>();
    auto ec_add_input2 = witnesses.next_input_array<2>();
    auto ec_add_outputs = witnesses.next_witness_array<2>();
    auto keccak_inputs = witnesses.next_input_array<25>();
    auto keccak_outputs = witnesses.next_witness_array<25>();

    Acir::Circuit circuit = make_circuit({
        Acir::Opcode{ .value =
                          Acir::Opcode::BlackBoxFuncCall{
                              .value = Acir::BlackBoxFuncCall{ .value =
                                                                   Acir::BlackBoxFuncCall::AND{
                                                                       .lhs = witnesses.next_input(),
                                                                       .rhs = witnesses.next_input(),
                                                                       .num_bits = 8,
                                                                       .output = witnesses.next_witness(),
                                                                   } } } },
        Acir::Opcode{
            .value =
                Acir::Opcode::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall{ .value =
                                                                                     Acir::BlackBoxFuncCall::XOR{
                                                                                         .lhs = witnesses.next_input(),
                                                                                         .rhs = witnesses.next_input(),
                                                                                         .num_bits = 8,
                                                                                         .output =
                                                                                             witnesses.next_witness(),
                                                                                     } } } },
        Acir::Opcode{
            .value =
                Acir::Opcode::BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall{ .value =
                                                                                     Acir::BlackBoxFuncCall::RANGE{
                                                                                         .input =
                                                                                             witnesses.next_input(),
                                                                                         .num_bits = 16,
                                                                                     } } } },
        Acir::Opcode{ .value =
                          Acir::Opcode::BlackBoxFuncCall{
                              .value =
                                  Acir::BlackBoxFuncCall{
                                      .value =
                                          Acir::BlackBoxFuncCall::AES128Encrypt{
                                              .inputs =
                                                  witnesses.next_inputs(16),
                                              .iv =
                                                  witnesses.next_input_array<16>(),
                                              .key = witnesses.next_input_array<16>(),
                                              .outputs =
                                                  witnesses.next_witnesses(16),
                                          } } } },
        Acir::Opcode{
            .value =
                Acir::Opcode::BlackBoxFuncCall{
                    .value =
                        Acir::BlackBoxFuncCall{
                            .value =
                                Acir::BlackBoxFuncCall::Sha256Compression{
                                    .inputs =
                                        sha256_inputs,
                                    .hash_values = sha256_hash_values,
                                    .outputs = sha256_outputs,
                                } } } },
        Acir::Opcode{ .value =
                          Acir::Opcode::BlackBoxFuncCall{
                              .value =
                                  Acir::BlackBoxFuncCall{
                                      .value =
                                          Acir::BlackBoxFuncCall::Blake2s{
                                              .inputs =
                                                  witnesses.next_inputs(64),
                                              .outputs =
                                                  witnesses.next_witness_array<32>(),
                                          } } } },
        Acir::Opcode{ .value =
                          Acir::Opcode::BlackBoxFuncCall{
                              .value =
                                  Acir::BlackBoxFuncCall{
                                      .value =
                                          Acir::BlackBoxFuncCall::Blake3{
                                              .inputs =
                                                  witnesses.next_inputs(64),
                                              .outputs =
                                                  witnesses.next_witness_array<32>(),
                                          } } } },
        Acir::
            Opcode{ .value =
                        Acir::Opcode::BlackBoxFuncCall{ .value =
                                                            Acir::BlackBoxFuncCall{
                                                                .value =
                                                                    Acir::BlackBoxFuncCall::EcdsaSecp256k1{
                                                                        .public_key_x = k1_public_key_x,
                                                                        .public_key_y = k1_public_key_y,
                                                                        .signature = k1_signature,
                                                                        .hashed_message = k1_hashed_message,
                                                                        .predicate = make_constant_input(bb::fr::one()),
                                                                        .output = witnesses.next_witness(),
                                                                    } } } },
        Acir::
            Opcode{ .value =
                        Acir::Opcode::BlackBoxFuncCall{ .value =
                                                            Acir::BlackBoxFuncCall{
                                                                .value =
                                                                    Acir::BlackBoxFuncCall::EcdsaSecp256r1{
                                                                        .public_key_x = r1_public_key_x,
                                                                        .public_key_y = r1_public_key_y,
                                                                        .signature = r1_signature,
                                                                        .hashed_message = r1_hashed_message,
                                                                        .predicate = make_constant_input(bb::fr::one()),
                                                                        .output = witnesses.next_witness(),
                                                                    } } } },
        Acir::
            Opcode{ .value =
                        Acir::Opcode::BlackBoxFuncCall{ .value =
                                                            Acir::BlackBoxFuncCall{
                                                                .value =
                                                                    Acir::BlackBoxFuncCall::MultiScalarMul{
                                                                        .points = witnesses.next_inputs(2),
                                                                        .scalars = witnesses.next_inputs(2),
                                                                        .predicate = make_constant_input(bb::fr::one()),
                                                                        .outputs = msm_outputs,
                                                                    } } } },
        Acir::
            Opcode{ .value =
                        Acir::Opcode::BlackBoxFuncCall{ .value =
                                                            Acir::BlackBoxFuncCall{
                                                                .value =
                                                                    Acir::BlackBoxFuncCall::EmbeddedCurveAdd{
                                                                        .input1 = ec_add_input1,
                                                                        .input2 = ec_add_input2,
                                                                        .predicate = make_constant_input(bb::fr::one()),
                                                                        .outputs = ec_add_outputs,
                                                                    } } } },
        Acir::Opcode{ .value = Acir::Opcode::
                          BlackBoxFuncCall{ .value = Acir::BlackBoxFuncCall{ .value =
                                                                                 Acir::BlackBoxFuncCall::Keccakf1600{
                                                                                     .inputs = keccak_inputs,
                                                                                     .outputs = keccak_outputs,
                                                                                 } } } },
        Acir::Opcode{ .value =
                          Acir::Opcode::BlackBoxFuncCall{
                              .value = Acir::BlackBoxFuncCall{ .value =
                                                                   Acir::BlackBoxFuncCall::RecursiveAggregation{
                                                                       .verification_key = witnesses.next_inputs(4),
                                                                       .proof = witnesses.next_inputs(8),
                                                                       .public_inputs = witnesses.next_inputs(2),
                                                                       .key_hash = witnesses.next_input(),
                                                                       .proof_type = 0,
                                                                       .predicate = make_constant_input(bb::fr::zero()),
                                                                   } } } },
        Acir::Opcode{ .value =
                          Acir::Opcode::BlackBoxFuncCall{
                              .value = Acir::BlackBoxFuncCall{ .value =
                                                                   Acir::BlackBoxFuncCall::Poseidon2Permutation{
                                                                       .inputs = witnesses.next_inputs(4),
                                                                       .outputs = witnesses.next_witnesses(4),
                                                                   } } } },
    });

    expect_no_component_errors(run_components_check(circuit));
}

TEST_F(AcirComponentsCheckTest, FixedBaseMultiScalarMulMergesCircuitComponents)
{
    WitnessFactory witnesses;
    const auto generator_x = bb::grumpkin::g1::affine_one.x;
    const auto generator_y = bb::grumpkin::g1::affine_one.y;

    Acir::Circuit circuit =
        make_circuit(
            {
                Acir::Opcode{
                    .value =
                        Acir::Opcode::BlackBoxFuncCall{ .value =
                                                            Acir::BlackBoxFuncCall{
                                                                .value =
                                                                    Acir::BlackBoxFuncCall::MultiScalarMul{
                                                                        .points = { make_constant_input(generator_x),
                                                                                    make_constant_input(generator_y) },
                                                                        .scalars = witnesses.next_inputs(2),
                                                                        .predicate = make_constant_input(bb::fr::one()),
                                                                        .outputs = witnesses.next_witness_array<2>(),
                                                                    } } } },
                Acir::Opcode{
                    .value =
                        Acir::Opcode::BlackBoxFuncCall{
                            .value =
                                Acir::BlackBoxFuncCall{
                                    .value =
                                        Acir::BlackBoxFuncCall::MultiScalarMul{
                                            .points = { make_constant_input(generator_x),
                                                        make_constant_input(generator_y) },
                                            .scalars = witnesses.next_inputs(2),
                                            .predicate = make_constant_input(bb::fr::one()),
                                            .outputs = witnesses.next_witness_array<2>(),
                                        } } } },
            });

    const std::vector<uint32_t> relevant_witnesses = { 0, 1, 2, 3, 5, 6, 7, 8 };

    EXPECT_EQ(count_acir_components_for_witnesses(circuit, relevant_witnesses), 2U);
    EXPECT_EQ(count_circuit_components_for_witnesses(circuit, relevant_witnesses), 1U);
}

TEST_F(AcirComponentsCheckTest, MemoryOpcodesPassComponentsCheck)
{
    Acir::Circuit circuit =
        make_circuit(
            {
                Acir::Opcode{ .value =
                                  Acir::Opcode::MemoryInit{
                                      .block_id = Acir::BlockId{ .value = 0 },
                                      .init = { make_witness(0), make_witness(1) },
                                      .block_type = Acir::BlockType{ .value = Acir::BlockType::Memory{} },
                                  } },
                Acir::Opcode{ .value =
                                  Acir::Opcode::MemoryOp{
                                      .block_id = Acir::BlockId{ .value = 0 },
                                      .op =
                                          Acir::MemOp{
                                              .read = false,
                                              .index = make_witness(2),
                                              .value = make_witness(3),
                                          },
                                  } },
            });

    expect_no_component_errors(run_components_check(circuit));
}

TEST_F(AcirComponentsCheckTest, BrilligCallProducesNoComponentErrors)
{
    Acir::Circuit circuit = make_circuit({
        Acir::Opcode{ .value = Acir::Opcode::BrilligCall{
                          .id = 7,
                          .inputs =
                              {
                                  Acir::BrilligInputs{
                                      .value = Acir::BrilligInputs::Single{ .value = make_witness_expression(0) } },
                                  Acir::BrilligInputs{ .value = Acir::BrilligInputs::Array{
                                                           .value = { make_witness_expression(1),
                                                                      make_witness_expression(2) } } },
                                  Acir::BrilligInputs{
                                      .value = Acir::BrilligInputs::MemoryArray{ .value = Acir::BlockId{ .value = 0 } } },
                              },
                          .outputs =
                              {
                                  Acir::BrilligOutputs{
                                      .value = Acir::BrilligOutputs::Simple{ .value = make_witness(3) } },
                                  Acir::BrilligOutputs{
                                      .value = Acir::BrilligOutputs::Array{ .value = { make_witness(4),
                                                                                        make_witness(5) } } },
                              },
                          .predicate = make_constant_expression(bb::fr::one()),
                      } },
    });

    expect_no_component_errors(run_components_check(circuit));
}

TEST_F(AcirComponentsCheckTest, CallOpcodeIsRejectedByCircuitCreation)
{
    Acir::Circuit circuit = make_circuit({
        Acir::Opcode{ .value =
                          Acir::Opcode::Call{
                              .id = 9,
                              .inputs = { make_witness(0), make_witness(1) },
                              .outputs = { make_witness(2) },
                              .predicate = make_constant_expression(bb::fr::one()),
                          } },
    });

    EXPECT_THROW_WITH_MESSAGE(run_components_check(circuit), "Call opcode is not supported");
}

TEST_F(AcirComponentsCheckTest, DetectsSplitComponents)
{
    Acir::Circuit circuit = make_circuit({
        Acir::Opcode{ .value = Acir::Opcode::AssertZero{
                          .value = Acir::Expression{
                              .linear_combinations =
                                  {
                                      { bb::fr::one().to_buffer(), make_witness(0) },
                                      { bb::fr::one().to_buffer(), make_witness(1) },
                                      { bb::fr::one().to_buffer(), make_witness(2) },
                                      { bb::fr(-3).to_buffer(), make_witness(3) },
                                  },
                              .q_c = bb::fr::zero().to_buffer(),
                          } } },
        Acir::Opcode{ .value = Acir::Opcode::AssertZero{
                          .value = Acir::Expression{
                              .linear_combinations =
                                  {
                                      { bb::fr::one().to_buffer(), make_witness(4) },
                                      { bb::fr(-1).to_buffer(), make_witness(5) },
                                  },
                              .q_c = bb::fr::zero().to_buffer(),
                          } } },
    });

    auto constraints = circuit_serde_to_acir_format(circuit, IsMegaBuilder<AcirComponentsCheckBuilder>);
    AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = create_circuit<AcirComponentsCheckBuilder>(program);
    // Corrupt the circuit
    builder.real_variable_index[2] = builder.zero_idx();

    acir_components_check::ComponentsChecker checker(circuit, builder);
    auto errors = checker.check();
    expect_single_error_type(errors, acir_components_check::Error::Type::SPLIT);
}

TEST_F(AcirComponentsCheckTest, DetectsUnconstrainedWitnesses)
{
    Acir::Circuit circuit = make_circuit({
        Acir::Opcode{ .value = Acir::Opcode::AssertZero{
                          .value = Acir::Expression{
                              .linear_combinations =
                                  {
                                      { bb::fr::one().to_buffer(), make_witness(1000) },
                                      { bb::fr(-1).to_buffer(), make_witness(1001) },
                                  },
                              .q_c = bb::fr::zero().to_buffer(),
                          } } },
    });

    auto circuit_missing_witness = make_circuit({
        Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = make_witness_expression(0) } },
    });
    auto constraints = circuit_serde_to_acir_format(circuit_missing_witness, IsMegaBuilder<AcirComponentsCheckBuilder>);
    AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = create_circuit<AcirComponentsCheckBuilder>(program);

    acir_components_check::ComponentsChecker checker(circuit, builder);
    auto errors = checker.check();
    expect_single_error_type(errors, acir_components_check::Error::Type::UNCONSTRAINED);
}

TEST_F(AcirComponentsCheckTest, TwoIndependentLinkedPairs)
{
    Acir::Expression expr0{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 0 } },
                                                     { bb::fr(-1).to_buffer(), Acir::Witness{ 1 } } },
                            .q_c = bb::fr::zero().to_buffer() };
    Acir::Expression expr1{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 2 } },
                                                     { bb::fr(-1).to_buffer(), Acir::Witness{ 3 } } },
                            .q_c = bb::fr::zero().to_buffer() };
    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr0 } },
                     Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr1 } } },
        .public_parameters = {},
        .return_values = {},
    };

    expect_no_component_errors(run_components_check(circuit));
}

TEST_F(AcirComponentsCheckTest, PublicInputStyleCircuit)
{
    // Mirrors the structure of AcirFormatTests.PublicInputs: two linked witnesses plus public metadata.
    Acir::Expression expr{ .linear_combinations = { { bb::fr::one().to_buffer(), Acir::Witness{ 3 } },
                                                    { bb::fr(-1).to_buffer(), Acir::Witness{ 2 } } },
                           .q_c = bb::fr(-2).to_buffer() };
    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::AssertZero{ .value = expr } } },
        .public_parameters =
            Acir::PublicInputs{ .value = { Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 } } },
        .return_values = Acir::PublicInputs{ .value = { Acir::Witness{ .value = 4 }, Acir::Witness{ .value = 5 } } },
    };

    expect_no_component_errors(run_components_check(circuit));
}
