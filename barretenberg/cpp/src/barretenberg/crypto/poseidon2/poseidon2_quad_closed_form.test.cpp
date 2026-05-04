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
// are taken as opaque inputs). They can be folded into a single linear map. This test verifies
// that the coefficient tables consumed by the relations agree with explicit step iteration on
// random inputs.

#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <array>
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

Out closed_form(FF w_r, FF w_o, FF w_4, FF u0, FF u1, FF u2, FF u3)
{
    const auto& table = QuadParams::tables.closed_form;
    auto eval = [&](size_t row) {
        return table[row][0] * w_r + table[row][1] * w_o + table[row][2] * w_4 + table[row][3] * u0 +
               table[row][4] * u1 + table[row][5] * u2 + table[row][6] * u3;
    };
    return { eval(0), eval(1), eval(2), eval(3) };
}

} // namespace

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
    for (int trial = 0; trial < 100; ++trial) {
        FF w_r = FF::random_element();
        FF w_o = FF::random_element();
        FF w_4 = FF::random_element();
        FF u0 = FF::random_element();
        FF u1 = FF::random_element();
        FF u2 = FF::random_element();
        FF u3 = FF::random_element();

        // Reference path: derive (s_1^{(0)}, s_2^{(0)}, s_3^{(0)}) from (w_*, u_*) via
        // the b_k formulas + Lagrange solve, then iterate the internal-MDS steps explicitly.
        const FF D1 = QuadParams::D1;
        const FF S = QuadParams::SIGMA;
        FF b_1 = w_r - D1 * u0;
        FF b_2 = -FF(2) * w_r + w_o + (FF(2) * D1 - FF(3)) * u0 - D1 * u1;
        FF b_3 = -(S + FF(2)) * w_r - w_o + w_4 + ((S + FF(2)) * D1 - S - FF(3)) * u0 + (D1 - FF(3)) * u1 - D1 * u2;
        FF s1 = QuadParams::alpha_1_1 * b_1 + QuadParams::alpha_1_2 * b_2 + QuadParams::alpha_1_3 * b_3;
        FF s2 = QuadParams::alpha_2_1 * b_1 + QuadParams::alpha_2_2 * b_2 + QuadParams::alpha_2_3 * b_3;
        FF s3 = QuadParams::alpha_3_1 * b_1 + QuadParams::alpha_3_2 * b_2 + QuadParams::alpha_3_3 * b_3;

        Out ref = reference_step_iter(s1, s2, s3, u0, u1, u2, u3);
        Out cf = closed_form(w_r, w_o, w_4, u0, u1, u2, u3);

        EXPECT_EQ(ref.out_0, cf.out_0) << "trial " << trial;
        EXPECT_EQ(ref.out_1, cf.out_1) << "trial " << trial;
        EXPECT_EQ(ref.out_2, cf.out_2) << "trial " << trial;
        EXPECT_EQ(ref.out_3, cf.out_3) << "trial " << trial;
    }
}
