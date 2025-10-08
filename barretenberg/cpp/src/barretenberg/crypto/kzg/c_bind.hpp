// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/wasm_export.hpp"
#include <cstddef>
#include <cstdint>

extern "C" {

/**
 * Load the trusted setup for KZG operations.
 * This must be called before any other KZG operations.
 *
 * @param trusted_setup_path Path to trusted setup file (if nullptr, uses embedded setup)
 * @return 0 on success, non-zero on failure
 */
WASM_EXPORT int kzg_load_trusted_setup(const char* trusted_setup_path);

/**
 * Free the loaded trusted setup.
 */
WASM_EXPORT void kzg_free_trusted_setup();

/**
 * Convert a blob to a KZG commitment.
 *
 * @param blob_data Input blob data (131072 bytes = 4096 field elements * 32 bytes)
 * @param commitment_out Output commitment (48 bytes)
 * @return 0 on success, non-zero on failure
 */
WASM_EXPORT int kzg_blob_to_kzg_commitment(const uint8_t* blob_data, uint8_t* commitment_out);

/**
 * Compute KZG proof for polynomial at evaluation point z.
 * Returns both the proof and the evaluation y = p(z).
 *
 * @param blob_data Input blob data (131072 bytes)
 * @param z_bytes Evaluation point z (32 bytes)
 * @param proof_out Output KZG proof (48 bytes)
 * @param y_out Output evaluation y = p(z) (32 bytes)
 * @return 0 on success, non-zero on failure
 */
WASM_EXPORT int kzg_compute_kzg_proof(const uint8_t* blob_data,
                                      const uint8_t* z_bytes,
                                      uint8_t* proof_out,
                                      uint8_t* y_out);

/**
 * Compute blob KZG proof (for EIP-4844 verification).
 *
 * @param blob_data Input blob data (131072 bytes)
 * @param commitment_bytes KZG commitment (48 bytes)
 * @param proof_out Output KZG proof (48 bytes)
 * @return 0 on success, non-zero on failure
 */
WASM_EXPORT int kzg_compute_blob_kzg_proof(const uint8_t* blob_data,
                                           const uint8_t* commitment_bytes,
                                           uint8_t* proof_out);

/**
 * Verify a KZG proof that p(z) = y.
 *
 * @param commitment_bytes KZG commitment (48 bytes)
 * @param z_bytes Evaluation point z (32 bytes)
 * @param y_bytes Claimed evaluation y (32 bytes)
 * @param proof_bytes KZG proof (48 bytes)
 * @param result_out Output result (1 = valid, 0 = invalid)
 * @return 0 on success (check result_out for validity), non-zero on error
 */
WASM_EXPORT int kzg_verify_kzg_proof(const uint8_t* commitment_bytes,
                                     const uint8_t* z_bytes,
                                     const uint8_t* y_bytes,
                                     const uint8_t* proof_bytes,
                                     bool* result_out);

/**
 * Verify blob KZG proof (for EIP-4844).
 *
 * @param blob_data Input blob data (131072 bytes)
 * @param commitment_bytes KZG commitment (48 bytes)
 * @param proof_bytes KZG proof (48 bytes)
 * @param result_out Output result (1 = valid, 0 = invalid)
 * @return 0 on success (check result_out for validity), non-zero on error
 */
WASM_EXPORT int kzg_verify_blob_kzg_proof(const uint8_t* blob_data,
                                          const uint8_t* commitment_bytes,
                                          const uint8_t* proof_bytes,
                                          bool* result_out);

/**
 * Verify multiple blob KZG proofs in batch (more efficient).
 *
 * @param blobs_data Array of blob data pointers
 * @param commitments_bytes Array of commitment pointers (48 bytes each)
 * @param proofs_bytes Array of proof pointers (48 bytes each)
 * @param count Number of blobs/commitments/proofs
 * @param result_out Output result (1 = all valid, 0 = at least one invalid)
 * @return 0 on success (check result_out for validity), non-zero on error
 */
WASM_EXPORT int kzg_verify_blob_kzg_proof_batch(const uint8_t** blobs_data,
                                                const uint8_t** commitments_bytes,
                                                const uint8_t** proofs_bytes,
                                                size_t count,
                                                bool* result_out);

// Constants
constexpr size_t BYTES_PER_BLOB = 131072; // 4096 * 32
constexpr size_t BYTES_PER_COMMITMENT = 48;
constexpr size_t BYTES_PER_PROOF = 48;
constexpr size_t BYTES_PER_FIELD_ELEMENT = 32;
constexpr size_t FIELD_ELEMENTS_PER_BLOB = 4096;
}
