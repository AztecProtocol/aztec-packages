#include "acir_format.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <filesystem>
#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;

namespace {

// Resolve the noir-protocol-circuits `target` directory relative to this source file.
// Layout: <repo>/barretenberg/cpp/src/barretenberg/dsl/acir_format/<this file>
//         <repo>/noir-projects/noir-protocol-circuits/target/*.json
std::filesystem::path protocol_circuits_target_dir()
{
    std::filesystem::path here = std::filesystem::path(__FILE__).parent_path();
    return here / ".." / ".." / ".." / ".." / ".." / ".." / "noir-projects" / "noir-protocol-circuits" / "target";
}

size_t measure_chonk_circuit_size(const std::filesystem::path& artifact_json)
{
    auto bytecode = get_bytecode_from_json(artifact_json.string());
    AcirFormat constraints = circuit_buf_to_acir_format(std::move(bytecode));
    AcirProgram program{ constraints, /*witness=*/{} };

    auto ivc = create_mock_chonk_from_constraints(constraints.hn_recursion_constraints);
    ProgramMetadata metadata{ .ivc = ivc };

    auto builder = create_circuit<MegaCircuitBuilder>(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);
    return builder.num_gates();
}

} // namespace

class HidingKernelProtocolCircuitsGateCount : public ::testing::Test {
  protected:
    void SetUp() override { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Pin the gate count of the compiled `hiding_kernel_to_rollup` protocol circuit. The circuit
// recursively verifies an HN_FINAL proof from `private_kernel_tail` and validates its VK in the VK
// tree; changes to either the recursion lowering or the Noir circuit body will shift this count.
TEST_F(HidingKernelProtocolCircuitsGateCount, HidingKernelToRollup)
{
    const auto path = protocol_circuits_target_dir() / "hiding_kernel_to_rollup.json";
    if (!std::filesystem::exists(path)) {
        GTEST_SKIP() << "noir-protocol-circuits not built; missing " << path;
    }
    EXPECT_EQ(measure_chonk_circuit_size(path), HIDING_KERNEL_TO_ROLLUP_GATE_COUNT);
}

// Pin the gate count of the compiled `hiding_kernel_to_public` protocol circuit. Same structure as
// `hiding_kernel_to_rollup` but feeds a PrivateToPublicKernelCircuitPublicInputs struct, which has
// more public inputs and therefore more gates.
TEST_F(HidingKernelProtocolCircuitsGateCount, HidingKernelToPublic)
{
    const auto path = protocol_circuits_target_dir() / "hiding_kernel_to_public.json";
    if (!std::filesystem::exists(path)) {
        GTEST_SKIP() << "noir-protocol-circuits not built; missing " << path;
    }
    EXPECT_EQ(measure_chonk_circuit_size(path), HIDING_KERNEL_TO_PUBLIC_GATE_COUNT);
}
