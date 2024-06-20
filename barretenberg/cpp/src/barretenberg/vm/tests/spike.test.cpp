#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm/generated/copy_circuit_builder.hpp"
#include "barretenberg/vm/generated/copy_flavor.hpp"

// Proofs
#include "barretenberg/vm/generated/copy_composer.hpp"
#include "barretenberg/vm/generated/copy_prover.hpp"
#include "barretenberg/vm/generated/copy_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();
}

class SpikeCopyTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

TEST_F(SpikeCopyTests, copyTest)
{

    // Plan
    // - Fill up the copy row with everything the same

    // TODO: some generic way to populate all of the id columns?
    using Builder = CopyCircuitBuilder;
    using Row = Builder::Row;
    Builder circuit_builder;

    const size_t circuit_size = 16;
    std::vector<Row> rows;

    // Fill in the id columns
    for (size_t i = 0; i < circuit_size; ++i) {
        Row row{
            .copy_sigma_x = i,
            .copy_sigma_y = circuit_size + i,
            .copy_sigma_z = 2 * circuit_size + i,
            .id_0 = i,
            .id_1 = circuit_size + i,
            .id_2 = 2 * circuit_size + i,
        };
        rows.push_back(row);
    }

    // Fill in x y and z with all zeros as a naive test
    for (size_t i = 0; i < circuit_size; ++i) {
        rows[i].copy_x = 0;
        rows[i].copy_y = 0;
        rows[i].copy_z = 0;
    }

    circuit_builder.set_trace(std::move(rows));

    // Run circuit checker
    bool c_sat = circuit_builder.check_circuit();
    ASSERT_TRUE(c_sat);

    auto composer = CopyComposer();
    auto prover = composer.create_prover(circuit_builder);
    HonkProof proof = prover.construct_proof();

    auto verifier = composer.create_verifier(circuit_builder);
    auto verified = verifier.verify_proof(proof);

    ASSERT_TRUE(verified);
}
