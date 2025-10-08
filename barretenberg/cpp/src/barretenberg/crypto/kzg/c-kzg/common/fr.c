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

#include "common/fr.h"
#include "common/bytes.h"

#include <inttypes.h> /* For uint*_t */
#include <stdbool.h>  /* For bool */

/**
 * Test whether two field elements are equal.
 *
 * @param[in]   a   The first element
 * @param[in]   b   The second element
 *
 * @retval  true    The two elements are equal.
 * @retval  false   The two elements are not equal.
 */
bool fr_equal(const fr_t *a, const fr_t *b) {
    uint64_t _a[4], _b[4];
    blst_uint64_from_fr(_a, a);
    blst_uint64_from_fr(_b, b);
    return _a[0] == _b[0] && _a[1] == _b[1] && _a[2] == _b[2] && _a[3] == _b[3];
}

/**
 * Test whether the operand is one in the finite field.
 *
 * @param[in]   p   The field element to be checked
 *
 * @retval  true    The element is one
 * @retval  false   The element is not one
 */
bool fr_is_one(const fr_t *p) {
    uint64_t a[4];
    blst_uint64_from_fr(a, p);
    return a[0] == 1 && a[1] == 0 && a[2] == 0 && a[3] == 0;
}

/**
 * Test whether the operand is null (all 0xff's).
 *
 * @param[in]   p   The field element to be checked
 *
 * @retval  true    The element is null
 * @retval  false   The element is not null
 */
bool fr_is_null(const fr_t *p) {
    return fr_equal(p, &FR_NULL);
}

/**
 * Divide a field element by another.
 *
 * @param[out]  out The result, `a / b`
 * @param[in]   a   The dividend
 * @param[in]   b   The divisor
 *
 * @remark The behavior for `b == 0` is unspecified.
 * @remark This function supports in-place computation.
 */
void fr_div(fr_t *out, const fr_t *a, const fr_t *b) {
    fr_t tmp;
    blst_fr_eucl_inverse(&tmp, b);
    blst_fr_mul(out, a, &tmp);
}

/**
 * Exponentiation of a field element.
 *
 * Uses square and multiply for log(n) performance.
 *
 * @param[out]  out The result, `a**n`
 * @param[in]   a   The field element to be exponentiated
 * @param[in]   n   The exponent
 *
 * @remark A 64-bit exponent is sufficient for our needs here.
 * @remark This function does support in-place computation.
 */
void fr_pow(fr_t *out, const fr_t *a, uint64_t n) {
    fr_t tmp = *a;
    *out = FR_ONE;

    while (true) {
        if (n & 1) {
            blst_fr_mul(out, out, &tmp);
        }
        if ((n >>= 1) == 0) break;
        blst_fr_sqr(&tmp, &tmp);
    }
}

/**
 * Create a field element from a single 64-bit unsigned integer.
 *
 * @param[out]  out The field element equivalent of `n`
 * @param[in]   n   The 64-bit integer to be converted
 *
 * @remark This can only generate a tiny fraction of possible field elements,
 *         and is mostly useful for testing.
 */
void fr_from_uint64(fr_t *out, uint64_t n) {
    uint64_t vals[] = {n, 0, 0, 0};
    blst_fr_from_uint64(out, vals);
}

/**
 * Print a field element to the console.
 *
 * @param[in]   f   The field element to print
 */
void print_fr(const fr_t *f) {
    Bytes32 bytes;
    bytes_from_bls_field(&bytes, f);
    print_bytes32(&bytes);
}
