// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "gate_separator.hpp"

#include <cstddef>
#include <vector>
namespace bb {

template <typename FF> class ProverEqPolynomial {

  public:
    static Polynomial<FF> construct(std::span<const FF> challenge, size_t log_num_monomials)
    {
        std::vector<FF> pow_betas = transform_challenge(challenge);
        FF scaling_factor = compute_scaling_factor(challenge);
        Polynomial<FF> out = GateSeparatorPolynomial<FF>::compute_beta_products(pow_betas, log_num_monomials);
        out *= scaling_factor;
        return out;
    };

    static FF compute_scaling_factor(std::span<const FF> challenge)
    {
        FF out(1);

        const FF one(1);

        for (auto u_i : challenge) {
            out *= (one - u_i);
        }
        return out;
    }

    static std::vector<FF> transform_challenge(std::span<const FF> challenges)
    {
        std::vector<FF> result;
        std::vector<FF> denominators;
        for (const auto& challenge : challenges) {
            denominators.push_back((FF(1) - challenge));
        }

        FF::batch_invert(denominators);

        for (const auto& [denom_inverted, challenge] : zip_view(denominators, challenges)) {
            result.push_back(denom_inverted * challenge);
        }

        return result;
    }
};
/**
 * @brief Verifier-side polynomial for division-free evaluation of eq(r, u).
 *
 * eq(r,u) = ∏_i ((1 - r_i)(1 - u_i) + r_i u_i)
 *         = ∏_i ( b_i + u_i * a_i ), where:
 *             a_i = 2 r_i - 1
 *             b_i = 1 - r_i
 *
 * Features:
 *  - O(d) evaluation with no divisions.
 *  - Incremental "combiner challenge" updates: multiply in the i-th factor and advance.
 */
template <typename FF> struct EqVerifierPolynomial {
    // --- Instance data (fixed for a proof) ---
    std::vector<FF> r; // instance challenges r_i
    std::vector<FF> a; // a_i = 2 r_i - 1
    std::vector<FF> b; // b_i = 1 - r_i

    explicit EqVerifierPolynomial(const std::vector<FF>& r_in) { initialize(r_in); }

    void initialize(const std::vector<FF>& r_in)
    {
        r = r_in;
        a.resize(r.size());
        b.resize(r.size());
        for (size_t i = 0; i < r.size(); ++i) {
            a[i] = r[i] + r[i] - FF(1); // 2 r_i - 1
            b[i] = FF(1) - r[i];        // 1 - r_i
        }
    }

    // ---- One-shot evaluation: eq(r, u) ----
    FF evaluate(std::span<const FF> u) const
    {
        assert(u.size() == r.size());
        FF acc = FF(1);
        for (size_t i = 0; i < u.size(); ++i) {
            // term_i = b_i + u_i * a_i
            acc *= (b[i] + u[i] * a[i]);
        }
        return acc;
    }

    // ---- Static convenience: one-shot eq(r, u) without constructing the object ----
    static FF eval(std::span<const FF> r_in, std::span<const FF> u)
    {
        assert(r_in.size() == u.size());
        FF acc = FF(1);
        for (size_t i = 0; i < r_in.size(); ++i) {
            const FF ai = r_in[i] + r_in[i] - FF(1);
            const FF bi = FF(1) - r_in[i];
            acc *= (bi + u[i] * ai);
        }
        return acc;
    }
};

} // namespace bb
