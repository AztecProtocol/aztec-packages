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

#include "common/fr.h"
#include "common/ret.h"

#include <inttypes.h> /* For uint*_t */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Macros
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The number of field elements in a blob. */
#define FIELD_ELEMENTS_PER_BLOB 4096

/** The number of bytes in a blob. */
#define BYTES_PER_BLOB (FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT)

/**
 * The logarithm (base 2) of the expansion factor of our Reed-Solomon code.
 * In other words, this defines the rate of the Reed-Solomon code (blob / extended blob).
 * Note that our codebase is not guaranteed to work anymore if this is changed.
 */
#define LOG_EXPANSION_FACTOR 1

/** The number of field elements in an extended blob. */
#define FIELD_ELEMENTS_PER_EXT_BLOB (FIELD_ELEMENTS_PER_BLOB << LOG_EXPANSION_FACTOR)

////////////////////////////////////////////////////////////////////////////////////////////////////
// Types
////////////////////////////////////////////////////////////////////////////////////////////////////

/** A basic blob data. */
typedef struct {
    uint8_t bytes[BYTES_PER_BLOB];
} Blob;

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

C_KZG_RET blob_to_polynomial(fr_t *p, const Blob *blob);
void print_blob(const Blob *blob);

#ifdef __cplusplus
}
#endif
