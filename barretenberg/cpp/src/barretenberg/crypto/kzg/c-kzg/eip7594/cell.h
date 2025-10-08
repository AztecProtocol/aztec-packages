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

#include "eip4844/blob.h"

#include <inttypes.h> /* For uint8_t */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Macros
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The number of field elements in a cell. */
#define FIELD_ELEMENTS_PER_CELL 64

/** The number of bytes in a single cell. */
#define BYTES_PER_CELL (FIELD_ELEMENTS_PER_CELL * BYTES_PER_FIELD_ELEMENT)

/** The number of cells in a blob. */
#define CELLS_PER_BLOB (FIELD_ELEMENTS_PER_BLOB / FIELD_ELEMENTS_PER_CELL)

/** The number of cells in an extended blob. */
#define CELLS_PER_EXT_BLOB (FIELD_ELEMENTS_PER_EXT_BLOB / FIELD_ELEMENTS_PER_CELL)

////////////////////////////////////////////////////////////////////////////////////////////////////
// Types
////////////////////////////////////////////////////////////////////////////////////////////////////

/** A single cell for a blob. */
typedef struct {
    uint8_t bytes[BYTES_PER_CELL];
} Cell;

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

void print_cell(const Cell *cell);

#ifdef __cplusplus
}
#endif
