// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "./fq12.hpp"
#include "./g1.hpp"
#include "./g2.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"

namespace bb::pairing {

// Precompute 2^{-1} mod q for gradient calculations of tangent lines
constexpr fq two_inv = fq(2).invert();

/**
 * @brief Compute \f$\Psi^{-1} \circ \phi_q \circ \Psi(Q)\f$ where \f$\Psi\f$ is the untwisting isomorphism and
 * \f$\phi_q\f$ is the Frobenius morphism.
 *
 * @param a
 * @return g2::element
 */
inline constexpr g2::element frobenius(const g2::element& a)
{
    // We map a = [X : Y : Z] to its affine coordinates (X/Z, Y/Z) and then apply the Frobenius map to get
    // (\xi^{(q-1)/3} X^q/Z^q, \xi^{(q-1)/2} Y^q/Z^q). We then homogeneize again to get
    // [\xi^{(q-1)/3} X^q :, \xi^{(q-1)/2} Y^q : Z^q]
    fq2 T0 = a.x.frobenius_map();
    fq2 T1 = a.y.frobenius_map();

    return {
        fq2::frobenius_on_twisted_curve_x() * T0,
        fq2::frobenius_on_twisted_curve_y() * T1,
        a.z.frobenius_map(),
    };
}
constexpr void doubling_step_for_flipped_miller_loop(g2::element& current, fq12::ell_coeffs& ell)
{
    // a = x / (2y)
    fq2 a = current.x.mul_by_fq(two_inv);
    a *= current.y;

    // b = y^2
    fq2 b = current.y.sqr();
    // c = z^2
    fq2 c = current.z.sqr();
    // d = 3 * z^2
    fq2 d = c + c;
    d += c;
    // e = 3 * z^2 * twist_coeff_b
    fq2 e = d * fq2::twist_coeff_b();
    // f = 9 * z^2 * twist_coeff_b
    fq2 f = e + e;
    f += e;

    // g = y^2 + 9 * z^2 * twist_coeff_b
    fq2 g = b + f;
    // g = (y^2 + 9 * z^2 * twist_coeff_b) / 2
    g = g.mul_by_fq(two_inv);
    // h = (y + z)^2
    fq2 h = current.y + current.z;
    h = h.sqr();
    // i = y^2 + z^2
    fq2 i = b + c;
    // h = ((y + z)^2 - (y^2 + z^2)) = 2yz
    h -= i;
    // i = 3 * z^2 * twist_coeff_b - y^2
    i = e - b;
    // j = x^2
    fq2 j = current.x.sqr();
    // ee = 9 * z^4 * twist_coeff_b^2
    fq2 ee = e.sqr();
    // k = y^2 - 9 * z^2 * twist_coeff_b
    fq2 k = b - f;
    // current.x = (y^2 - 9 * z^2 * twist_coeff_b) * x / (2y)
    current.x = a * k;

    // k = 27 z^4 * twist_coeff_b^2
    k = ee + ee;
    k += ee;

    // c = [(y^2 + 9 * z^2 * twist_coeff_b) / 2]^2
    c = g.sqr();
    // y = [(y^2 + 9 * z^2 * twist_coeff_b) / 2]^2 - 27 * z^4 * twist_coeff_b^2
    current.y = c - k;
    // z = y^2 * 2yz
    current.z = b * h;

    ell.o = fq6::mul_by_non_residue(i);

    ell.vw = -h;
    ell.vv = j + j;
    ell.vv += j;
}

constexpr void mixed_addition_step_for_flipped_miller_loop(const g2::element& base,
                                                           g2::element& Q,
                                                           fq12::ell_coeffs& line)
{
    fq2 d = base.x * Q.z;
    d = Q.x - d;

    fq2 e = base.y * Q.z;
    e = Q.y - e;

    fq2 f = d.sqr();
    fq2 g = e.sqr();
    fq2 h = d * f;
    fq2 i = Q.x * f;

    fq2 j = Q.z * g;
    j += h;
    j -= i;
    j -= i;

    Q.x = d * j;
    i -= j;
    i *= e;
    j = Q.y * h;
    Q.y = i - j;
    Q.z *= h;

    h = e * base.x;
    i = d * base.y;

    h -= i;
    line.o = fq6::mul_by_non_residue(h);

    line.vv = -e;
    line.vw = d;
}

constexpr void precompute_miller_lines(const g2::element& Q, miller_lines& lines)
{
    // We should not compute Miller lines if Q is the point at infinity, e(P, Q) = 1 in this case
    if (Q.is_point_at_infinity()) {
        throw_or_abort("Computing Miller lines when Q is the point at infinity");
    }

    g2::element Q_neg{ Q.x, -Q.y, fq2::one() };
    g2::element work_point = Q;

    size_t it = 0;
    for (unsigned char loop_bit : loop_bits) {
        doubling_step_for_flipped_miller_loop(work_point, lines.lines[it]);
        ++it;
        if (loop_bit == 1) {
            mixed_addition_step_for_flipped_miller_loop(Q, work_point, lines.lines[it]);
            ++it;
        } else if (loop_bit == 3) {
            mixed_addition_step_for_flipped_miller_loop(Q_neg, work_point, lines.lines[it]);
            ++it;
        }
    }

    g2::element Q1 = frobenius(Q);
    g2::element Q2 = frobenius(Q1);
    Q2 = -Q2;
    mixed_addition_step_for_flipped_miller_loop(Q1, work_point, lines.lines[it]);
    ++it;
    mixed_addition_step_for_flipped_miller_loop(Q2, work_point, lines.lines[it]);
}

constexpr fq12 miller_loop(g1::element& P, miller_lines& lines)
{
    fq12 work_scalar = fq12::one();

    size_t it = 0;
    fq12::ell_coeffs work_line;

    for (unsigned char loop_bit : loop_bits) {
        work_scalar = work_scalar.sqr();

        work_line.o = lines.lines[it].o;
        work_line.vw = lines.lines[it].vw.mul_by_fq(P.y);
        work_line.vv = lines.lines[it].vv.mul_by_fq(P.x);
        work_scalar.self_sparse_mul(work_line);
        ++it;

        if (loop_bit != 0) {
            work_line.o = lines.lines[it].o;
            work_line.vw = lines.lines[it].vw.mul_by_fq(P.y);
            work_line.vv = lines.lines[it].vv.mul_by_fq(P.x);
            work_scalar.self_sparse_mul(work_line);
            ++it;
        }
    }

    work_line.o = lines.lines[it].o;
    work_line.vw = lines.lines[it].vw.mul_by_fq(P.y);
    work_line.vv = lines.lines[it].vv.mul_by_fq(P.x);
    work_scalar.self_sparse_mul(work_line);
    ++it;
    work_line.o = lines.lines[it].o;
    work_line.vw = lines.lines[it].vw.mul_by_fq(P.y);
    work_line.vv = lines.lines[it].vv.mul_by_fq(P.x);
    work_scalar.self_sparse_mul(work_line);
    ++it;
    return work_scalar;
}

constexpr fq12 miller_loop_batch(const g1::element* points, const miller_lines* lines, size_t num_pairs)
{
    fq12 work_scalar = fq12::one();

    size_t it = 0;
    fq12::ell_coeffs work_line;

    for (unsigned char loop_bit : loop_bits) {
        work_scalar = work_scalar.sqr();
        for (size_t j = 0; j < num_pairs; ++j) {
            work_line.o = lines[j].lines[it].o;
            work_line.vw = lines[j].lines[it].vw.mul_by_fq(points[j].y);
            work_line.vv = lines[j].lines[it].vv.mul_by_fq(points[j].x);
            work_scalar.self_sparse_mul(work_line);
        }
        ++it;
        if (loop_bit != 0) {
            for (size_t j = 0; j < num_pairs; ++j) {
                work_line.o = lines[j].lines[it].o;
                work_line.vw = lines[j].lines[it].vw.mul_by_fq(points[j].y);
                work_line.vv = lines[j].lines[it].vv.mul_by_fq(points[j].x);
                work_scalar.self_sparse_mul(work_line);
            }
            ++it;
        }
    }

    for (size_t j = 0; j < num_pairs; ++j) {
        work_line.o = lines[j].lines[it].o;
        work_line.vw = lines[j].lines[it].vw.mul_by_fq(points[j].y);
        work_line.vv = lines[j].lines[it].vv.mul_by_fq(points[j].x);
        work_scalar.self_sparse_mul(work_line);
    }
    ++it;
    for (size_t j = 0; j < num_pairs; ++j) {
        work_line.o = lines[j].lines[it].o;
        work_line.vw = lines[j].lines[it].vw.mul_by_fq(points[j].y);
        work_line.vv = lines[j].lines[it].vv.mul_by_fq(points[j].x);
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

    return T * R;
}

constexpr fq12 reduced_ate_pairing(const g1::affine_element& P_affine, const g2::affine_element& Q_affine)
{
    g1::element P(P_affine);
    g2::element Q(Q_affine);

    // Early exit condition: e(P, Q) = 1 if either P or Q are the point at infinity
    if (Q.is_point_at_infinity() || P.is_point_at_infinity()) {
        return fq12::one();
    }

    miller_lines lines;
    precompute_miller_lines(Q, lines);

    fq12 result = miller_loop(P, lines);
    result = final_exponentiation_easy_part(result);
    result = final_exponentiation_tricky_part(result);
    return result;
}

fq12 reduced_ate_pairing_batch_precomputed(const g1::affine_element* P_affines,
                                           const miller_lines* lines,
                                           const size_t num_points)
{
    std::vector<g1::element> P;
    P.reserve(num_points);

    // Remove pairs for which P = point at infinity, e(P, Q) = 1 in this case
    for (size_t i = 0; i < num_points; ++i) {
        if (!P_affines[i].is_point_at_infinity()) {
            P.emplace_back(g1::element(P_affines[i]));
        }
    }

    fq12 result = miller_loop_batch(&P[0], &lines[0], P.size());
    result = final_exponentiation_easy_part(result);
    result = final_exponentiation_tricky_part(result);
    return result;
}

fq12 reduced_ate_pairing_batch(const g1::affine_element* P_affines,
                               const g2::affine_element* Q_affines,
                               const size_t num_points)
{

    std::vector<g1::element> P;      // Vector of points P_i for which we compute e(P_i, Q_i)
    std::vector<g2::element> Q;      // Vector of points Q_i for which we compute e(P_i, Q_i)
    std::vector<miller_lines> lines; // i-th element are the Miller lines of Q_i

    P.reserve(num_points);
    Q.reserve(num_points);
    lines.reserve(num_points);

    size_t num_pairings = 0;
    for (size_t i = 0; i < num_points; ++i) {
        // If either P_i or Q_i is the point at infinity, then e(P_i, Q_i) = 1, so we can skip the calculation of
        // that pairing
        if (!P_affines[i].is_point_at_infinity() && !Q_affines[i].is_point_at_infinity()) {
            P.emplace_back(g1::element(P_affines[i]));
            Q.emplace_back(g2::element(Q_affines[i]));
            lines.emplace_back(miller_lines{});

            precompute_miller_lines(Q.back(), lines.back());

            num_pairings += 1;
        }
    }

    // If for every couple (P_i, Q_i) either P_i or Q_i is the point at infinity, then \prod e(P_i, Q_i) = 1
    if (P.empty()) {
        return fq12::one();
    }

    fq12 result = miller_loop_batch(&P[0], &lines[0], num_pairings);
    result = final_exponentiation_easy_part(result);
    result = final_exponentiation_tricky_part(result);
    return result;
}

} // namespace bb::pairing
