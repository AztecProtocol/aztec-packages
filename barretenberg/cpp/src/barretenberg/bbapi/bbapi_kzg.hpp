#pragma once
/**
 * @file bbapi_kzg.hpp
 * @brief KZG-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for KZG operations including trusted setup loading,
 * blob commitments, proof generation and verification for EIP-4844.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct KzgLoadTrustedSetup
 * @brief Load the trusted setup for KZG operations from byte buffers
 *
 * This must be called before any other KZG operations.
 */
struct KzgLoadTrustedSetup {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgLoadTrustedSetup";

    /**
     * @struct Response
     * @brief Empty response indicating successful trusted setup loading
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgLoadTrustedSetupResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief G1 points in Lagrange form */
    std::vector<uint8_t> g1_lagrange;
    /** @brief G1 points in monomial form */
    std::vector<uint8_t> g1_monomial;
    /** @brief G2 points in monomial form */
    std::vector<uint8_t> g2_monomial;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(g1_lagrange, g1_monomial, g2_monomial);
    bool operator==(const KzgLoadTrustedSetup&) const = default;
};

/**
 * @struct KzgFreeTrustedSetup
 * @brief Free the loaded trusted setup
 */
struct KzgFreeTrustedSetup {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgFreeTrustedSetup";

    /**
     * @struct Response
     * @brief Empty response indicating successful cleanup
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgFreeTrustedSetupResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    Response execute(BBApiRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const KzgFreeTrustedSetup&) const = default;
};

/**
 * @struct KzgBlobToCommitment
 * @brief Convert a blob to a KZG commitment
 */
struct KzgBlobToCommitment {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgBlobToCommitment";

    /**
     * @struct Response
     * @brief Contains the computed KZG commitment
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgBlobToCommitmentResponse";

        /** @brief KZG commitment (48 bytes) */
        std::vector<uint8_t> commitment;
        MSGPACK_FIELDS(commitment);
        bool operator==(const Response&) const = default;
    };

    /** @brief Input blob data (131072 bytes = 4096 field elements * 32 bytes) */
    std::vector<uint8_t> blob_data;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(blob_data);
    bool operator==(const KzgBlobToCommitment&) const = default;
};

/**
 * @struct KzgComputeProof
 * @brief Compute KZG proof for polynomial at evaluation point z
 *
 * Returns both the proof and the evaluation y = p(z)
 */
struct KzgComputeProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgComputeProof";

    /**
     * @struct Response
     * @brief Contains the KZG proof and evaluation result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgComputeProofResponse";

        /** @brief KZG proof (48 bytes) */
        std::vector<uint8_t> proof;
        /** @brief Evaluation y = p(z) (32 bytes) */
        std::vector<uint8_t> y;
        MSGPACK_FIELDS(proof, y);
        bool operator==(const Response&) const = default;
    };

    /** @brief Input blob data (131072 bytes) */
    std::vector<uint8_t> blob_data;
    /** @brief Evaluation point z (32 bytes) */
    std::vector<uint8_t> z;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(blob_data, z);
    bool operator==(const KzgComputeProof&) const = default;
};

/**
 * @struct KzgComputeBlobProof
 * @brief Compute blob KZG proof (for EIP-4844 verification)
 */
struct KzgComputeBlobProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgComputeBlobProof";

    /**
     * @struct Response
     * @brief Contains the blob KZG proof
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgComputeBlobProofResponse";

        /** @brief KZG proof (48 bytes) */
        std::vector<uint8_t> proof;
        MSGPACK_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };

    /** @brief Input blob data (131072 bytes) */
    std::vector<uint8_t> blob_data;
    /** @brief KZG commitment (48 bytes) */
    std::vector<uint8_t> commitment;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(blob_data, commitment);
    bool operator==(const KzgComputeBlobProof&) const = default;
};

/**
 * @struct KzgVerifyProof
 * @brief Verify a KZG proof that p(z) = y
 */
struct KzgVerifyProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgVerifyProof";

    /**
     * @struct Response
     * @brief Contains the verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgVerifyProofResponse";

        /** @brief True if the proof is valid */
        bool valid;
        MSGPACK_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief KZG commitment (48 bytes) */
    std::vector<uint8_t> commitment;
    /** @brief Evaluation point z (32 bytes) */
    std::vector<uint8_t> z;
    /** @brief Claimed evaluation y (32 bytes) */
    std::vector<uint8_t> y;
    /** @brief KZG proof (48 bytes) */
    std::vector<uint8_t> proof;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(commitment, z, y, proof);
    bool operator==(const KzgVerifyProof&) const = default;
};

/**
 * @struct KzgVerifyBlobProof
 * @brief Verify blob KZG proof (for EIP-4844)
 */
struct KzgVerifyBlobProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgVerifyBlobProof";

    /**
     * @struct Response
     * @brief Contains the verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgVerifyBlobProofResponse";

        /** @brief True if the proof is valid */
        bool valid;
        MSGPACK_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief Input blob data (131072 bytes) */
    std::vector<uint8_t> blob_data;
    /** @brief KZG commitment (48 bytes) */
    std::vector<uint8_t> commitment;
    /** @brief KZG proof (48 bytes) */
    std::vector<uint8_t> proof;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(blob_data, commitment, proof);
    bool operator==(const KzgVerifyBlobProof&) const = default;
};

/**
 * @struct KzgVerifyBlobProofBatch
 * @brief Verify multiple blob KZG proofs in batch (more efficient)
 */
struct KzgVerifyBlobProofBatch {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgVerifyBlobProofBatch";

    /**
     * @struct Response
     * @brief Contains the batch verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KzgVerifyBlobProofBatchResponse";

        /** @brief True if all proofs are valid */
        bool valid;
        MSGPACK_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief Array of blob data (count * 131072 bytes) */
    std::vector<uint8_t> blobs;
    /** @brief Array of commitments (count * 48 bytes) */
    std::vector<uint8_t> commitments;
    /** @brief Array of proofs (count * 48 bytes) */
    std::vector<uint8_t> proofs;
    /** @brief Number of blobs/commitments/proofs */
    uint32_t count;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(blobs, commitments, proofs, count);
    bool operator==(const KzgVerifyBlobProofBatch&) const = default;
};

} // namespace bb::bbapi
