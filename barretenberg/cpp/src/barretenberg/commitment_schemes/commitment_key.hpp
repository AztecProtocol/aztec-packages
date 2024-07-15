#pragma once

/**
 * @brief Provides interfaces for different 'CommitmentKey' classes.
 *
 * TODO(#218)(Mara): This class should handle any modification to the SRS (e.g compute pippenger point table) to
 * simplify the codebase.
 */

#include "barretenberg/common/op_count.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <cstddef>
#include <memory>
#include <ranges>
#include <string_view>

namespace bb {

/**
 * @brief CommitmentKey object over a pairing group 𝔾₁.
 *
 * @details Commitments are computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ where Gᵢ is the i-th element of the SRS. For BN254,
 * the SRS is given as a list of 𝔾₁ points { [xʲ]₁ }ⱼ where 'x' is unknown. For Grumpkin, they are random points. The
 * SRS stored in the commitment key is after applying the pippenger_point_table thus being double the size of what is
 * loaded from path.
 */
template <class Curve> class CommitmentKey {

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using G1 = typename Curve::AffineElement;

    using IndicesView = std::ranges::iota_view<size_t>;
    using EvenIndicesView = std::ranges::filter_view<IndicesView, std::function<bool(size_t)>>;
    using SrsViewType = std::ranges::transform_view<EvenIndicesView, std::function<G1(size_t)>>;

    SrsViewType srs_view;

  public:
    scalar_multiplication::pippenger_runtime_state<Curve> pippenger_runtime_state;
    std::shared_ptr<srs::factories::CrsFactory<Curve>> crs_factory;
    std::shared_ptr<srs::factories::ProverCrs<Curve>> srs;

    CommitmentKey() = delete;

    /**
     * @brief Construct a new Kate Commitment Key object from existing SRS
     *
     * @param n
     * @param path
     *
     */
    CommitmentKey(const size_t num_points)
        : pippenger_runtime_state(num_points)
        , crs_factory(srs::get_crs_factory<Curve>())
        , srs(crs_factory->get_prover_crs(num_points))
    {}

    // Note: This constructor is to be used only by Plonk; For Honk the srs lives in the CommitmentKey
    CommitmentKey(const size_t num_points, std::shared_ptr<srs::factories::ProverCrs<Curve>> prover_crs)
        : pippenger_runtime_state(num_points)
        , srs(prover_crs)
    {}

    /**
     * @brief Uses the ProverSRS to create a commitment to p(X)
     *
     * @param polynomial a univariate polynomial p(X) = ∑ᵢ aᵢ⋅Xⁱ
     * @return Commitment computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ
     */
    Commitment commit(std::span<const Fr> polynomial)
    {
        BB_OP_COUNT_TIME();
        const size_t degree = polynomial.size();
        ASSERT(degree <= srs->get_monomial_size());
        return scalar_multiplication::pippenger_unsafe<Curve>(
            const_cast<Fr*>(polynomial.data()), srs->get_monomial_points(), degree, pippenger_runtime_state);
    };

    auto get_srs_view()
    {
        size_t point_table_size = 2 * srs->get_monomial_size();
        G1* point_table = srs->get_monomial_points();

        auto srs_view =
            std::views::iota(static_cast<size_t>(0), point_table_size) | // generate view of indices 0, ..., n-1
            std::views::filter([](int i) { return i % 2 == 0; }) |       // create a view of the even indices only
            std::views::transform([point_table](size_t i) { return point_table[i]; }); // extract even srs

        return srs_view;
    }

    Commitment commit_sparse(std::span<const Fr> polynomial)
    {
        // BB_OP_COUNT_TIME();
        const size_t degree = polynomial.size();
        ASSERT(degree <= srs->get_monomial_size());

        G1* point_table = srs->get_monomial_points();

        std::vector<Fr> scalars;
        std::vector<G1> points;

        const size_t num_threads = degree >= get_num_cpus_pow2() ? get_num_cpus_pow2() : 1;
        const size_t block_size = degree / num_threads;

        std::vector<std::vector<Fr>> thread_scalars(num_threads);
        std::vector<std::vector<G1>> thread_points(num_threads);

        parallel_for(num_threads, [&](size_t thread_idx) {
            const size_t start = thread_idx * block_size;
            const size_t end = (thread_idx + 1) * block_size;

            for (size_t idx = start; idx < end; ++idx) {

                const G1& point = point_table[idx * 2];
                const Fr& scalar = polynomial[idx];
                if (!scalar.is_zero()) {
                    thread_scalars[thread_idx].emplace_back(scalar);
                    thread_points[thread_idx].emplace_back(point);
                }
            }
        });

        for (size_t idx = 0; idx < num_threads; ++idx) {
            scalars.insert(scalars.end(), thread_scalars[idx].begin(), thread_scalars[idx].end());
            points.insert(points.end(), thread_points[idx].begin(), thread_points[idx].end());
        }

        return scalar_multiplication::pippenger_without_endomorphism_basis_points<Curve>(
            scalars.data(), points.data(), scalars.size(), pippenger_runtime_state);
    }
};

} // namespace bb
