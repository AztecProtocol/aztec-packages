#include "barretenberg/honk/composer/eccvm_composer.hpp"
#include "barretenberg/honk/flavor/ecc_vm.hpp"
#include "barretenberg/honk/proof_system/lookup_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/honk/proof_system/prover_library.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include <gtest/gtest.h>

/**
 * We want to test if all three relations (namely, ArithmeticRelation, GrandProductComputationRelation,
 * GrandProductInitializationRelation) provide correct contributions by manually computing their
 * contributions with deterministic and random inputs. The relations are supposed to work with
 * univariates (edges) of degree one (length 2) and spit out polynomials of corresponding degrees. We have
 * MAX_RELATION_LENGTH = 5, meaning the output of a relation can atmost be a degree 5 polynomial. Hence,
 * we use a method compute_mock_extended_edges() which starts with degree one input polynomial (two evaluation
 points),
 * extends them (using barycentric formula) to six evaluation points, and stores them to an array of polynomials.
 */

using namespace proof_system::honk::sumcheck;
using Flavor = proof_system::honk::flavor::ECCVM;
using FF = typename Flavor::FF;
using ProverPolynomials = typename Flavor::ProverPolynomials;
using RawPolynomials = typename Flavor::RawPolynomials;

static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

namespace proof_system::honk_relation_tests_ecc_vm_full {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

ECCVMCircuitConstructor<Flavor> generate_trace(numeric::random::Engine* engine = nullptr)
{
    static bool init = false;
    static grumpkin::g1::element a;
    static grumpkin::g1::element b;
    static grumpkin::g1::element c;
    static grumpkin::fr x;
    static grumpkin::fr y;

    ECCVMCircuitConstructor<Flavor> result;
    if (!init) {
        a = grumpkin::get_generator(0);
        b = grumpkin::get_generator(1);
        c = grumpkin::get_generator(2);
        x = grumpkin::fr::random_element(engine);
        y = grumpkin::fr::random_element(engine);
        init = true;
    }

    result.mul_accumulate(a, x);

    return result;
}

TEST(SumcheckRelation, ECCVMLookupRelationAlgebra)
{
    const auto run_test = []() {
        auto lookup_relation = ECCVMLookupRelation<barretenberg::fr>();

        barretenberg::fr scaling_factor = barretenberg::fr::random_element();
        const FF gamma = FF::random_element(&engine);
        const FF eta = FF::random_element(&engine);
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto permutation_offset =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        permutation_offset = permutation_offset.invert();
        honk::sumcheck::RelationParameters<barretenberg::fr> relation_params{
            .eta = eta,
            .beta = 1,
            .gamma = gamma,
            .public_input_delta = 1,
            .lookup_grand_product_delta = 1,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .permutation_offset = permutation_offset,
        };

        auto circuit_constructor = generate_trace(&engine);
        auto rows = circuit_constructor.compute_full_polynomials();
        const size_t num_rows = rows[0].size();
        honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
            rows, relation_params, num_rows);
        honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
            num_rows, rows, relation_params);
        rows.z_perm_shift = Flavor::Polynomial(rows.z_perm.shifted());

        // auto transcript_trace = transcript_trace.export_rows();

        ECCVMLookupRelation<FF>::RelationValues result;
        for (auto& r : result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            Flavor::RowPolynomials row;
            for (size_t j = 0; j < NUM_POLYNOMIALS; ++j) {
                row[j] = rows[j][i];
            }
            lookup_relation.add_full_relation_value_contribution(result, row, relation_params, scaling_factor);
        }

        for (auto r : result) {
            EXPECT_EQ(r, 0);
        }
    };
    run_test();
}

TEST(SumcheckRelation, ECCVMFullRelationAlgebra)
{
    const auto run_test = []() {
        // auto transcript_relation = ECCVMTranscriptRelation<barretenberg::fr>();
        // auto point_relation = ECCVMPointTableRelation<barretenberg::fr>();
        // auto wnaf_relation = ECCVMWnafRelation<barretenberg::fr>();
        // auto msm_relation = ECCVMMSMRelation<barretenberg::fr>();
        // auto set_relation = ECCVMSetRelation<barretenberg::fr>();
        auto lookup_relation = ECCVMLookupRelation<barretenberg::fr>();

        barretenberg::fr scaling_factor = barretenberg::fr::random_element();
        const FF gamma = FF::random_element(&engine);
        const FF eta = FF::random_element(&engine);
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto permutation_offset =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        permutation_offset = permutation_offset.invert();
        honk::sumcheck::RelationParameters<barretenberg::fr> relation_params{
            .eta = eta,
            .beta = 1,
            .gamma = gamma,
            .public_input_delta = 1,
            .lookup_grand_product_delta = 1,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .permutation_offset = permutation_offset,
        };
        auto circuit_constructor = generate_trace(&engine);
        auto rows = circuit_constructor.compute_full_polynomials();
        const size_t num_rows = rows[0].size();
        honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
            rows, relation_params, num_rows);
        honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
            num_rows, rows, relation_params);
        rows.z_perm_shift = Flavor::Polynomial(rows.z_perm.shifted());

        // compute_permutation_polynomials(rows, relation_params);
        // compute_lookup_inverse_polynomial(rows, relation_params);

        // auto transcript_trace = transcript_trace.export_rows();

        ECCVMLookupRelation<FF>::RelationValues lookup_result;
        for (auto& r : lookup_result) {
            r = 0;
        }

        const auto evaluate_relation = [&]<typename Relation>(const std::string& relation_name) {
            auto relation = Relation();
            typename Relation::RelationValues result;
            for (auto& r : result) {
                r = 0;
            }
            constexpr size_t NUM_SUBRELATIONS = result.size();
            std::array<bool, NUM_SUBRELATIONS> relation_fail{};
            std::array<size_t, NUM_SUBRELATIONS> relation_fails_at_row{};

            for (size_t i = 0; i < num_rows; ++i) {
                Flavor::RowPolynomials row;
                for (size_t j = 0; j < NUM_POLYNOMIALS; ++j) {
                    row[j] = rows[j][i];
                }
                relation.add_full_relation_value_contribution(result, row, relation_params, scaling_factor);

                for (size_t j = 0; j < NUM_SUBRELATIONS; ++j) {
                    if (result[j] != 0) {
                        if (!relation_fail[j]) {
                            relation_fail[j] = true;
                            relation_fails_at_row[j] = i;
                        }
                    }
                }
            }

            for (size_t j = 0; j < NUM_SUBRELATIONS; ++j) {
                EXPECT_EQ(relation_fail[j], false);
                if (relation_fail[j]) {
                    std::cerr << "relation " << relation_name << ", subrelation " << j
                              << " fails. First failure at row " << relation_fails_at_row[j] << std::endl;
                }
            }
        };

        evaluate_relation.template operator()<ECCVMTranscriptRelation<FF>>("ECCVMTranscriptRelation");
        evaluate_relation.template operator()<ECCVMPointTableRelation<FF>>("ECCVMPointTableRelation");
        evaluate_relation.template operator()<ECCVMWnafRelation<FF>>("ECCVMWnafRelation");
        evaluate_relation.template operator()<ECCVMMSMRelation<FF>>("ECCVMMSMRelation");
        evaluate_relation.template operator()<ECCVMSetRelation<FF>>("ECCVMSetRelation");

        for (size_t i = 0; i < num_rows; ++i) {
            Flavor::RowPolynomials row;
            for (size_t j = 0; j < NUM_POLYNOMIALS; ++j) {
                row[j] = rows[j][i];
            }
            {
                lookup_relation.add_full_relation_value_contribution(
                    lookup_result, row, relation_params, scaling_factor);
            }
        }
        for (auto r : lookup_result) {
            EXPECT_EQ(r, 0);
        }
    };
    run_test();
}

TEST(SumcheckRelation, ECCVMFullRelationProver)
{
    const auto run_test = []() {
        const FF gamma = FF::random_element(&engine);
        const FF eta = FF::random_element(&engine);
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto permutation_offset =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        permutation_offset = permutation_offset.invert();
        honk::sumcheck::RelationParameters<barretenberg::fr> relation_params{
            .eta = eta,
            .beta = 1,
            .gamma = gamma,
            .public_input_delta = 1,
            .lookup_grand_product_delta = 1,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .permutation_offset = permutation_offset,
        };

        auto circuit_constructor = generate_trace(&engine);
        auto full_polynomials = circuit_constructor.compute_full_polynomials();
        const size_t num_rows = full_polynomials[0].size();
        honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
            full_polynomials, relation_params, num_rows);

        honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
            num_rows, full_polynomials, relation_params);
        full_polynomials.z_perm_shift = Flavor::Polynomial(full_polynomials.z_perm.shifted());

        // size_t pidx = 0;
        // for (auto& p : full_polynomials) {
        //     size_t count = 0;
        //     for (auto& x : p) {
        //         std::cout << "poly[" << pidx << "][" << count << "] = " << x << std::endl;
        //         count++;
        //     }
        //     pidx++;
        // }
        // auto foo = full_polynomials.get_to_be_shifted();
        // size_t c = 0;
        // for (auto& x : foo) {
        //     if (x[0] != 0) {
        //         std::cout << "shift at " << c << "not zero :/" << std::endl;
        //     }
        //     c += 1;
        // }
        const size_t multivariate_n = full_polynomials[0].size();
        const size_t multivariate_d = static_cast<size_t>(numeric::get_msb64(multivariate_n));

        EXPECT_EQ(1ULL << multivariate_d, multivariate_n);

        auto prover_transcript = honk::ProverTranscript<FF>::init_empty();

        auto sumcheck_prover = Sumcheck<Flavor, honk::ProverTranscript<FF>>(multivariate_n, prover_transcript);

        auto prover_output = sumcheck_prover.execute_prover(full_polynomials, relation_params);

        auto verifier_transcript = honk::VerifierTranscript<FF>::init_empty(prover_transcript);

        auto sumcheck_verifier = Sumcheck<Flavor, honk::VerifierTranscript<FF>>(multivariate_n, verifier_transcript);

        std::optional verifier_output = sumcheck_verifier.execute_verifier(relation_params);

        ASSERT_TRUE(verifier_output.has_value());
        ASSERT_EQ(prover_output, *verifier_output);
    };
    run_test();
}

class ECCVMComposerTestsB : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }
};
TEST_F(ECCVMComposerTestsB, BaseCase)
{
    auto circuit_constructor = generate_trace(&engine);
    // auto composer = honk::ECCVMComposerHelper();
    // auto prover = composer.create_prover(circuit_constructor);

    // prover.construct_proof();
    // auto eta = prover.relation_parameters.eta;
    // auto beta = prover.relation_parameters.beta;
    // auto gamma = prover.relation_parameters.gamma;
    // ECCVMBuilder trace2 = generate_trace(&engine);

    auto eta = FF::random_element(&engine);   // prover.relation_parameters.eta;
    auto beta = FF::random_element(&engine);  // prover.relation_parameters.beta;
    auto gamma = FF::random_element(&engine); // prover.relation_parameters.gamma;
    const FF eta_sqr = eta.sqr();
    const FF eta_cube = eta_sqr * eta;
    auto permutation_offset =
        gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
    permutation_offset = permutation_offset.invert();

    honk::sumcheck::RelationParameters<barretenberg::fr> relation_params{
        .eta = eta,
        .beta = beta,
        .gamma = gamma,
        .public_input_delta = 0,
        .lookup_grand_product_delta = 0,
        .eta_sqr = eta_sqr,
        .eta_cube = eta_cube,
        .permutation_offset = permutation_offset,
    };
    // std::cout << "gamma eta = " << gamma << " , " << eta << std::endl;

    // RawPolynomials full_polynomials = trace2.compute_full_polynomials();

    // auto& full_polynomials = prover.prover_polynomials;
    auto full_polynomials = circuit_constructor.compute_full_polynomials();
    // compute_logderivative_inverse(prover.proving_key, full_polynomials)
    const size_t multivariate_n = full_polynomials[0].size();
    const size_t multivariate_d = static_cast<size_t>(numeric::get_msb64(multivariate_n));

    EXPECT_EQ(1ULL << multivariate_d, multivariate_n);

    honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
        full_polynomials, relation_params, multivariate_n);

    honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
        multivariate_n, full_polynomials, relation_params);
    full_polynomials.z_perm_shift = Flavor::Polynomial(full_polynomials.z_perm.shifted());

    auto prover_transcript = honk::ProverTranscript<FF>::init_empty();

    auto sumcheck_prover = Sumcheck<Flavor, honk::ProverTranscript<FF>>(multivariate_n, prover_transcript);

    auto prover_output = sumcheck_prover.execute_prover(full_polynomials, relation_params);

    auto verifier_transcript = honk::VerifierTranscript<FF>::init_empty(prover_transcript);

    auto sumcheck_verifier = Sumcheck<Flavor, honk::VerifierTranscript<FF>>(multivariate_n, verifier_transcript);

    std::optional verifier_output = sumcheck_verifier.execute_verifier(relation_params);

    ASSERT_TRUE(verifier_output.has_value());
    ASSERT_EQ(prover_output, *verifier_output);
}
} // namespace proof_system::honk_relation_tests_ecc_vm_full
