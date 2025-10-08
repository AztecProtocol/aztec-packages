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

#include "common/ec.h"
#include "common/bytes.h"

#include <stdio.h> /* For printf */

/**
 * Subtraction of G1 group elements.
 *
 * @param[out]  out The result, `a - b`
 * @param[in]   a   A G1 group element
 * @param[in]   b   The G1 group element to be subtracted
 */
void g1_sub(g1_t *out, const g1_t *a, const g1_t *b) {
    g1_t bneg = *b;
    blst_p1_cneg(&bneg, true);
    blst_p1_add_or_double(out, a, &bneg);
}

/**
 * Multiply a G1 group element by a field element.
 *
 * @param[out]  out The result, `a * b`
 * @param[in]   a   The G1 group element
 * @param[in]   b   The multiplier
 */
void g1_mul(g1_t *out, const g1_t *a, const fr_t *b) {
    blst_scalar s;
    blst_scalar_from_fr(&s, b);
    blst_p1_mult(out, a, s.b, BITS_PER_FIELD_ELEMENT);
}

/**
 * Print a G1 point to the console.
 *
 * @param[in]   g   The g1 point to print
 */
void print_g1(const g1_t *g) {
    Bytes48 bytes;
    bytes_from_g1(&bytes, g);
    print_bytes48(&bytes);
}
