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

// The number of last rows in ProverPolynomials that are randomized to mask
// 1) witness commitments,
// 2) multilinear evaluations of witness polynomials in Sumcheck
// 3*) multilinear evaluations of shifts of witness polynomials in Sumcheck OR univariate evaluations required in ECCVM
static constexpr uint32_t NUM_MASKED_ROWS = 3;

// To account for the masked entries of witness polynomials in ZK-Sumcheck, we are disabling all relations in the last
// `NUM_MASKED_ROWS + 1` rows, where `+1` is needed for the shifts. Namely, any relation involving a shift of a masked
// polynomial w_shift, can't be satisfied on the row `N - (NUM_MASKED_ROWS + 1)`, as `w_shift.at(N - (NUM_MASKED_ROWS +
// 1))` is equal to the random value `w.at(N - NUM_MASKED_ROWS)`.
static constexpr uint32_t NUM_DISABLED_ROWS_IN_SUMCHECK = NUM_MASKED_ROWS + 1;

// For ZK Flavors: the number of the commitments required by Libra and SmallSubgroupIPA.
static constexpr uint32_t NUM_LIBRA_COMMITMENTS = 3;

// The SmallSubgroupIPA is a sub-protocol used in several Flavors, to prove claimed inner product, the Prover sends 4
// extra evaluations
static constexpr uint32_t NUM_SMALL_IPA_EVALUATIONS = 4;

static constexpr uint32_t MERGE_PROOF_SIZE = 65; // used to ensure mock proofs are generated correctly

// There are 5 distinguished wires in ECCVM that have to be opened as univariates to establish the connection between
// ECCVM and Translator
static constexpr uint32_t NUM_TRANSLATION_EVALUATIONS = 5;
// The interleaving trick needed for Translator adds 2 extra claims to Gemini fold claims
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1293): Decouple Gemini from Interleaving
static constexpr uint32_t NUM_INTERLEAVING_CLAIMS = 2;

// When we branch a transcript, we want to clearly distinguish between what happened before and after the branching. We
// increase the `round_index` of the original transcript by `BRANCHING_JUMP`, so that there is a gap of `BRANCHING_JUMP`
// round indices between what happened before and after the branching. This constant is arbitrary.
static constexpr std::size_t BRANCHING_JUMP = 5;
} // namespace bb
