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

template <uint Start, uint End, std::size_t... Ints> constexpr auto make_seq_range(std::index_sequence<Ints...>)
{
    return std::array<CopyCircuitBuilder::FF, sizeof...(Ints)>{ (Start + Ints)... };
}

template <uint Start, uint End> constexpr auto make_sequence()
{
    return make_seq_range<Start, End>(std::make_index_sequence<End - Start>{});
}

const uint32_t CIRCUIT_SIZE = 16;

class SpikeCopyTests : public ::testing::Test {

  protected:
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };

  public:
    using Builder = CopyCircuitBuilder;
    using Row = Builder::Row;
    using FF = Builder::FF;

    const std::array<FF, CIRCUIT_SIZE> id_0 = make_sequence<1, 1 + CIRCUIT_SIZE>();
    const std::array<FF, CIRCUIT_SIZE> id_1 = make_sequence<1 + CIRCUIT_SIZE, 1 + 2 * CIRCUIT_SIZE>();
    const std::array<FF, CIRCUIT_SIZE> id_2 = make_sequence<1 + 2 * CIRCUIT_SIZE, 1 + 3 * CIRCUIT_SIZE>();
    const std::array<FF, CIRCUIT_SIZE> id_3 = make_sequence<1 + 3 * CIRCUIT_SIZE, 1 + 4 * CIRCUIT_SIZE>();

    Builder circuit_builder;

    // Function to perform check circuit, create a proof and verify on the trace
    void check_and_verify(std::vector<Row> rows)
    {
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
};

TEST_F(SpikeCopyTests, simpleAllSameCopyTest)
{
    std::vector<Row> rows;

    // Fill in the id columns
    for (size_t i = 0; i < CIRCUIT_SIZE; ++i) {
        Row row{
            // Second set
            .copy_sigma_a = id_0[i],
            .copy_sigma_b = id_1[i],
            .copy_sigma_c = id_2[i],
            .copy_sigma_d = id_3[i],

            // First set
            .copy_sigma_x = id_0[i],
            .copy_sigma_y = id_1[i],
            .copy_sigma_z = id_2[i],

            // Id cols
            .id_0 = id_0[i],
            .id_1 = id_1[i],
            .id_2 = id_2[i],
            .id_3 = id_3[i],
        };
        rows.push_back(row);
    }

    // Fill in x y and z with all zeros as a naive test
    for (size_t i = 0; i < CIRCUIT_SIZE; ++i) {
        // First set
        rows[i].copy_x = 0;
        rows[i].copy_y = 0;
        rows[i].copy_z = 0;

        // Second set
        rows[i].copy_a = 0;
        rows[i].copy_b = 0;
        rows[i].copy_c = 0;
        rows[i].copy_d = 0;
    }

    // Set lagrange first and last
    rows[0].lagrange_first = 1;
    rows[CIRCUIT_SIZE - 1].lagrange_last = 1;

    check_and_verify(std::move(rows));
}

TEST_F(SpikeCopyTests, nonTrivialCopyTest)
{
    std::vector<Row> rows;

    // Fill in the id columns
    for (size_t i = 0; i < CIRCUIT_SIZE; ++i) {
        Row row{
            // Id cols
            .id_0 = id_0[i],
            .id_1 = id_1[i],
            .id_2 = id_2[i],
            .id_3 = id_3[i],
        };
        rows.push_back(row);
    }

    // We want x to be y in reverse order
    // id_0 is paired with sigma_x, id_1 is paired with sigma_y, in order to copy them into each other, we map the pairs
    for (size_t i = 0; i < CIRCUIT_SIZE; ++i) {
        Row& row = rows.at(i);
        // x wired to y in reverse
        row.copy_sigma_x = id_1[CIRCUIT_SIZE - i - 1];
        // y wired to x in reverse
        row.copy_sigma_y = id_0[CIRCUIT_SIZE - i - 1];

        row.copy_x = i;
        row.copy_y = CIRCUIT_SIZE - i - 1;
    }

    // Fill in the rest of the copies to be default
    for (size_t i = 0; i < CIRCUIT_SIZE; ++i) {
        Row& row = rows.at(i);
        // First set
        row.copy_z = 0;

        // Second set (keep defaut)
        row.copy_a = 0;
        row.copy_b = 0;
        row.copy_c = 0;
        row.copy_d = 0;

        // First set permutation (keep default)
        row.copy_sigma_z = id_2[i];

        // Second set permutation (keep default)
        row.copy_sigma_a = id_0[i];
        row.copy_sigma_b = id_1[i];
        row.copy_sigma_c = id_2[i];
        row.copy_sigma_d = id_3[i];
    }

    // Set lagrange first and last
    rows[0].lagrange_first = 1;
    rows[CIRCUIT_SIZE - 1].lagrange_last = 1;

    check_and_verify(std::move(rows));
}