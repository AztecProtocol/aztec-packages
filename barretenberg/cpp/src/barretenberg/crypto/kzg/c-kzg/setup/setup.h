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

#include "common/ret.h"
#include "setup/settings.h"

#include <stdio.h> /* For FILE */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

C_KZG_RET load_trusted_setup(
    KZGSettings *out,
    const uint8_t *g1_monomial_bytes,
    uint64_t num_g1_monomial_bytes,
    const uint8_t *g1_lagrange_bytes,
    uint64_t num_g1_lagrange_bytes,
    const uint8_t *g2_monomial_bytes,
    uint64_t num_g2_monomial_bytes,
    uint64_t precompute
);

C_KZG_RET load_trusted_setup_file(KZGSettings *out, FILE *in, uint64_t precompute);

void free_trusted_setup(KZGSettings *s);

#ifdef __cplusplus
}
#endif
