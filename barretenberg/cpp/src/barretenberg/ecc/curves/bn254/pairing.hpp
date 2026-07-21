// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
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

// Signed bit decomposition (from MSB to LSB) of (6 * z + 2) where z is the parameter of BN254, used in the Miller loop.
// \f$6z + 2 = \sum_{i} b_i 2^i + 2^{64}\f$ where b_i = 1 if loop_bits[loop_length - i - 1] = 1, b_i = -1 if
// loop_bits[loop_length - i - 1] = 3 and b_i = 0 if loop_bits[loop_length - i - 1] = 0
constexpr std::array<uint8_t, loop_length> loop_bits{ 1, 0, 1, 0, 0, 0, 3, 0, 3, 0, 0, 0, 3, 0, 1, 0, 3, 0, 0, 3, 0, 0,
                                                      0, 0, 0, 1, 0, 0, 3, 0, 1, 0, 0, 3, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0,
                                                      3, 0, 3, 0, 0, 1, 0, 0, 0, 3, 0, 0, 3, 0, 1, 0, 1, 0, 0, 0 };

// Bit decomposition of z (from MSB to LSB): \f$\sum_{i} b_i 2^i + 2^{64}\f$ where b_i = 1 if z_loop_bits[z_loop_length
// - i - 1] = 1 and b_i = 0 if z_loop_bits[z_loop_length - i - 1] = 0
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

/**

 *
 * @details When calculating pairings, point operations are calculated via an ad-hoc method, so it's more sensible to
 * use a specific struct rather than reusing g2::element
 */
struct g2Projective {
    fq2 x;
    fq2 y;
    fq2 z;
};

/**
 * @brief  Struct representing a point in G1 in homogeneous projective coordinates
 *
 * @details When calculating pairings, point operations are calculated via an ad-hoc method, so it's more sensible to
 * use a specific struct rather than reusing g2::element
 *
 */
struct g1Projective {
    fq x;
    fq y;
    fq z;
};

/**
 * @brief Doubling step for Miller loop calculation.
 *
 * @details This function computes the constants required to evaluate the tangent line at work_point and updates
 * work_point to 2 * work_point. The formulas are taken from https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf,
 * section 4.2.
 *
 * @param work_point
 * @param line
 */
constexpr void doubling_step_for_miller_loop(g2Projective& work_point, fq12::ell_coeffs& line);

/**
 * @brief Addition step for Miller loop calculation.
 *
 * @details This function computes the constants required to evaluate the line through work_point and Q and updates
 * work_point to work_point + Q. The formulas are taken from https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf,
 * section 4.2.
 *
 * @note The formulas for mixed addition in https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf have a typo: the
 * first term in the line evaluation of the mixed addition is lambda * y_P, not lambda * (-y_P)
 *
 * @param Q
 * @param work_point
 * @param line
 */
constexpr void mixed_addition_step_for_miller_loop(const g2Projective& Q,
                                                   g2Projective& work_point,
                                                   fq12::ell_coeffs& line);

/**
 * @brief Precomputation of Miller lines for a point Q in G2.
 *
 * @details This function computes the lines that are evaluated in the calculation of the Miller loop for the point Q.
 * Setting work_point = Q as the MSB bit in the signed decomposition of 6z + 2 is 1, for each bit in the signed
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
 *
 * @param Q
 * @param lines
 */
constexpr void precompute_miller_lines(const g2Projective& Q, miller_lines& lines);

// Overload when the function is called with a g2::element
constexpr void precompute_miller_lines(const g2::element& Q, miller_lines& lines);

/**
 * @brief Miller loop implementation.
 *
 * @details This function computes the Miller loop
 * \f[
 *      f_{6z + 2, Q}(P) \cdot l_{(6z + 2)Q, Q'}(P) \cdot l_{(6z + 2)Q + Q', -Q''}(P)
 * \f]
 * where Q' is the image of Q under the Frobenius map and Q'' is minus the image of Q' under the Frobenius map. For the
 * point P and the precomputed Miller lines of Q.
 *
 * @param P
 * @param lines
 * @return constexpr fq12
 */
constexpr fq12 miller_loop(const g1::affine_element& P, const miller_lines& lines);

/**
 * @brief Compute the Miller loop for multiple pairs of points.
 *
 * @details The structure of the Miller loop allows computing the product of the Miller loops for multiple
 * pairs (P_i, Q_i) with a single loop over the bits of 6z + 2: at each step in the loop we aggregate all the
 * contributions from each point so to perform a single squaring.
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

/**
 * @brief Easy part of the final exponentiation.
 *
 * @details This function computes \f$elt^{(p^6 - 1)(p^2 + 1)}\f$, where \f$elt$ is the result the Miller loop.
 *
 * @param elt
 */
constexpr fq12 final_exponentiation_easy_part(const fq12& elt);

/**
 * @brief Compute elt^z for elt a unitary element
 *
 * @param elt
 */
constexpr fq12 final_exponentiation_exp_by_z(const fq12& elt);

/**
 * @brief Hard part of the final exponentiation.
 *
 *
 * @details This function computes \f$elt^{\frac{q^4 - q^2 + 1}{r} \cdot \gamma}\f$, where \f$elt\f$ is the result of
 * the easy part of the final exponentiation and \f$\gamma = 2z ( 6z^2 + 3z^2 + 1)\f$, with \f$z\f$ the parameter
 * defining the BN254 curve. The algorithm is based on Section 3.3 of "Efficient Implementation of Bilinear Pairings on
 * ARM Processors" https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf.
 *
 * @param elt
 */
constexpr fq12 final_exponentiation_tricky_part(const fq12& elt);

// ======================
// Pairing
//
// NOTE: All points supplied for pairing calculations are checked to be on the curve. For G1 = BN254 this is equivalent
// to a subgroup membership check (cofactor 1). For G2 = BN254 twist, on-curve does NOT imply membership in the
// prime-order subgroup because the cofactor is non-trivial. The two G2 points consumed inside pairings come from
// PairingPoints::check(), which feeds them the SRS values [1]_2 and [x]_2 — the SRS ingress (bbapi::SrsInitSrs)
// invokes `affine_element::is_in_prime_subgroup()` on the user-supplied [x]_2 before installation, so by the time
// they reach this file they are already known to be in the prime-order subgroup. Any future code path that brings a
// new G2 point in from outside the SRS must run the subgroup check itself.
//
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
