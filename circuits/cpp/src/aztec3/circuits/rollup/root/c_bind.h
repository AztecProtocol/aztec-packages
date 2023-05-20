#include <cstdint>
#include <cstddef>
#include <barretenberg/serialize/cbind_fwd.hpp>


WASM_EXPORT size_t root_rollup__init_proving_key(uint8_t const** pk_buf);
WASM_EXPORT size_t root_rollup__init_verification_key(uint8_t const* pk_buf, uint8_t const** vk_buf);
CBIND_DECL(root_rollup__sim);

WASM_EXPORT size_t root_rollup__verify_proof(uint8_t const* vk_buf,
                                             uint8_t const* proof,
                                             uint32_t length);
