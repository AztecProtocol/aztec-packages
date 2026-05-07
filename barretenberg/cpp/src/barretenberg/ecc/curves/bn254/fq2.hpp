// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "../../fields/field2.hpp"
#include "./fq.hpp"

namespace bb {

/**
 * @brief Quadratic extension of the base field of BN254
 *
 * @details The quadratic extension Fq2 is defined as Fq[u] / (u^2 + 1). Fq2 is the base field of
 * the twist of BN254, thus points in G2 have coordinates in Fq2.
 *
 * Inside this struct we define the parameters of the twist:
 * - the coefficient twist_b = 3 / (9 + u) defining the equation of the twist: y^2 = x^3 + twist_b. The coefficient is
 *   derived as b / \xi, where b = 3 is the coefficient of BN254 in short-Weierstrass form, and \xi = 9 + u is not a
 *   sixth residue in Fq2.
 * - the coefficients required to compute the frobenius map on the twisted curve: if \Psi : E' --> E is the isomorphism
 *   between the twist E' and the base curve E, then the frobenius map on E' is \Psi^{-1} \circ Frobenius \circ \Psi.
 *   This map is given by (x, y) --> (\xi^{(q-1)/3} * x^q, \xi^{(q-1)/2}} * y^q). We precompute the two powers of \xi
 *   and store them as frobenius_on_twisted_curve_x and frobenius_on_twisted_curve_y.
 */
struct Bn254Fq2Params {
    static constexpr fq twist_coeff_b_0{
        0x3bf938e377b802a8UL, 0x020b1b273633535dUL, 0x26b7edf049755260UL, 0x2514c6324384a86dUL
    };
    static constexpr fq twist_coeff_b_1{
        0x38e7ecccd1dcff67UL, 0x65f0b37d93ce0d3eUL, 0xd749d0dd22ac00aaUL, 0x0141b9ce4a688d4dUL
    };
    static constexpr fq frobenius_on_twisted_curve_x_0{
        0xb5773b104563ab30UL, 0x347f91c8a9aa6454UL, 0x7a007127242e0991UL, 0x1956bcd8118214ecUL
    };
    static constexpr fq frobenius_on_twisted_curve_x_1{
        0x6e849f1ea0aa4757UL, 0xaa1c7b6d89f89141UL, 0xb6e713cdfae0ca3aUL, 0x26694fbb4e82ebc3UL
    };
    static constexpr fq frobenius_on_twisted_curve_y_0{
        0xe4bbdd0c2936b629UL, 0xbb30f162e133bacbUL, 0x31a9d1b6f9645366UL, 0x253570bea500f8ddUL
    };
    static constexpr fq frobenius_on_twisted_curve_y_1{
        0xa1d77ce45ffe77c7UL, 0x07affd117826d1dbUL, 0x6d16bd27bb7edc6bUL, 0x2c87200285defeccUL
    };
};

using fq2 = field2<fq, Bn254Fq2Params>;
} // namespace bb
