/**
 * @file components_check.test.cpp
 * @brief Regression tests: small hand-built `Acir::Circuit` values through serde, `create_circuit`,
 *        and `ComponentsChecker` (same path as the `acir_components_check` binary minus file I/O).
 */
#include "components_check.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>
#include <string>

using namespace acir_format;

namespace {

std::vector<acir_components_check::Error> run_components_check(const Acir::Circuit& circuit)
{
    auto constraints = circuit_serde_to_acir_format(circuit);
    AcirProgram program{ .constraints = constraints, .witness = {} };
    auto builder = create_circuit<bb::UltraCircuitBuilder>(program);
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
