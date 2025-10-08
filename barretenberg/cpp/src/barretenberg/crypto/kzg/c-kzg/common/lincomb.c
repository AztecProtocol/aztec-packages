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

#include "common/lincomb.h"
#include "common/alloc.h"

#include <stdlib.h> /* For NULL */

/**
 * Calculate a linear combination of G1 group elements.
 *
 * Calculates `[coeffs_0]p_0 + [coeffs_1]p_1 + ... + [coeffs_n]p_n` where `n` is `len - 1`.
 *
 * @param[out]  out     The resulting sum-product
 * @param[in]   p       Array of G1 group elements, length `len`
 * @param[in]   coeffs  Array of field elements, length `len`
 * @param[in]   len     The number of group/field elements
 *
 * @remark This function computes the result naively without using Pippenger's algorithm.
 */
void g1_lincomb_naive(g1_t *out, const g1_t *p, const fr_t *coeffs, size_t len) {
    g1_t tmp;
    *out = G1_IDENTITY;
    for (size_t i = 0; i < len; i++) {
        g1_mul(&tmp, &p[i], &coeffs[i]);
        blst_p1_add_or_double(out, out, &tmp);
    }
}

/**
 * Calculate a linear combination of G1 group elements.
 *
 * Calculates `[coeffs_0]p_0 + [coeffs_1]p_1 + ... + [coeffs_n]p_n` where `n` is `len - 1`.
 *
 * @param[out]  out     The resulting sum-product
 * @param[in]   p       Array of G1 group elements, length `len`
 * @param[in]   coeffs  Array of field elements, length `len`
 * @param[in]   len     The number of group/field elements
 *
 * For the benefit of future generations (since blst has no documentation to speak of), there are
 * two ways to pass the arrays of scalars and points into blst_p1s_mult_pippenger().
 *
 * 1. Pass `points` as an array of pointers to the points, and pass `scalars` as an array of
 *    pointers to the scalars, each of length `len`.
 * 2. Pass an array where the first element is a pointer to the contiguous array of points and the
 *    second is null, and similarly for scalars.
 *
 * We do the second of these to save memory here.
 *
 * @remark This function returns G1_IDENTITY if called with the empty set as input.
 */
C_KZG_RET g1_lincomb_fast(g1_t *out, const g1_t *p, const fr_t *coeffs, size_t len) {
    C_KZG_RET ret;
    limb_t *scratch = NULL;
    blst_p1 *p_filtered = NULL;
    blst_p1_affine *p_affine = NULL;
    blst_scalar *scalars = NULL;

    /* Allocate space for arrays */
    ret = c_kzg_calloc((void **)&p_filtered, len, sizeof(blst_p1));
    if (ret != C_KZG_OK) goto out;
    ret = c_kzg_calloc((void **)&p_affine, len, sizeof(blst_p1_affine));
    if (ret != C_KZG_OK) goto out;
    ret = c_kzg_calloc((void **)&scalars, len, sizeof(blst_scalar));
    if (ret != C_KZG_OK) goto out;

    /* Allocate space for Pippenger scratch */
    size_t scratch_size = blst_p1s_mult_pippenger_scratch_sizeof(len);
    ret = c_kzg_malloc((void **)&scratch, scratch_size);
    if (ret != C_KZG_OK) goto out;

    /* Transform the field elements to 256-bit scalars */
    for (size_t i = 0; i < len; i++) {
        blst_scalar_from_fr(&scalars[i], &coeffs[i]);
    }

    /* Filter out zero points: make a new list p_filtered that contains only non-zero points */
    size_t new_len = 0;
    for (size_t i = 0; i < len; i++) {
        if (!blst_p1_is_inf(&p[i])) {
            /* Copy valid points to the new position */
            p_filtered[new_len] = p[i];
            scalars[new_len] = scalars[i];
            new_len++;
        }
    }

    /* We were either given no inputs, or all zero inputs: return the point at infinity */
    if (new_len == 0) {
        *out = G1_IDENTITY;
        goto out;
    }

    /* Transform the points to affine representation */
    const blst_p1 *p_arg[2] = {p_filtered, NULL};
    blst_p1s_to_affine(p_affine, p_arg, new_len);

    /* Call the Pippenger implementation */
    const byte *scalars_arg[2] = {(byte *)scalars, NULL};
    const blst_p1_affine *points_arg[2] = {p_affine, NULL};
    blst_p1s_mult_pippenger(out, points_arg, new_len, scalars_arg, BITS_PER_FIELD_ELEMENT, scratch);
    ret = C_KZG_OK;

out:
    c_kzg_free(scratch);
    c_kzg_free(p_filtered);
    c_kzg_free(p_affine);
    c_kzg_free(scalars);
    return ret;
}
