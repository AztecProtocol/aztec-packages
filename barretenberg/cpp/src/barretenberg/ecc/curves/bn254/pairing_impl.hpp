// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "./fq12.hpp"
#include "./g1.hpp"
#include "./g2.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"

namespace bb::pairing {

// Precompute 2^{-1} mod q for gradient calculations of tangent lines
constexpr fq two_inv = fq(2).invert();

/**
 * @brief Compute \f$\Psi^{-1} \circ \phi_q \circ \Psi(Q)\f$ where \f$\Psi\f$ is the untwisting isomorphism and
 * \f$\phi_q\f$ is the Frobenius morphism.
 *
 * @param a
 * @return g2Projective
 */
inline constexpr g2Projective twisted_frobenius(const g2Projective& a)
{
    // We map a = [X : Y : Z] to its affine coordinates (X/Z, Y/Z) and then apply the Frobenius map to get
    // (\xi^{(q-1)/3} X^q/Z^q, \xi^{(q-1)/2} Y^q/Z^q). We then homogeneize again to get
    // [\xi^{(q-1)/3} X^q : \xi^{(q-1)/2} Y^q : Z^q]
    fq2 T0 = a.x.frobenius_map();
    fq2 T1 = a.y.frobenius_map();

    return {
        fq2::frobenius_on_twisted_curve_x() * T0,
        fq2::frobenius_on_twisted_curve_y() * T1,
        a.z.frobenius_map(),
    };
}

constexpr void doubling_step_for_miller_loop(g2Projective& work_point, fq12::ell_coeffs& line)
{
    fq2 A = work_point.x * work_point.y.mul_by_fq(two_inv); // A = (X * Y) / 2
    fq2 B = work_point.y.sqr();                             // B = Y^2
    fq2 C = work_point.z.sqr();                             // C = Z^2
    fq2 D = fq2::twist_coeff_b() * C;                       // D = b' * C
    fq2 E = D + D + D;                                      // E = 3 * D
    fq2 F = E + E + E;                                      // F = 3 * E
    fq2 G = (B + F).mul_by_fq(two_inv);                     // G = (B + F) / 2
    fq2 H = (work_point.y + work_point.z).sqr() - B - C;    // H = (Y + Z)^2 - B - C
    fq2 I = work_point.x.sqr();                             // I = X^2
    fq2 J = E.sqr();                                        // J = E^2

    line.o = H;
    line.w = I + I + I;
    line.vw = E - B;

    work_point.x = A * (B - F);
    work_point.y = G.sqr() - (J + J + J);
    work_point.z = B * H;
}

constexpr void mixed_addition_step_for_miller_loop(const g2Projective& Q,
                                                   g2Projective& work_point,
                                                   fq12::ell_coeffs& line)
{
    fq2 A = Q.y * work_point.z;         // A = Y2 * Z
    fq2 B = Q.x * work_point.z;         // B = X2 * Z
    fq2 theta = work_point.y - A;       // theta = Y - A
    fq2 lambda = work_point.x - B;      // lambda = X - B
    fq2 C = theta.sqr();                // C = theta^2
    fq2 D = lambda.sqr();               // D = lambda^2
    fq2 E = lambda * D;                 // E = lambda * D
    fq2 F = work_point.z * C;           // F = Z * C
    fq2 G = work_point.x * D;           // G = X * D
    fq2 H = E + F - G - G;              // H = E + F - 2 * G
    fq2 I = work_point.y * E;           // I = Y * E
    fq2 J = theta * Q.x - lambda * Q.y; // J = theta * X2 - lambda * Y2

    work_point.x = lambda * H;          // X3 = lambda * H
    work_point.y = theta * (G - H) - I; // Y3 = theta * (G - H) - I
    work_point.z = work_point.z * E;    // Z3 = Z * E

    line.o = lambda;
    line.w = theta;
    line.vw = J;
}

constexpr void precompute_miller_lines(const g2Projective& Q, miller_lines& lines)
{
    g2Projective Q_neg{ Q.x, -Q.y, Q.z };
    g2Projective work_point = Q;

    size_t it = 0;
    for (unsigned char loop_bit : loop_bits) {
        doubling_step_for_miller_loop(work_point, lines.lines[it]);
        ++it;
        if (loop_bit == 1) {
            mixed_addition_step_for_miller_loop(Q, work_point, lines.lines[it]);
            ++it;
        } else if (loop_bit == 3) {
            mixed_addition_step_for_miller_loop(Q_neg, work_point, lines.lines[it]);
            ++it;
        }
    }

    g2Projective Q1 = twisted_frobenius(Q);
    g2Projective Q2 = twisted_frobenius(Q1);
    Q2.y = -Q2.y;
    mixed_addition_step_for_miller_loop(Q1, work_point, lines.lines[it]);
    ++it;
    mixed_addition_step_for_miller_loop(Q2, work_point, lines.lines[it]);
}

constexpr void precompute_miller_lines(const g2::element& Q, miller_lines& lines)
{
    if (Q.is_point_at_infinity()) {
        throw_or_abort("precompute_miller_lines: Cannot precompute Miller lines for the point at infinity.");
    }
    precompute_miller_lines(g2Projective{ Q.x, Q.y, Q.z }, lines);
}

constexpr fq12 miller_loop(const g1::affine_element& P, const miller_lines& lines)
{
    fq12 work_scalar = fq12::one();
    fq minus_y_P = -P.y;
    fq minus_x_P = -P.x;

    size_t it = 0;
    fq12::ell_coeffs work_line;

    for (unsigned char loop_bit : loop_bits) {
        work_scalar = work_scalar.sqr();

        work_line.o = lines.lines[it].o.mul_by_fq(minus_y_P);
        work_line.w = lines.lines[it].w.mul_by_fq(P.x);
        work_line.vw = lines.lines[it].vw;
        work_scalar.self_sparse_mul(work_line);
        ++it;

        if (loop_bit != 0) {
            work_line.o = lines.lines[it].o.mul_by_fq(P.y);
            work_line.w = lines.lines[it].w.mul_by_fq(minus_x_P);
            work_line.vw = lines.lines[it].vw;
            work_scalar.self_sparse_mul(work_line);
            ++it;
        }
    }

    work_line.o = lines.lines[it].o.mul_by_fq(P.y);
    work_line.w = lines.lines[it].w.mul_by_fq(minus_x_P);
    work_line.vw = lines.lines[it].vw;
    work_scalar.self_sparse_mul(work_line);
    ++it;
    work_line.o = lines.lines[it].o.mul_by_fq(P.y);
    work_line.w = lines.lines[it].w.mul_by_fq(minus_x_P);
    work_line.vw = lines.lines[it].vw;
    work_scalar.self_sparse_mul(work_line);
    ++it;

    return work_scalar;
}

constexpr fq12 miller_loop_batch(const g1::affine_element* points, const miller_lines* lines, size_t num_pairs)
{
    fq12 work_scalar = fq12::one();

    size_t it = 0;
    fq12::ell_coeffs work_line;

    for (unsigned char loop_bit : loop_bits) {
        work_scalar = work_scalar.sqr();
        for (size_t j = 0; j < num_pairs; ++j) {
            const auto& coeff = lines[j].lines[it];
            work_line.o = coeff.o.mul_by_fq(-points[j].y);
            work_line.w = coeff.w.mul_by_fq(points[j].x);
            work_line.vw = coeff.vw;
            work_scalar.self_sparse_mul(work_line);
        }
        ++it;
        if (loop_bit != 0) {
            for (size_t j = 0; j < num_pairs; ++j) {
                const auto& coeff = lines[j].lines[it];
                work_line.o = coeff.o.mul_by_fq(points[j].y);
                work_line.w = coeff.w.mul_by_fq(-points[j].x);
                work_line.vw = coeff.vw;
                work_scalar.self_sparse_mul(work_line);
            }
            ++it;
        }
    }

    for (size_t j = 0; j < num_pairs; ++j) {
        const auto& coeff = lines[j].lines[it];
        work_line.o = coeff.o.mul_by_fq(points[j].y);
        work_line.w = coeff.w.mul_by_fq(-points[j].x);
        work_line.vw = coeff.vw;
        work_scalar.self_sparse_mul(work_line);
    }
    ++it;
    for (size_t j = 0; j < num_pairs; ++j) {
        const auto& coeff = lines[j].lines[it];
        work_line.o = coeff.o.mul_by_fq(points[j].y);
        work_line.w = coeff.w.mul_by_fq(-points[j].x);
        work_line.vw = coeff.vw;
        work_scalar.self_sparse_mul(work_line);
    }
    ++it;
    return work_scalar;
}

constexpr fq12 final_exponentiation_easy_part(const fq12& elt)
{
    fq12 a{ elt.c0, -elt.c1 };        // Conjugate of elt = elt^{q^6}
    a *= elt.invert();                // elt^{q^6 - 1}
    return a * a.frobenius_map_two(); // elt^{(q^6 - 1)(q^2 + 1)}
}

constexpr fq12 final_exponentiation_exp_by_z(const fq12& elt)
{
    fq12 r = elt;

    for (bool z_loop_bit : z_loop_bits) {
        r = r.cyclotomic_squared();
        if (z_loop_bit) {
            r *= elt;
        }
    }
    return r;
}

constexpr fq12 final_exponentiation_tricky_part(const fq12& elt)
{
    // We only keep count of the exponents on the right
    fq12 A = final_exponentiation_exp_by_z(elt); // z
    fq12 B = A.cyclotomic_squared();             // 2z
    fq12 C = B.cyclotomic_squared();             // 4z
    fq12 D = B * C;                              // 6z
    fq12 E = final_exponentiation_exp_by_z(D);   // 6z^2
    fq12 F = E.cyclotomic_squared();             // 12z^2
    fq12 G = final_exponentiation_exp_by_z(F);   // 12z^3
    fq12 J = G * E;                              // G * E = 12z^3 + 6z^2
    fq12 K = J * D;                              // J * D = 12z^3 + 6z^2 + 6z = \mu_2
    fq12 L = J * C;                              // J * C = 12z^3 + 6z^2 + 4z = \mu_1
    fq12 M = K * E;                              // K * E = 12z^3 + 12z^2 + 6z
    fq12 N = M * elt;                            // M * elt = 12z^3 + 12z^2 + 6z + 1 = \mu_0
    fq12 O = L * elt.unitary_inverse();          // L * elt^{-1} = 12z^3 + 6z^2 + 4z - 1 = \mu_3
    fq12 P = L.frobenius_map_one();              // \mu_1 * q
    fq12 Q = K.frobenius_map_two();              // \mu_2 * q^2
    fq12 R = O.frobenius_map_three();            // \mu_3 * q^3
    fq12 S = N * P;                              // \mu_0 + \mu_1 * q
    fq12 T = S * Q;                              // \mu_0 + \mu_1 * q + \mu_2 * q^2

    return T * R; // \mu_0 + \mu_1 * q + \mu_2 * q^2 + \mu_3 * q^3
}

constexpr fq12 reduced_ate_pairing(const g1::affine_element& P_affine, const g2::affine_element& Q_affine)
{
    if (!P_affine.on_curve()) {
        throw_or_abort("reduced_ate_pairing: P is not on the curve.");
    }

    if (!Q_affine.on_curve()) {
        throw_or_abort("reduced_ate_pairing: Q is not on the curve.");
    }

    // Early exit condition: e(P, Q) = 1 if either P or Q are the point at infinity
    if (Q_affine.is_point_at_infinity() || P_affine.is_point_at_infinity()) {
        return fq12::one();
    }

    g2Projective Q{ Q_affine.x, Q_affine.y, fq2::one() };

    miller_lines lines;
    precompute_miller_lines(Q, lines);

    fq12 result = miller_loop(P_affine, lines);
    result = final_exponentiation_easy_part(result);
    result = final_exponentiation_tricky_part(result);
    return result;
}

fq12 reduced_ate_pairing_batch_precomputed(const g1::affine_element* P_affines,
                                           const miller_lines* lines,
                                           const size_t num_points)
{
    bool has_infinity_point = false;
    for (size_t i = 0; i < num_points; ++i) {
        if (!P_affines[i].on_curve()) {
            bb::assert_failure("reduced_ate_pairing_batch_precomputed: one of the points is not on the curve.");
        }
        // A G1 point at infinity contributes e(P_i, Q_i) = 1 to the product, so it must be excluded from the
        // Miller loop rather than fed in as a regular point (on_curve() returns true for the point at infinity).
        if (P_affines[i].is_point_at_infinity()) {
            has_infinity_point = true;
        }
    }

    if (!has_infinity_point) {
        fq12 result = miller_loop_batch(P_affines, lines, num_points);
        result = final_exponentiation_easy_part(result);
        result = final_exponentiation_tricky_part(result);
        return result;
    }

    // Drop the infinity points along with their precomputed lines so the two arrays stay index-aligned.
    std::vector<g1::affine_element> filtered_points;
    std::vector<miller_lines> filtered_lines;
    filtered_points.reserve(num_points);
    filtered_lines.reserve(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        if (!P_affines[i].is_point_at_infinity()) {
            filtered_points.emplace_back(P_affines[i]);
            filtered_lines.emplace_back(lines[i]);
        }
    }

    if (filtered_points.empty()) {
        return fq12::one();
    }

    fq12 result = miller_loop_batch(filtered_points.data(), filtered_lines.data(), filtered_points.size());
    result = final_exponentiation_easy_part(result);
    result = final_exponentiation_tricky_part(result);
    return result;
}

fq12 reduced_ate_pairing_batch(const g1::affine_element* P_affines,
                               const g2::affine_element* Q_affines,
                               const size_t num_points)
{
    std::vector<miller_lines> lines;
    lines.reserve(num_points);

    bool has_infinity_pair = false;
    for (size_t i = 0; i < num_points; ++i) {
        if (!P_affines[i].on_curve()) {
            bb::assert_failure("reduced_ate_pairing_batch: one of the P points is not on the curve.");
        }
        if (!Q_affines[i].on_curve()) {
            bb::assert_failure("reduced_ate_pairing_batch: one of the Q points is not on the curve.");
        }

        // If either P_i or Q_i is the point at infinity, then e(P_i, Q_i) = 1, so we can skip the calculation of
        // that pairing
        if (!P_affines[i].is_point_at_infinity() && !Q_affines[i].is_point_at_infinity()) {
            lines.emplace_back(miller_lines{});
            precompute_miller_lines(g2Projective{ Q_affines[i].x, Q_affines[i].y, fq2::one() }, lines.back());
        } else {
            has_infinity_pair = true;
        }
    }

    if (lines.empty()) {
        return fq12::one();
    }

    if (!has_infinity_pair) {
        fq12 result = miller_loop_batch(P_affines, lines.data(), num_points);
        result = final_exponentiation_easy_part(result);
        result = final_exponentiation_tricky_part(result);
        return result;
    }

    std::vector<g1::affine_element> filtered_points;
    filtered_points.reserve(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        if (!P_affines[i].is_point_at_infinity() && !Q_affines[i].is_point_at_infinity()) {
            filtered_points.emplace_back(P_affines[i]);
        }
    }

    fq12 result = miller_loop_batch(filtered_points.data(), lines.data(), filtered_points.size());
    result = final_exponentiation_easy_part(result);
    result = final_exponentiation_tricky_part(result);
    return result;
}

} // namespace bb::pairing
