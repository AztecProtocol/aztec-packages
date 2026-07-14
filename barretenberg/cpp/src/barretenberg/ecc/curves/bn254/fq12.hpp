// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "../../fields/field12.hpp"
#include "./fq2.hpp"
#include "./fq6.hpp"

namespace bb {

/**
 * @brief The twelfth degree extension of the base field of BN254
 *
 * @details Fq12 is defined as Fq6[w] / (w^2 - v), where v is the variable added to Fq2 to construct Fq6. We store in
 * the struct the coefficients to compute the frobenius morphism (we need powers up to q^3 to compute the final
 * exponentiation in the pairing calculation)
 * 1. Power q
 * \f[
 *     (a + bw)^q = a^q + b^q * w^q = a^q + b^q * \xi^{(q-1)/6} * v
 * \f]
 * 2. Power q^2
 * \f[
 *     (a + bw)^{q^2} = a^{q^2} + b^{q^2} * w^{q^2} = a + b * \xi^{(q^2-1)/6} * v
 * \f]
 * 3. Power q^3
 * \f[
 *     (a + bw)^{q^3} = a^{q^3} + b^{q^3} * w^{q^3} = a^q + b^q * \xi^{(q^3-1)/6} * v
 * \f]
 *
 *
 */
struct Bn254Fq12Params {

    static constexpr fq2 frobenius_coefficients_1{
        { 0xaf9ba69633144907UL, 0xca6b1d7387afb78aUL, 0x11bded5ef08a2087UL, 0x02f34d751a1f3a7cUL },
        { 0xa222ae234c492d72UL, 0xd00f02a4565de15bUL, 0xdc2ff3a253dfc926UL, 0x10a75716b3899551UL }
    };

    static constexpr fq2 frobenius_coefficients_2{
        { 0xca8d800500fa1bf2UL, 0xf0c5d61468b39769UL, 0x0e201271ad0d4418UL, 0x04290f65bad856e6UL },
        { 0UL, 0UL, 0UL, 0UL }
    };

    static constexpr fq2 frobenius_coefficients_3{
        { 0x365316184e46d97dUL, 0x0af7129ed4c96d9fUL, 0x659da72fca1009b5UL, 0x08116d8983a20d23UL },
        { 0xb1df4af7c39c1939UL, 0x3d9f02878a73bf7fUL, 0x9b2220928caf0ae0UL, 0x26684515eff054a6UL }
    };
};

using fq12 = field12<fq2, fq6, Bn254Fq12Params>;
} // namespace bb
