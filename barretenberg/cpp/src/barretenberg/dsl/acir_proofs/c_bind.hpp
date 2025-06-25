// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include <barretenberg/common/serialize.hpp>
#include <barretenberg/common/wasm_export.hpp>
#include <barretenberg/ecc/curves/bn254/fr.hpp>
#include <cstddef>
#include <cstdint>

using namespace bb;

WASM_EXPORT void acir_get_circuit_sizes(uint8_t const* constraint_system_buf,
                                        bool const* recursive,
                                        bool const* honk_recursion,
                                        uint32_t* total,
                                        uint32_t* subgroup);

/**
 * @brief Construct and verify an UltraHonk proof
 *
 */
WASM_EXPORT void acir_prove_and_verify_ultra_honk(uint8_t const* constraint_system_buf,
                                                  uint8_t const* witness_buf,
                                                  bool* result);

/**
 * @brief Construct and verify a ClientIVC proof
 * @deprecated
 */
WASM_EXPORT void acir_prove_and_verify_mega_honk(uint8_t const* constraint_system_buf,
                                                 uint8_t const* witness_buf,
                                                 bool* result);

WASM_EXPORT void acir_prove_aztec_client(uint8_t const* ivc_inputs_buf, uint8_t** out_proof, uint8_t** out_vk);

WASM_EXPORT void acir_verify_aztec_client(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result);

WASM_EXPORT void acir_load_verification_key(in_ptr acir_composer_ptr, uint8_t const* vk_buf);

WASM_EXPORT void acir_init_verification_key(in_ptr acir_composer_ptr);

WASM_EXPORT void acir_get_verification_key(in_ptr acir_composer_ptr, uint8_t** out);

WASM_EXPORT void acir_get_proving_key(in_ptr acir_composer_ptr,
                                      uint8_t const* acir_vec,
                                      bool const* recursive,
                                      uint8_t** out);

WASM_EXPORT void acir_verify_proof(in_ptr acir_composer_ptr, uint8_t const* proof_buf, bool* result);

WASM_EXPORT void acir_get_solidity_verifier(in_ptr acir_composer_ptr, out_str_buf out);
WASM_EXPORT void acir_honk_solidity_verifier(uint8_t const* proof_buf, uint8_t const* vk_buf, out_str_buf out);

WASM_EXPORT void acir_serialize_proof_into_fields(in_ptr acir_composer_ptr,
                                                  uint8_t const* proof_buf,
                                                  uint32_t const* num_inner_public_inputs,
                                                  fr::vec_out_buf out);

WASM_EXPORT void acir_serialize_verification_key_into_fields(in_ptr acir_composer_ptr,
                                                             fr::vec_out_buf out_vkey,
                                                             fr::out_buf out_key_hash);

WASM_EXPORT void acir_prove_ultra_honk(uint8_t const* acir_vec,
                                       uint8_t const* witness_vec,
                                       uint8_t const* vk_buf,
                                       uint8_t** out);
WASM_EXPORT void acir_prove_ultra_keccak_honk(uint8_t const* acir_vec,
                                              uint8_t const* witness_vec,
                                              uint8_t const* vk_buf,
                                              uint8_t** out);
WASM_EXPORT void acir_prove_ultra_keccak_zk_honk(uint8_t const* acir_vec,
                                                 uint8_t const* witness_vec,
                                                 uint8_t const* vk_buf,
                                                 uint8_t** out);
WASM_EXPORT void acir_prove_ultra_starknet_honk(uint8_t const* acir_vec,
                                                uint8_t const* witness_vec,
                                                uint8_t const* vk_buf,
                                                uint8_t** out);
WASM_EXPORT void acir_prove_ultra_starknet_zk_honk(uint8_t const* acir_vec,
                                                   uint8_t const* witness_vec,
                                                   uint8_t const* vk_buf,
                                                   uint8_t** out);

WASM_EXPORT void acir_verify_ultra_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result);
WASM_EXPORT void acir_verify_ultra_keccak_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result);
WASM_EXPORT void acir_verify_ultra_keccak_zk_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result);
WASM_EXPORT void acir_verify_ultra_starknet_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result);
WASM_EXPORT void acir_verify_ultra_starknet_zk_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result);

WASM_EXPORT void acir_write_vk_ultra_honk(uint8_t const* acir_vec, uint8_t** out);
WASM_EXPORT void acir_write_vk_ultra_keccak_honk(uint8_t const* acir_vec, uint8_t** out);
WASM_EXPORT void acir_write_vk_ultra_keccak_zk_honk(uint8_t const* acir_vec, uint8_t** out);
WASM_EXPORT void acir_write_vk_ultra_starknet_honk(uint8_t const* acir_vec, uint8_t** out);
WASM_EXPORT void acir_write_vk_ultra_starknet_zk_honk(uint8_t const* acir_vec, uint8_t** out);

WASM_EXPORT void acir_proof_as_fields_ultra_honk(uint8_t const* proof_buf, fr::vec_out_buf out);

WASM_EXPORT void acir_vk_as_fields_ultra_honk(uint8_t const* vk_buf, fr::vec_out_buf out_vkey);

WASM_EXPORT void acir_vk_as_fields_mega_honk(uint8_t const* vk_buf, fr::vec_out_buf out_vkey);

WASM_EXPORT void acir_gates_aztec_client(uint8_t const* ivc_inputs_buf, uint8_t** out);
