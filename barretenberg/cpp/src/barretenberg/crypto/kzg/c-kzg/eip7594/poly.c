/*
 * Copyright 2024 Benjamin Edgington
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "poly.h"
#include "common/alloc.h"
#include "common/ec.h"
#include "common/ret.h"
#include "common/utils.h"
#include "eip7594/fft.h"
#include "setup/settings.h"

#include <stdlib.h> /* For NULL */
#include <string.h> /* For memcpy */

/**
 * Shift a polynomial in place.
 *
 * Multiplies each coefficient by `shift_factor ^ i`. Equivalent to creating a polynomial that
 * evaluates at `x * shift_factor` rather than `x`.
 *
 * @param[in,out]   p               The polynomial coefficients to be scaled, length `len`
 * @param[in]       len             Length of the polynomial coefficients
 * @param[in]       shift_factor    Shift factor
 */
void shift_poly(fr_t *p, size_t len, const fr_t *shift_factor) {
    fr_t factor_power = FR_ONE;
    for (size_t i = 1; i < len; i++) {
        blst_fr_mul(&factor_power, &factor_power, shift_factor);
        blst_fr_mul(&p[i], &p[i], &factor_power);
    }
}

/**
 * Bit reverses and converts a polynomial in lagrange form to monomial form.
 *
 * @param[out]  monomial_out    The result, an array of `len` fields
 * @param[in]   lagrange        The input poly, an array of `len` fields
 * @param[in]   len             The length of both polynomials
 * @param[in]   s               The trusted setup
 *
 * @remark `monomial_out` and `lagrange` can point to the same memory.
 * @remark This method converts a lagrange-form polynomial to a monomial-form polynomial, by inverse
 * FFTing the bit-reverse-permuted lagrange polynomial.
 */
C_KZG_RET poly_lagrange_to_monomial(
    fr_t *monomial_out, const fr_t *lagrange, size_t len, const KZGSettings *s
) {
    C_KZG_RET ret;
    fr_t *lagrange_brp = NULL;

    /* Allocate space for the intermediate BRP poly */
    ret = new_fr_array(&lagrange_brp, len);
    if (ret != C_KZG_OK) goto out;

    /* Copy the values and perform a bit reverse permutation */
    memcpy(lagrange_brp, lagrange, sizeof(fr_t) * len);
    ret = bit_reversal_permutation(lagrange_brp, sizeof(fr_t), len);
    if (ret != C_KZG_OK) goto out;

    /* Perform an inverse FFT on the BRP'd polynomial */
    ret = fr_ifft(monomial_out, lagrange_brp, len, s);
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(lagrange_brp);
    return ret;
}
