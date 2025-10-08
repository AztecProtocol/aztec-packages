// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "c_bind.hpp"
#include "c-kzg/ckzg.h"
#include "c-kzg/eip4844/blob.h"
#include "c-kzg/eip4844/eip4844.h"
#include <cstdio>
#include <cstring>
#include <stdexcept>

// Global KZG settings (loaded once)
static KZGSettings g_kzg_settings;
static bool g_kzg_initialized = false;

extern "C" {

WASM_EXPORT int kzg_load_trusted_setup(const char* trusted_setup_path)
{
    if (g_kzg_initialized) {
        return 0; // Already initialized
    }

    C_KZG_RET ret;
    if (trusted_setup_path == nullptr) {
        // Use embedded trusted setup from trusted_setup.txt
        // For now, we'll require the path to be provided
        // TODO: Embed the trusted setup data
        return 1; // Error: no trusted setup provided
    }

    // Open the file
    FILE* fp = fopen(trusted_setup_path, "r");
    if (fp == nullptr) {
        return 1; // Error: could not open file
    }

    // Load with precompute = 0 (no precomputation for now)
    ret = load_trusted_setup_file(&g_kzg_settings, fp, 0);
    fclose(fp);

    if (ret != C_KZG_OK) {
        return static_cast<int>(ret);
    }

    g_kzg_initialized = true;
    return 0;
}

WASM_EXPORT void kzg_free_trusted_setup()
{
    if (g_kzg_initialized) {
        free_trusted_setup(&g_kzg_settings);
        g_kzg_initialized = false;
    }
}

WASM_EXPORT int kzg_blob_to_kzg_commitment(const uint8_t* blob_data, uint8_t* commitment_out)
{
    if (!g_kzg_initialized) {
        return 1; // Error: not initialized
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    KZGCommitment* commitment = reinterpret_cast<KZGCommitment*>(commitment_out);

    C_KZG_RET ret = blob_to_kzg_commitment(commitment, blob, &g_kzg_settings);
    return static_cast<int>(ret);
}

WASM_EXPORT int kzg_compute_kzg_proof(const uint8_t* blob_data,
                                      const uint8_t* z_bytes,
                                      uint8_t* proof_out,
                                      uint8_t* y_out)
{
    if (!g_kzg_initialized) {
        return 1; // Error: not initialized
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    const Bytes32* z = reinterpret_cast<const Bytes32*>(z_bytes);
    KZGProof* proof = reinterpret_cast<KZGProof*>(proof_out);
    Bytes32* y = reinterpret_cast<Bytes32*>(y_out);

    C_KZG_RET ret = compute_kzg_proof(proof, y, blob, z, &g_kzg_settings);
    return static_cast<int>(ret);
}

WASM_EXPORT int kzg_compute_blob_kzg_proof(const uint8_t* blob_data,
                                           const uint8_t* commitment_bytes,
                                           uint8_t* proof_out)
{
    if (!g_kzg_initialized) {
        return 1; // Error: not initialized
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    const Bytes48* commitment = reinterpret_cast<const Bytes48*>(commitment_bytes);
    KZGProof* proof = reinterpret_cast<KZGProof*>(proof_out);

    C_KZG_RET ret = compute_blob_kzg_proof(proof, blob, commitment, &g_kzg_settings);
    return static_cast<int>(ret);
}

WASM_EXPORT int kzg_verify_kzg_proof(const uint8_t* commitment_bytes,
                                     const uint8_t* z_bytes,
                                     const uint8_t* y_bytes,
                                     const uint8_t* proof_bytes,
                                     bool* result_out)
{
    if (!g_kzg_initialized) {
        return 1; // Error: not initialized
    }

    const Bytes48* commitment = reinterpret_cast<const Bytes48*>(commitment_bytes);
    const Bytes32* z = reinterpret_cast<const Bytes32*>(z_bytes);
    const Bytes32* y = reinterpret_cast<const Bytes32*>(y_bytes);
    const Bytes48* proof = reinterpret_cast<const Bytes48*>(proof_bytes);

    C_KZG_RET ret = verify_kzg_proof(result_out, commitment, z, y, proof, &g_kzg_settings);
    return static_cast<int>(ret);
}

WASM_EXPORT int kzg_verify_blob_kzg_proof(const uint8_t* blob_data,
                                          const uint8_t* commitment_bytes,
                                          const uint8_t* proof_bytes,
                                          bool* result_out)
{
    if (!g_kzg_initialized) {
        return 1; // Error: not initialized
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    const Bytes48* commitment = reinterpret_cast<const Bytes48*>(commitment_bytes);
    const Bytes48* proof = reinterpret_cast<const Bytes48*>(proof_bytes);

    C_KZG_RET ret = verify_blob_kzg_proof(result_out, blob, commitment, proof, &g_kzg_settings);
    return static_cast<int>(ret);
}

WASM_EXPORT int kzg_verify_blob_kzg_proof_batch(const uint8_t** blobs_data,
                                                const uint8_t** commitments_bytes,
                                                const uint8_t** proofs_bytes,
                                                size_t count,
                                                bool* result_out)
{
    if (!g_kzg_initialized) {
        return 1; // Error: not initialized
    }

    const Blob* blobs = reinterpret_cast<const Blob*>(blobs_data[0]);
    const Bytes48* commitments = reinterpret_cast<const Bytes48*>(commitments_bytes[0]);
    const Bytes48* proofs = reinterpret_cast<const Bytes48*>(proofs_bytes[0]);

    C_KZG_RET ret = verify_blob_kzg_proof_batch(result_out, blobs, commitments, proofs, count, &g_kzg_settings);
    return static_cast<int>(ret);
}

} // extern "C"
