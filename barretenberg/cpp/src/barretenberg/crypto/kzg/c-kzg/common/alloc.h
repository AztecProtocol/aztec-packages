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
#include "common/fr.h"
#include "common/ret.h"

#include <stdbool.h> /* For bool */
#include <stddef.h>  /* For size_t */
#include <stdlib.h>  /* For free */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Macros
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Helper macro to release memory allocated on the heap. Unlike free(), c_kzg_free() macro sets the
 * pointer value to NULL after freeing it.
 */
#define c_kzg_free(p) \
    do { \
        free(p); \
        (p) = NULL; \
    } while (0)

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

C_KZG_RET c_kzg_malloc(void **out, size_t size);
C_KZG_RET c_kzg_calloc(void **out, size_t count, size_t size);
C_KZG_RET new_g1_array(g1_t **x, size_t n);
C_KZG_RET new_g2_array(g2_t **x, size_t n);
C_KZG_RET new_fr_array(fr_t **x, size_t n);
C_KZG_RET new_bool_array(bool **x, size_t n);

#ifdef __cplusplus
}
#endif
