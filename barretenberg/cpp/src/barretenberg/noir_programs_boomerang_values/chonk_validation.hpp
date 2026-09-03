#pragma once

/**
 * @file chonk_validation.hpp
 * @brief Validates ACIR-backed CHONK recursion construction using production-stage fingerprints and witness links.
 */

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"

namespace bb::chonk_validation {

using recursion_helpers::SCANNER_FINGERPRINT_SIZE;
using recursion_helpers::ULTRA_BLOCK_ARITHMETIC;
using recursion_helpers::ULTRA_BLOCK_ELLIPTIC;
using recursion_helpers::ULTRA_BLOCK_MEMORY;
using recursion_helpers::ULTRA_BLOCK_NNF;
using recursion_helpers::ULTRA_BLOCK_POSEIDON2_EXT;
using recursion_helpers::ULTRA_BLOCK_POSEIDON2_INT;

/** @brief Production CHONK stages validated in recursive-verifier execution order. */
enum class Stage : uint8_t {
    OINK_ONLY,
    KERNEL_IO_DATABUS,
    MERGE,
    ECCVM,
    JOINT_TRANSLATOR_OINK,
    JOINT_COMMITTED_SUMCHECK,
    JOINT_SHPLEMINI_PCS,
    OUTPUT_AGGREGATION,
    ACIR_OUTPUT_FINALIZATION,
    COUNT,
};

/** @brief Fingerprint metadata for one production stage in one execution-trace block. */
struct Fingerprint {
    Stage stage;
    size_t block;
    recursion_helpers::FunctionFingerprint value;
};

/** @brief Fingerprint metadata for a block-local operation outside the staged verifier chain. */
struct BlockFingerprint {
    size_t block;
    recursion_helpers::FunctionFingerprint value;
};

inline constexpr std::array FINGERPRINTS{
    Fingerprint{ Stage::KERNEL_IO_DATABUS,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 683, 3300576537548107642ULL, 7168848738012626868ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::KERNEL_IO_DATABUS,
                 ULTRA_BLOCK_NNF,
                 { 460, 9597988890089570214ULL, 12867440540418116472ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::MERGE,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 77321, 3300576537548107642ULL, 14344035100740713938ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::MERGE,
                 ULTRA_BLOCK_MEMORY,
                 { 4595, 15383583471802579689ULL, 7184192658312166273ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::MERGE,
                 ULTRA_BLOCK_NNF,
                 { 43792, 9597988890089570214ULL, 8106182424122377407ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::MERGE,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 270, 15451349259357675649ULL, 10529117908679203630ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::MERGE,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 1539, 18351710661041967697ULL, 4003396106037333684ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ECCVM,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 90008, 10176457587695493970ULL, 9642233238914746522ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ECCVM,
                 ULTRA_BLOCK_ELLIPTIC,
                 { 15656, 12108997647406547221ULL, 18027705484937731182ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ECCVM,
                 ULTRA_BLOCK_MEMORY,
                 { 14640, 15383583471802579689ULL, 7023119998799378958ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ECCVM,
                 ULTRA_BLOCK_NNF,
                 { 44729, 9597988890089570214ULL, 12721354902791167651ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ECCVM,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 2110, 15451349259357675649ULL, 4842232922589363908ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ECCVM,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 12027, 18351710661041967697ULL, 9450284387108588385ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_TRANSLATOR_OINK,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 1409, 12818432037899771678ULL, 11465933893515225736ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_TRANSLATOR_OINK,
                 ULTRA_BLOCK_NNF,
                 { 846, 9597988890089570214ULL, 10436250088855292146ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_TRANSLATOR_OINK,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 170, 15451349259357675649ULL, 14406333718801862981ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_TRANSLATOR_OINK,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 969, 18351710661041967697ULL, 17585245843096243739ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_COMMITTED_SUMCHECK,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 4936, 8857018563112042960ULL, 14139836988663651820ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_COMMITTED_SUMCHECK,
                 ULTRA_BLOCK_NNF,
                 { 1240, 9597988890089570214ULL, 16878260960391731358ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_COMMITTED_SUMCHECK,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 1070, 15451349259357675649ULL, 4779088471931223091ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_COMMITTED_SUMCHECK,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 6099, 18351710661041967697ULL, 13945745341541801142ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_SHPLEMINI_PCS,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 393541, 5609728017185645021ULL, 6555123114730163855ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_SHPLEMINI_PCS,
                 ULTRA_BLOCK_MEMORY,
                 { 27555, 15383583471802579689ULL, 9448115758764471398ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_SHPLEMINI_PCS,
                 ULTRA_BLOCK_NNF,
                 { 215298, 9597988890089570214ULL, 7320750510088418176ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_SHPLEMINI_PCS,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 580, 15451349259357675649ULL, 8667037252893421020ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::JOINT_SHPLEMINI_PCS,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 3306, 18351710661041967697ULL, 895707899644697828ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::OUTPUT_AGGREGATION,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 32593, 8769705703053790106ULL, 4692258616004745789ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::OUTPUT_AGGREGATION,
                 ULTRA_BLOCK_MEMORY,
                 { 1310, 15383583471802579689ULL, 5958499117039133651ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::OUTPUT_AGGREGATION,
                 ULTRA_BLOCK_NNF,
                 { 18432, 14014278140692711202ULL, 14468827360662128442ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::OUTPUT_AGGREGATION,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 80, 15451349259357675649ULL, 17753480509529643391ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::OUTPUT_AGGREGATION,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 456, 18351710661041967697ULL, 9689871824944577703ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ACIR_OUTPUT_FINALIZATION,
                 ULTRA_BLOCK_ARITHMETIC,
                 { 13013, 3525001896473865604ULL, 17061428040061051006ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ACIR_OUTPUT_FINALIZATION,
                 ULTRA_BLOCK_ELLIPTIC,
                 { 3308, 12108997647406547221ULL, 4859228934832882757ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ACIR_OUTPUT_FINALIZATION,
                 ULTRA_BLOCK_MEMORY,
                 { 2800, 15383583471802579689ULL, 73802566061902188ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ACIR_OUTPUT_FINALIZATION,
                 ULTRA_BLOCK_NNF,
                 { 4064, 9597988890089570214ULL, 9299552964259667112ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ACIR_OUTPUT_FINALIZATION,
                 ULTRA_BLOCK_POSEIDON2_EXT,
                 { 620, 15451349259357675649ULL, 1256185288276530632ULL, SCANNER_FINGERPRINT_SIZE } },
    Fingerprint{ Stage::ACIR_OUTPUT_FINALIZATION,
                 ULTRA_BLOCK_POSEIDON2_INT,
                 { 3534, 18351710661041967697ULL, 8134392184193138654ULL, SCANNER_FINGERPRINT_SIZE } },
};

inline constexpr BlockFingerprint SERIALIZATION_NNF_FINGERPRINT{
    .block = ULTRA_BLOCK_NNF,
    .value = { 1798, 9597988890089570214ULL, 9520128473726866297ULL, SCANNER_FINGERPRINT_SIZE },
};
inline constexpr size_t SERIALIZATION_ARITH_NORMALIZED_GATE_COUNT = 4544;
inline constexpr size_t SERIALIZATION_ARITH_NORMALIZED_HASH = 850000748917342110ULL;

/** @brief Half-open gate range `[start, end)` within one execution-trace block. */
struct Range {
    size_t start = SIZE_MAX;
    size_t end = SIZE_MAX;
};

/** @brief Fingerprint, witness-link, and per-block range results for one production stage. */
struct StageResult {
    bool fingerprint_valid = true;
    bool witness_link_valid = true;
    std::vector<Range> ranges;
};

/** @brief Complete validation result for serialization and every CHONK production stage. */
struct Result {
    std::array<StageResult, static_cast<size_t>(Stage::COUNT)> stages{};
    std::vector<Range> serialization_ranges;
    bool serialization_valid = false;
    bool serialization_fingerprint_valid = true;
    bool serialization_witness_link_valid = false;
    OinkVerifierValidation::ChonkOinkValidationResult semantic_oink;
    bool all_valid = false;
};

/**
 * @brief Select the HidingKernelIO public-input witnesses from the stitched hiding Oink proof.
 *
 * The hiding segment begins with ACIR public inputs followed by the fixed-size
 * HidingKernelIO public inputs. Returning an empty span signals an invalid layout.
 *
 * @param hiding Witness indices for the complete hiding Oink proof segment.
 * @param num_acir_public_inputs Number of ACIR public inputs prepended to the proof.
 * @return Span containing exactly HidingKernelIO::PUBLIC_INPUTS_SIZE witness indices, or an empty span.
 */
inline std::span<const uint32_t> kernel_io_witnesses(const std::span<const uint32_t> hiding,
                                                     const size_t num_acir_public_inputs)
{
    if (hiding.size() < num_acir_public_inputs + HidingKernelIO::PUBLIC_INPUTS_SIZE) {
        return {};
    }
    return hiding.subspan(num_acir_public_inputs, HidingKernelIO::PUBLIC_INPUTS_SIZE);
}

/**
 * @brief Check whether any supplied ACIR witness occurs inside a validated stage range.
 *
 * Witness aliases are canonicalized through Builder::real_variable_index. This
 * checks direct use of the same canonical variable in any execution-trace block;
 * it does not follow transitive dependencies through newly derived witnesses.
 *
 * @tparam FF Native field type used by the static analyzer.
 * @tparam Builder Circuit builder type.
 * @param witnesses ACIR witness indices to inspect.
 * @param builder Builder containing canonical variable mappings and trace blocks.
 * @param analyzer Static analyzer used to obtain all gates containing each variable.
 * @param result Validated per-block half-open ranges for one production stage.
 * @return True if at least one witness occurs in one of the stage ranges.
 */
template <typename FF, typename Builder>
bool any_witness_links_to_stage(const std::span<const uint32_t> witnesses,
                                Builder& builder,
                                cdg::StaticAnalyzer_<FF, Builder>& analyzer,
                                const StageResult& result)
{
    for (const uint32_t witness : witnesses) {
        const uint32_t real = builder.real_variable_index.at(witness);
        for (const auto& [block, gate] : analyzer.get_variable_gates(real)) {
            const Range& range = result.ranges.at(block);
            if (range.start != SIZE_MAX && gate >= range.start && gate < range.end) {
                return true;
            }
        }
    }
    return false;
}

/**
 * @brief Validate one CHONK recursion constraint against the current production circuit shape.
 *
 * Validation performs four checks:
 * 1. reconstruct and parse the stitched `{ public_inputs | proof }` witness layout;
 * 2. validate normalized VK-serialization fingerprints;
 * 3. validate all production stages in protocol order across every active trace block;
 * 4. require stage-local links from the corresponding ACIR proof/key witnesses.
 *
 * Every serialization and stage result contributes to Result::all_valid.
 *
 * Oink starts are derived from key-hash/proof witness links and semantic stage
 * fingerprints. Later stage cursors advance from those ranges, so unrelated
 * gates before or after the single production CHONK chain are excluded.
 *
 * @tparam FF Native field type used by the static analyzer.
 * @tparam Builder Circuit builder type.
 * @param builder Fully constructed ACIR circuit builder.
 * @param analyzer Static analyzer associated with builder.
 * @param constraint CHONK recursion constraint whose witnesses must anchor the validated stages.
 * @return Detailed serialization, fingerprint, witness-link, range, and aggregate validity results.
 */
template <typename FF, typename Builder>
Result validate(Builder& builder,
                cdg::StaticAnalyzer_<FF, Builder>& analyzer,
                const acir_format::RecursionConstraint& constraint)
{
    Result result;
    const auto proof_indices = acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    constexpr size_t fixed_size = MERGE_PROOF_SIZE + ECCVMFlavor::PROOF_LENGTH + ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH +
                                  ChonkProof::JOINT_PROOF_LENGTH;
    if (constraint.proof_type != acir_format::PROOF_TYPE::CHONK || proof_indices.size() < fixed_size) {
        return result;
    }
    const size_t hiding_size = proof_indices.size() - fixed_size;
    result.serialization_valid = hiding_size >= ChonkProof::HIDING_OINK_LENGTH + HidingKernelIO::PUBLIC_INPUTS_SIZE;

    auto blocks = builder.blocks.get();
    result.serialization_ranges.resize(blocks.size());
    for (auto& stage : result.stages) {
        stage.ranges.resize(blocks.size());
    }

    const auto hiding = std::span(proof_indices).subspan(0, hiding_size);
    const auto merge = std::span(proof_indices).subspan(hiding_size, MERGE_PROOF_SIZE);
    const auto eccvm = std::span(proof_indices).subspan(hiding_size + MERGE_PROOF_SIZE, ECCVMFlavor::PROOF_LENGTH);
    const auto ipa =
        std::span(proof_indices)
            .subspan(hiding_size + MERGE_PROOF_SIZE + ECCVMFlavor::PROOF_LENGTH, ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH);
    const auto joint = std::span(proof_indices).last(ChonkProof::JOINT_PROOF_LENGTH);

    const size_t total_public_inputs = constraint.public_inputs.size() + HidingKernelIO::PUBLIC_INPUTS_SIZE;
    if (hiding.size() >= total_public_inputs + ChonkProof::HIDING_OINK_LENGTH) {
        const auto public_input_span = hiding.first(total_public_inputs);
        const auto hiding_oink_span = hiding.subspan(total_public_inputs, ChonkProof::HIDING_OINK_LENGTH);
        const std::vector<uint32_t> public_input_witnesses(public_input_span.begin(), public_input_span.end());
        const std::vector<uint32_t> hiding_oink_body(hiding_oink_span.begin(), hiding_oink_span.end());
        result.semantic_oink = OinkVerifierValidation::validate_chonk_oink<FF>(
            builder, analyzer, constraint, public_input_witnesses, hiding_oink_body);
    }

    StageResult& oink = result.stages.at(static_cast<size_t>(Stage::OINK_ONLY));
    oink.fingerprint_valid = result.semantic_oink.is_valid;
    std::vector<size_t> cursors(blocks.size(), SIZE_MAX);
    if (result.semantic_oink.block_ranges.size() == blocks.size()) {
        for (size_t block = 0; block < blocks.size(); ++block) {
            const auto [start, end] = result.semantic_oink.block_ranges[block];
            if (start == SIZE_MAX) {
                continue;
            }
            oink.ranges[block] = { start, end };
            cursors[block] = end;
        }
    }

    const Range& oink_nnf = oink.ranges.at(SERIALIZATION_NNF_FINGERPRINT.block);
    if (oink_nnf.start == SIZE_MAX || oink_nnf.start < SERIALIZATION_NNF_FINGERPRINT.value.gate_count) {
        result.serialization_fingerprint_valid = false;
    } else {
        const size_t start = oink_nnf.start - SERIALIZATION_NNF_FINGERPRINT.value.gate_count;
        result.serialization_ranges[SERIALIZATION_NNF_FINGERPRINT.block] = { start, oink_nnf.start };
        const bool valid = recursion_helpers::matches_fingerprint_at(
            builder, blocks[SERIALIZATION_NNF_FINGERPRINT.block], start, SERIALIZATION_NNF_FINGERPRINT.value);
        if (!valid) {
            info("CHONK serialization NNF fingerprint mismatch at ", start, "; Oink NNF starts at ", oink_nnf.start);
        }
        result.serialization_fingerprint_valid &= valid;
    }

    const Range& oink_arith = oink.ranges.at(ULTRA_BLOCK_ARITHMETIC);
    if (oink_arith.start == SIZE_MAX) {
        result.serialization_fingerprint_valid = false;
    } else {
        size_t serialization_arith_start = oink_arith.start;
        size_t normalized_gate_count = 0;
        while (serialization_arith_start > 0 && normalized_gate_count < SERIALIZATION_ARITH_NORMALIZED_GATE_COUNT) {
            --serialization_arith_start;
            if (!recursion_helpers::is_fix_witness_gate(builder, serialization_arith_start)) {
                ++normalized_gate_count;
            }
        }
        result.serialization_ranges[ULTRA_BLOCK_ARITHMETIC] = { serialization_arith_start, oink_arith.start };
        const auto normalized_arith = recursion_helpers::calculate_normalized_hash_arithmetic_block(
            builder, serialization_arith_start, oink_arith.start);
        result.serialization_fingerprint_valid &= normalized_arith.first == SERIALIZATION_ARITH_NORMALIZED_GATE_COUNT &&
                                                  normalized_arith.second == SERIALIZATION_ARITH_NORMALIZED_HASH;
    }

    for (const auto& fp : FINGERPRINTS) {
        StageResult& stage = result.stages.at(static_cast<size_t>(fp.stage));
        size_t start = cursors.at(fp.block);
        if (start == SIZE_MAX && fp.stage == Stage::MERGE && fp.block == ULTRA_BLOCK_MEMORY) {
            const Range& source = stage.ranges.at(ULTRA_BLOCK_ARITHMETIC);
            if (source.start != SIZE_MAX) {
                const auto linked = recursion_helpers::collect_linked_gates(builder,
                                                                            analyzer,
                                                                            blocks[ULTRA_BLOCK_ARITHMETIC],
                                                                            source.start,
                                                                            source.end,
                                                                            blocks[ULTRA_BLOCK_MEMORY]);
                const auto anchored = recursion_helpers::find_fingerprint_range_containing_any_gate(
                    builder, blocks[ULTRA_BLOCK_MEMORY], linked, fp.value);
                start = anchored.value_or(SIZE_MAX);
            }
        } else if (start == SIZE_MAX && fp.stage == Stage::ECCVM && fp.block == ULTRA_BLOCK_ELLIPTIC) {
            const Range& source = stage.ranges.at(ULTRA_BLOCK_ARITHMETIC);
            if (source.start != SIZE_MAX) {
                const auto linked = recursion_helpers::collect_linked_gates(builder,
                                                                            analyzer,
                                                                            blocks[ULTRA_BLOCK_ARITHMETIC],
                                                                            source.start,
                                                                            source.end,
                                                                            blocks[ULTRA_BLOCK_ELLIPTIC]);
                const auto anchored = recursion_helpers::find_fingerprint_range_containing_any_gate(
                    builder, blocks[ULTRA_BLOCK_ELLIPTIC], linked, fp.value);
                start = anchored.value_or(SIZE_MAX);
            }
        }

        const bool valid =
            start != SIZE_MAX && recursion_helpers::matches_fingerprint_at(builder, blocks[fp.block], start, fp.value);
        if (!valid) {
            info("CHONK stage fingerprint mismatch: stage=",
                 static_cast<size_t>(fp.stage),
                 " block=",
                 fp.block,
                 " start=",
                 start);
        }
        stage.fingerprint_valid &= valid;
        if (valid) {
            stage.ranges.at(fp.block) = { start, start + fp.value.gate_count };
            cursors.at(fp.block) = start + fp.value.gate_count;
        }
    }

    auto link = [&](const Stage stage, const std::span<const uint32_t> witnesses) {
        StageResult& stage_result = result.stages.at(static_cast<size_t>(stage));
        stage_result.witness_link_valid = any_witness_links_to_stage<FF>(witnesses, builder, analyzer, stage_result);
    };
    link(Stage::OINK_ONLY, hiding);
    oink.witness_link_valid &=
        any_witness_links_to_stage<FF>(std::span(&constraint.key_hash, 1), builder, analyzer, oink);
    const auto kernel_io = kernel_io_witnesses(hiding, constraint.public_inputs.size());
    if (kernel_io.empty()) {
        result.serialization_valid = false;
    } else {
        link(Stage::KERNEL_IO_DATABUS, kernel_io);
    }
    link(Stage::MERGE, merge);
    link(Stage::ECCVM, eccvm);
    link(Stage::JOINT_TRANSLATOR_OINK, joint);
    link(Stage::JOINT_COMMITTED_SUMCHECK, joint);
    link(Stage::JOINT_SHPLEMINI_PCS, joint);
    link(Stage::ACIR_OUTPUT_FINALIZATION, ipa);

    StageResult& output = result.stages.at(static_cast<size_t>(Stage::OUTPUT_AGGREGATION));
    output.witness_link_valid = true;

    StageResult serialization_stage;
    serialization_stage.ranges = result.serialization_ranges;
    result.serialization_witness_link_valid =
        any_witness_links_to_stage<FF>(constraint.key, builder, analyzer, serialization_stage);

    result.all_valid = result.serialization_valid && result.serialization_fingerprint_valid &&
                       result.serialization_witness_link_valid && result.semantic_oink.is_valid;
    for (const auto& stage : result.stages) {
        result.all_valid &= stage.fingerprint_valid && stage.witness_link_valid;
    }
    return result;
}

} // namespace bb::chonk_validation
