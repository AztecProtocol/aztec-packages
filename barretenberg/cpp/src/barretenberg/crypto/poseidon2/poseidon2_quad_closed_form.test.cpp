// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
//
// Equivalence test: closed-form 4-round propagation vs. step iteration.
//
// The K=4 compressed Poseidon2 internal-round relation currently computes (out_0..out_3) from
// (w_l, w_r, w_o, w_4, q_l..q_4) via:
//   1) S-boxes  u_k = (w_k + q_k)^5  for k = 0..3
//   2) Vandermonde RHS  b_1, b_2, b_3  (linear in w_r, w_o, w_4 and u_0, u_1, u_2)
//   3) Lagrange solve   s_j^{(0)} = α_j^(1) b_1 + α_j^(2) b_2 + α_j^(3) b_3
//   4) Four step iterations of the internal-MDS update on (s_1, s_2, s_3)
//   5) out_0 = D_1 u_3 + T_3,  out_{1,2,3} = state[1..3] at round 4
//
// Steps 2..5 are linear in (w_r, w_o, w_4, u_0..u_3) (everything is linear once the four S-boxes
// are taken as opaque inputs). They can be folded into a single linear map with constexpr coefs.
// This test verifies that the closed-form coefficients (computed at runtime here, lifted to
// constexpr in the relation header once verified) agree with the step iteration on random inputs.

#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <gtest/gtest.h>

namespace {

using FF = bb::fr;
using QuadParams = bb::crypto::Poseidon2QuadBn254Params;

struct Out {
    FF out_0, out_1, out_2, out_3;
};

// Reference: same body as Poseidon2QuadInternalRelationImpl::accumulate, evaluated
// in plain field arithmetic.
Out reference_step_iter(FF s1, FF s2, FF s3, FF u0, FF u1, FF u2, FF u3)
{
    auto step = [](FF& x1, FF& x2, FF& x3, const FF& u) {
        FF sum = x1 + x2 + x3;
        FF t = u + sum;
        FF n1 = t + x1 * (QuadParams::D2 - FF(1));
        FF n2 = t + x2 * (QuadParams::D3 - FF(1));
        FF n3 = t + x3 * (QuadParams::D4 - FF(1));
        x1 = n1;
        x2 = n2;
        x3 = n3;
    };
    step(s1, s2, s3, u0);
    step(s1, s2, s3, u1);
    step(s1, s2, s3, u2);
    FF T_3 = s1 + s2 + s3;
    FF out_0 = u3 * QuadParams::D1 + T_3;
    step(s1, s2, s3, u3);
    return { out_0, s1, s2, s3 };
}

// 3x3 helpers
struct Mat3 {
    FF m[3][3];
};
struct Vec3 {
    FF v[3];
};

Mat3 mm(const Mat3& a, const Mat3& b)
{
    Mat3 r{};
    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            FF s = FF(0);
            for (int k = 0; k < 3; ++k)
                s += a.m[i][k] * b.m[k][j];
            r.m[i][j] = s;
        }
    }
    return r;
}
Vec3 mv(const Mat3& a, const Vec3& v)
{
    Vec3 r{};
    for (int i = 0; i < 3; ++i) {
        FF s = FF(0);
        for (int k = 0; k < 3; ++k)
            s += a.m[i][k] * v.v[k];
        r.v[i] = s;
    }
    return r;
}

// Closed-form coefficients packed as four 7-tuples (one per output).
// Order within each tuple: (w_r, w_o, w_4, u_0, u_1, u_2, u_3).
struct Coefs {
    FF c[4][7];
};

Coefs compute_coefs()
{
    const FF D1 = QuadParams::D1;
    const FF D2 = QuadParams::D2;
    const FF D3 = QuadParams::D3;
    const FF D4 = QuadParams::D4;
    const FF S = QuadParams::SIGMA;

    // A: 3x3 matrix acting on (s_1, s_2, s_3) inside the internal round.
    //   step(v, u) = A v + u·1
    Mat3 A{ { { D2, FF(1), FF(1) }, { FF(1), D3, FF(1) }, { FF(1), FF(1), D4 } } };
    Mat3 A2 = mm(A, A);
    Mat3 A3 = mm(A2, A);
    Mat3 A4 = mm(A3, A);

    Vec3 ones{ { FF(1), FF(1), FF(1) } };
    Vec3 A_1 = mv(A, ones);
    Vec3 A2_1 = mv(A2, ones);
    Vec3 A3_1 = mv(A3, ones);

    // V_inv (rows = α_j^(*) — Lagrange coefficients of the inverse Vandermonde).
    Mat3 V_inv{ { { QuadParams::alpha_1_1, QuadParams::alpha_1_2, QuadParams::alpha_1_3 },
                  { QuadParams::alpha_2_1, QuadParams::alpha_2_2, QuadParams::alpha_2_3 },
                  { QuadParams::alpha_3_1, QuadParams::alpha_3_2, QuadParams::alpha_3_3 } } };
    Mat3 M = mm(A4, V_inv); // (A^4 V^{-1}) — maps b → b-part of out at round 4

    // B_w: rows are w-coefs of b_k.
    //   b_1 =                      w_r
    //   b_2 =       -2 w_r + w_o
    //   b_3 = -(S+2) w_r -    w_o + w_4
    Mat3 B_w{ { { FF(1), FF(0), FF(0) }, { -FF(2), FF(1), FF(0) }, { -(S + FF(2)), -FF(1), FF(1) } } };

    // B_u: rows are (u_0, u_1, u_2)-coefs of b_k.
    //   b_1: -D_1 u_0
    //   b_2: (2 D_1 - 3) u_0 - D_1 u_1
    //   b_3: ((S+2) D_1 - S - 3) u_0 + (D_1 - 3) u_1 - D_1 u_2
    Mat3 B_u{
        { { -D1, FF(0), FF(0) }, { FF(2) * D1 - FF(3), -D1, FF(0) }, { (S + FF(2)) * D1 - S - FF(3), D1 - FF(3), -D1 } }
    };

    // M_w: w-coefs of out_{1,2,3} = M · B_w
    Mat3 M_w = mm(M, B_w);
    // M_u: u_{0,1,2}-coefs of out_{1,2,3} = M · B_u + diag-shifted (A^k · 1) inhomogeneous part
    Mat3 MBu = mm(M, B_u);
    Mat3 M_u{};
    for (int j = 0; j < 3; ++j) {
        M_u.m[j][0] = MBu.m[j][0] + A3_1.v[j];
        M_u.m[j][1] = MBu.m[j][1] + A2_1.v[j];
        M_u.m[j][2] = MBu.m[j][2] + A_1.v[j];
    }

    // T_3 = (1^T A^3) V^{-1} b + (1^T A^2 · 1) u_0 + (1^T A · 1) u_1 + 3 u_2
    FF row_sum_A3[3] = { A3.m[0][0] + A3.m[1][0] + A3.m[2][0],
                         A3.m[0][1] + A3.m[1][1] + A3.m[2][1],
                         A3.m[0][2] + A3.m[1][2] + A3.m[2][2] };
    FF q_T3[3];
    for (int i = 0; i < 3; ++i) {
        q_T3[i] = FF(0);
        for (int k = 0; k < 3; ++k)
            q_T3[i] += row_sum_A3[k] * V_inv.m[k][i];
    }
    // T3_w = q_T3 · B_w  (1x3 · 3x3 = 1x3)
    FF T3_w[3] = { FF(0), FF(0), FF(0) };
    for (int i = 0; i < 3; ++i)
        for (int k = 0; k < 3; ++k)
            T3_w[i] += q_T3[k] * B_w.m[k][i];
    // T3_u_b_part = q_T3 · B_u
    FF T3_u_b[3] = { FF(0), FF(0), FF(0) };
    for (int i = 0; i < 3; ++i)
        for (int k = 0; k < 3; ++k)
            T3_u_b[i] += q_T3[k] * B_u.m[k][i];
    // T_3 inhomogeneous u contribution: (Σ A²·1) u_0 + (Σ A·1) u_1 + 3 u_2
    FF sum_A2_1 = A2_1.v[0] + A2_1.v[1] + A2_1.v[2];
    FF sum_A_1 = A_1.v[0] + A_1.v[1] + A_1.v[2];
    FF T3_u[3] = { T3_u_b[0] + sum_A2_1, T3_u_b[1] + sum_A_1, T3_u_b[2] + FF(3) };

    Coefs c{};
    // out_0 = D_1 u_3 + T_3
    c.c[0][0] = T3_w[0];
    c.c[0][1] = T3_w[1];
    c.c[0][2] = T3_w[2];
    c.c[0][3] = T3_u[0];
    c.c[0][4] = T3_u[1];
    c.c[0][5] = T3_u[2];
    c.c[0][6] = D1;
    // out_j (j=1,2,3): u_3 coef is 1
    for (int j = 0; j < 3; ++j) {
        c.c[j + 1][0] = M_w.m[j][0];
        c.c[j + 1][1] = M_w.m[j][1];
        c.c[j + 1][2] = M_w.m[j][2];
        c.c[j + 1][3] = M_u.m[j][0];
        c.c[j + 1][4] = M_u.m[j][1];
        c.c[j + 1][5] = M_u.m[j][2];
        c.c[j + 1][6] = FF(1);
    }
    return c;
}

Out closed_form(FF w_r, FF w_o, FF w_4, FF u0, FF u1, FF u2, FF u3, const Coefs& c)
{
    auto eval = [&](int row) {
        return c.c[row][0] * w_r + c.c[row][1] * w_o + c.c[row][2] * w_4 + c.c[row][3] * u0 + c.c[row][4] * u1 +
               c.c[row][5] * u2 + c.c[row][6] * u3;
    };
    return { eval(0), eval(1), eval(2), eval(3) };
}

} // namespace

TEST(Poseidon2QuadClosedForm, HeaderTableMatchesRuntimeReference)
{
    auto local = compute_coefs();
    for (size_t row = 0; row < 4; ++row) {
        for (size_t col = 0; col < 7; ++col) {
            EXPECT_EQ(local.c[row][col], QuadParams::tables.closed_form[row][col]) << "row " << row << " col " << col;
        }
    }
}

TEST(Poseidon2QuadClosedForm, ForwardVandermondeLhsMatchesWeightedSum)
{
    // Sanity: each forward-Vandermonde LHS row should equal the weighted sum of the
    // out_1, out_2, out_3 closed-form rows.
    const std::array<std::array<FF, 3>, 3> weights = {
        { { FF(1), FF(1), FF(1) },
          { QuadParams::D2, QuadParams::D3, QuadParams::D4 },
          { QuadParams::D2 * QuadParams::D2, QuadParams::D3 * QuadParams::D3, QuadParams::D4 * QuadParams::D4 } }
    };
    for (size_t k = 0; k < 3; ++k) {
        for (size_t i = 0; i < 7; ++i) {
            FF expected = weights[k][0] * QuadParams::tables.closed_form[1][i] +
                          weights[k][1] * QuadParams::tables.closed_form[2][i] +
                          weights[k][2] * QuadParams::tables.closed_form[3][i];
            EXPECT_EQ(QuadParams::tables.forward_vandermonde_lhs[k][i], expected) << "row " << k << " col " << i;
        }
    }
}

TEST(Poseidon2QuadClosedForm, MatchesStepIteration)
{
    auto coefs = compute_coefs();

    for (int trial = 0; trial < 100; ++trial) {
        FF w_r = FF::random_element();
        FF w_o = FF::random_element();
        FF w_4 = FF::random_element();
        FF u0 = FF::random_element();
        FF u1 = FF::random_element();
        FF u2 = FF::random_element();
        FF u3 = FF::random_element();

        // Reference path: derive (s_1^{(0)}, s_2^{(0)}, s_3^{(0)}) from (w_*, u_*) via
        // the b_k formulas + Lagrange solve, then iterate steps. Mirrors what the
        // current relation does inside its accumulate body.
        const FF D1 = QuadParams::D1;
        const FF S = QuadParams::SIGMA;
        FF b_1 = w_r - D1 * u0;
        FF b_2 = -FF(2) * w_r + w_o + (FF(2) * D1 - FF(3)) * u0 - D1 * u1;
        FF b_3 = -(S + FF(2)) * w_r - w_o + w_4 + ((S + FF(2)) * D1 - S - FF(3)) * u0 + (D1 - FF(3)) * u1 - D1 * u2;
        FF s1 = QuadParams::alpha_1_1 * b_1 + QuadParams::alpha_1_2 * b_2 + QuadParams::alpha_1_3 * b_3;
        FF s2 = QuadParams::alpha_2_1 * b_1 + QuadParams::alpha_2_2 * b_2 + QuadParams::alpha_2_3 * b_3;
        FF s3 = QuadParams::alpha_3_1 * b_1 + QuadParams::alpha_3_2 * b_2 + QuadParams::alpha_3_3 * b_3;

        Out ref = reference_step_iter(s1, s2, s3, u0, u1, u2, u3);
        Out cf = closed_form(w_r, w_o, w_4, u0, u1, u2, u3, coefs);

        EXPECT_EQ(ref.out_0, cf.out_0) << "trial " << trial;
        EXPECT_EQ(ref.out_1, cf.out_1) << "trial " << trial;
        EXPECT_EQ(ref.out_2, cf.out_2) << "trial " << trial;
        EXPECT_EQ(ref.out_3, cf.out_3) << "trial " << trial;
    }
}
