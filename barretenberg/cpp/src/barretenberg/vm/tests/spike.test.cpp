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

TEST_F(SpikeCopyTests, simpleAllSameCopyTest)
{

    // TODO: some generic way to populate all of the id columns?
    using Builder = CopyCircuitBuilder;
    using Row = Builder::Row;
    Builder circuit_builder;

    const size_t circuit_size = 16;
    std::vector<Row> rows;

    // Fill in the id columns
    for (size_t i = 0; i < circuit_size; ++i) {
        Row row{
            // Second set
            .copy_sigma_a = i,
            .copy_sigma_b = circuit_size + i,
            .copy_sigma_c = 2 * circuit_size + i,
            .copy_sigma_d = 3 * circuit_size + i,

            // First set
            .copy_sigma_x = i,
            .copy_sigma_y = circuit_size + i,
            .copy_sigma_z = 2 * circuit_size + i,

            // Id cols
            .id_0 = i,
            .id_1 = circuit_size + i,
            // .id_2 = 2 * circuit_size + i,
            // .id_3 = 3 * circuit_size + i,
        };
        rows.push_back(row);
    }

    // Set lagrange first and last
    rows[0].copy_lagrange_first = 1;
    rows[circuit_size - 1].copy_lagrange_last = 1;

    // Fill in x y and z with all zeros as a naive test
    for (size_t i = 0; i < circuit_size; ++i) {
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

    circuit_builder.set_trace(std::move(rows));

    // Run circuit checker
    bool c_sat = circuit_builder.check_circuit();
    ASSERT_TRUE(c_sat);

    // auto composer = CopyComposer();
    // auto prover = composer.create_prover(circuit_builder);
    // HonkProof proof = prover.construct_proof();

    // auto verifier = composer.create_verifier(circuit_builder);
    // auto verified = verifier.verify_proof(proof);

    // ASSERT_TRUE(verified);
}

template <int Start, int End, std::size_t... Ints> constexpr auto make_seq_range(std::index_sequence<Ints...>)
{
    return std::array<CopyCircuitBuilder::FF, sizeof...(Ints)>{ (Start + Ints)... };
}

template <int Start, int End> constexpr auto make_sequence()
{
    return make_seq_range<Start, End>(std::make_index_sequence<End - Start>{});
}

TEST_F(SpikeCopyTests, nonTrivialCopyTest)
{
    using Builder = CopyCircuitBuilder;
    using Row = Builder::Row;
    using FF = Builder::FF;
    Builder circuit_builder;

    constexpr size_t circuit_size = 16;
    std::vector<Row> rows;

    // Make disjoint sets for each range
    const std::array<FF, circuit_size> id_0 = make_sequence<1, 1 + circuit_size>();
    const std::array<FF, circuit_size> id_1 = make_sequence<1 + circuit_size, 1 + 2 * circuit_size>();
    const std::array<FF, circuit_size> id_2 = make_sequence<1 + 2 * circuit_size, 1 + 3 * circuit_size>();
    const std::array<FF, circuit_size> id_3 = make_sequence<1 + 3 * circuit_size, 1 + 4 * circuit_size>();

    // Fill in the id columns
    for (size_t i = 0; i < circuit_size; ++i) {
        Row row{
            // Id cols
            .id_0 = id_0[i],
            .id_1 = id_1[i],
            // .id_2 = id_2[i],
            // .id_3 = id_3[i],
        };
        rows.push_back(row);
    }

    // We want x to be y in reverse order
    // id_0 is paired with sigma_x, id_1 is paired with sigma_y, in order to copy them into each other, we map the pairs
    // for (size_t i = 0; i < circuit_size; ++i){
    //     Row& row = rows.at(i);
    //     row.copy_sigma_x = id_1[circuit_size - i - 1];
    //     row.copy_sigma_y = id_0[circuit_size - i - 1];

    //     row.copy_x = i;
    //     row.copy_y = circuit_size - i - 1;
    //     // row.copy_y = i;

    //     info("x       ", row.copy_x, " | y       ", row.copy_y);
    //     info("sigma x ", row.copy_sigma_x, " | sigma y ", row.copy_sigma_y);
    //     info("id 0    ", row.id_0, " | id 1    ", row.id_1);
    //     info("\n");
    // }

    // Fill in the rest of the copies to be default
    for (size_t i = 0; i < circuit_size; ++i) {
        Row& row = rows.at(i);

        // // temp
        row.copy_x = 1;
        row.copy_y = 1;
        row.copy_sigma_x = id_0[i];
        row.copy_sigma_y = id_1[i];
        // // end tmpe

        row.copy_sigma_z = id_2[i];

        row.copy_sigma_a = id_0[i];
        row.copy_sigma_b = id_1[i];
        row.copy_sigma_c = id_2[i];
        row.copy_sigma_d = id_3[i];

        /// Fill in z
        row.copy_z = 1;

        // Fill in zeros for a,b,c,d
        row.copy_a = 1;
        row.copy_b = 1;
        row.copy_c = 1;
        row.copy_d = 0;
    }

    // Set lagrange first and last
    rows[0].copy_lagrange_first = 1;
    rows[circuit_size - 1].copy_lagrange_last = 1;

    // rows.at(0).copy_x = 10;
    // rows.at(1).copy_y = 10;

    // rows.at(0).copy_sigma_x = id_1[1];
    // rows.at(1).copy_sigma_y = id_0[0];

    // Note uncommenting these makes it pass - it should work without these commented out
    // rows.at(1).copy_sigma_x = id_1[0];
    // rows.at(0).copy_sigma_y = id_0[1];

    circuit_builder.set_trace(std::move(rows));

    // Run circuit checker
    bool c_sat = circuit_builder.check_circuit();
    ASSERT_TRUE(c_sat);

    // auto composer = CopyComposer();
    // auto prover = composer.create_prover(circuit_builder);
    // HonkProof proof = prover.construct_proof();

    // auto verifier = composer.create_verifier(circuit_builder);
    // auto verified = verifier.verify_proof(proof);

    // ASSERT_TRUE(verified);
}