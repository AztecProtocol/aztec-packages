#pragma once
#include <cstdint>

namespace bb {
// The log of the max circuit size assumed in order to achieve constant sized Honk proofs
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1046): Remove the need for const sized proofs
static constexpr uint32_t CONST_PROOF_SIZE_LOG_N = 28;

// The log of the max circuit size of circuits being folded. This size is assumed by the PG prover and verifier in order
// to ensure a constant PG proof size and a PG recursive verifier circuit that is independent of the size of the
// circuits being folded.
static constexpr uint32_t CONST_PG_LOG_N = 20;

static constexpr uint32_t CONST_ECCVM_LOG_N = 16;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1193): potentially reenable for better memory performance
// static constexpr uint32_t MAX_LOOKUP_TABLES_SIZE = 80000;

static constexpr uint32_t MAX_DATABUS_SIZE = 10000;

// The number of entries in ProverPolynomials reserved for randomness intended to mask witness commitments, witness
// evaluation at the sumcheck challenge, and, if necessary, the evaluation of the corresponding shift
static constexpr uint32_t MASKING_OFFSET = 4;
// For ZK Flavors: the number of the commitments required by Libra and SmallSubgroupIPA.
static constexpr uint32_t NUM_LIBRA_COMMITMENTS = 3;
// The SmallSubgroupIPA is a sub-protocol used in several Flavors, to prove claimed inner product, the Prover sends 4
// extra evaluations
static constexpr uint32_t NUM_SMALL_IPA_EVALUATIONS = 4;

static constexpr uint32_t MERGE_PROOF_SIZE = 65; // used to ensure mock proofs are generated correctly
// There are 5 distinguished wires in ECCVM that have to be opened as univariates to establish the connection between
// ECCVM and Translator
static constexpr uint32_t NUM_TRANSLATION_EVALUATIONS = 5;
} // namespace bb
