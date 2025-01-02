#pragma once
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/debug_log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <typeinfo>

namespace bb {

// TODO(luke): This contains utilities for grand product computation and is not specific to the permutation grand
// product. Update comments accordingly.
/**
 * @brief Compute a permutation grand product polynomial Z_perm(X)
 *
 * @details
 * Z_perm may be defined in terms of its values  on X_i = 0,1,...,n-1 as Z_perm[0] = 1 and for i = 1:n-1
 *                  relation::numerator(j)
 * Z_perm[i] = ∏ --------------------------------------------------------------------------------
 *                  relation::denominator(j)
 *
 * where ∏ := ∏_{j=0:i-1}
 *
 * The specific algebraic relation used by Z_perm is defined by Flavor::GrandProductRelations
 *
 * For example, in Flavor::Standard the relation describes:
 *
 *                  (w_1(j) + β⋅id_1(j) + γ) ⋅ (w_2(j) + β⋅id_2(j) + γ) ⋅ (w_3(j) + β⋅id_3(j) + γ)
 * Z_perm[i] = ∏ --------------------------------------------------------------------------------
 *                  (w_1(j) + β⋅σ_1(j) + γ) ⋅ (w_2(j) + β⋅σ_2(j) + γ) ⋅ (w_3(j) + β⋅σ_3(j) + γ)
 * where ∏ := ∏_{j=0:i-1} and id_i(X) = id(X) + n*(i-1)
 *
 * For Flavor::Ultra both the UltraPermutation and Lookup grand products are computed by this method.
 *
 * The grand product is constructed over the course of three steps.
 *
 * For expositional simplicity, write Z_perm[i] as
 *
 *                A(j)
 * Z_perm[i] = ∏ --------------------------
 *                B(h)
 *
 * Step 1) Compute 2 length-n polynomials A, B
 * Step 2) Compute 2 length-n polynomials numerator = ∏ A(j), nenominator = ∏ B(j)
 * Step 3) Compute Z_perm[i + 1] = numerator[i] / denominator[i] (recall: Z_perm[0] = 1)
 *
 * Note: Step (3) utilizes Montgomery batch inversion to replace n-many inversions with
 *
 * @tparam Flavor
 * @tparam GrandProdRelation
 * @param full_polynomials
 * @param relation_parameters
 * @param size_override optional size of the domain; otherwise based on dyadic polynomial domain
 */
template <typename Flavor, typename GrandProdRelation>
void compute_grand_product_old(typename Flavor::ProverPolynomials& full_polynomials,
                               bb::RelationParameters<typename Flavor::FF>& relation_parameters,
                               size_t size_override = 0,
                               std::vector<std::pair<size_t, size_t>> active_block_ranges = {})
{
    PROFILE_THIS_NAME("compute_grand_product");

    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    using Accumulator = std::tuple_element_t<0, typename GrandProdRelation::SumcheckArrayOfValuesOverSubrelations>;

    // Set the domain over which the grand product must be computed. This may be less than the dyadic circuit size, e.g
    // the permutation grand product does not need to be computed beyond the index of the last active wire
    size_t domain_size = size_override == 0 ? full_polynomials.get_polynomial_size() : size_override;

    std::vector<size_t> active_idxs;
    if (active_block_ranges.empty()) {
        for (size_t i = 0; i < domain_size; ++i) {
            active_idxs.push_back(i);
        }
    } else {
        for (auto& range : active_block_ranges) {
            for (size_t i = range.first; i < range.second; ++i) {
                active_idxs.push_back(i);
            }
        }
    }

    // const size_t num_threads = 4;
    std::vector<std::pair<size_t, size_t>> idx_bounds;
    const size_t num_threads = calculate_num_threads(domain_size, /*min_iterations_per_thread=*/1 << 14);
    {
        info("num_threads = ", num_threads);
        // const size_t num_threads = domain_size >= get_num_cpus_pow2() ? get_num_cpus_pow2() : 1;
        const size_t block_size = domain_size / num_threads;
        const size_t final_idx = domain_size - 1;

        // Cumpute the index bounds for each thread for reuse in the computations below
        idx_bounds.reserve(num_threads);
        for (size_t thread_idx = 0; thread_idx < num_threads; ++thread_idx) {
            const size_t start = thread_idx * block_size;
            const size_t end = (thread_idx == num_threads - 1) ? final_idx : (thread_idx + 1) * block_size;
            idx_bounds.push_back(std::make_pair(start, end));
            info("idx_bounds.start = ", start);
            info("idx_bounds.end = ", end);
        }
    }

    const size_t active_num_threads = calculate_num_threads(domain_size, /*min_iterations_per_thread=*/1 << 5);
    std::vector<std::pair<size_t, size_t>> active_idx_bounds;
    {
        size_t domain_size = active_idxs.size();
        const size_t block_size = domain_size / active_num_threads;
        const size_t final_idx = domain_size - 1;

        // Cumpute the index bounds for each thread for reuse in the computations below
        active_idx_bounds.reserve(active_num_threads);
        for (size_t thread_idx = 0; thread_idx < active_num_threads; ++thread_idx) {
            const size_t start = thread_idx * block_size;
            const size_t end = (thread_idx == active_num_threads - 1) ? final_idx : (thread_idx + 1) * block_size;
            active_idx_bounds.push_back(std::make_pair(start, end));
            // info("idx_bounds.start = ", start);
            // info("idx_bounds.end = ", end);
        }
    }

    // Allocate numerator/denominator polynomials that will serve as scratch space
    // TODO(zac) we can re-use the permutation polynomial as the numerator polynomial. Reduces readability
    Polynomial numerator{ domain_size, domain_size };
    Polynomial denominator{ domain_size, domain_size };

    auto check_is_active = [&](size_t idx) {
        if (active_block_ranges.empty()) {
            return true;
        }
        return std::any_of(active_block_ranges.begin(), active_block_ranges.end(), [idx](const auto& range) {
            return idx >= range.first && idx < range.second;
        });
    };

    for (auto range : active_block_ranges) {
        info("start = ", range.first);
        info("end = ", range.second);
    }

    // Step (1)
    // Populate `numerator` and `denominator` with the algebra described by Relation
    {
        PROFILE_THIS_NAME("GP step 1");
        parallel_for(num_threads, [&](size_t thread_idx) {
            typename Flavor::AllValues row;
            const size_t start = idx_bounds[thread_idx].first;
            const size_t end = idx_bounds[thread_idx].second;
            for (size_t i = start; i < end; ++i) {
                if (check_is_active(i)) {
                    // TODO(https://github.com/AztecProtocol/barretenberg/issues/940):consider avoiding get_row if
                    // possible.
                    row = full_polynomials.get_row(i);
                    numerator.at(i) = GrandProdRelation::template compute_grand_product_numerator<Accumulator>(
                        row, relation_parameters);
                    denominator.at(i) = GrandProdRelation::template compute_grand_product_denominator<Accumulator>(
                        row, relation_parameters);
                } else {
                    numerator.at(i) = 1;
                    denominator.at(i) = 1;
                }
                info("num = ", numerator.at(i));
                info("den = ", denominator.at(i));
            }
        });
        // parallel_for(active_num_threads, [&](size_t thread_idx) {
        //     typename Flavor::AllValues row;
        //     const size_t start = active_idx_bounds[thread_idx].first;
        //     const size_t end = active_idx_bounds[thread_idx].second;
        //     for (size_t i = start; i < end; ++i) {
        //         // TODO(https://github.com/AztecProtocol/barretenberg/issues/940):consider avoiding get_row if
        //         // possible.
        //         size_t idx = active_idxs[i];
        //         row = full_polynomials.get_row(idx); // WORKTODO: implement get_row_for_permuation_argument?
        //         numerator.at(idx) =
        //             GrandProdRelation::template compute_grand_product_numerator<Accumulator>(row,
        //             relation_parameters);
        //         denominator.at(idx) = GrandProdRelation::template compute_grand_product_denominator<Accumulator>(
        //             row, relation_parameters);
        //         info("num = ", numerator.at(idx));
        //         info("den = ", denominator.at(idx));
        //     }
        // });
    }

    DEBUG_LOG_ALL(numerator.coeffs());
    DEBUG_LOG_ALL(denominator.coeffs());

    // Step (2)
    // Compute the accumulating product of the numerator and denominator terms.
    // This step is split into three parts for efficient multithreading:
    // (i) compute ∏ A(j), ∏ B(j) subproducts for each thread
    // (ii) compute scaling factor required to convert each subproduct into a single running product
    // (ii) combine subproducts into a single running product
    //
    // For example, consider 4 threads and a size-8 numerator { a0, a1, a2, a3, a4, a5, a6, a7 }
    // (i)   Each thread computes 1 element of N = {{ a0, a0a1 }, { a2, a2a3 }, { a4, a4a5 }, { a6, a6a7 }}
    // (ii)  Take partial products P = { 1, a0a1, a2a3, a4a5 }
    // (iii) Each thread j computes N[i][j]*P[j]=
    //      {{a0,a0a1},{a0a1a2,a0a1a2a3},{a0a1a2a3a4,a0a1a2a3a4a5},{a0a1a2a3a4a5a6,a0a1a2a3a4a5a6a7}}
    std::vector<FF> partial_numerators(num_threads);
    std::vector<FF> partial_denominators(num_threads);

    {
        info("GP step 2.1");
        PROFILE_THIS_NAME("GP step 2.1");
        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = idx_bounds[thread_idx].first;
            const size_t end = idx_bounds[thread_idx].second;
            for (size_t i = start; i < end - 1; ++i) {
                if (check_is_active(i + 1)) {
                    numerator.at(i + 1) *= numerator[i];
                    denominator.at(i + 1) *= denominator[i];
                }
                info("num = ", numerator.at(i + 1));
                info("den = ", denominator.at(i + 1));
            }
            partial_numerators[thread_idx] = numerator[end - 1];
            partial_denominators[thread_idx] = denominator[end - 1];
        });

        DEBUG_LOG_ALL(partial_numerators);
        DEBUG_LOG_ALL(partial_denominators);
    }
    {
        PROFILE_THIS_NAME("GP step 2.2");
        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = idx_bounds[thread_idx].first;
            const size_t end = idx_bounds[thread_idx].second;
            if (thread_idx > 0) {
                FF numerator_scaling = 1;
                FF denominator_scaling = 1;

                for (size_t j = 0; j < thread_idx; ++j) {
                    numerator_scaling *= partial_numerators[j];
                    denominator_scaling *= partial_denominators[j];
                }
                for (size_t i = start; i < end; ++i) {
                    if (check_is_active(i)) {
                        numerator.at(i) = numerator[i] * numerator_scaling;
                        denominator.at(i) = denominator[i] * denominator_scaling;
                    }
                }
            }

            // Final step: invert denominator
            FF::batch_invert(std::span{ &denominator.data()[start], end - start });
        });
    }

    DEBUG_LOG_ALL(numerator.coeffs());
    DEBUG_LOG_ALL(denominator.coeffs());

    // Step (3) Compute z_perm[i] = numerator[i] / denominator[i]
    auto& grand_product_polynomial = GrandProdRelation::get_grand_product_polynomial(full_polynomials);
    // We have a 'virtual' 0 at the start (as this is a to-be-shifted polynomial)
    ASSERT(grand_product_polynomial.start_index() == 1);

    {
        PROFILE_THIS_NAME("GP step 3");
        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = idx_bounds[thread_idx].first;
            const size_t end = idx_bounds[thread_idx].second;
            for (size_t i = end; i-- > start;) {
                // if (check_is_active(i + 1)) {
                if (check_is_active(i)) {
                    grand_product_polynomial.at(i + 1) = numerator[i] * denominator[i];
                } else {
                    // Set the value in the inactive regions to the first active value in the active region that follows
                    for (size_t j = 0; j < active_block_ranges.size() - 1; ++j) {
                        auto& ranges = active_block_ranges;
                        if (i + 1 >= ranges[j].second && i + 1 < ranges[j + 1].first) {
                            size_t val_idx = ranges[j + 1].first;
                            grand_product_polynomial.at(i + 1) = numerator[val_idx] * denominator[val_idx];
                            break;
                        }
                    }
                }
                // info("active = ", check_is_active(i + 1));
                // info("GP(", i + 1, ") = ", grand_product_polynomial.at(i + 1));
            }
        });
    }

    DEBUG_LOG_ALL(grand_product_polynomial.coeffs());
}

template <typename Flavor, typename GrandProdRelation>
void compute_grand_product(typename Flavor::ProverPolynomials& full_polynomials,
                           bb::RelationParameters<typename Flavor::FF>& relation_parameters,
                           size_t size_override = 0,
                           std::vector<std::pair<size_t, size_t>> active_block_ranges = {})
{
    PROFILE_THIS_NAME("compute_grand_product");

    for (auto range : active_block_ranges) {
        info("start = ", range.first);
        info("end = ", range.second);
    }

    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    using Accumulator = std::tuple_element_t<0, typename GrandProdRelation::SumcheckArrayOfValuesOverSubrelations>;

    // Set the domain over which the grand product must be computed. This may be less than the dyadic circuit size, e.g
    // the permutation grand product does not need to be computed beyond the index of the last active wire
    size_t domain_size = size_override == 0 ? full_polynomials.get_polynomial_size() : size_override;

    const size_t num_threads = domain_size >= get_num_cpus_pow2() ? get_num_cpus_pow2() : 1;
    const size_t block_size = domain_size / num_threads;
    const size_t final_idx = domain_size - 1;

    // Cumpute the index bounds for each thread for reuse in the computations below
    std::vector<std::pair<size_t, size_t>> idx_bounds;
    idx_bounds.reserve(num_threads);
    for (size_t thread_idx = 0; thread_idx < num_threads; ++thread_idx) {
        const size_t start = thread_idx * block_size;
        const size_t end = (thread_idx == num_threads - 1) ? final_idx : (thread_idx + 1) * block_size;
        idx_bounds.push_back(std::make_pair(start, end));
    }

    // Allocate numerator/denominator polynomials that will serve as scratch space
    // TODO(zac) we can re-use the permutation polynomial as the numerator polynomial. Reduces readability
    Polynomial numerator{ domain_size, domain_size };
    Polynomial denominator{ domain_size, domain_size };

    auto check_is_active = [&](size_t idx) {
        if (active_block_ranges.empty()) {
            return true;
        }
        return std::any_of(active_block_ranges.begin(), active_block_ranges.end(), [idx](const auto& range) {
            return idx >= range.first && idx < range.second;
        });
    };

    // Step (1)
    // Populate `numerator` and `denominator` with the algebra described by Relation
    // FF gamma_fourth = relation_parameters.gamma.pow(4);
    parallel_for(num_threads, [&](size_t thread_idx) {
        typename Flavor::AllValues row;
        const size_t start = idx_bounds[thread_idx].first;
        const size_t end = idx_bounds[thread_idx].second;
        for (size_t i = start; i < end; ++i) {
            if (check_is_active(i)) {
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/940):consider avoiding get_row if possible.
                row = full_polynomials.get_row(i);
                numerator.at(i) =
                    GrandProdRelation::template compute_grand_product_numerator<Accumulator>(row, relation_parameters);
                denominator.at(i) = GrandProdRelation::template compute_grand_product_denominator<Accumulator>(
                    row, relation_parameters);
            } else {
                numerator.at(i) = 1;
                denominator.at(i) = 1;
            }
        }
    });

    DEBUG_LOG_ALL(numerator.coeffs());
    DEBUG_LOG_ALL(denominator.coeffs());

    // Step (2)
    // Compute the accumulating product of the numerator and denominator terms.
    // This step is split into three parts for efficient multithreading:
    // (i) compute ∏ A(j), ∏ B(j) subproducts for each thread
    // (ii) compute scaling factor required to convert each subproduct into a single running product
    // (ii) combine subproducts into a single running product
    //
    // For example, consider 4 threads and a size-8 numerator { a0, a1, a2, a3, a4, a5, a6, a7 }
    // (i)   Each thread computes 1 element of N = {{ a0, a0a1 }, { a2, a2a3 }, { a4, a4a5 }, { a6, a6a7 }}
    // (ii)  Take partial products P = { 1, a0a1, a2a3, a4a5 }
    // (iii) Each thread j computes N[i][j]*P[j]=
    //      {{a0,a0a1},{a0a1a2,a0a1a2a3},{a0a1a2a3a4,a0a1a2a3a4a5},{a0a1a2a3a4a5a6,a0a1a2a3a4a5a6a7}}
    std::vector<FF> partial_numerators(num_threads);
    std::vector<FF> partial_denominators(num_threads);

    parallel_for(num_threads, [&](size_t thread_idx) {
        const size_t start = idx_bounds[thread_idx].first;
        const size_t end = idx_bounds[thread_idx].second;
        for (size_t i = start; i < end - 1; ++i) {
            if (check_is_active(i + 1)) {
                // info("active");
                numerator.at(i + 1) *= numerator[i];
                denominator.at(i + 1) *= denominator[i];
            } else {
                // info("inactive");
                numerator.at(i + 1) = numerator[i];
                denominator.at(i + 1) = denominator[i];
            }
            // info("i = ", i, ", num = ", numerator.at(i));
        }
        partial_numerators[thread_idx] = numerator[end - 1];
        partial_denominators[thread_idx] = denominator[end - 1];
    });

    DEBUG_LOG_ALL(partial_numerators);
    DEBUG_LOG_ALL(partial_denominators);

    parallel_for(num_threads, [&](size_t thread_idx) {
        const size_t start = idx_bounds[thread_idx].first;
        const size_t end = idx_bounds[thread_idx].second;
        if (thread_idx > 0) {
            FF numerator_scaling = 1;
            FF denominator_scaling = 1;

            for (size_t j = 0; j < thread_idx; ++j) {
                numerator_scaling *= partial_numerators[j];
                denominator_scaling *= partial_denominators[j];
            }
            for (size_t i = start; i < end; ++i) {
                numerator.at(i) = numerator[i] * numerator_scaling;
                denominator.at(i) = denominator[i] * denominator_scaling;
                // info("i = ", i, ", numer = ", numerator.at(i));
            }
        }

        // Final step: invert denominator
        FF::batch_invert(std::span{ &denominator.data()[start], end - start });
    });

    DEBUG_LOG_ALL(numerator.coeffs());
    DEBUG_LOG_ALL(denominator.coeffs());

    // Step (3) Compute z_perm[i] = numerator[i] / denominator[i]
    auto& grand_product_polynomial = GrandProdRelation::get_grand_product_polynomial(full_polynomials);
    // We have a 'virtual' 0 at the start (as this is a to-be-shifted polynomial)
    ASSERT(grand_product_polynomial.start_index() == 1);

    parallel_for(num_threads, [&](size_t thread_idx) {
        const size_t start = idx_bounds[thread_idx].first;
        const size_t end = idx_bounds[thread_idx].second;
        for (size_t i = end; i-- > start;) {
            if (check_is_active(i + 1)) {
                grand_product_polynomial.at(i + 1) = numerator[i] * denominator[i];
            } else {
                // Set the value in the inactive regions to the first active value in the active region that follows
                for (size_t j = 0; j < active_block_ranges.size() - 1; ++j) {
                    auto& ranges = active_block_ranges;
                    // info("i + 1 = ", i + 1);
                    // info("ranges[j].second = ", ranges[j].second);
                    // info("ranges[j + 1].first = ", ranges[j + 1].first);
                    if (i + 1 >= ranges[j].second && i + 1 < ranges[j + 1].first) {
                        size_t val_idx = ranges[j + 1].first - 1;
                        // info("inactive value idx = ", val_idx);
                        grand_product_polynomial.at(i + 1) = numerator[val_idx] * denominator[val_idx];
                        break;
                    }
                }
            }
            // info("idx  = ", i + 1, ", z_perm = ", grand_product_polynomial[i + 1]);
        }
    });

    DEBUG_LOG_ALL(grand_product_polynomial.coeffs());
}

/**
 * @brief Compute the grand product corresponding to each grand-product relation defined in the Flavor
 *
 */
template <typename Flavor>
void compute_grand_products(typename Flavor::ProverPolynomials& full_polynomials,
                            bb::RelationParameters<typename Flavor::FF>& relation_parameters)
{
    using GrandProductRelations = typename Flavor::GrandProductRelations;

    constexpr size_t NUM_RELATIONS = std::tuple_size<GrandProductRelations>{};
    bb::constexpr_for<0, NUM_RELATIONS, 1>([&]<size_t i>() {
        using GrandProdRelation = typename std::tuple_element<i, GrandProductRelations>::type;

        compute_grand_product<Flavor, GrandProdRelation>(full_polynomials, relation_parameters);
    });
}

} // namespace bb