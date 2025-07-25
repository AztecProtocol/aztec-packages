#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/witness_computation.hpp"

#include <gtest/gtest.h>

using namespace bb;

using Flavor = UltraFlavor;
using FF = typename Flavor::FF;

class SumcheckTestsRealCircuit : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Test the Ultra Sumcheck Prover and Verifier for a real circuit
 *
 */
TEST_F(SumcheckTestsRealCircuit, Ultra)
{
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    using Transcript = typename Flavor::Transcript;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;

    // Create a composer and a dummy circuit with a few gates
    auto builder = UltraCircuitBuilder();
    FF a = FF::one();

    // Add some basic add gates, with a public input for good measure
    uint32_t a_idx = builder.add_public_variable(a);
    FF b = FF::one();
    FF c = a + b;
    FF d = a + c;
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);
    for (size_t i = 0; i < 16; i++) {
        builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });
        builder.create_add_gate({ d_idx, c_idx, a_idx, 1, -1, -1, 0 });
    }

    // Add a big add gate with use of next row to test q_arith = 2
    FF e = a + b + c + d;
    uint32_t e_idx = builder.add_variable(e);

    uint32_t zero_idx = builder.zero_idx;
    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, -1, -1, -1, -1, 0 }, true); // use next row
    builder.create_big_add_gate({ zero_idx, zero_idx, zero_idx, e_idx, 0, 0, 0, 0, 0 }, false);

    // Add some lookup gates (related to pedersen hashing)
    auto pedersen_input_value = FF::random_element();
    const FF input_hi =
        uint256_t(pedersen_input_value)
            .slice(plookup::fixed_base::table::BITS_PER_LO_SCALAR,
                   plookup::fixed_base::table::BITS_PER_LO_SCALAR + plookup::fixed_base::table::BITS_PER_HI_SCALAR);
    const FF input_lo = uint256_t(pedersen_input_value).slice(0, bb::plookup::fixed_base::table::BITS_PER_LO_SCALAR);
    const auto input_hi_index = builder.add_variable(input_hi);
    const auto input_lo_index = builder.add_variable(input_lo);

    const auto sequence_data_hi =
        plookup::get_lookup_accumulators(bb::plookup::MultiTableId::FIXED_BASE_LEFT_HI, input_hi);
    const auto sequence_data_lo =
        plookup::get_lookup_accumulators(bb::plookup::MultiTableId::FIXED_BASE_LEFT_LO, input_lo);

    builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_HI, sequence_data_hi, input_hi_index);
    builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, sequence_data_lo, input_lo_index);

    // Add a sort gate (simply checks that consecutive inputs have a difference of < 4)
    a_idx = builder.add_variable(FF(0));
    b_idx = builder.add_variable(FF(1));
    c_idx = builder.add_variable(FF(2));
    d_idx = builder.add_variable(FF(3));
    builder.create_sort_constraint({ a_idx, b_idx, c_idx, d_idx });

    // Add an elliptic curve addition gate
    grumpkin::g1::affine_element p1 = grumpkin::g1::affine_element::random_element();
    grumpkin::g1::affine_element p2 = grumpkin::g1::affine_element::random_element();

    grumpkin::g1::affine_element p3(grumpkin::g1::element(p1) + grumpkin::g1::element(p2));

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x2 = builder.add_variable(p2.x);
    uint32_t y2 = builder.add_variable(p2.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    // Add some RAM gates
    uint32_t ram_values[8]{
        builder.add_variable(FF::random_element()), builder.add_variable(FF::random_element()),
        builder.add_variable(FF::random_element()), builder.add_variable(FF::random_element()),
        builder.add_variable(FF::random_element()), builder.add_variable(FF::random_element()),
        builder.add_variable(FF::random_element()), builder.add_variable(FF::random_element()),
    };

    size_t ram_id = builder.create_RAM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        builder.init_RAM_element(ram_id, i, ram_values[i]);
    }

    a_idx = builder.read_RAM_array(ram_id, builder.add_variable(5));
    EXPECT_EQ(a_idx != ram_values[5], true);

    b_idx = builder.read_RAM_array(ram_id, builder.add_variable(4));
    c_idx = builder.read_RAM_array(ram_id, builder.add_variable(1));

    builder.write_RAM_array(ram_id, builder.add_variable(4), builder.add_variable(500));
    d_idx = builder.read_RAM_array(ram_id, builder.add_variable(4));

    EXPECT_EQ(builder.get_variable(d_idx), 500);

    // ensure these vars get used in another arithmetic gate
    const auto e_value = builder.get_variable(a_idx) + builder.get_variable(b_idx) + builder.get_variable(c_idx) +
                         builder.get_variable(d_idx);
    e_idx = builder.add_variable(e_value);

    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, -1, -1, -1, -1, 0 }, true);
    builder.create_big_add_gate(
        {
            builder.zero_idx,
            builder.zero_idx,
            builder.zero_idx,
            e_idx,
            0,
            0,
            0,
            0,
            0,
        },
        false);

    stdlib::recursion::PairingPoints<UltraCircuitBuilder>::add_default_to_public_inputs(builder);
    // Create a prover (it will compute proving key and witness)
    auto decider_pk = std::make_shared<DeciderProvingKey_<Flavor>>(builder);

    WitnessComputation<Flavor>::complete_proving_key_for_test(decider_pk);

    auto prover_transcript = Transcript::prover_init_empty();
    auto circuit_size = decider_pk->dyadic_size();
    auto log_circuit_size = numeric::get_msb(circuit_size);

    SubrelationSeparators prover_alphas;
    for (size_t idx = 0; idx < prover_alphas.size(); idx++) {
        prover_alphas[idx] = prover_transcript->template get_challenge<FF>("Sumcheck:alpha_" + std::to_string(idx));
    }

    std::vector<FF> prover_gate_challenges(log_circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        prover_gate_challenges[idx] =
            prover_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    decider_pk->gate_challenges = prover_gate_challenges;

    SumcheckProver<Flavor> sumcheck_prover(circuit_size,
                                           decider_pk->polynomials,
                                           prover_transcript,
                                           prover_alphas,
                                           prover_gate_challenges,
                                           decider_pk->relation_parameters);

    auto prover_output = sumcheck_prover.prove();

    auto verifier_transcript = Transcript::verifier_init_empty(prover_transcript);

    SubrelationSeparators verifier_alphas;
    for (size_t idx = 0; idx < verifier_alphas.size(); idx++) {
        verifier_alphas[idx] = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha_" + std::to_string(idx));
    }
    SumcheckVerifier<Flavor> sumcheck_verifier(verifier_transcript, verifier_alphas);

    std::vector<FF> verifier_gate_challenges(log_circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        verifier_gate_challenges[idx] =
            verifier_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    std::array<FF, CONST_PROOF_SIZE_LOG_N> padding_indicator_array;
    for (size_t idx = 0; idx < padding_indicator_array.size(); idx++) {
        padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
    }
    auto verifier_output =
        sumcheck_verifier.verify(decider_pk->relation_parameters, verifier_gate_challenges, padding_indicator_array);

    auto verified = verifier_output.verified;

    ASSERT_TRUE(verified);
}
