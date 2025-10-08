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

#include "common/alloc.h"
#include "common/ec.h"
#include "common/fr.h"

#include <stdbool.h> /* For bool */
#include <stddef.h>  /* For size_t & NULL */
#include <stdlib.h>  /* For malloc */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Memory Allocation
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wrapped malloc() that reports failures to allocate.
 *
 * @param[out]  out     Pointer to the allocated space
 * @param[in]   size    The number of bytes to be allocated
 *
 * @remark Will return C_KZG_BADARGS if the requested size is zero.
 */
C_KZG_RET c_kzg_malloc(void **out, size_t size) {
    *out = NULL;
    if (size == 0) return C_KZG_BADARGS;
    *out = malloc(size);
    return *out != NULL ? C_KZG_OK : C_KZG_MALLOC;
}

/**
 * Wrapped calloc() that reports failures to allocate.
 *
 * @param[out]  out     Pointer to the allocated space
 * @param[in]   count   The number of elements
 * @param[in]   size    The size of each element
 *
 * @remark Will return C_KZG_BADARGS if the requested size is zero.
 */
C_KZG_RET c_kzg_calloc(void **out, size_t count, size_t size) {
    *out = NULL;
    if (count == 0 || size == 0) return C_KZG_BADARGS;
    *out = calloc(count, size);
    return *out != NULL ? C_KZG_OK : C_KZG_MALLOC;
}

/**
 * Allocate memory for an array of G1 group elements.
 *
 * @param[out]  x   Pointer to the allocated space
 * @param[in]   n   The number of G1 elements to be allocated
 *
 * @remark Free the space later using c_kzg_free().
 */
C_KZG_RET new_g1_array(g1_t **x, size_t n) {
    return c_kzg_calloc((void **)x, n, sizeof(g1_t));
}

/**
 * Allocate memory for an array of G2 group elements.
 *
 * @param[out]  x   Pointer to the allocated space
 * @param[in]   n   The number of G2 elements to be allocated
 *
 * @remark Free the space later using c_kzg_free().
 */
C_KZG_RET new_g2_array(g2_t **x, size_t n) {
    return c_kzg_calloc((void **)x, n, sizeof(g2_t));
}

/**
 * Allocate memory for an array of field elements.
 *
 * @param[out]  x   Pointer to the allocated space
 * @param[in]   n   The number of field elements to be allocated
 *
 * @remark Free the space later using c_kzg_free().
 */
C_KZG_RET new_fr_array(fr_t **x, size_t n) {
    return c_kzg_calloc((void **)x, n, sizeof(fr_t));
}

/**
 * Allocate memory for an array of booleans.
 *
 * @param[out]  x   Pointer to the allocated space
 * @param[in]   n   The number of booleans to be allocated
 *
 * @remark Free the space later using c_kzg_free().
 */
C_KZG_RET new_bool_array(bool **x, size_t n) {
    return c_kzg_calloc((void **)x, n, sizeof(bool));
}
