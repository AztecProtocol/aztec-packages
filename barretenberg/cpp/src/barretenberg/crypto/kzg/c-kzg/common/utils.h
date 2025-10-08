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

#include "common/ec.h"
#include "common/ret.h"

#include <inttypes.h> /* For uint*_t */
#include <stdbool.h>  /* For bool */
#include <stddef.h>   /* For size_t */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

bool is_power_of_two(uint64_t n);
uint64_t log2_pow2(uint64_t n);
uint64_t reverse_bits(uint64_t n);
uint64_t reverse_bits_limited(uint64_t n, uint64_t value);
C_KZG_RET bit_reversal_permutation(void *values, size_t size, size_t n);
void compute_powers(fr_t *out, const fr_t *x, size_t n);
bool pairings_verify(const g1_t *a1, const g2_t *a2, const g1_t *b1, const g2_t *b2);

#ifdef __cplusplus
}
#endif
