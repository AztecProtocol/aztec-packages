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

#include "eip7594/fk20.h"
#include "common/alloc.h"
#include "common/lincomb.h"
#include "eip7594/cell.h"
#include "eip7594/fft.h"

#include <stdlib.h> /* For NULL */

/**
 * This is an auxiliary function that selects the values for the circulant matrix in the FK20
 * multiproof algorithm (Section 3) taking them from the coefficients of the input polynomial (for
 * which the proofs are created).
 *
 * This function outputs the first column of the circulant matrix F''_i. The matrix F''_i is the
 * padding of the Toeplitz matrix of size (r-1)·(r-1) to the size 2r·2r. It is supposed to output
 * an array of size 2r that looks as follows:
 *
 *   out[0]      = in[d-i]
 *   out[1..r+1] = 0
 *   out[r+2]    = in[d-(r-2)l-i]
 *   out[r+3]    = in[d-(r-3)l-i]
 *   out[r+4]    = in[d-(r-4)l-i]
 *   ...
 *   out[2r-2]   = in[d-2l-i]
 *   out[2r-1]   = in[d-1l-i]
 *
 * Where the following constants are:
 *
 *   d = FIELD_ELEMENTS_PER_BLOB-1
 *   r = CELLS_PER_BLOB
 *   l = FIELD_ELEMENTS_PER_CELL
 *   i = offset
 *
 * @param[out]  out     The reordered polynomial, length 2*CELLS_PER_BLOB
 * @param[in]   in      The input polynomial, length FIELD_ELEMENTS_PER_BLOB
 * @param[in]   offset  The offset, an integer between 0 and FIELD_ELEMENTS_PER_BLOB-1, inclusive
 */
static void circulant_coeffs_stride(fr_t *out, const fr_t *in, size_t offset) {
    const size_t r = CELLS_PER_BLOB;
    const size_t l = FIELD_ELEMENTS_PER_CELL;
    const size_t d = FIELD_ELEMENTS_PER_BLOB - 1;
    const size_t d_minus_i = d - offset; /* Shortcut for: d-i */

    assert(d >= offset);

    /* Let's zero-initialise the whole output vector (length 2r) */
    for (size_t j = 0; j < 2 * r; j++) {
        out[j] = FR_ZERO;
    }

    /* First non-zero element is in[d-i] */
    out[0] = in[d_minus_i];

    /*
     * Now we need to fill the remaining non-zero entries, which start at out[r+2] and finish at the
     * end of the buffer out[2r-1]. That's r-2 elements from in[d-(r-2)l-i] to in[d-l-i].
     */
    for (size_t j = 1; j < r - 1; j++) { /* j = 1 ... r-2 */
        out[2 * r - j] = in[d_minus_i - j * l];
    }
}

/**
 * Compute FK20 cell-proofs for a polynomial. Each cell-proof is a KZG multi-proof that proves that
 * the input polynomial takes certain values in several points, concretely in
 * FIELD_ELEMENTS_PER_CELL points.
 *
 * A naive way to construct the proofs would take time quadratic in the number of proofs. A more
 * efficient way is to use an algorithm called FK20, documented in
 * https://eprint.iacr.org/2023/033.pdf.
 *
 * The FK20 algorithm for n multi-proofs, each covering l evaluation points of a polynomial of
 * degree d, dictates (Theorem 2 and Proposition 4) to proceed in two phases. The total complexity
 * of this algorithm is 2rl·log(2r) for Phase 1, plus n·log(n) for Phase 2.
 *
 *   Phase 1: Compute the coefficients of a polynomial v(X) of degree r-1.
 *
 *     Observations:
 *
 *     1) The coefficients are computed as a sum of l matrix-vector products, where each matrix is
 *        a Toeplitz matrix of size (r-1)·(r-1) (zeros below the main diagonal) composed from
 *        certain coefficients of the input polynomial and a vector is a subvector of the KZG
 *        trusted setup.
 *     2) Each matrix-vector product is reduced to the product of a bigger circulant matrix by a
 *        twice longer vector s_i.
 *     3) The circulant matrix-vector product is best computed via FFT, so that the matrix is 2r·2r
 *        (which are powers of two), thus little bigger than twice the Toeplitz matrix.
 *
 *     Computations:
 *
 *     4) We then compute the FFT of each circulant vector c_i and each setup subvector s_i,
 *        getting w_i and y_i respectively. In this protocol, the y_i vector is used multiple times
 *        and is computed and stored in the KZG trusted setup during initialization.
 *     5) w_i and y_i are multiplied componentwise (this is effectively a scalar multiplication in
 *        a group), then the resulting l vectors are summed to u.
 *     6) The inverse FFT transformation is applied to u, which gives us a vector of 2r group
 *        elements, with first r-1 element being the coefficients of v(X).
 *
 *   Phase 2: Evaluate the polynomial at n points.
 *
 *     1) Evaluate v(X) at n points. As those are selected to be the n-th roots of unity, and n in
 *        this particular protocol is a power of two, we just apply an FFT of size n.
 *
 * Where the following constants are:
 *
 *   d = FIELD_ELEMENTS_PER_BLOB-1
 *   r = CELLS_PER_BLOB
 *   n = CELLS_PER_EXT_BLOB
 *   l = FIELD_ELEMENTS_PER_CELL
 *
 * @param[out]  out     An array of CELLS_PER_EXT_BLOB proofs
 * @param[in]   poly    The polynomial, an array of FIELD_ELEMENTS_PER_BLOB coefficients
 * @param[in]   s       The trusted setup
 *
 * @remark The polynomial should have FIELD_ELEMENTS_PER_BLOB coefficients. Only the lower half of
 * the extended polynomial is supplied because the upper half is assumed to be zero.
 *
 * @remark The configuration of this protocol currently (May 2025) assumes r=l and n=2r. This may
 * result in some optimizations, not particularly suited for r being much different to l. However,
 * the code is supposed to work also for l=1, which is the case of FK20 regular (single) proofs.
 */
C_KZG_RET compute_fk20_cell_proofs(g1_t *out, const fr_t *poly, const KZGSettings *s) {
    C_KZG_RET ret;
    size_t circulant_domain_size;

    blst_scalar *scalars = NULL;
    fr_t **coeffs = NULL;
    fr_t *circulant_coeffs = NULL;     /* The vectors c_i */
    fr_t *circulant_coeffs_fft = NULL; /* The vectors w_i */
    g1_t *v = NULL;
    g1_t *u = NULL;
    limb_t *scratch = NULL;
    bool precompute = s->wbits != 0;

    /*
     * Note: this constant 2 is not related to LOG_EXPANSION_FACTOR. Instead, it is to produce a
     * circulant matrix of size 2r in FK20, see Section 3 in https://eprint.iacr.org/2023/033.pdf.
     */
    circulant_domain_size = CELLS_PER_BLOB * 2;

    /* Do allocations */
    ret = new_fr_array(&circulant_coeffs, circulant_domain_size);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&circulant_coeffs_fft, circulant_domain_size);
    if (ret != C_KZG_OK) goto out;
    ret = new_g1_array(&u, circulant_domain_size);
    if (ret != C_KZG_OK) goto out;
    ret = new_g1_array(&v, circulant_domain_size);
    if (ret != C_KZG_OK) goto out;

    if (precompute) {
        /* Allocations for fixed-base MSM */
        ret = c_kzg_malloc((void **)&scratch, s->scratch_size);
        if (ret != C_KZG_OK) goto out;
        ret = c_kzg_calloc((void **)&scalars, FIELD_ELEMENTS_PER_CELL, sizeof(blst_scalar));
        if (ret != C_KZG_OK) goto out;
    }

    /* Allocate 2d array for coefficients by column */
    ret = c_kzg_calloc((void **)&coeffs, circulant_domain_size, sizeof(void *));
    if (ret != C_KZG_OK) goto out;
    for (size_t i = 0; i < circulant_domain_size; i++) {
        ret = new_fr_array(&coeffs[i], FIELD_ELEMENTS_PER_CELL);
        if (ret != C_KZG_OK) goto out;
    }

    /* Initialize values to zero */
    for (size_t i = 0; i < circulant_domain_size; i++) {
        u[i] = G1_IDENTITY;
    }

    /* Phase 1, step 4: Compute the w_i columns */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_CELL; i++) {
        /* Select the coefficients c_i of poly that form the i-th circulant matrix */
        circulant_coeffs_stride(circulant_coeffs, poly, i);
        /* Apply FFT to get w_i */
        ret = fr_fft(circulant_coeffs_fft, circulant_coeffs, circulant_domain_size, s);
        if (ret != C_KZG_OK) goto out;
        for (size_t j = 0; j < circulant_domain_size; j++) {
            coeffs[j][i] = circulant_coeffs_fft[j];
        }
    }

    /*
     * Phase 1, step 5: Compute the u vector via MSM. The y_i vectors are computed beforehand.
     *
     * There are two ways to compute the u vector:
     *
     *   1) Fixed-base MSM with precompution: the scalar products [q]y_i[j] are stored for small q
     *      in s->tables; then we compute each component of the u vector as a fixed-based MSM of
     *      size l with precomputation.
     *   2) Pippenger MSM without precompution: the y_i vectors are stored in s->x_ext_fft_columns
     *      then each component of the u vector is just an MSM of size l.
     */
    for (size_t i = 0; i < circulant_domain_size; i++) {
        if (precompute) {
            /* Transform the field elements to 255-bit scalars */
            for (size_t j = 0; j < FIELD_ELEMENTS_PER_CELL; j++) {
                blst_scalar_from_fr(&scalars[j], &coeffs[i][j]);
            }
            const byte *scalars_arg[2] = {(byte *)scalars, NULL};

            /* A fixed-base MSM with precomputation */
            blst_p1s_mult_wbits(
                &u[i],
                s->tables[i],
                s->wbits,
                FIELD_ELEMENTS_PER_CELL,
                scalars_arg,
                BITS_PER_FIELD_ELEMENT,
                scratch
            );
        } else {
            /* A pretty fast MSM without precomputation */
            ret = g1_lincomb_fast(
                &u[i], s->x_ext_fft_columns[i], coeffs[i], FIELD_ELEMENTS_PER_CELL
            );
            if (ret != C_KZG_OK) goto out;
        }
    }

    /*
     * Phase 1, step 6: Apply the inverse FFT to the u vector.
     *
     * The result is almost the final v vector: the second half of the vector should be set to the
     * identity elements (commitments to zero coefficients). The v polynomial actually has degree
     * r-1, which is guaranteed by setting the last r+1 elements of c_i vectors to be identities.
     */
    ret = g1_ifft(v, u, circulant_domain_size, s);
    if (ret != C_KZG_OK) goto out;

    /*
     * Zero the second half of v to get the polynomial of degree r.
     * We do not need to zero the r-th element as it is guaranteed to be zero.
     */
    for (size_t i = CELLS_PER_BLOB; i < circulant_domain_size; i++) {
        v[i] = G1_IDENTITY;
    }

    /* Phase 2: Evaluate the polynomial v(X) at n points */
    ret = g1_fft(out, v, CELLS_PER_EXT_BLOB, s);
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(scalars);
    if (coeffs != NULL) {
        for (size_t i = 0; i < circulant_domain_size; i++) {
            c_kzg_free(coeffs[i]);
        }
        c_kzg_free(coeffs);
    }
    c_kzg_free(circulant_coeffs);
    c_kzg_free(circulant_coeffs_fft);
    c_kzg_free(v);
    c_kzg_free(u);
    c_kzg_free(scratch);
    return ret;
}
