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

#include "setup/setup.h"
#include "common/alloc.h"
#include "common/utils.h"
#include "eip7594/eip7594.h"
#include "eip7594/fft.h"

#include <assert.h>   /* For assert */
#include <inttypes.h> /* For SCNu64 */
#include <stdio.h>    /* For FILE */
#include <stdlib.h>   /* For NULL */
#include <string.h>   /* For memcpy */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Macros
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The number of bytes in a g1 point. */
#define BYTES_PER_G1 48

/** The number of bytes in a g2 point. */
#define BYTES_PER_G2 96

/** The number of g1 points in a trusted setup. */
#define NUM_G1_POINTS FIELD_ELEMENTS_PER_BLOB

/** The number of g2 points in a trusted setup. */
#define NUM_G2_POINTS 65

////////////////////////////////////////////////////////////////////////////////////////////////////
// Constants
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * This is the root of unity associated with FIELD_ELEMENTS_PER_EXT_BLOB.
 *
 * Compute this constant with the scripts below:
 *
 * @code{.py}
 * import math
 *
 * FIELD_ELEMENTS_PER_EXT_BLOB = 8192
 * PRIMITIVE_ROOT_OF_UNITY = 7
 * BLS_MODULUS = 52435875175126190479447740508185965837690552500527637822603658699938581184513
 *
 * order = int(math.log2(FIELD_ELEMENTS_PER_EXT_BLOB))
 * root_of_unity = pow(PRIMITIVE_ROOT_OF_UNITY, (BLS_MODULUS - 1) // (2**order), BLS_MODULUS)
 * uint64s = [(root_of_unity >> (64 * i)) & 0xFFFFFFFFFFFFFFFF for i in range(4)]
 * values = [f"0x{uint64:016x}L" for uint64 in uint64s]
 * print(f"{{{', '.join(values)}}}")
 * @endcode
 *
 * Then paste the output into the following:
 *
 * @code{.c}
 * fr_t root_of_unity;
 * uint64_t values[4] = <output-from-python>;
 * blst_fr_from_uint64(&root_of_unity, values);
 * for (size_t i = 0; i < 4; i++)
 *     printf("%#018llxL,\n", root_of_unity.l[i]);
 * @endcode
 *
 * @remark this constant is tied to LOG_EXPANSION_FACTOR = 1, i.e., if the expansion
 * factor changes, this constant is no longer correct.
 */
static const fr_t ROOT_OF_UNITY = {
    0xa33d279ff0ccffc9L, 0x41fac79f59e91972L, 0x065d227fead1139bL, 0x71db41abda03e055L
};

////////////////////////////////////////////////////////////////////////////////////////////////////
// Trusted Setup Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Generate powers of a root of unity in the field.
 *
 * @param[out]  out     The roots of unity (length `width + 1`)
 * @param[in]   root    A root of unity
 * @param[in]   width   One less than the size of `out`
 *
 * @remark `root` must be such that `root ^ width` is equal to one, but no smaller power of `root`
 * is equal to one.
 */
static C_KZG_RET expand_root_of_unity(fr_t *out, const fr_t *root, size_t width) {
    size_t i;

    /* We assume it's at least two */
    if (width < 2) {
        return C_KZG_BADARGS;
    }

    /* We know what these will be */
    out[0] = FR_ONE;
    out[1] = *root;

    /* Compute powers of root */
    for (i = 2; i <= width; i++) {
        blst_fr_mul(&out[i], &out[i - 1], root);
        if (fr_is_one(&out[i])) break;
    }

    /* We expect the last entry to be one */
    if (i != width || !fr_is_one(&out[width])) {
        return C_KZG_BADARGS;
    }

    return C_KZG_OK;
}

/**
 * Initialize the roots of unity.
 *
 * @param[out]  s   Pointer to KZGSettings
 */
static C_KZG_RET compute_roots_of_unity(KZGSettings *s) {
    C_KZG_RET ret;

    /* Populate the roots of unity */
    ret = expand_root_of_unity(s->roots_of_unity, &ROOT_OF_UNITY, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;

    /* Copy all but the last root to the roots of unity */
    memcpy(s->brp_roots_of_unity, s->roots_of_unity, sizeof(fr_t) * FIELD_ELEMENTS_PER_EXT_BLOB);

    /* Apply the bit reversal permutation to the roots of unity */
    ret = bit_reversal_permutation(
        s->brp_roots_of_unity, sizeof(fr_t), FIELD_ELEMENTS_PER_EXT_BLOB
    );
    if (ret != C_KZG_OK) goto out;

    /* Populate reverse roots of unity */
    for (size_t i = 0; i <= FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        s->reverse_roots_of_unity[i] = s->roots_of_unity[FIELD_ELEMENTS_PER_EXT_BLOB - i];
    }

out:
    return ret;
}

/**
 * Free a trusted setup (KZGSettings).
 *
 * @param[in]   s   The trusted setup to free
 *
 * @remark This does nothing if `s` is NULL.
 */
void free_trusted_setup(KZGSettings *s) {
    if (s == NULL) return;
    c_kzg_free(s->brp_roots_of_unity);
    c_kzg_free(s->roots_of_unity);
    c_kzg_free(s->reverse_roots_of_unity);
    c_kzg_free(s->g1_values_monomial);
    c_kzg_free(s->g1_values_lagrange_brp);
    c_kzg_free(s->g2_values_monomial);

    /*
     * If for whatever reason we accidentally call free_trusted_setup() on an uninitialized
     * structure, we don't want to deference these 2d arrays. Without these NULL checks, it's
     * possible for there to be a segmentation fault via null pointer dereference.
     */
    if (s->x_ext_fft_columns != NULL) {
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            c_kzg_free(s->x_ext_fft_columns[i]);
        }
    }
    if (s->tables != NULL) {
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            c_kzg_free(s->tables[i]);
        }
    }
    c_kzg_free(s->x_ext_fft_columns);
    c_kzg_free(s->tables);
    s->wbits = 0;
    s->scratch_size = 0;
}

/**
 * The first part of the Toeplitz matrix multiplication algorithm: the Fourier transform of the
 * vector x extended.
 *
 * @param[out]  out The FFT of the extension of x, size n * 2
 * @param[in]   x   The input vector, size n
 * @param[in]   n   The length of the input vector x
 * @param[in]   s   The trusted setup
 */
static C_KZG_RET toeplitz_part_1(g1_t *out, const g1_t *x, size_t n, const KZGSettings *s) {
    C_KZG_RET ret;

    /*
     * Note: this constant 2 is not related to `LOG_EXPANSION_FACTOR`.
     * Instead, it is related to circulant matrices used in FK20, see
     * Section 2.2 and 3.2 in https://eprint.iacr.org/2023/033.pdf.
     */
    size_t circulant_domain_size = n * 2;
    g1_t *x_ext;

    /* Create extended array of points */
    ret = new_g1_array(&x_ext, circulant_domain_size);
    if (ret != C_KZG_OK) goto out;

    /* Copy x & extend with zero */
    for (size_t i = 0; i < n; i++) {
        x_ext[i] = x[i];
    }
    for (size_t i = n; i < circulant_domain_size; i++) {
        x_ext[i] = G1_IDENTITY;
    }

    /* Perform forward transformation */
    ret = g1_fft(out, x_ext, circulant_domain_size, s);
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(x_ext);
    return ret;
}

/**
 * Initialize fields for FK20 multi-proof computations.
 *
 * @param[out]  s   Pointer to KZGSettings to initialize
 */
static C_KZG_RET init_fk20_multi_settings(KZGSettings *s) {
    C_KZG_RET ret;
    size_t circulant_domain_size;
    g1_t *x = NULL;
    g1_t *points = NULL;
    blst_p1_affine *p_affine = NULL;
    bool precompute = s->wbits != 0;

    /*
     * Note: this constant 2 is not related to `LOG_EXPANSION_FACTOR`.
     * Instead, it is related to circulant matrices used in FK20, see
     * Section 2.2 and 3.2 in https://eprint.iacr.org/2023/033.pdf.
     */
    circulant_domain_size = 2 * CELLS_PER_BLOB;

    if (FIELD_ELEMENTS_PER_CELL >= NUM_G2_POINTS) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    /* Allocate space for arrays */
    ret = new_g1_array(&x, CELLS_PER_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_g1_array(&points, circulant_domain_size);
    if (ret != C_KZG_OK) goto out;

    /* Allocate space for array of pointers, this is a 2D array */
    ret = c_kzg_calloc((void **)&s->x_ext_fft_columns, circulant_domain_size, sizeof(void *));
    if (ret != C_KZG_OK) goto out;
    for (size_t i = 0; i < circulant_domain_size; i++) {
        ret = new_g1_array(&s->x_ext_fft_columns[i], FIELD_ELEMENTS_PER_CELL);
        if (ret != C_KZG_OK) goto out;
    }

    for (size_t offset = 0; offset < FIELD_ELEMENTS_PER_CELL; offset++) {
        /* Compute x, sections of the g1 values */
        size_t start = FIELD_ELEMENTS_PER_BLOB - FIELD_ELEMENTS_PER_CELL - 1 - offset;
        for (size_t i = 0; i < CELLS_PER_BLOB - 1; i++) {
            size_t j = start - i * FIELD_ELEMENTS_PER_CELL;
            x[i] = s->g1_values_monomial[j];
        }
        x[CELLS_PER_BLOB - 1] = G1_IDENTITY;

        /* Compute points, the fft of an extended x */
        ret = toeplitz_part_1(points, x, CELLS_PER_BLOB, s);
        if (ret != C_KZG_OK) goto out;

        /* Reorganize from rows into columns */
        for (size_t row = 0; row < circulant_domain_size; row++) {
            s->x_ext_fft_columns[row][offset] = points[row];
        }
    }

    if (precompute) {
        /* Allocate space for precomputed tables */
        ret = c_kzg_calloc((void **)&s->tables, circulant_domain_size, sizeof(void *));
        if (ret != C_KZG_OK) goto out;

        /* Allocate space for points in affine representation */
        ret = c_kzg_calloc((void **)&p_affine, FIELD_ELEMENTS_PER_CELL, sizeof(blst_p1_affine));
        if (ret != C_KZG_OK) goto out;

        /* Calculate the size of each table, this can be re-used */
        size_t table_size = blst_p1s_mult_wbits_precompute_sizeof(
            s->wbits, FIELD_ELEMENTS_PER_CELL
        );

        for (size_t i = 0; i < circulant_domain_size; i++) {
            /* Transform the points to affine representation */
            const blst_p1 *p_arg[2] = {s->x_ext_fft_columns[i], NULL};
            blst_p1s_to_affine(p_affine, p_arg, FIELD_ELEMENTS_PER_CELL);
            const blst_p1_affine *points_arg[2] = {p_affine, NULL};

            /* Allocate space for the table */
            ret = c_kzg_malloc((void **)&s->tables[i], table_size);
            if (ret != C_KZG_OK) goto out;

            /* Compute table for fixed-base MSM */
            blst_p1s_mult_wbits_precompute(
                s->tables[i], s->wbits, points_arg, FIELD_ELEMENTS_PER_CELL
            );
        }

        /* Calculate the size of the scratch */
        s->scratch_size = blst_p1s_mult_wbits_scratch_sizeof(FIELD_ELEMENTS_PER_CELL);
    }

out:
    c_kzg_free(x);
    c_kzg_free(points);
    c_kzg_free(p_affine);
    return ret;
}

/**
 * Basic sanity check that the trusted setup was loaded in Lagrange form.
 *
 * @param[in]   s   Pointer to the stored trusted setup data
 * @param[in]   n1  Number of G1 points in the trusted setup
 * @param[in]   n2  Number of G2 points in the trusted setup
 */
static C_KZG_RET is_trusted_setup_in_lagrange_form(const KZGSettings *s, size_t n1, size_t n2) {
    /* Trusted setup is too small; we can't work with this */
    if (n1 < 2 || n2 < 2) {
        return C_KZG_BADARGS;
    }

    /*
     * If the following pairing equation checks out:
     *     e(G1_SETUP[1], G2_SETUP[0]) ?= e(G1_SETUP[0], G2_SETUP[1])
     * then the trusted setup was loaded in monomial form.
     * If so, error out since we want the trusted setup in Lagrange form.
     */
    bool is_monomial_form = pairings_verify(
        &s->g1_values_lagrange_brp[1],
        &s->g2_values_monomial[0],
        &s->g1_values_lagrange_brp[0],
        &s->g2_values_monomial[1]
    );
    return is_monomial_form ? C_KZG_BADARGS : C_KZG_OK;
}

/**
 * Initialize all fields in KZGSettings to null/zero.
 *
 * @param[out]  out The KZGSettings to initialize.
 */
static void init_settings(KZGSettings *out) {
    out->roots_of_unity = NULL;
    out->brp_roots_of_unity = NULL;
    out->reverse_roots_of_unity = NULL;
    out->g1_values_monomial = NULL;
    out->g1_values_lagrange_brp = NULL;
    out->g2_values_monomial = NULL;
    out->x_ext_fft_columns = NULL;
    out->tables = NULL;
    out->wbits = 0;
    out->scratch_size = 0;
}

/**
 * Load trusted setup into a KZGSettings.
 *
 * @param[out]  out                     Pointer to the stored trusted setup
 * @param[in]   g1_monomial_bytes       Array of G1 points in monomial form
 * @param[in]   num_g1_monomial_bytes   Number of g1 monomial bytes
 * @param[in]   g1_lagrange_bytes       Array of G1 points in Lagrange form
 * @param[in]   num_g1_lagrange_bytes   Number of g1 Lagrange bytes
 * @param[in]   g2_monomial_bytes       Array of G2 points in monomial form
 * @param[in]   num_g2_monomial_bytes   Number of g2 monomial bytes
 * @param[in]   precompute              Configurable value between 0-15
 *
 * @remark Free afterwards use with free_trusted_setup().
 */
C_KZG_RET load_trusted_setup(
    KZGSettings *out,
    const uint8_t *g1_monomial_bytes,
    uint64_t num_g1_monomial_bytes,
    const uint8_t *g1_lagrange_bytes,
    uint64_t num_g1_lagrange_bytes,
    const uint8_t *g2_monomial_bytes,
    uint64_t num_g2_monomial_bytes,
    uint64_t precompute
) {
    C_KZG_RET ret;

    /*
     * Initialize all fields to null/zero so that if there's an error, we can can call
     * free_trusted_setup() without worrying about freeing a random pointer.
     */
    init_settings(out);

    /* It seems that blst limits the input to 15 */
    if (precompute > 15) {
        ret = C_KZG_BADARGS;
        goto out_error;
    }

    /*
     * This is the window size for the windowed multiplication in proof generation. The larger wbits
     * is, the faster the MSM will be, but the size of the precomputed table will grow
     * exponentially. With 8 bits, the tables are 96 MiB; with 9 bits, the tables are 192 MiB and so
     * forth. From our testing, there are diminishing returns after 8 bits.
     */
    out->wbits = precompute;

    /* Sanity check in case this is called directly */
    if (num_g1_monomial_bytes != NUM_G1_POINTS * BYTES_PER_G1 ||
        num_g1_lagrange_bytes != NUM_G1_POINTS * BYTES_PER_G1 ||
        num_g2_monomial_bytes != NUM_G2_POINTS * BYTES_PER_G2) {
        ret = C_KZG_BADARGS;
        goto out_error;
    }

    /* Allocate all of our arrays */
    ret = new_fr_array(&out->brp_roots_of_unity, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out_error;
    ret = new_fr_array(&out->roots_of_unity, FIELD_ELEMENTS_PER_EXT_BLOB + 1);
    if (ret != C_KZG_OK) goto out_error;
    ret = new_fr_array(&out->reverse_roots_of_unity, FIELD_ELEMENTS_PER_EXT_BLOB + 1);
    if (ret != C_KZG_OK) goto out_error;
    ret = new_g1_array(&out->g1_values_monomial, NUM_G1_POINTS);
    if (ret != C_KZG_OK) goto out_error;
    ret = new_g1_array(&out->g1_values_lagrange_brp, NUM_G1_POINTS);
    if (ret != C_KZG_OK) goto out_error;
    ret = new_g2_array(&out->g2_values_monomial, NUM_G2_POINTS);
    if (ret != C_KZG_OK) goto out_error;

    /* Convert all g1 monomial bytes to g1 points */
    for (size_t i = 0; i < NUM_G1_POINTS; i++) {
        blst_p1_affine g1_affine;
        BLST_ERROR err = blst_p1_uncompress(&g1_affine, &g1_monomial_bytes[BYTES_PER_G1 * i]);
        if (err != BLST_SUCCESS) {
            ret = C_KZG_BADARGS;
            goto out_error;
        }
        blst_p1_from_affine(&out->g1_values_monomial[i], &g1_affine);
    }

    /* Convert all g1 Lagrange bytes to g1 points */
    for (size_t i = 0; i < NUM_G1_POINTS; i++) {
        blst_p1_affine g1_affine;
        BLST_ERROR err = blst_p1_uncompress(&g1_affine, &g1_lagrange_bytes[BYTES_PER_G1 * i]);
        if (err != BLST_SUCCESS) {
            ret = C_KZG_BADARGS;
            goto out_error;
        }
        blst_p1_from_affine(&out->g1_values_lagrange_brp[i], &g1_affine);
    }

    /* Convert all g2 bytes to g2 points */
    for (size_t i = 0; i < NUM_G2_POINTS; i++) {
        blst_p2_affine g2_affine;
        BLST_ERROR err = blst_p2_uncompress(&g2_affine, &g2_monomial_bytes[BYTES_PER_G2 * i]);
        if (err != BLST_SUCCESS) {
            ret = C_KZG_BADARGS;
            goto out_error;
        }
        blst_p2_from_affine(&out->g2_values_monomial[i], &g2_affine);
    }

    /* Make sure the trusted setup was loaded in Lagrange form */
    ret = is_trusted_setup_in_lagrange_form(out, NUM_G1_POINTS, NUM_G2_POINTS);
    if (ret != C_KZG_OK) goto out_error;

    /* Compute roots of unity and permute the G1 trusted setup */
    ret = compute_roots_of_unity(out);
    if (ret != C_KZG_OK) goto out_error;

    /* Bit reverse the Lagrange form points */
    ret = bit_reversal_permutation(out->g1_values_lagrange_brp, sizeof(g1_t), NUM_G1_POINTS);
    if (ret != C_KZG_OK) goto out_error;

    /* Setup for FK20 proof computation */
    ret = init_fk20_multi_settings(out);
    if (ret != C_KZG_OK) goto out_error;

    goto out_success;

out_error:
    /*
     * Note: this only frees the fields in the KZGSettings structure. It does not free the
     * KZGSettings structure memory. If necessary, that must be done by the caller.
     */
    free_trusted_setup(out);
out_success:
    return ret;
}

/**
 * Load trusted setup from a file.
 *
 * @param[out]  out         Pointer to the loaded trusted setup data
 * @param[in]   in          File handle for input
 * @param[in]   precompute  Configurable value between 0-15
 *
 * @remark See also load_trusted_setup().
 * @remark The input file will not be closed.
 * @remark The file format is `n1 n2 g1_1 g1_2 ... g1_n1 g2_1 ... g2_n2` where the first two numbers
 * are in decimal and the remainder are hexstrings and any whitespace can be used as separators.
 */
C_KZG_RET load_trusted_setup_file(KZGSettings *out, FILE *in, uint64_t precompute) {
    C_KZG_RET ret;
    int num_matches;
    uint64_t num_g1_points;
    uint64_t num_g2_points;
    uint8_t *g1_monomial_bytes = NULL;
    uint8_t *g1_lagrange_bytes = NULL;
    uint8_t *g2_monomial_bytes = NULL;

    /*
     * Initialize all fields to null/zero so that if there's an error, we can can call
     * free_trusted_setup() without worrying about freeing a random pointer.
     */
    init_settings(out);

    /* Allocate space for points */
    ret = c_kzg_calloc((void **)&g1_monomial_bytes, NUM_G1_POINTS, BYTES_PER_G1);
    if (ret != C_KZG_OK) goto out;
    ret = c_kzg_calloc((void **)&g1_lagrange_bytes, NUM_G1_POINTS, BYTES_PER_G1);
    if (ret != C_KZG_OK) goto out;
    ret = c_kzg_calloc((void **)&g2_monomial_bytes, NUM_G2_POINTS, BYTES_PER_G2);
    if (ret != C_KZG_OK) goto out;

    /* Read the number of g1 points */
    num_matches = fscanf(in, "%" SCNu64, &num_g1_points);
    if (num_matches != 1 || num_g1_points != NUM_G1_POINTS) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    /* Read the number of g2 points */
    num_matches = fscanf(in, "%" SCNu64, &num_g2_points);
    if (num_matches != 1 || num_g2_points != NUM_G2_POINTS) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    /* Read all of the g1 points in Lagrange form, byte by byte */
    for (size_t i = 0; i < NUM_G1_POINTS * BYTES_PER_G1; i++) {
        num_matches = fscanf(in, "%2hhx", &g1_lagrange_bytes[i]);
        if (num_matches != 1) {
            ret = C_KZG_BADARGS;
            goto out;
        }
    }

    /* Read all of the g2 points in monomial form, byte by byte */
    for (size_t i = 0; i < NUM_G2_POINTS * BYTES_PER_G2; i++) {
        num_matches = fscanf(in, "%2hhx", &g2_monomial_bytes[i]);
        if (num_matches != 1) {
            ret = C_KZG_BADARGS;
            goto out;
        }
    }

    /* Read all of the g1 points in monomial form, byte by byte */
    /* Note: this is last because it is an extension for EIP-7594 */
    for (size_t i = 0; i < NUM_G1_POINTS * BYTES_PER_G1; i++) {
        num_matches = fscanf(in, "%2hhx", &g1_monomial_bytes[i]);
        if (num_matches != 1) {
            ret = C_KZG_BADARGS;
            goto out;
        }
    }

    ret = load_trusted_setup(
        out,
        g1_monomial_bytes,
        NUM_G1_POINTS * BYTES_PER_G1,
        g1_lagrange_bytes,
        NUM_G1_POINTS * BYTES_PER_G1,
        g2_monomial_bytes,
        NUM_G2_POINTS * BYTES_PER_G2,
        precompute
    );

out:
    c_kzg_free(g1_monomial_bytes);
    c_kzg_free(g1_lagrange_bytes);
    c_kzg_free(g2_monomial_bytes);
    return ret;
}
