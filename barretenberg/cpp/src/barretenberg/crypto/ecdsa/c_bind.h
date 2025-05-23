// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/common/wasm_export.hpp"
#include <ecc/curves/secp256k1/secp256k1.hpp>
#include <ecc/curves/secp256r1/secp256r1.hpp>

// secp256k1 curve

WASM_EXPORT void ecdsa__compute_public_key(uint8_t const* private_key, uint8_t* public_key_buf);

WASM_EXPORT void ecdsa__construct_signature(uint8_t const* message,
                                            size_t msg_len,
                                            uint8_t const* private_key,
                                            uint8_t* output_sig_r,
                                            uint8_t* output_sig_s,
                                            uint8_t* output_sig_v);

WASM_EXPORT void ecdsa__construct_signature_(uint8_t const* message_buf,
                                             uint8_t const* private_key,
                                             uint8_t* output_sig_r,
                                             uint8_t* output_sig_s,
                                             uint8_t* output_sig_v);

WASM_EXPORT void ecdsa__recover_public_key_from_signature(uint8_t const* message,
                                                          size_t msg_len,
                                                          uint8_t const* sig_r,
                                                          uint8_t const* sig_s,
                                                          uint8_t* sig_v,
                                                          uint8_t* output_pub_key);

WASM_EXPORT void ecdsa__recover_public_key_from_signature_(
    uint8_t const* message_buf, uint8_t const* sig_r, uint8_t const* sig_s, uint8_t* sig_v, uint8_t* output_pub_key);

WASM_EXPORT bool ecdsa__verify_signature(uint8_t const* message,
                                         size_t msg_len,
                                         uint8_t const* pub_key,
                                         uint8_t const* sig_r,
                                         uint8_t const* sig_s,
                                         uint8_t const* sig_v);

WASM_EXPORT bool ecdsa__verify_signature_(uint8_t const* message,
                                          uint8_t const* pub_key,
                                          uint8_t const* sig_r,
                                          uint8_t const* sig_s,
                                          uint8_t const* sig_v,
                                          bool* result);

// secp256r1 curve

WASM_EXPORT void ecdsa_r_compute_public_key(uint8_t const* private_key, uint8_t* public_key_buf);

WASM_EXPORT void ecdsa_r_construct_signature(uint8_t const* message,
                                             size_t msg_len,
                                             uint8_t const* private_key,
                                             uint8_t* output_sig_r,
                                             uint8_t* output_sig_s,
                                             uint8_t* output_sig_v);

WASM_EXPORT void ecdsa_r_construct_signature_(uint8_t const* message_buf,
                                              uint8_t const* private_key,
                                              uint8_t* output_sig_r,
                                              uint8_t* output_sig_s,
                                              uint8_t* output_sig_v);

WASM_EXPORT void ecdsa_r_recover_public_key_from_signature(uint8_t const* message,
                                                           size_t msg_len,
                                                           uint8_t const* sig_r,
                                                           uint8_t const* sig_s,
                                                           uint8_t* sig_v,
                                                           uint8_t* output_pub_key);

WASM_EXPORT void ecdsa_r_recover_public_key_from_signature_(
    uint8_t const* message_buf, uint8_t const* sig_r, uint8_t const* sig_s, uint8_t* sig_v, uint8_t* output_pub_key);

WASM_EXPORT bool ecdsa_r_verify_signature(uint8_t const* message,
                                          size_t msg_len,
                                          uint8_t const* pub_key,
                                          uint8_t const* sig_r,
                                          uint8_t const* sig_s,
                                          uint8_t const* sig_v);

WASM_EXPORT void ecdsa_r_verify_signature_(uint8_t const* message,
                                           uint8_t const* pub_key,
                                           uint8_t const* sig_r,
                                           uint8_t const* sig_s,
                                           uint8_t const* sig_v,
                                           bool* result);
