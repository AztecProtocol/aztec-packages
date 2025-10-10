/**
 * @file bbapi_kzg.cpp
 * @brief Implementation of KZG command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_kzg.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "ckzg.h"
#include "eip4844/blob.h"
#include "eip4844/eip4844.h"
#include "setup/setup.h"
#include <cstring>

// Global KZG settings (loaded once, similar to original c_bind.cpp)
static KZGSettings g_kzg_settings;
static bool g_kzg_initialized = false;

namespace bb::bbapi {

KzgLoadTrustedSetup::Response KzgLoadTrustedSetup::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (g_kzg_initialized) {
        // Already initialized - skip
        return {};
    }

    // Load trusted setup from byte arrays
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
    return {};
}

KzgFreeTrustedSetup::Response KzgFreeTrustedSetup::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (g_kzg_initialized) {
        free_trusted_setup(&g_kzg_settings);
        g_kzg_initialized = false;
    }
    return {};
}

KzgBlobToCommitment::Response KzgBlobToCommitment::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call KzgLoadTrustedSetup first.");
    }

    // Validate blob size (BYTES_PER_BLOB is defined in c-kzg headers)
    if (blob_data.size() != BYTES_PER_BLOB) {
        throw_or_abort("Invalid blob size. Expected 131072 bytes.");
    }

    // Cast to c-kzg types
    const Blob* blob = reinterpret_cast<const Blob*>(blob_data.data());

    // Allocate output buffer
    Response response;
    response.commitment.resize(48);
    KZGCommitment* commitment = reinterpret_cast<KZGCommitment*>(response.commitment.data());

    // Call c-kzg function
    C_KZG_RET ret = blob_to_kzg_commitment(commitment, blob, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("blob_to_kzg_commitment failed");
    }

    return response;
}

KzgComputeProof::Response KzgComputeProof::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call KzgLoadTrustedSetup first.");
    }

    // Validate sizes
    // BYTES_PER_BLOB is defined in c-kzg headers
    if (blob_data.size() != BYTES_PER_BLOB) {
        throw_or_abort("Invalid blob size. Expected 131072 bytes.");
    }
    if (z.size() != 32) {
        throw_or_abort("Invalid z size. Expected 32 bytes.");
    }

    // Cast to c-kzg types
    const Blob* blob = reinterpret_cast<const Blob*>(blob_data.data());
    const Bytes32* z_ptr = reinterpret_cast<const Bytes32*>(z.data());

    // Allocate output buffers
    Response response;
    response.proof.resize(48);
    response.y.resize(32);
    KZGProof* proof = reinterpret_cast<KZGProof*>(response.proof.data());
    Bytes32* y_ptr = reinterpret_cast<Bytes32*>(response.y.data());

    // Call c-kzg function
    C_KZG_RET ret = compute_kzg_proof(proof, y_ptr, blob, z_ptr, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("compute_kzg_proof failed");
    }

    return response;
}

KzgComputeBlobProof::Response KzgComputeBlobProof::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call KzgLoadTrustedSetup first.");
    }

    // Validate sizes
    // BYTES_PER_BLOB is defined in c-kzg headers
    if (blob_data.size() != BYTES_PER_BLOB) {
        throw_or_abort("Invalid blob size. Expected 131072 bytes.");
    }
    if (commitment.size() != 48) {
        throw_or_abort("Invalid commitment size. Expected 48 bytes.");
    }

    // Cast to c-kzg types
    const Blob* blob = reinterpret_cast<const Blob*>(blob_data.data());
    const Bytes48* commitment_ptr = reinterpret_cast<const Bytes48*>(commitment.data());

    // Allocate output buffer
    Response response;
    response.proof.resize(48);
    KZGProof* proof = reinterpret_cast<KZGProof*>(response.proof.data());

    // Call c-kzg function
    C_KZG_RET ret = compute_blob_kzg_proof(proof, blob, commitment_ptr, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("compute_blob_kzg_proof failed");
    }

    return response;
}

KzgVerifyProof::Response KzgVerifyProof::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call KzgLoadTrustedSetup first.");
    }

    // Validate sizes
    if (commitment.size() != 48) {
        throw_or_abort("Invalid commitment size. Expected 48 bytes.");
    }
    if (z.size() != 32) {
        throw_or_abort("Invalid z size. Expected 32 bytes.");
    }
    if (y.size() != 32) {
        throw_or_abort("Invalid y size. Expected 32 bytes.");
    }
    if (proof.size() != 48) {
        throw_or_abort("Invalid proof size. Expected 48 bytes.");
    }

    // Cast to c-kzg types
    const Bytes48* commitment_ptr = reinterpret_cast<const Bytes48*>(commitment.data());
    const Bytes32* z_ptr = reinterpret_cast<const Bytes32*>(z.data());
    const Bytes32* y_ptr = reinterpret_cast<const Bytes32*>(y.data());
    const Bytes48* proof_ptr = reinterpret_cast<const Bytes48*>(proof.data());

    // Call c-kzg function
    Response response;
    C_KZG_RET ret = verify_kzg_proof(&response.valid, commitment_ptr, z_ptr, y_ptr, proof_ptr, &g_kzg_settings);
    if (ret != C_KZG_OK) {
        throw_or_abort("verify_kzg_proof failed");
    }

    return response;
}

KzgVerifyBlobProof::Response KzgVerifyBlobProof::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call KzgLoadTrustedSetup first.");
    }

    // Validate sizes
    // BYTES_PER_BLOB is defined in c-kzg headers
    if (blob_data.size() != BYTES_PER_BLOB) {
        throw_or_abort("Invalid blob size. Expected 131072 bytes.");
    }
    if (commitment.size() != 48) {
        throw_or_abort("Invalid commitment size. Expected 48 bytes.");
    }
    if (proof.size() != 48) {
        throw_or_abort("Invalid proof size. Expected 48 bytes.");
    }

    // Cast to c-kzg types
    const Blob* blob = reinterpret_cast<const Blob*>(blob_data.data());
    const Bytes48* commitment_ptr = reinterpret_cast<const Bytes48*>(commitment.data());
    const Bytes48* proof_ptr = reinterpret_cast<const Bytes48*>(proof.data());

    // Call c-kzg function
    Response response;
    verify_blob_kzg_proof(&response.valid, blob, commitment_ptr, proof_ptr, &g_kzg_settings);

    return response;
}

KzgVerifyBlobProofBatch::Response KzgVerifyBlobProofBatch::execute(BBApiRequest& request) &&
{
    (void)request; // Unused, but kept for API consistency

    if (!g_kzg_initialized) {
        throw_or_abort("KZG not initialized. Call KzgLoadTrustedSetup first.");
    }

    // Validate sizes (constants defined in c-kzg headers)
    // BYTES_PER_COMMITMENT is defined in c-kzg headers
    // BYTES_PER_PROOF is defined in c-kzg headers

    if (blobs.size() != count * BYTES_PER_BLOB) {
        throw_or_abort("Invalid blobs size. Expected " + std::to_string(count * BYTES_PER_BLOB) + " bytes.");
    }
    if (commitments.size() != count * BYTES_PER_COMMITMENT) {
        throw_or_abort("Invalid commitments size. Expected " + std::to_string(count * BYTES_PER_COMMITMENT) +
                       " bytes.");
    }
    if (proofs.size() != count * BYTES_PER_PROOF) {
        throw_or_abort("Invalid proofs size. Expected " + std::to_string(count * BYTES_PER_PROOF) + " bytes.");
    }

    // Cast to c-kzg types
    const Blob* blobs_ptr = reinterpret_cast<const Blob*>(blobs.data());
    const Bytes48* commitments_ptr = reinterpret_cast<const Bytes48*>(commitments.data());
    const Bytes48* proofs_ptr = reinterpret_cast<const Bytes48*>(proofs.data());

    // Call c-kzg function
    Response response;
    verify_blob_kzg_proof_batch(&response.valid, blobs_ptr, commitments_ptr, proofs_ptr, count, &g_kzg_settings);

    return response;
}

} // namespace bb::bbapi
