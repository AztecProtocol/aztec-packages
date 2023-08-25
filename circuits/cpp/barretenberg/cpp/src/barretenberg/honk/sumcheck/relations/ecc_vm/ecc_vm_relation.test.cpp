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

namespace proof_system::honk_relation_tests_ecc_vm_full {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

template <typename Flavor> class ECCVMSumcheckTests : public ::testing::Test {};

using FlavorTypes = ::testing::Types<proof_system::honk::flavor::ECCVM, proof_system::honk::flavor::ECCVMGrumpkin>;
TYPED_TEST_SUITE(ECCVMSumcheckTests, FlavorTypes);

template <typename Flavor> ECCVMCircuitBuilder<Flavor> generate_trace(numeric::random::Engine* engine = nullptr)
{
    using G1 = typename Flavor::CycleGroup;
    using Fr = typename G1::Fr;
    auto generators = G1::template derive_generators<3>();

    ECCVMCircuitBuilder<Flavor> result;

    typename G1::element a = generators[0];
    typename G1::element b = generators[1];
    typename G1::element c = generators[2];
    Fr x = Fr::random_element(engine);
    Fr y = Fr::random_element(engine);

    typename G1::element expected_1 = (a * x) + a + a + (b * y) + (b * x) + (b * x);
    typename G1::element expected_2 = (a * x) + c + (b * x);

    result.add_accumulate(a);
    result.mul_accumulate(a, x);
    result.mul_accumulate(b, x);
    result.mul_accumulate(b, y);
    result.add_accumulate(a);
    result.mul_accumulate(b, x);
    result.eq(expected_1);
    result.add_accumulate(c);
    result.mul_accumulate(a, x);
    result.mul_accumulate(b, x);
    result.eq(expected_2);
    result.mul_accumulate(a, x);
    result.mul_accumulate(b, x);
    result.mul_accumulate(c, x);

    return result;
}

TYPED_TEST(ECCVMSumcheckTests, ECCVMLookupRelationAlgebra)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    const auto run_test = []() {
        auto lookup_relation = ECCVMLookupRelation<FF>();

        FF scaling_factor = FF::random_element();
        const FF gamma = FF::random_element(&engine);
        const FF eta = FF::random_element(&engine);
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto eccvm_set_permutation_delta =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        eccvm_set_permutation_delta = eccvm_set_permutation_delta.invert();
        honk::sumcheck::RelationParameters<FF> relation_params{
            .eta = eta,
            .beta = 1,
            .gamma = gamma,
            .public_input_delta = 1,
            .lookup_grand_product_delta = 1,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .eccvm_set_permutation_delta = eccvm_set_permutation_delta,
        };

        auto circuit_constructor = generate_trace<Flavor>(&engine);
        auto rows = circuit_constructor.compute_full_polynomials();
        const size_t num_rows = rows[0].size();
        honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
            rows, relation_params, num_rows);
        honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
            num_rows, rows, relation_params);
        rows.z_perm_shift = typename Flavor::Polynomial(rows.z_perm.shifted());

        // auto transcript_trace = transcript_trace.export_rows();

        typename ECCVMLookupRelation<FF>::RelationValues result;
        for (auto& r : result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            typename Flavor::RowPolynomials row;
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

TYPED_TEST(ECCVMSumcheckTests, ECCVMFullRelationAlgebra)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    const auto run_test = []() {
        auto lookup_relation = ECCVMLookupRelation<FF>();

        FF scaling_factor = FF::random_element();
        const FF gamma = FF::random_element(&engine);
        const FF eta = FF::random_element(&engine);
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto eccvm_set_permutation_delta =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        eccvm_set_permutation_delta = eccvm_set_permutation_delta.invert();
        honk::sumcheck::RelationParameters<FF> relation_params{
            .eta = eta,
            .beta = 1,
            .gamma = gamma,
            .public_input_delta = 1,
            .lookup_grand_product_delta = 1,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .eccvm_set_permutation_delta = eccvm_set_permutation_delta,
        };
        auto circuit_constructor = generate_trace<Flavor>(&engine);
        auto rows = circuit_constructor.compute_full_polynomials();
        const size_t num_rows = rows[0].size();
        honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
            rows, relation_params, num_rows);
        honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
            num_rows, rows, relation_params);
        rows.z_perm_shift = typename Flavor::Polynomial(rows.z_perm.shifted());

        typename ECCVMLookupRelation<FF>::RelationValues lookup_result;
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
                typename Flavor::RowPolynomials row;
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
            typename Flavor::RowPolynomials row;
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

TYPED_TEST(ECCVMSumcheckTests, ECCVMFullRelationProver)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;

    const auto run_test = []() {
        const FF gamma = FF::random_element(&engine);
        const FF eta = FF::random_element(&engine);
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto eccvm_set_permutation_delta =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        eccvm_set_permutation_delta = eccvm_set_permutation_delta.invert();
        honk::sumcheck::RelationParameters<FF> relation_params{
            .eta = eta,
            .beta = 1,
            .gamma = gamma,
            .public_input_delta = 1,
            .lookup_grand_product_delta = 1,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .eccvm_set_permutation_delta = eccvm_set_permutation_delta,
        };

        auto circuit_constructor = generate_trace<Flavor>(&engine);
        auto full_polynomials = circuit_constructor.compute_full_polynomials();
        const size_t num_rows = full_polynomials[0].size();
        honk::lookup_library::compute_logderivative_inverse<Flavor, ECCVMLookupRelation<FF>>(
            full_polynomials, relation_params, num_rows);

        honk::permutation_library::compute_permutation_grand_product<Flavor, ECCVMSetRelation<FF>>(
            num_rows, full_polynomials, relation_params);
        full_polynomials.z_perm_shift = typename Flavor::Polynomial(full_polynomials.z_perm.shifted());

        const size_t multivariate_n = full_polynomials[0].size();
        const auto multivariate_d = static_cast<size_t>(numeric::get_msb64(multivariate_n));

        EXPECT_EQ(1ULL << multivariate_d, multivariate_n);

        auto prover_transcript = honk::ProverTranscript<FF>::init_empty();

        auto sumcheck_prover = SumcheckProver<Flavor>(multivariate_n, prover_transcript);

        auto prover_output = sumcheck_prover.prove(full_polynomials, relation_params);

        auto verifier_transcript = honk::VerifierTranscript<FF>::init_empty(prover_transcript);

        auto sumcheck_verifier = SumcheckVerifier<Flavor>(multivariate_n);

        std::optional verifier_output = sumcheck_verifier.verify(relation_params, verifier_transcript);

        ASSERT_TRUE(verifier_output.has_value());
        ASSERT_EQ(prover_output, *verifier_output);
    };
    run_test();
}

} // namespace proof_system::honk_relation_tests_ecc_vm_full
