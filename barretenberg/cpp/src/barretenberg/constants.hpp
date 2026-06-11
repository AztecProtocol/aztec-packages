#pragma once
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace bb {

// Arbitrarily large constant (> size of the BN254 srs) used to ensure that the evaluations on the hypercube of the
// permutation argument polynomials (sigmas, ids) are unique, e.g. id[i][j] == id[m][n] iff (i == m && j == n)
constexpr uint32_t PERMUTATION_ARGUMENT_VALUE_SEPARATOR = 1 << 28;

// The fixed size of the Translator trace where each accumulation gate, corresponding to one UltraOp, will occupy two
// rows.
static constexpr uint32_t CONST_TRANSLATOR_MINI_CIRCUIT_LOG_SIZE = 13;

// -1 as each op occupies two rows in Translator trace
static constexpr uint32_t CONST_OP_QUEUE_LOG_SIZE = CONST_TRANSLATOR_MINI_CIRCUIT_LOG_SIZE - 1;

// The log of the max circuit size assumed in order to achieve constant sized Honk proofs
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1046): Remove the need for const sized proofs
static constexpr uint32_t CONST_PROOF_SIZE_LOG_N = 25;

// The log of the max circuit size of circuits being folded. This size is assumed by the HN prover and verifier in order
// to ensure a constant HN proof size and a HN recursive verifier circuit that is independent of the size of the
// circuits being folded.
static constexpr uint32_t CONST_FOLDING_LOG_N = 24;
// Hiding kernel is a constant circuit that is being proven with MegaZKFlavor as a part Chonk
static constexpr uint32_t HIDING_KERNEL_LOG_N = 16;
// The size of the AVMRecursiveVerifier circuit arithmetized with Mega.
static constexpr uint32_t MEGA_AVM_LOG_N = 21;

static constexpr uint32_t CONST_ECCVM_LOG_N = 15;

// IPA proof length: 4 * CONST_ECCVM_LOG_N (L and R commitments) + 2 (G_0) + 2 (a_0)
// Note: Updating this requires updating noir protocol circuits (rollup-base-private,
// rollup-base-public, rollup-block-merge, rollup-block-root, rollup-merge, rollup-root)
static constexpr size_t IPA_PROOF_LENGTH = (4 * CONST_ECCVM_LOG_N) + 4;

// The number of rows randomized to mask witness polynomials, hiding (1) witness commitments, (2) multilinear
// evaluations of witness polynomials in Sumcheck, (3) evaluations of shifted witness polynomials in Sumcheck or
// univariate evaluations required in ECCVM. The masking values are placed in the rows NUM_ZERO_ROWS .. TRACE_OFFSET +
// NUM_ZERO_ROWS - 1 of the trace. (Recall that the first NUM_ZERO_ROWS are zeroed out.)
static constexpr uint32_t NUM_MASKED_ROWS = 3;

// The first NUM_MASKED_ROWS + 1 rows are disabled in Sumcheck (= TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK). The
// +1 accounts for shifts: the relation at row TRACE_OFFSET involves w_shift(TRACE_OFFSET) = w(TRACE_OFFSET + 1),
// but the gate separator vanishes there, so the first row where relations are active is TRACE_OFFSET.
static constexpr uint32_t NUM_DISABLED_ROWS_IN_SUMCHECK = NUM_MASKED_ROWS + 1;

// Number of wires in Ultra and Mega arithmetization
static constexpr uint32_t NUM_WIRES = 4;

static constexpr uint32_t MERGE_PROOF_SIZE = 42; // used to ensure mock proofs are generated correctly

// There are 5 distinguished wires in ECCVM that have to be opened as univariates to establish the connection between
// ECCVM and Translator
static constexpr uint32_t NUM_TRANSLATION_EVALUATIONS = 5;

// The number of leading zero rows in the execution trace. Used to enable shifted polynomials.
static constexpr size_t NUM_ZERO_ROWS = 1;

// The maximum number of app circuits a single kernel can recursively verify in one accumulation group.
static constexpr uint8_t MAX_APPS_PER_KERNEL = 3;

static constexpr size_t CHONK_MAX_NUM_APPS = 41;
static constexpr size_t compute_chonk_max_num_circuits()
{
    return CHONK_MAX_NUM_APPS + ((CHONK_MAX_NUM_APPS + MAX_APPS_PER_KERNEL - 1) / MAX_APPS_PER_KERNEL) +
           /*trailing kernels*/ 3;
}
static constexpr size_t CHONK_MAX_NUM_CIRCUITS = compute_chonk_max_num_circuits();

static constexpr size_t BATCH_MERGE_PROOF_SIZE =
    /*num subtables*/ 1 +
    /*shift sizes*/ CHONK_MAX_NUM_CIRCUITS +
    /*commitments*/ (4 * (4 * (CHONK_MAX_NUM_CIRCUITS + /*zk tables, merged tables*/ 2) + /*degree check*/ 1)) +
    /*evals*/ (4 * (CHONK_MAX_NUM_CIRCUITS + 2) + 1) +
    /*shplonk and kzg*/ 8;
} // namespace bb
