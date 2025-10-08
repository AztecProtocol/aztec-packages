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

#include "eip4844/blob.h"
#include "common/bytes.h"

#include <stdio.h> /* For printf */

/**
 * Deserialize a blob (array of bytes) into a polynomial (array of field elements).
 *
 * @param[out]  p       The output polynomial (array of field elements)
 * @param[in]   blob    The blob (an array of bytes)
 *
 * @remark The polynomial is of degree (at most) FIELD_ELEMENTS_PER_BLOB - 1. That is,
 * the function will set the first FIELD_ELEMENTS_PER_BLOB elements of p.
 */
C_KZG_RET blob_to_polynomial(fr_t *p, const Blob *blob) {
    C_KZG_RET ret;
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        ret = bytes_to_bls_field(&p[i], (const Bytes32 *)&blob->bytes[i * BYTES_PER_FIELD_ELEMENT]);
        if (ret != C_KZG_OK) return ret;
    }
    return C_KZG_OK;
}

/**
 * Print a Blob to the console.
 *
 * @param[in]   blob    The Blob to print
 */
void print_blob(const Blob *blob) {
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        const Bytes32 *field = (const Bytes32 *)&blob->bytes[i * BYTES_PER_FIELD_ELEMENT];
        print_bytes32(field);
    }
}
