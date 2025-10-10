// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "c_bind.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "c-kzg/ckzg.h"
#include "c-kzg/eip4844/blob.h"
#include "c-kzg/eip4844/eip4844.h"
#include "c-kzg/setup/setup.h"
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <vector>

using namespace bb;

// Global KZG settings (loaded once)
static KZGSettings g_kzg_settings;
static bool g_kzg_initialized = false;

extern "C" {

WASM_EXPORT void kzg_load_trusted_setup(uint8_t const* g1_lagrange_bytes,
                                        uint8_t const* g1_monomial_bytes,
                                        uint8_t const* g2_monomial_bytes)
{
    if (g_kzg_initialized) {
        return; // Already initialized
    }

    // Extract byte arrays from length-prefixed buffers
    std::vector<uint8_t> g1_lagrange;
    std::vector<uint8_t> g1_monomial;
    std::vector<uint8_t> g2_monomial;

    read(g1_lagrange_bytes, g1_lagrange);
    read(g1_monomial_bytes, g1_monomial);
    read(g2_monomial_bytes, g2_monomial);

    // Load trusted setup
    C_KZG_RET ret = load_trusted_setup(&g_kzg_settings,
                                       g1_monomial.data(),
                                       static_cast<uint64_t>(g1_monomial.size()),
                                       g1_lagrange.data(),
                                       static_cast<uint64_t>(g1_lagrange.size()),
                                       g2_monomial.data(),
                                       static_cast<uint64_t>(g2_monomial.size()),
                                       0 // precompute = 0
    );

    if (ret != C_KZG_OK) {
        throw_or_abort("Failed to load KZG trusted setup");
    }

    g_kzg_initialized = true;
}

WASM_EXPORT void kzg_free_trusted_setup()
{
    if (g_kzg_initialized) {
        free_trusted_setup(&g_kzg_settings);
        g_kzg_initialized = false;
    }
}

WASM_EXPORT void kzg_blob_to_kzg_commitment(uint8_t const* blob_data, uint8_t* commitment_out)
{
    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call kzg_load_trusted_setup first.");
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    KZGCommitment* commitment = reinterpret_cast<KZGCommitment*>(commitment_out);

    C_KZG_RET ret = blob_to_kzg_commitment(commitment, blob, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("blob_to_kzg_commitment failed");
    }
}

WASM_EXPORT void kzg_compute_kzg_proof(const uint8_t* blob_data,
                                       const uint8_t* z_bytes,
                                       uint8_t* proof_out,
                                       uint8_t* y_out)
{
    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call kzg_load_trusted_setup first.");
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    const Bytes32* z = reinterpret_cast<const Bytes32*>(z_bytes);
    KZGProof* proof = reinterpret_cast<KZGProof*>(proof_out);
    Bytes32* y = reinterpret_cast<Bytes32*>(y_out);

    C_KZG_RET ret = compute_kzg_proof(proof, y, blob, z, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("compute_kzg_proof failed");
    }
}

WASM_EXPORT void kzg_compute_blob_kzg_proof(const uint8_t* blob_data,
                                            const uint8_t* commitment_bytes,
                                            uint8_t* proof_out)
{
    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call kzg_load_trusted_setup first.");
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    const Bytes48* commitment = reinterpret_cast<const Bytes48*>(commitment_bytes);
    KZGProof* proof = reinterpret_cast<KZGProof*>(proof_out);

    C_KZG_RET ret = compute_blob_kzg_proof(proof, blob, commitment, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("compute_blob_kzg_proof failed");
    }
}

WASM_EXPORT void kzg_verify_kzg_proof(const uint8_t* commitment_bytes,
                                      const uint8_t* z_bytes,
                                      const uint8_t* y_bytes,
                                      const uint8_t* proof_bytes,
                                      bool* result_out)
{
    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call kzg_load_trusted_setup first.");
    }

    const Bytes48* commitment = reinterpret_cast<const Bytes48*>(commitment_bytes);
    const Bytes32* z = reinterpret_cast<const Bytes32*>(z_bytes);
    const Bytes32* y = reinterpret_cast<const Bytes32*>(y_bytes);
    const Bytes48* proof = reinterpret_cast<const Bytes48*>(proof_bytes);

    C_KZG_RET ret = verify_kzg_proof(result_out, commitment, z, y, proof, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("verify_kzg_proof failed");
    }
}

WASM_EXPORT void kzg_verify_blob_kzg_proof(const uint8_t* blob_data,
                                           const uint8_t* commitment_bytes,
                                           const uint8_t* proof_bytes,
                                           bool* result_out)
{
    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call kzg_load_trusted_setup first.");
    }

    const Blob* blob = reinterpret_cast<const Blob*>(blob_data);
    const Bytes48* commitment = reinterpret_cast<const Bytes48*>(commitment_bytes);
    const Bytes48* proof = reinterpret_cast<const Bytes48*>(proof_bytes);

    verify_blob_kzg_proof(result_out, blob, commitment, proof, &g_kzg_settings);
}

WASM_EXPORT void kzg_verify_blob_kzg_proof_batch(const uint8_t* blobs_data,
                                                 const uint8_t* commitments_bytes,
                                                 const uint8_t* proofs_bytes,
                                                 const uint32_t* count_in,
                                                 bool* result_out)
{
    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call kzg_load_trusted_setup first.");
    }

    const Blob* blobs = reinterpret_cast<const Blob*>(blobs_data);
    const Bytes48* commitments = reinterpret_cast<const Bytes48*>(commitments_bytes);
    const Bytes48* proofs = reinterpret_cast<const Bytes48*>(proofs_bytes);
    const uint32_t count = ntohl(*count_in);

    verify_blob_kzg_proof_batch(result_out, blobs, commitments, proofs, count, &g_kzg_settings);
}

} // extern "C"
