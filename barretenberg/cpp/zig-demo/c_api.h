#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Declarations for the C functions we want to call from Zig
// These match the WASM_EXPORT functions in the C++ code

void ecc_grumpkin__mul(const uint8_t* point_buf, const uint8_t* scalar_buf, uint8_t* result);
void ecc_grumpkin__add(const uint8_t* point_a_buf, const uint8_t* point_b_buf, uint8_t* result);
void ecc_grumpkin__get_random_scalar_mod_circuit_modulus(uint8_t* result);
void ecc_grumpkin__batch_mul(const uint8_t* point_buf, const uint8_t* scalar_buf, uint32_t num_points, uint8_t* result);

void ecc_secp256k1__mul(const uint8_t* point_buf, const uint8_t* scalar_buf, uint8_t* result);
void ecc_secp256k1__get_random_scalar_mod_circuit_modulus(uint8_t* result);

void bn254_fr_sqrt(const uint8_t* input, uint8_t* result);

// Threading test function that will force pthread linking
void test_pthread_linking(void);

#ifdef __cplusplus
}
#endif