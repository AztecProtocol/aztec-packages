// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <random>

#include "./fq12.hpp"
#include "./fq2.hpp"
#include "./fq6.hpp"
#include "./g1.hpp"
#include "./g2.hpp"

namespace bb::pairing {

// Number of iterations in the Miller loop, equal to the length minus 1 of the signed bit decomposition of (6 * z + 2),
// where z is the parameter of BN254
constexpr size_t loop_length = 64;
// Bit length minus 1 of the parameter z of BN254
constexpr size_t z_loop_length = 62;
// Number of lines required by the Miller loop: equal to
// loop_length (tangent lines) +
// len([i for i in range(loop_length) if loop_bits[i] != 0]) (addition lines) +
// 2 (final two lines)
constexpr size_t precomputed_coefficients_length = 87;

// Signed bit decomposition of (6 * z + 2) where z is the parameter of BN254, used in the Miller loop.
// \f$6z + 2 = \sum_{i} b_i 2^i + 2^{64}\f$ where b_i = 1 if loop_bits[i] = 1, b_i = -1 if loop_bits[i] = 3 and b_i = 0
// if loop_bits[i] = 0
constexpr std::array<uint8_t, loop_length> loop_bits{ 1, 0, 1, 0, 0, 0, 3, 0, 3, 0, 0, 0, 3, 0, 1, 0, 3, 0, 0, 3, 0, 0,
                                                      0, 0, 0, 1, 0, 0, 3, 0, 1, 0, 0, 3, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0,
                                                      3, 0, 3, 0, 0, 1, 0, 0, 0, 3, 0, 0, 3, 0, 1, 0, 1, 0, 0, 0 };

// Bit decomposition of z: \f$\sum_{i} b_i 2^i + 2^{64}\f$ where b_i = 1 if z_loop_bits[i] = 1 and b_i = 0 if
// z_loop_bits[i] = 0
constexpr std::array<bool, z_loop_length> z_loop_bits{
    false, false, false, true,  false, false, true,  true,  true, false, true,  false, false, true,  true,  false,
    false, true,  false, false, true,  false, true,  false, true, true,  false, true,  false, false, false, true,
    false, false, true,  false, true,  false, false, true,  true, false, true,  false, false, true,  false, false,
    false, false, true,  false, false, true,  true,  true,  true, true,  false, false, false, true
};

// ======================
// Miller loop
// ======================
struct miller_lines {
    std::array<fq12::ell_coeffs, precomputed_coefficients_length> lines;
};

struct g2Projective {
    fq2 x;
    fq2 y;
    fq2 z;
};

struct g1Projective {
    fq x;
    fq y;
    fq z;
};

constexpr void doubling_step_for_flipped_miller_loop(g2Projective& work_point, fq12::ell_coeffs& line);

constexpr void mixed_addition_step_for_flipped_miller_loop(const g2Projective& Q,
                                                           g2Projective& work_point,
                                                           fq12::ell_coeffs& line);

/**
 * @brief Precomputation of Miller lines for a point Q in G2.
 *
 * @details This function computes the lines that are evaluated in the calculation of the Miller loop for the point Q.
 * Setting work_point = ±Q depending on the first bit in the signed decomposition of 6z + 2, for each bit in the signed
 * decomposition of 6z + 2 (except the MSB) we need:
 *  - The tangent line at work_point --> updated work_point = 2 * work_point
 *  - The line through:
 *      - work_point and Q if the bit is 1 --> updated work_point = work_point + Q
 *      - work_point and -Q if the bit is -1 --> updated work_point = work_point - Q
 *      - nothing else if the bit is 0 --> work_point is unchanged
 * After the loop, we need two more lines:
 *  - The line through (6z + 2)Q and Q' (image of Q under the Frobenius map)
 *  - The line through (6z + 2)Q + Q' and Q'' (minus the image of Q' under the Frobenius map)
 *
 * We data required for each of these lines: gradients between the relevant points, as well as coordinates of the
 * work_point.
 *
 * @param Q
 * @param lines
 */
constexpr void precompute_miller_lines(const g2Projective& Q, miller_lines& lines);

/**
 * @brief Miller loop implementation.
 *
 * @details This function computes the Miller loop \f$f_{6z + 2, Q}(P)\f$ for the point P and the precomputed Miller
 * lines of Q.
 *
 * @param P
 * @param lines
 * @return constexpr fq12
 */
constexpr fq12 miller_loop(const g1Projective& P, const miller_lines& lines);

/**
 * @brief Compute the Miller loop for multiple pairs of points.
 *
 * @details The structure of the Miller loop allows computing the product \prod_i f_{6z + 2, Q_i}(P_i) for multiple
 * pairs (P_i, Q_i) with a single loop over the bits of 6z + 2: at each step in the loop we aggregate all the
 * contributions from each point so to perform a single squaring.
 *
 *
 * @param points
 * @param lines
 * @param num_pairs
 * @return constexpr fq12
 */
constexpr fq12 miller_loop_batch(const g1::affine_element* points, const miller_lines* lines, size_t num_pairs);

// ======================
// Final exponentiation
// ======================

struct fq12Compressed {
    fq2 g2;
    fq2 g3;
    fq2 g4;
    fq2 g5;

    /**
     * @brief Map an element of fq12 into its compressed form.
     *
     * @details Fq12 can be constructed in two ways: ADD DETAILS HERE
     *
     * @param elt
     * @return constexpr fq12Compressed
     */
    static constexpr fq12Compressed from_fq12(const fq12& elt)
    {
        return { elt.c1.c0, elt.c0.c2, elt.c0.c1, elt.c1.c2 };
    }

    constexpr fq12 decompress(const std::optional<fq2>& hint = std::nullopt) const
    {
        fq2 g0;
        fq2 g1;
        fq2 inverse;
        if (g2.is_zero()) {
            inverse = hint.has_value() ? hint.value() : g3.invert();
            g1 = g4 * g5.mul_by_fq(fq(2)) * inverse;
            g0 = fq6::mul_by_non_residue(g1.sqr().mul_by_fq(fq(2)) - g3 * g4.mul_by_fq(fq(3))) + fq2::one();
        } else {
            inverse = hint.has_value() ? hint.value() : g2.mul_by_fq(fq(4)).invert();
            g1 = (fq6::mul_by_non_residue(g5.sqr()) + g4.sqr().mul_by_fq(fq(3)) - g3.mul_by_fq(fq(2))) * inverse;
            g0 = fq6::mul_by_non_residue(g1.sqr().mul_by_fq(fq(2)) + g2 * g5 - g3 * g4.mul_by_fq(fq(3))) + fq2::one();
        }

        return fq12{ { g0, g4, g3 }, { g2, g1, g5 } };
    }

    constexpr void self_sqr()
    {
        fq2 A23 = (g2 + g3) * (g2 + fq6::mul_by_non_residue(g3));
        fq2 A45 = (g4 + g5) * (g4 + fq6::mul_by_non_residue(g5));
        fq2 B23 = g2 * g3;
        fq2 B45 = g4 * g5;
        fq2 B23_mul_by_non_residue = fq6::mul_by_non_residue(B23);
        fq2 B45_mul_by_non_residue = fq6::mul_by_non_residue(B45);

        g2 = (g2 + B45_mul_by_non_residue.mul_by_fq(fq(3))).mul_by_fq(fq(2));
        g3 = (A45 - (B45_mul_by_non_residue + B45)).mul_by_fq(fq(3)) - g3.mul_by_fq(fq(2));
        g4 = (A23 - (B23_mul_by_non_residue + B23)).mul_by_fq(fq(3)) - g4.mul_by_fq(fq(2));
        g5 = (g5 + B23.mul_by_fq(fq(3))).mul_by_fq(fq(2));
    }

    constexpr fq12Compressed sqr() const
    {
        fq12Compressed result = *this;
        result.self_sqr();
        return result;
    }
};

/**
 * @brief Easy part of the final exponentiation.
 *
 * @details This function computes \f$elt^{(p^6 - 1)(p^2 + 1)}\f$, where \f$elt$ is the result the Miller loop.
 *
 * @param elt
 */
constexpr fq12 final_exponentiation_easy_part(const fq12& elt);

/**
 * @brief Compute f^z for f a unitary element
 *
 * @param elt
 */
constexpr fq12 final_exponentiation_exp_by_z(const fq12& elt);

/**
 * @brief Hard part of the final exponentiation.
 *
 *
 * @details This function computes \f$elt^{\frac{q^4 - q^2 + 1}{r}}\f$, where \f$elt\f$ is the result of the easy
 * part of the final exponentiation. The algorithm is based on Section 3.3 of "Efficient Implementation of Bilinear
 * Pairings on ARM Processors" https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf.
 *
 * @param elt
 */
constexpr fq12 final_exponentiation_tricky_part(const fq12& elt);

// ======================
// Pairing
// ======================

/**
 * @brief Optimal Ate pairing implementation. Compute e(P, Q).
 *
 * @param P_affine
 * @param Q_affine
 * @return constexpr fq12
 */
constexpr fq12 reduced_ate_pairing(const g1::affine_element& P_affine, const g2::affine_element& Q_affine);

/**
 * @brief Batch optimal Ate pairing implementation.
 *
 * @details This function computes \f$\prod_i e(P_i, Q_i)\f$ for multiple pairs.
 *
 * @param P_affines
 * @param Q_affines
 * @param num_points
 * @return fq12
 */
inline fq12 reduced_ate_pairing_batch(const g1::affine_element* P_affines,
                                      const g2::affine_element* Q_affines,
                                      size_t num_points);

/**
 * @brief Implementation of the optimal Ate pairing for multiple pairs of points where the Miller lines for the
 * points in G2 are precomputed.
 *
 * @param P_affines
 * @param lines
 * @param num_points
 * @return fq12
 */
inline fq12 reduced_ate_pairing_batch_precomputed(const g1::affine_element* P_affines,
                                                  const miller_lines* lines,
                                                  size_t num_points);

} // namespace bb::pairing

#include "./pairing_impl.hpp"
