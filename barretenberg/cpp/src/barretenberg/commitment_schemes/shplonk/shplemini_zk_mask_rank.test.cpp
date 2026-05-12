// Rank sanity check for sparse Shplemini PCS masking.
//
// Builds the leakage matrix B for the KZG (tail-halving support) and IPA
// (dyadic-cut support) sparse masking layouts over BN254 Fr at random
// non-degenerate challenges, and asserts rank(B) == |S|. See
// SHPLEMINI_ZK_MASKING.md for the analytical proofs — the assertions here
// guard against construction bugs in the support generators and the
// transcript-leakage formulas, not against the math itself.

#include "barretenberg/commitment_schemes/shplonk/sparse_masking_poly.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <unordered_set>
#include <vector>

namespace bb {
namespace {

using Fr = bb::fr;

// --------------------------- field helpers ---------------------------------

std::vector<Fr> power_table(const Fr& base, size_t length)
{
    std::vector<Fr> out(length, Fr::one());
    for (size_t k = 1; k < length; ++k) {
        out[k] = out[k - 1] * base;
    }
    return out;
}

// [lambda_0(s), ..., lambda_d(s)], the Gemini fold weights for E_s.
std::vector<Fr> lambda_at(const std::vector<Fr>& u, size_t s)
{
    std::vector<Fr> out;
    out.reserve(u.size() + 1);
    out.push_back(Fr::one());
    for (size_t t = 0; t < u.size(); ++t) {
        const bool bit = ((s >> t) & 1U) != 0U;
        const Fr factor = bit ? u[t] : (Fr::one() - u[t]);
        out.push_back(out.back() * factor);
    }
    return out;
}

// Rank over Fr via row-echelon Gauss elimination (no rref).
size_t rank_mod_fr(std::vector<std::vector<Fr>> rows)
{
    const size_t m = rows.size();
    const size_t n = rows.empty() ? 0 : rows[0].size();
    size_t rank = 0;
    for (size_t col = 0; col < n; ++col) {
        size_t pivot = m;
        for (size_t r = rank; r < m; ++r) {
            if (!rows[r][col].is_zero()) {
                pivot = r;
                break;
            }
        }
        if (pivot == m) {
            continue;
        }
        std::swap(rows[rank], rows[pivot]);
        const Fr inv_p = rows[rank][col].invert();
        const auto& pr = rows[rank];
        for (size_t r = rank + 1; r < m; ++r) {
            if (rows[r][col].is_zero()) {
                continue;
            }
            const Fr factor = rows[r][col] * inv_p;
            for (size_t k = col; k < n; ++k) {
                rows[r][k] -= factor * pr[k];
            }
        }
        ++rank;
        if (rank == m || rank == n) {
            break;
        }
    }
    return rank;
}

// --------------------------- challenge sampling ----------------------------

struct Challenges {
    std::vector<Fr> u;
    Fr nu;
    Fr z;
    Fr tau;
    std::vector<Fr> r_pow;     // r_pow[t] = r^(2^t).
    std::vector<Fr> neg_r_pow; // (-r)^(2^t) and its negation.
};

Challenges sample_challenges(size_t d)
{
    while (true) {
        Challenges ch;
        ch.u.reserve(d);
        for (size_t t = 0; t < d; ++t) {
            ch.u.push_back(Fr::random_element());
        }
        const Fr r = Fr::random_element();
        ch.nu = Fr::random_element();
        ch.z = Fr::random_element();
        ch.tau = Fr::random_element();
        Fr current = r;
        ch.r_pow.reserve(d);
        ch.neg_r_pow.reserve(d);
        for (size_t t = 0; t < d; ++t) {
            ch.r_pow.push_back(current);
            ch.neg_r_pow.push_back(-current);
            current = current.sqr();
        }
        bool bad = (ch.z == ch.tau);
        for (size_t t = 0; t < d && !bad; ++t) {
            if (ch.z == ch.r_pow[t] || ch.z == ch.neg_r_pow[t]) {
                bad = true;
            }
            if (ch.tau == ch.r_pow[t] || ch.tau == ch.neg_r_pow[t]) {
                bad = true;
            }
        }
        if (!bad) {
            return ch;
        }
    }
}

// --------------------------- supports --------------------------------------

// KZG tail-halving support: production generator, pinned to extent = 2^d for the test.
std::vector<size_t> halving_tail_support(size_t d)
{
    return tail_halving_support(d, static_cast<size_t>(1) << d);
}

// IPA support: four entries around every dyadic cut, plus top tail.
std::vector<size_t> ipa_dyadic_cut_support(size_t d)
{
    const size_t n = static_cast<size_t>(1) << d;
    std::unordered_set<size_t> seen;
    std::vector<size_t> support;
    const auto add = [&](int64_t i) {
        if (i >= 0 && static_cast<size_t>(i) < n) {
            const size_t v = static_cast<size_t>(i);
            if (seen.insert(v).second) {
                support.push_back(v);
            }
        }
    };
    add(static_cast<int64_t>(n) - 4);
    add(static_cast<int64_t>(n) - 3);
    add(static_cast<int64_t>(n) - 2);
    add(static_cast<int64_t>(n) - 1);
    for (size_t q = 1; q < d; ++q) {
        const int64_t base = static_cast<int64_t>(1) << q;
        for (int64_t delta : { -2, -1, 0, 1 }) {
            add(base + delta);
        }
    }
    return support;
}

// --------------------------- KZG leakage matrix ----------------------------

// Row layout (total 2d + 3 rows):
//   0:               M(u)        = lambda_d(s)
//   1..d:            M_t(tau),     t=0..d-1
//   d+1..2d:         M_t(-r_t),    t=0..d-1
//   2d+1:            Shplonk Q(tau)
//   2d+2:            KZG W(tau) = (Q(tau) - Q(z)) / (tau - z)
std::vector<std::vector<Fr>> kzg_matrix(size_t d, const std::vector<size_t>& support, const Challenges& ch)
{
    const size_t n = static_cast<size_t>(1) << d;
    const std::vector<Fr> tau_pow = power_table(ch.tau, n);
    const std::vector<Fr> z_pow = power_table(ch.z, n);

    std::vector<std::vector<Fr>> pos_pow(d);
    std::vector<std::vector<Fr>> neg_pow(d);
    std::vector<Fr> inv_tau_minus_pos(d);
    std::vector<Fr> inv_tau_minus_neg(d);
    std::vector<Fr> inv_z_minus_pos(d);
    std::vector<Fr> inv_z_minus_neg(d);
    for (size_t t = 0; t < d; ++t) {
        const size_t len = std::max<size_t>(n >> t, 1);
        pos_pow[t] = power_table(ch.r_pow[t], len);
        neg_pow[t] = power_table(ch.neg_r_pow[t], len);
        inv_tau_minus_pos[t] = (ch.tau - ch.r_pow[t]).invert();
        inv_tau_minus_neg[t] = (ch.tau - ch.neg_r_pow[t]).invert();
        inv_z_minus_pos[t] = (ch.z - ch.r_pow[t]).invert();
        inv_z_minus_neg[t] = (ch.z - ch.neg_r_pow[t]).invert();
    }
    const Fr inv_tau_minus_z = (ch.tau - ch.z).invert();

    const size_t rows_count = (2 * d) + 3;
    std::vector<std::vector<Fr>> rows(rows_count, std::vector<Fr>(support.size(), Fr::zero()));

    for (size_t col = 0; col < support.size(); ++col) {
        const size_t s = support[col];
        const auto lam = lambda_at(ch.u, s);
        rows[0][col] = lam[d];

        std::vector<Fr> m_tau(d);
        std::vector<Fr> m_pos(d);
        std::vector<Fr> m_neg(d);
        std::vector<Fr> m_z(d);
        for (size_t t = 0; t < d; ++t) {
            const size_t k = s >> t;
            m_tau[t] = lam[t] * tau_pow[k];
            m_z[t] = lam[t] * z_pow[k];
            m_pos[t] = lam[t] * pos_pow[t][k];
            m_neg[t] = lam[t] * neg_pow[t][k];
            rows[1 + t][col] = m_tau[t];
            rows[1 + d + t][col] = m_neg[t];
        }

        Fr q_tau = Fr::zero();
        Fr q_z = Fr::zero();
        Fr nu_pow = Fr::one();
        for (size_t t = 0; t < d; ++t) {
            q_tau += nu_pow * (m_tau[t] - m_pos[t]) * inv_tau_minus_pos[t];
            q_z += nu_pow * (m_z[t] - m_pos[t]) * inv_z_minus_pos[t];
            nu_pow *= ch.nu;
            q_tau += nu_pow * (m_tau[t] - m_neg[t]) * inv_tau_minus_neg[t];
            q_z += nu_pow * (m_z[t] - m_neg[t]) * inv_z_minus_neg[t];
            nu_pow *= ch.nu;
        }
        rows[(2 * d) + 1][col] = q_tau;
        rows[(2 * d) + 2][col] = (q_tau - q_z) * inv_tau_minus_z;
    }
    return rows;
}

// --------------------------- IPA leakage matrix ----------------------------

// Row layout (total N + 1 rows):
//   0:        M(u)              = lambda_d(s)
//   1..N:     coefficient of X^j in the Shplonk batched polynomial G(X).
// Using (X^k - p^k)/(X - p) = sum_{j<k} p^(k-1-j) X^j with k = s >> t and
// p = +/- r_t, the (E_s, t, sign) contribution to coeff_j is
//   lam[t] * nu_pow * (sign * r_t)^(k-1-j),  for j < k.
std::vector<std::vector<Fr>> ipa_matrix(size_t d, const std::vector<size_t>& support, const Challenges& ch)
{
    const size_t n = static_cast<size_t>(1) << d;

    std::vector<std::vector<Fr>> pos_pow(d);
    std::vector<std::vector<Fr>> neg_pow(d);
    for (size_t t = 0; t < d; ++t) {
        const size_t len = std::max<size_t>(n >> t, 1);
        pos_pow[t] = power_table(ch.r_pow[t], len);
        neg_pow[t] = power_table(ch.neg_r_pow[t], len);
    }

    std::vector<std::vector<Fr>> rows(1 + n, std::vector<Fr>(support.size(), Fr::zero()));

    for (size_t col = 0; col < support.size(); ++col) {
        const size_t s = support[col];
        const auto lam = lambda_at(ch.u, s);
        rows[0][col] = lam[d];
        Fr nu_pow = Fr::one();
        for (size_t t = 0; t < d; ++t) {
            const size_t k = s >> t;
            for (const auto* sign_table : { &pos_pow[t], &neg_pow[t] }) {
                const Fr lam_nu = lam[t] * nu_pow;
                for (size_t j = 0; j < k; ++j) {
                    rows[1 + j][col] += lam_nu * (*sign_table)[k - 1 - j];
                }
                nu_pow *= ch.nu;
            }
        }
    }
    return rows;
}

// --------------------------- tests -----------------------------------------

constexpr std::array<size_t, 3> kKzgDValues = { 10, 11, 12 };
constexpr std::array<size_t, 3> kIpaDValues = { 10, 11, 12 };

TEST(ShpleminiZkMaskRank, KzgTailHalvingHasFullRank)
{
    for (size_t d : kKzgDValues) {
        const auto support = halving_tail_support(d);
        const auto ch = sample_challenges(d);
        const auto rows = kzg_matrix(d, support, ch);
        const size_t rank = rank_mod_fr(rows);
        EXPECT_EQ(rank, support.size()) << "KZG rank mismatch at d=" << d;
    }
}

TEST(ShpleminiZkMaskRank, IpaDyadicCutHasFullRank)
{
    for (size_t d : kIpaDValues) {
        const auto support = ipa_dyadic_cut_support(d);
        ASSERT_LT(support.size(), static_cast<size_t>(1) << d) << "IPA support saturates the polynomial at d=" << d;
        const auto ch = sample_challenges(d);
        const auto rows = ipa_matrix(d, support, ch);
        const size_t rank = rank_mod_fr(rows);
        EXPECT_EQ(rank, support.size()) << "IPA rank mismatch at d=" << d;
    }
}

} // namespace
} // namespace bb
