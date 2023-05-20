#pragma once
#include <barretenberg/serialize/cbind_fwd.hpp>

#include <cstddef>
#include <cstdint>

WASM_EXPORT size_t private_kernel__init_proving_key(uint8_t const** pk_buf);
WASM_EXPORT size_t private_kernel__init_verification_key(uint8_t const* pk_buf, uint8_t const** vk_buf);
CBIND_DECL(private_kernel__dummy_previous_kernel);
CBIND_DECL(private_kernel__sim);
CBIND_DECL(private_kernel__prove);
WASM_EXPORT size_t private_kernel__verify_proof(uint8_t const* vk_buf, uint8_t const* proof, uint32_t length);
