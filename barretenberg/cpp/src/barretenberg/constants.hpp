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

static constexpr uint32_t CONST_ECCVM_LOG_N = 15;

static constexpr uint32_t MAX_LOOKUP_TABLES_SIZE = 75000;

static constexpr uint32_t MAX_DATABUS_SIZE = 10000;

// DEBUG
// static constexpr uint32_t MAX_LOOKUP_TABLES_SIZE = 8;
// static constexpr uint32_t MAX_DATABUS_SIZE = 2;

// The number of entries in ProverPolynomials reserved for randomness intended to mask witness commitments, witness
// evaluation at the sumcheck challenge, and, if necessary, the evaluation of the corresponding shift
static constexpr uint32_t MASKING_OFFSET = 4;
} // namespace bb