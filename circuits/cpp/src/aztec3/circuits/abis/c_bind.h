#include <cstdint>
#include <cstddef>
#include "aztec3/msgpack/cbind.h"
#include <algorithm>

WASM_EXPORT void abis__hash_tx_request(uint8_t const* tx_request_buf, uint8_t* output);

WASM_EXPORT void abis__compute_function_selector(char const* func_sig_cstr, uint8_t* output);

WASM_EXPORT void abis__compute_function_leaf(uint8_t const* function_leaf_preimage_buf, uint8_t* output);

WASM_EXPORT void abis__compute_function_tree_root(uint8_t const* function_leaves_buf,
                                                  uint8_t* output);

WASM_EXPORT void abis__compute_function_tree(uint8_t const* function_leaves_buf,
                                             uint8_t* output);

WASM_EXPORT void abis__hash_vk(uint8_t const* vk_data_buf, uint8_t* output);

WASM_EXPORT void abis__hash_constructor(uint8_t const* func_data_buf,
                                        uint8_t const* args_buf,
                                        uint8_t const* constructor_vk_hash_buf,
                                        uint8_t* output);

CBIND_DECL(abis__compute_contract_address);

WASM_EXPORT void abis__compute_contract_leaf(uint8_t const* contract_leaf_preimage_buf, uint8_t* output);
