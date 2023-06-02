#pragma once

#include <barretenberg/barretenberg.hpp>

#include <cstddef>
#include <cstdint>


WASM_EXPORT size_t base_rollup__init_proving_key(uint8_t const** pk_buf);
WASM_EXPORT size_t base_rollup__init_verification_key(uint8_t const* pk_buf, uint8_t const** vk_buf);
WASM_EXPORT size_t base_rollup__dummy_previous_rollup(uint8_t const** previous_rollup_buf);
CBIND_DECL(base_rollup__sim);
WASM_EXPORT size_t base_rollup__verify_proof(uint8_t const* vk_buf,
                                             uint8_t const* proof,
                                             uint32_t length);
