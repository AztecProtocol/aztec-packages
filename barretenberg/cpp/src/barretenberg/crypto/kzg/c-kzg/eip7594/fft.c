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

#include "eip7594/fft.h"
#include "common/alloc.h"
#include "common/utils.h"
#include "eip7594/cell.h"
#include "eip7594/poly.h"

#include <string.h> /* For memcpy */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Constants
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The coset shift factor for the cell recovery code.
 *
 *   fr_t a;
 *   fr_from_uint64(&a, 7);
 *   for (size_t i = 0; i < 4; i++)
 *       printf("%#018llxL,\n", a.l[i]);
 */
static const fr_t RECOVERY_SHIFT_FACTOR = {
    0x0000000efffffff1L, 0x17e363d300189c0fL, 0xff9c57876f8457b0L, 0x351332208fc5a8c4L
};

/**
 * The inverse of RECOVERY_SHIFT_FACTOR.
 *
 *   fr_t a;
 *   fr_from_uint64(&a, 7);
 *   fr_div(&a, &FR_ONE, &a);
 *   for (size_t i = 0; i < 4; i++)
 *       printf("%#018llxL,\n", a.l[i]);
 */
static const fr_t INV_RECOVERY_SHIFT_FACTOR = {
    0xdb6db6dadb6db6dcL, 0xe6b5824adb6cc6daL, 0xf8b356e005810db9L, 0x66d0f1e660ec4796L
};

////////////////////////////////////////////////////////////////////////////////////////////////////
// FFT Functions for Field Elements
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Fast Fourier Transform.
 *
 * Recursively divide and conquer.
 *
 * @param[out]  out             The results, length `n`
 * @param[in]   in              The input data, length `n * stride`
 * @param[in]   stride          The input data stride
 * @param[in]   roots           Roots of unity, length `n * roots_stride`
 * @param[in]   roots_stride    The stride interval among the roots of unity
 * @param[in]   n               Length of the FFT, must be a power of two
 */
static void fr_fft_fast(
    fr_t *out, const fr_t *in, size_t stride, const fr_t *roots, size_t roots_stride, size_t n
) {
    size_t half = n / 2;
    if (half > 0) {
        fr_t y_times_root;
        fr_fft_fast(out, in, stride * 2, roots, roots_stride * 2, half);
        fr_fft_fast(out + half, in + stride, stride * 2, roots, roots_stride * 2, half);
        for (size_t i = 0; i < half; i++) {
            blst_fr_mul(&y_times_root, &out[i + half], &roots[i * roots_stride]);
            blst_fr_sub(&out[i + half], &out[i], &y_times_root);
            blst_fr_add(&out[i], &out[i], &y_times_root);
        }
    } else {
        *out = *in;
    }
}

/**
 * The entry point for forward FFT over field elements.
 *
 * @param[out]  out The results, length `n`
 * @param[in]   in  The input data, length `n`
 * @param[in]   n   Length of the arrays
 * @param[in]   s   The trusted setup
 *
 * @remark Will do nothing if given a zero length array.
 * @remark The array lengths must be a power of two.
 * @remark Use fr_ifft() for inverse transformation.
 */
C_KZG_RET fr_fft(fr_t *out, const fr_t *in, size_t n, const KZGSettings *s) {
    /* Handle zero length input */
    if (n == 0) return C_KZG_OK;

    /* Ensure the length is valid */
    if (n > FIELD_ELEMENTS_PER_EXT_BLOB || !is_power_of_two(n)) {
        return C_KZG_BADARGS;
    }

    size_t roots_stride = FIELD_ELEMENTS_PER_EXT_BLOB / n;
    fr_fft_fast(out, in, 1, s->roots_of_unity, roots_stride, n);

    return C_KZG_OK;
}

/**
 * The entry point for inverse FFT over field elements.
 *
 * @param[out]  out The results, length `n`
 * @param[in]   in  The input data, length `n`
 * @param[in]   n   Length of the arrays
 * @param[in]   s   The trusted setup
 *
 * @remark Will do nothing if given a zero length array.
 * @remark The array lengths must be a power of two.
 * @remark Use fr_fft() for forward transformation.
 */
C_KZG_RET fr_ifft(fr_t *out, const fr_t *in, size_t n, const KZGSettings *s) {
    /* Handle zero length input */
    if (n == 0) return C_KZG_OK;

    /* Ensure the length is valid */
    if (n > FIELD_ELEMENTS_PER_EXT_BLOB || !is_power_of_two(n)) {
        return C_KZG_BADARGS;
    }

    size_t stride = FIELD_ELEMENTS_PER_EXT_BLOB / n;
    fr_fft_fast(out, in, 1, s->reverse_roots_of_unity, stride, n);

    fr_t inv_n;
    fr_from_uint64(&inv_n, n);
    blst_fr_eucl_inverse(&inv_n, &inv_n);
    for (size_t i = 0; i < n; i++) {
        blst_fr_mul(&out[i], &out[i], &inv_n);
    }
    return C_KZG_OK;
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// FFT Functions for G1 Points
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Fast Fourier Transform.
 *
 * Recursively divide and conquer.
 *
 * @param[out]  out             The results, length `n`
 * @param[in]   in              The input data, length `n * stride`
 * @param[in]   stride          The input data stride
 * @param[in]   roots           Roots of unity, length `n * roots_stride`
 * @param[in]   roots_stride    The stride interval among the roots of unity
 * @param[in]   n               Length of the FFT, must be a power of two
 */
static void g1_fft_fast(
    g1_t *out, const g1_t *in, size_t stride, const fr_t *roots, size_t roots_stride, size_t n
) {
    g1_t y_times_root;
    size_t half = n / 2;
    if (half > 0) { /* Tunable parameter */
        g1_fft_fast(out, in, stride * 2, roots, roots_stride * 2, half);
        g1_fft_fast(out + half, in + stride, stride * 2, roots, roots_stride * 2, half);
        for (size_t i = 0; i < half; i++) {
            /* If the scalar is one, we can skip the multiplication */
            if (fr_is_one(&roots[i * roots_stride])) {
                y_times_root = out[i + half];
            } else {
                g1_mul(&y_times_root, &out[i + half], &roots[i * roots_stride]);
            }
            g1_sub(&out[i + half], &out[i], &y_times_root);
            blst_p1_add_or_double(&out[i], &out[i], &y_times_root);
        }
    } else {
        *out = *in;
    }
}

/**
 * The entry point for forward FFT over G1 points.
 *
 * @param[out]  out The results, length `n`
 * @param[in]   in  The input data, length `n`
 * @param[in]   n   Length of the arrays
 * @param[in]   s   The trusted setup
 *
 * @remark Will do nothing if given a zero length array.
 * @remark The array lengths must be a power of two.
 * @remark Use g1_ifft() for inverse transformation.
 */
C_KZG_RET g1_fft(g1_t *out, const g1_t *in, size_t n, const KZGSettings *s) {
    /* Handle zero length input */
    if (n == 0) return C_KZG_OK;

    /* Ensure the length is valid */
    if (n > FIELD_ELEMENTS_PER_EXT_BLOB || !is_power_of_two(n)) {
        return C_KZG_BADARGS;
    }

    size_t roots_stride = FIELD_ELEMENTS_PER_EXT_BLOB / n;
    g1_fft_fast(out, in, 1, s->roots_of_unity, roots_stride, n);

    return C_KZG_OK;
}

/**
 * The entry point for inverse FFT over G1 points.
 *
 * @param[out]  out The results, length `n`
 * @param[in]   in  The input data, length `n`
 * @param[in]   n   Length of the arrays
 * @param[in]   s   The trusted setup
 *
 * @remark Will do nothing if given a zero length array.
 * @remark The array lengths must be a power of two.
 * @remark Use g1_fft() for forward transformation.
 */
C_KZG_RET g1_ifft(g1_t *out, const g1_t *in, size_t n, const KZGSettings *s) {
    /* Handle zero length input */
    if (n == 0) return C_KZG_OK;

    /* Ensure the length is valid */
    if (n > FIELD_ELEMENTS_PER_EXT_BLOB || !is_power_of_two(n)) {
        return C_KZG_BADARGS;
    }

    size_t stride = FIELD_ELEMENTS_PER_EXT_BLOB / n;
    g1_fft_fast(out, in, 1, s->reverse_roots_of_unity, stride, n);

    fr_t inv_n;
    fr_from_uint64(&inv_n, n);
    blst_fr_eucl_inverse(&inv_n, &inv_n);
    for (size_t i = 0; i < n; i++) {
        g1_mul(&out[i], &out[i], &inv_n);
    }

    return C_KZG_OK;
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// FFT Functions for Cosets
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Do an FFT over a coset of the roots of unity.
 *
 * @param[out]  out The results, length `n`
 * @param[in]   in  The input data, length `n`
 * @param[in]   n   Length of the arrays
 * @param[in]   s   The trusted setup
 *
 * @remark Will do nothing if given a zero length array.
 * @remark The coset shift factor is RECOVERY_SHIFT_FACTOR.
 */
C_KZG_RET coset_fft(fr_t *out, const fr_t *in, size_t n, const KZGSettings *s) {
    /* Handle zero length input */
    if (n == 0) return C_KZG_OK;

    /* Create some room to shift the polynomial */
    fr_t *in_shifted = NULL;
    C_KZG_RET ret = new_fr_array(&in_shifted, n);
    if (ret != C_KZG_OK) goto out;

    /* Shift the poly */
    memcpy(in_shifted, in, n * sizeof(fr_t));
    shift_poly(in_shifted, n, &RECOVERY_SHIFT_FACTOR);

    ret = fr_fft(out, in_shifted, n, s);
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(in_shifted);
    return ret;
}

/**
 * Do an inverse FFT over a coset of the roots of unity.
 *
 * @param[out]  out The results, length `n`
 * @param[in]   in  The input data, length `n`
 * @param[in]   n   Length of the arrays
 * @param[in]   s   The trusted setup
 *
 * @remark Will do nothing if given a zero length array.
 * @remark The coset shift factor is RECOVERY_SHIFT_FACTOR. In this function we use its inverse to
 * implement the IFFT.
 */
C_KZG_RET coset_ifft(fr_t *out, const fr_t *in, size_t n, const KZGSettings *s) {
    /* Handle zero length input */
    if (n == 0) return C_KZG_OK;

    C_KZG_RET ret = fr_ifft(out, in, n, s);
    if (ret != C_KZG_OK) goto out;

    shift_poly(out, n, &INV_RECOVERY_SHIFT_FACTOR);

out:
    return ret;
}
