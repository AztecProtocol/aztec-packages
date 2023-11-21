#include "barretenberg/vm/generated/AvmMini_composer.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/generated/AvmMini_flavor.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/proof_system/circuit_builder/generated/AvmMini_trace.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/vm/generated/AvmMini_prover.hpp"
#include "barretenberg/vm/generated/AvmMini_verifier.hpp"
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <string>
#include <vector>

using namespace proof_system::honk;

namespace example_relation_honk_composer {

class AvmMiniTests : public ::testing::Test {
  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { barretenberg::srs::init_crs_factory("../srs_db/ignition"); };
};

namespace {
auto& engine = numeric::random::get_debug_engine();
}

TEST_F(AvmMiniTests, basic)
{
    // barretenberg::srs::init_crs_factory("../srs_db/ignition");

    auto circuit_builder = proof_system::AvmMiniTraceBuilder();
    circuit_builder.build_circuit();

    auto composer = AvmMiniComposer();

    circuit_builder.check_circuit();

    auto prover = composer.create_prover(circuit_builder);
    auto proof = prover.construct_proof();

    auto verifier = composer.create_verifier(circuit_builder);
    bool verified = verifier.verify_proof(proof);
    ASSERT_EQ(verified, true);

    info("We verified a proof!");
}

} // namespace example_relation_honk_composer