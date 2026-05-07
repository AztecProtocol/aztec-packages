// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "../../fields/field6.hpp"
#include "./fq.hpp"
#include "./fq2.hpp"

namespace bb {

/**
 * @brief Sextic extension of the base field of BN254
 *
 * @details Fq6 is defined as Fq2[v] / (v^3 - \xi), where \xi = 9 + u is not a cubic residue in Fq2. We store in the
 * struct the coefficients to compute the frobenius morphism (we need powers up to q^3 to compute the final
 * exponentiation in the pairing calculation)
 * 1. Power q
 * \f[
 *  (a + bv + cv^2)^q = a^q + b^q * v^q + c^q * v^{2q} = a^q + b^q * \xi^{(q-1)/3} * v + c^q * \xi^{2(q-1)/3} * v^2
 * \f]
 * 2. Power q^2
 * \f[
 *  (a + bv + cv^2)^{q^2} = a^{q^2} + b^{q^2} * v^{q^2} + c^{q^2} * v^{2q^2} =
 *                                  a + b * \xi^{(q^2-1)/3} * v + c * \xi^{2(q^2-1)/3} * v^2
 * \f]
 * 3. Power q^3
 * \f[
 *  (a + bv + cv^2)^{q^3} = a^{q^3} + b^{q^3} * v^{q^3} + c^{q^3} * v^{2q^3} =
 *                                  a^q + b^q * \xi^{(q^3-1)/3} * v + c^q * \xi^{2(q^3-1)/3} * v^2
 * \f]
 *
 */
struct Bn254Fq6Params {

    static constexpr fq2 frobenius_coeffs_c1_1{
        { 0xb5773b104563ab30UL, 0x347f91c8a9aa6454UL, 0x7a007127242e0991UL, 0x1956bcd8118214ecUL },
        { 0x6e849f1ea0aa4757UL, 0xaa1c7b6d89f89141UL, 0xb6e713cdfae0ca3aUL, 0x26694fbb4e82ebc3UL }
    };

    static constexpr fq2 frobenius_coeffs_c1_2{
        { 0x3350c88e13e80b9cUL, 0x7dce557cdb5e56b9UL, 0x6001b4b8b615564aUL, 0x2682e617020217e0UL },
        { 0UL, 0UL, 0UL, 0UL }
    };

    static constexpr fq2 frobenius_coeffs_c1_3{
        { 0xc9af22f716ad6badUL, 0xb311782a4aa662b2UL, 0x19eeaf64e248c7f4UL, 0x20273e77e3439f82UL },
        { 0xacc02860f7ce93acUL, 0x3933d5817ba76b4cUL, 0x69e6188b446c8467UL, 0x0a46036d4417cc55UL }
    };

    static constexpr fq2 frobenius_coeffs_c2_1{
        { 0x7361d77f843abe92UL, 0xa5bb2bd3273411fbUL, 0x9c941f314b3e2399UL, 0x15df9cddbb9fd3ecUL },
        { 0x5dddfd154bd8c949UL, 0x62cb29a5a4445b60UL, 0x37bc870a0c7dd2b9UL, 0x24830a9d3171f0fdUL }
    };

    static constexpr fq2 frobenius_coeffs_c2_2{
        { 0x71930c11d782e155UL, 0xa6bb947cffbe3323UL, 0xaa303344d4741444UL, 0x2c3b3f0d26594943UL },
        { 0UL, 0UL, 0UL, 0UL }
    };

    static constexpr fq2 frobenius_coeffs_c2_3{
        { 0x448a93a57b6762dfUL, 0xbfd62df528fdeadfUL, 0xd858f5d00e9bd47aUL, 0x06b03d4d3476ec58UL },
        { 0x2b19daf4bcc936d1UL, 0xa1a54e7a56f4299fUL, 0xb533eee05adeaef1UL, 0x170c812b84dda0b2UL }
    };

    static inline constexpr fq2 mul_by_non_residue(const fq2& a)
    {
        // non_residue = 9 + u
        // (a + bu) * (9 + u) = (9a - b) + (9b + a)u

        // 9a
        fq T0 = a.c0 + a.c0;
        T0 += T0;
        T0 += T0;
        T0 += a.c0;

        // 9b
        fq T1 = a.c1 + a.c1;
        T1 += T1;
        T1 += T1;
        T1 += a.c1;

        return { T0 - a.c1, T1 + a.c0 };
    }
};

using fq6 = field6<fq2, Bn254Fq6Params>;
} // namespace bb
