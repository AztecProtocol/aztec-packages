#include "eccvm_trace_checker.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"

using namespace bb;

using Flavor = ECCVMFlavor;
using Builder = typename ECCVMFlavor::CircuitBuilder;
using FF = typename ECCVMFlavor::FF;
using ProverPolynomials = typename ECCVMFlavor::ProverPolynomials;

bool ECCVMTraceChecker::check(Builder& builder,
                              numeric::RNG* engine_ptr
#ifdef FUZZING
                              ,
                              bool disable_fixed_dyadic_trace_size
#endif
)
{
    const FF gamma = FF::random_element(engine_ptr);
    const FF beta = FF::random_element(engine_ptr);
    const FF beta_sqr = beta.sqr();
    const FF beta_cube = beta_sqr * beta;
    const FF beta_quartic = beta_sqr * beta_sqr;
    auto first_term_tag = beta_quartic; // FIRST_TERM_TAG (= 1) * beta_quartic
    auto eccvm_set_permutation_delta = (gamma + first_term_tag) * (gamma + beta_sqr + first_term_tag) *
                                       (gamma + beta_sqr + beta_sqr + first_term_tag) *
                                       (gamma + beta_sqr + beta_sqr + beta_sqr + first_term_tag);
    eccvm_set_permutation_delta = eccvm_set_permutation_delta.invert();
    bb::RelationParameters<typename Flavor::FF> params{
        .eta = 0,
        .beta = beta,
        .gamma = gamma,
        .public_input_delta = 0,
        .beta_sqr = beta_sqr,
        .beta_cube = beta_cube,
        .beta_quartic = beta_quartic,
        .eccvm_set_permutation_delta = eccvm_set_permutation_delta,
    };

#ifdef FUZZING
    ProverPolynomials polynomials(builder, disable_fixed_dyadic_trace_size);
#else
    ProverPolynomials polynomials(builder);
#endif
    const size_t num_rows = polynomials.get_polynomial_size();
    const size_t unmasked_witness_size = num_rows - NUM_DISABLED_ROWS_IN_SUMCHECK;
    compute_logderivative_inverse<FF, ECCVMLookupRelation<FF>>(polynomials, params, unmasked_witness_size);

    // Compute den_wnaf_partial before the wnaf grand product (it reads this polynomial)
    {
        const auto first_term_tag_val = beta_quartic * ECCVMSetRelationConstants::FIRST_TERM_TAG;
        for (size_t i = 0; i < unmasked_witness_size; ++i) {
            const auto msm_pc_val = polynomials.msm_pc[i];
            const auto msm_count_val = polynomials.msm_count[i];
            const auto msm_round_val = polynomials.msm_round[i];

            const auto add1_val = polynomials.msm_add1[i];
            const auto slice1_val = polynomials.msm_slice1[i];
            auto wnaf_out1 = add1_val * (slice1_val + gamma + (msm_pc_val - msm_count_val) * beta +
                                          msm_round_val * beta_sqr + first_term_tag_val) +
                              (-add1_val + 1);

            const auto add2_val = polynomials.msm_add2[i];
            const auto slice2_val = polynomials.msm_slice2[i];
            auto wnaf_out2 = add2_val * (slice2_val + gamma + (msm_pc_val - msm_count_val - 1) * beta +
                                          msm_round_val * beta_sqr + first_term_tag_val) +
                              (-add2_val + 1);

            polynomials.den_wnaf_partial.at(i) = wnaf_out1 * wnaf_out2;
        }
    }

    compute_grand_product<Flavor, ECCVMSetWnafRelation<FF>>(polynomials, params, unmasked_witness_size);
    compute_grand_product<Flavor, ECCVMSetScalarRelation<FF>>(polynomials, params, unmasked_witness_size);
    compute_grand_product<Flavor, ECCVMSetMsmRelation<FF>>(polynomials, params, unmasked_witness_size);

    polynomials.z_perm_shift = Polynomial(polynomials.z_perm.shifted());
    polynomials.z_perm_scalar_shift = Polynomial(polynomials.z_perm_scalar.shifted());
    polynomials.z_perm_msm_shift = Polynomial(polynomials.z_perm_msm.shifted());

    const auto evaluate_relation = [&]<typename Relation>(const std::string& relation_name) {
        typename Relation::SumcheckArrayOfValuesOverSubrelations result;
        for (auto& r : result) {
            r = 0;
        }
        constexpr size_t NUM_SUBRELATIONS = result.size();

        for (size_t i = 0; i < num_rows; ++i) {
            auto row = polynomials.get_row(i);
#ifdef FUZZING
            // Check if the relation is skippable and should be skipped (only in fuzzing builds)
            if constexpr (isSkippable<Relation, decltype(row)>) {
                // Only accumulate if the relation should not be skipped
                if (!Relation::skip(row)) {
                    Relation::accumulate(result, row, params, 1);
                }
            } else {
                // If not skippable, always accumulate
                Relation::accumulate(result, row, params, 1);
            }
#else
            // In non-fuzzing builds, always accumulate for maximum security
            Relation::accumulate(result, row, params, 1);
#endif

            bool x = true;
            for (size_t j = 0; j < NUM_SUBRELATIONS; ++j) {
                if (result[j] != 0) {
                    info("Relation ", relation_name, ", subrelation index ", j, " failed at row ", i);
                    x = false;
                }
            }
            if (!x) {
                return false;
            }
        }
        return true;
    };

    bool result = true;
    result = result && evaluate_relation.template operator()<ECCVMTranscriptRelation<FF>>("ECCVMTranscriptRelation");
    result = result && evaluate_relation.template operator()<ECCVMPointTableRelation<FF>>("ECCVMPointTableRelation");
    result = result && evaluate_relation.template operator()<ECCVMWnafRelation<FF>>("ECCVMWnafRelation");
    result = result && evaluate_relation.template operator()<ECCVMMSMRelation<FF>>("ECCVMMSMRelation");
    result = result && evaluate_relation.template operator()<ECCVMSetWnafRelation<FF>>("ECCVMSetWnafRelation");
    result = result && evaluate_relation.template operator()<ECCVMSetScalarRelation<FF>>("ECCVMSetScalarRelation");
    result = result && evaluate_relation.template operator()<ECCVMSetMsmRelation<FF>>("ECCVMSetMsmRelation");
    result = result && evaluate_relation.template operator()<ECCVMBoolsRelation<FF>>("ECCVMBoolsRelation");

    using LookupRelation = ECCVMLookupRelation<FF>;
    typename ECCVMLookupRelation<typename Flavor::FF>::SumcheckArrayOfValuesOverSubrelations lookup_result;
    for (auto& r : lookup_result) {
        r = 0;
    }
    for (size_t i = 0; i < num_rows; ++i) {
        LookupRelation::accumulate(lookup_result, polynomials.get_row(i), params, 1);
    }
    for (auto r : lookup_result) {
        if (r != 0) {
            info("Relation ECCVMLookupRelation failed.");
            return false;
        }
    }
    return result;
}
