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

#pragma once

#include "blst.h"

#include <stdbool.h> /* For bool */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Types
////////////////////////////////////////////////////////////////////////////////////////////////////

typedef blst_fr fr_t; /**< Internal Fr field element type. */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Macros
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The number of bits in a BLS scalar field element. */
#define BITS_PER_FIELD_ELEMENT 255

/** The number of bytes in a BLS scalar field element. */
#define BYTES_PER_FIELD_ELEMENT 32

////////////////////////////////////////////////////////////////////////////////////////////////////
// Constants
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The zero field element. */
static const fr_t FR_ZERO = {0L, 0L, 0L, 0L};

/** This is 1 in blst's `blst_fr` limb representation. Crazy but true. */
static const fr_t FR_ONE = {
    0x00000001fffffffeL, 0x5884b7fa00034802L, 0x998c4fefecbc4ff5L, 0x1824b159acc5056fL
};

/** This used to represent a missing element. It's an invalid value. */
static const fr_t FR_NULL = {
    0xffffffffffffffffL, 0xffffffffffffffffL, 0xffffffffffffffffL, 0xffffffffffffffffL
};

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

bool fr_equal(const fr_t *a, const fr_t *b);
bool fr_is_one(const fr_t *p);
bool fr_is_null(const fr_t *p);
void fr_div(fr_t *out, const fr_t *a, const fr_t *b);
void fr_pow(fr_t *out, const fr_t *a, uint64_t n);
void fr_from_uint64(fr_t *out, uint64_t n);
void print_fr(const fr_t *f);

#ifdef __cplusplus
}
#endif
