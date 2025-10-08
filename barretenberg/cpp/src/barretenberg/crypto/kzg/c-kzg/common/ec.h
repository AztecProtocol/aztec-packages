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
#include "common/fr.h"

////////////////////////////////////////////////////////////////////////////////////////////////////
// Types
////////////////////////////////////////////////////////////////////////////////////////////////////

typedef blst_p1 g1_t; /**< Internal G1 group element type. */
typedef blst_p2 g2_t; /**< Internal G2 group element type. */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Constants
////////////////////////////////////////////////////////////////////////////////////////////////////

/** Deserialized form of the G1 identity/infinity point. */
static const g1_t G1_IDENTITY = {
    {0L, 0L, 0L, 0L, 0L, 0L}, {0L, 0L, 0L, 0L, 0L, 0L}, {0L, 0L, 0L, 0L, 0L, 0L}
};

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

void g1_sub(g1_t *out, const g1_t *a, const g1_t *b);
void g1_mul(g1_t *out, const g1_t *a, const fr_t *b);
void print_g1(const g1_t *g);

#ifdef __cplusplus
}
#endif
