#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/chonk_acir_test_utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/chonk_production_mirror.hpp"
#include "barretenberg/noir_programs_boomerang_values/chonk_validation.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

namespace {

using namespace bb;
using namespace acir_format;
using Builder = UltraCircuitBuilder;
using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;

void ensure_chonk_crs_initialized()
{
    static const bool crs_initialized = []() {
        srs::init_file_crs_factory(srs::bb_crs_path());
        srs::init_grumpkin_mem_crs_factory(srs::generate_grumpkin_srs(ECCVMFlavor::ECCVM_FIXED_SIZE));
        return true;
    }();
    static_cast<void>(crs_initialized);
}

void check_acir_round_trip(const size_t num_acir_public_inputs)
{
    ensure_chonk_crs_initialized();
    const auto vk = create_mock_honk_vk<MegaZKFlavor, IO>(1 << MegaZKFlavor::VIRTUAL_LOG_N, num_acir_public_inputs);
    const HonkProof flat_proof = create_mock_chonk_proof<Builder>(num_acir_public_inputs);

    std::vector<fr> witness;
    const RecursionConstraint constraint = recursion_data_to_recursion_constraint(
        witness, flat_proof, vk->to_field_elements(), vk->hash(), fr::one(), num_acir_public_inputs, PROOF_TYPE::CHONK);

    const std::vector<uint32_t> stitched_indices =
        add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    ASSERT_EQ(stitched_indices.size(), flat_proof.size());
    ASSERT_EQ(constraint.public_inputs.size(), num_acir_public_inputs);

    std::vector<fr> stitched_proof;
    stitched_proof.reserve(stitched_indices.size());
    for (const uint32_t index : stitched_indices) {
        stitched_proof.push_back(witness.at(index));
    }
    EXPECT_EQ(stitched_proof, flat_proof);

    const ChonkProof parsed = ChonkProof::from_field_elements(stitched_proof);
    EXPECT_EQ(parsed.to_field_elements(), flat_proof);
    EXPECT_EQ(parsed.hiding_oink_proof.size(),
              ChonkProof::HIDING_OINK_LENGTH + IO::PUBLIC_INPUTS_SIZE + num_acir_public_inputs);
    EXPECT_EQ(parsed.merge_proof.size(), MERGE_PROOF_SIZE);
    EXPECT_EQ(parsed.eccvm_proof.size(), ECCVMFlavor::PROOF_LENGTH);
    EXPECT_EQ(parsed.ipa_proof.size(), ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH);
    EXPECT_EQ(parsed.joint_proof.size(), ChonkProof::JOINT_PROOF_LENGTH);
}

void execute_oink_and_kernel_io(Builder& builder, const RecursionConstraint& constraint)
{
    using field_ct = stdlib::field_t<Builder>;
    using RecursiveVK = ChonkRecursiveVerifier::VK;
    using VKAndHash = ChonkRecursiveVerifier::VKAndHash;
    using RecursiveIO = stdlib::recursion::honk::HidingKernelIO<Builder>;

    const auto proof_indices = add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    auto key_fields = fields_from_witnesses(builder, constraint.key);
    auto proof_fields = fields_from_witnesses(builder, proof_indices);
    field_ct vk_hash = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash);
    ChonkStdlibProof proof = ChonkStdlibProof::from_field_elements(proof_fields);

    auto transcript = std::make_shared<typename GoblinRecursiveVerifier::Transcript>();
    BatchedHonkTranslatorRecursiveVerifier verifier(vk_and_hash, transcript);
    const auto oink_result = verifier.verify_mega_zk_oink(proof.hiding_oink_proof);
    RecursiveIO kernel_io;
    kernel_io.reconstruct_from_public(oink_result.public_inputs);
    kernel_io.kernel_return_data.incomplete_assert_equal(oink_result.kernel_calldata_commitment);
}

OinkVerifierValidation::ChonkOinkValidationResult validate_semantic_oink(Builder& builder,
                                                                         cdg::StaticAnalyzer_<fr, Builder>& analyzer,
                                                                         const RecursionConstraint& constraint)
{
    constexpr size_t fixed_size = MERGE_PROOF_SIZE + ECCVMFlavor::PROOF_LENGTH + ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH +
                                  ChonkProof::JOINT_PROOF_LENGTH;
    const auto proof_indices = add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    const size_t hiding_size = proof_indices.size() - fixed_size;
    const auto hiding = std::span(proof_indices).first(hiding_size);
    const size_t total_public_inputs = constraint.public_inputs.size() + IO::PUBLIC_INPUTS_SIZE;
    const auto public_inputs = hiding.first(total_public_inputs);
    const auto oink_body = hiding.subspan(total_public_inputs, ChonkProof::HIDING_OINK_LENGTH);
    return OinkVerifierValidation::validate_chonk_oink<fr>(builder,
                                                           analyzer,
                                                           constraint,
                                                           { public_inputs.begin(), public_inputs.end() },
                                                           { oink_body.begin(), oink_body.end() });
}

TEST(AcirChonkSerialization, RoundTripNoAcirPublicInputs)
{
    check_acir_round_trip(0);
}

TEST(AcirChonkSerialization, RoundTripOneAcirPublicInput)
{
    check_acir_round_trip(1);
}

TEST(AcirChonkSerialization, RoundTripFourAcirPublicInputs)
{
    check_acir_round_trip(4);
}

TEST(AcirChonkWitnessAlignment, AcirChonkWitnessSerializationParse)
{
    check_acir_round_trip(0);
    check_acir_round_trip(1);
    check_acir_round_trip(4);
}

TEST(ChonkRecursionTestSuite, AcirChonkFingerprintsMatchConstants)
{
    AcirProgram production_program = chonk_boomerang::make_production_chonk_acir_program();
    Builder production_builder = create_circuit<Builder>(production_program, { .has_ipa_claim = true });

    AcirProgram mirror_program = chonk_boomerang::make_production_chonk_acir_program();
    Builder mirror_builder{ mirror_program.witness, mirror_program.constraints.public_inputs, false };
    const auto trace = chonk_boomerang::execute_production_mirror(
        mirror_builder, mirror_program.constraints.chonk_recursion_constraints.at(0));

    ASSERT_FALSE(trace.boundaries.empty());
    EXPECT_EQ(trace.boundaries.back().second.sizes,
              recursion_helpers::BlockSnapshot::capture(production_builder).sizes);
    EXPECT_TRUE(trace.all_checks_passed);

    AcirFormat constraint_system = production_program.constraints;
    cdg::StaticAnalyzerAcir analyzer(std::move(constraint_system), std::move(production_builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST(AcirChonkProductionMirror, DumpProductionFingerprints)
{
    AcirProgram program = chonk_boomerang::make_production_chonk_acir_program();
    Builder builder{ program.witness, program.constraints.public_inputs, false };
    const auto trace =
        chonk_boomerang::execute_production_mirror(builder, program.constraints.chonk_recursion_constraints.at(0));

    ASSERT_GT(trace.boundaries.size(), 1);
    const auto& blocks = builder.blocks.get();
    const auto& serialization_end = trace.boundaries.front().second;
    for (size_t block_idx = 0; block_idx < blocks.size(); ++block_idx) {
        const size_t finish = serialization_end.sizes.at(block_idx);
        if (finish == 0) {
            continue;
        }
        const size_t prefix_size = std::min(recursion_helpers::SCANNER_FINGERPRINT_SIZE, finish);
        const size_t prefix_hash =
            block_idx == recursion_helpers::ULTRA_BLOCK_ARITHMETIC
                ? recursion_helpers::calculate_hash_arithmetic_block(builder, 0, prefix_size)
                : sha256_helpers::compute_selector_hash(0, blocks[block_idx], 0, prefix_size - 1);
        const size_t full_hash = block_idx == recursion_helpers::ULTRA_BLOCK_ARITHMETIC
                                     ? recursion_helpers::calculate_hash_arithmetic_block(builder, 0, finish)
                                     : sha256_helpers::compute_selector_hash(0, blocks[block_idx], 0, finish - 1);
        info("CHONK_SERIALIZATION_FP|", block_idx, "|", finish, "|", prefix_hash, "|", full_hash, "|", prefix_size);
    }
    for (size_t stage_idx = 1; stage_idx < trace.boundaries.size(); ++stage_idx) {
        const auto& [stage_name, after] = trace.boundaries[stage_idx];
        const auto& before = trace.boundaries[stage_idx - 1].second;
        for (size_t block_idx = 0; block_idx < blocks.size(); ++block_idx) {
            const size_t start = before.sizes.at(block_idx);
            const size_t finish = after.sizes.at(block_idx);
            if (finish == start) {
                continue;
            }
            const size_t prefix_size = std::min(recursion_helpers::SCANNER_FINGERPRINT_SIZE, finish - start);
            const size_t prefix_hash =
                block_idx == recursion_helpers::ULTRA_BLOCK_ARITHMETIC
                    ? recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + prefix_size)
                    : sha256_helpers::compute_selector_hash(0, blocks[block_idx], start, start + prefix_size - 1);
            const size_t full_hash =
                block_idx == recursion_helpers::ULTRA_BLOCK_ARITHMETIC
                    ? recursion_helpers::calculate_hash_arithmetic_block(builder, start, finish)
                    : sha256_helpers::compute_selector_hash(0, blocks[block_idx], start, finish - 1);
            info("CHONK_FP|",
                 stage_name,
                 "|",
                 block_idx,
                 "|",
                 finish - start,
                 "|",
                 prefix_hash,
                 "|",
                 full_hash,
                 "|",
                 prefix_size);
        }
    }
}

TEST(AcirChonkProductionMirror, AcirChonkPrimitiveStartDiscovery)
{
    AcirProgram program = chonk_boomerang::make_production_chonk_acir_program();
    Builder builder{ program.witness, program.constraints.public_inputs, false };

    const uint32_t a = builder.add_variable(fr::one());
    const uint32_t b = builder.add_variable(fr(2));
    const uint32_t c = builder.add_variable(fr(3));
    builder.create_add_gate({ a, b, c, fr::one(), fr::one(), -fr::one(), fr::zero() });
    const auto unrelated_prefix = recursion_helpers::BlockSnapshot::capture(builder);

    const auto trace =
        chonk_boomerang::execute_production_mirror(builder, program.constraints.chonk_recursion_constraints.at(0));
    cdg::StaticAnalyzer_<fr, Builder> analyzer(builder, false);
    const auto validation =
        chonk_validation::validate<fr>(builder, analyzer, program.constraints.chonk_recursion_constraints.at(0));
    const auto& serialization_nnf = chonk_validation::SERIALIZATION_NNF_FINGERPRINT;
    EXPECT_TRUE(
        recursion_helpers::matches_fingerprint_at(builder,
                                                  builder.blocks.get()[serialization_nnf.block],
                                                  validation.serialization_ranges.at(serialization_nnf.block).start,
                                                  serialization_nnf.value));
    ASSERT_TRUE(validation.all_valid);
    ASSERT_FALSE(trace.boundaries.empty());

    EXPECT_LT(unrelated_prefix.sizes.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC),
              validation.stages.at(static_cast<size_t>(chonk_validation::Stage::OINK_ONLY))
                  .ranges.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC)
                  .start);
    EXPECT_EQ(validation.serialization_ranges.at(serialization_nnf.block).start,
              unrelated_prefix.sizes.at(serialization_nnf.block));
    const auto& oink = validation.stages.at(static_cast<size_t>(chonk_validation::Stage::OINK_ONLY));
    for (const size_t block : { recursion_helpers::ULTRA_BLOCK_ARITHMETIC,
                                recursion_helpers::ULTRA_BLOCK_NNF,
                                recursion_helpers::ULTRA_BLOCK_POSEIDON2_EXT,
                                recursion_helpers::ULTRA_BLOCK_POSEIDON2_INT }) {
        EXPECT_EQ(oink.ranges.at(block).start, trace.boundaries.front().second.sizes.at(block));
    }
}

TEST(AcirChonkWitnessAlignment, KernelIoWitnessSliceAfterAcirPublicInputs)
{
    for (const size_t num_acir_public_inputs : { 0UL, 1UL, 2UL, 3UL, 4UL }) {
        std::vector<uint32_t> hiding(num_acir_public_inputs + IO::PUBLIC_INPUTS_SIZE + 3);
        std::iota(hiding.begin(), hiding.end(), 0);
        const auto kernel_io = chonk_validation::kernel_io_witnesses(hiding, num_acir_public_inputs);
        ASSERT_EQ(kernel_io.size(), IO::PUBLIC_INPUTS_SIZE);
        EXPECT_EQ(kernel_io.front(), num_acir_public_inputs);
        EXPECT_EQ(kernel_io.back(), num_acir_public_inputs + IO::PUBLIC_INPUTS_SIZE - 1);
    }
}

TEST(AcirChonkSemanticOink, SupportsVariableAcirPublicInputs)
{
    ensure_chonk_crs_initialized();
    for (const size_t num_acir_public_inputs : { 0UL, 1UL, 4UL }) {
        AcirProgram program = chonk_boomerang::make_mock_chonk_acir_program(num_acir_public_inputs);
        Builder builder{ program.witness, program.constraints.public_inputs, false };
        const auto& constraint = program.constraints.chonk_recursion_constraints.at(0);
        execute_oink_and_kernel_io(builder, constraint);
        cdg::StaticAnalyzer_<fr, Builder> analyzer(builder, false);

        const auto validation = validate_semantic_oink(builder, analyzer, constraint);
        EXPECT_TRUE(validation.is_valid) << num_acir_public_inputs;
        EXPECT_NE(validation.beta, UINT32_MAX);
        EXPECT_NE(validation.gamma, UINT32_MAX);
        EXPECT_NE(validation.public_input_delta, UINT32_MAX);
    }
}

TEST(AcirChonkSemanticOink, DetectsPublicInputAndDeltaCorruption)
{
    ensure_chonk_crs_initialized();
    AcirProgram program = chonk_boomerang::make_mock_chonk_acir_program(1);
    Builder builder{ program.witness, program.constraints.public_inputs, false };
    const auto& constraint = program.constraints.chonk_recursion_constraints.at(0);
    execute_oink_and_kernel_io(builder, constraint);
    cdg::StaticAnalyzer_<fr, Builder> analyzer(builder, false);

    const auto valid = validate_semantic_oink(builder, analyzer, constraint);
    ASSERT_TRUE(valid.is_valid);
    const auto stitched = add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    const auto hiding = std::span(stitched).first(constraint.public_inputs.size() + IO::PUBLIC_INPUTS_SIZE);
    auto blocks = builder.blocks.get();

    auto corrupt_linked_gate = [&](const uint32_t witness) {
        struct CorruptedSelector {
            size_t block;
            size_t gate;
            GateKind kind;
            fr original;
        };
        std::vector<CorruptedSelector> corrupted_selectors;
        const uint32_t real = builder.real_variable_index.at(witness);
        for (const auto& [block, gate] : analyzer.get_variable_gates(real)) {
            if (block != recursion_helpers::ULTRA_BLOCK_ARITHMETIC &&
                block != recursion_helpers::ULTRA_BLOCK_POSEIDON2_EXT &&
                block != recursion_helpers::ULTRA_BLOCK_POSEIDON2_INT) {
                continue;
            }
            const auto [start, end] = valid.block_ranges.at(block);
            if (start == SIZE_MAX || gate < start || gate >= end) {
                continue;
            }
            const GateKind kind =
                block == recursion_helpers::ULTRA_BLOCK_ARITHMETIC
                    ? GateKind::Arith
                    : (block == recursion_helpers::ULTRA_BLOCK_POSEIDON2_EXT ? GateKind::Poseidon2Ext
                                                                             : GateKind::Poseidon2Int);
            auto& selector = blocks[block].gate_selector_for(kind);
            const fr original = selector[gate];
            if (original.is_zero()) {
                continue;
            }
            corrupted_selectors.push_back({ block, gate, kind, original });
            selector.set(gate, fr::zero());
        }
        ASSERT_FALSE(corrupted_selectors.empty()) << "No Oink gate linked to public-input witness " << witness;
        EXPECT_FALSE(validate_semantic_oink(builder, analyzer, constraint).is_valid);
        for (const auto& corrupted : corrupted_selectors) {
            blocks[corrupted.block].gate_selector_for(corrupted.kind).set(corrupted.gate, corrupted.original);
        }
    };

    corrupt_linked_gate(hiding.front());
    corrupt_linked_gate(hiding[constraint.public_inputs.size()]);

    {
        const auto [start, end] = valid.block_ranges.at(recursion_helpers::ULTRA_BLOCK_POSEIDON2_EXT);
        ASSERT_LT(start, end);
        auto& selector = blocks[recursion_helpers::ULTRA_BLOCK_POSEIDON2_EXT].gate_selector_for(GateKind::Poseidon2Ext);
        const size_t gate = end - OinkVerifierValidation::CHONK_TRANSCRIPT_PERMUTATION_POSEIDON2_EXT.gate_count;
        const fr original = selector[gate];
        ASSERT_FALSE(original.is_zero());
        selector.set(gate, fr::zero());
        EXPECT_FALSE(validate_semantic_oink(builder, analyzer, constraint).is_valid);
        selector.set(gate, original);
    }

    const uint32_t delta = valid.public_input_delta;
    bool corrupted_delta = false;
    for (const auto& [block, gate] : analyzer.get_variable_gates(delta)) {
        if (block != recursion_helpers::ULTRA_BLOCK_ARITHMETIC) {
            continue;
        }
        const auto [start, end] = valid.block_ranges.at(block);
        if (gate < start || gate >= end || blocks[block].q_m()[gate] != fr::one()) {
            continue;
        }
        const size_t delta_start = gate + 1 - recursion_helpers::public_input_delta_gate_count(hiding.size());
        constexpr size_t INTERMEDIATE_DELTA_GATE_OFFSET = 10;
        const size_t intermediate_gate = delta_start + INTERMEDIATE_DELTA_GATE_OFFSET;
        const fr intermediate_original = blocks[block].q_c()[intermediate_gate];
        blocks[block].q_c().set(intermediate_gate, intermediate_original + fr::one());
        EXPECT_FALSE(validate_semantic_oink(builder, analyzer, constraint).is_valid);
        blocks[block].q_c().set(intermediate_gate, intermediate_original);

        const fr original = blocks[block].q_m()[gate];
        blocks[block].q_m().set(gate, fr::zero());
        EXPECT_FALSE(validate_semantic_oink(builder, analyzer, constraint).is_valid);
        blocks[block].q_m().set(gate, original);
        corrupted_delta = true;
        break;
    }
    EXPECT_TRUE(corrupted_delta);
}

TEST(AcirChonkAnchoring, IgnoresTrailingGates)
{
    AcirProgram program = chonk_boomerang::make_production_chonk_acir_program();
    Builder builder{ program.witness, program.constraints.public_inputs, false };
    const auto& constraint = program.constraints.chonk_recursion_constraints.at(0);
    chonk_boomerang::execute_production_mirror(builder, constraint);
    const auto chonk_end = recursion_helpers::BlockSnapshot::capture(builder);

    const uint32_t a = builder.add_variable(fr::one());
    const uint32_t b = builder.add_variable(fr(2));
    const uint32_t c = builder.add_variable(fr(3));
    builder.create_add_gate({ a, b, c, fr::one(), fr::one(), -fr::one(), fr::zero() });

    cdg::StaticAnalyzer_<fr, Builder> analyzer(builder, false);
    const auto validation = chonk_validation::validate<fr>(builder, analyzer, constraint);
    ASSERT_TRUE(validation.all_valid);
    const auto& finalization =
        validation.stages.at(static_cast<size_t>(chonk_validation::Stage::ACIR_OUTPUT_FINALIZATION));
    EXPECT_EQ(finalization.ranges.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC).end,
              chonk_end.sizes.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC));
    EXPECT_LT(finalization.ranges.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC).end, builder.blocks.arithmetic.size());
}

TEST(ChonkRecursionTestSuite, DetectsCorruptionInEveryProductionStage)
{
    AcirProgram program = chonk_boomerang::make_production_chonk_acir_program();
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    cdg::StaticAnalyzer_<fr, Builder> analyzer(builder, false);
    const auto& constraint = program.constraints.chonk_recursion_constraints.at(0);

    const auto valid = chonk_validation::validate<fr>(builder, analyzer, constraint);
    ASSERT_TRUE(valid.all_valid);

    auto blocks = builder.blocks.get();
    {
        const auto& range = valid.serialization_ranges.at(recursion_helpers::ULTRA_BLOCK_NNF);
        ASSERT_NE(range.start, SIZE_MAX);
        const fr original = blocks[recursion_helpers::ULTRA_BLOCK_NNF].q_c()[range.start];
        blocks[recursion_helpers::ULTRA_BLOCK_NNF].q_c().set(range.start, original + fr::one());
        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, constraint);
        EXPECT_FALSE(corrupted.serialization_fingerprint_valid);
        EXPECT_FALSE(corrupted.all_valid);
        blocks[recursion_helpers::ULTRA_BLOCK_NNF].q_c().set(range.start, original);
    }
    {
        const auto& range = valid.serialization_ranges.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC);
        constexpr size_t INTERIOR_SERIALIZATION_GATE_OFFSET = 100;
        ASSERT_LT(range.start + INTERIOR_SERIALIZATION_GATE_OFFSET, range.end);
        const size_t gate = range.start + INTERIOR_SERIALIZATION_GATE_OFFSET;
        const fr original = blocks[recursion_helpers::ULTRA_BLOCK_ARITHMETIC].q_c()[gate];
        blocks[recursion_helpers::ULTRA_BLOCK_ARITHMETIC].q_c().set(gate, original + fr::one());
        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, constraint);
        EXPECT_FALSE(corrupted.serialization_fingerprint_valid);
        EXPECT_FALSE(corrupted.all_valid);
        blocks[recursion_helpers::ULTRA_BLOCK_ARITHMETIC].q_c().set(gate, original);
    }

    {
        const auto& oink = valid.stages.at(static_cast<size_t>(chonk_validation::Stage::OINK_ONLY))
                               .ranges.at(recursion_helpers::ULTRA_BLOCK_ARITHMETIC);
        const fr original = blocks[recursion_helpers::ULTRA_BLOCK_ARITHMETIC].q_c()[oink.start];
        blocks[recursion_helpers::ULTRA_BLOCK_ARITHMETIC].q_c().set(oink.start, original + fr::one());
        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, constraint);
        EXPECT_FALSE(corrupted.semantic_oink.is_valid);
        EXPECT_FALSE(corrupted.all_valid);
        blocks[recursion_helpers::ULTRA_BLOCK_ARITHMETIC].q_c().set(oink.start, original);
    }

    for (size_t stage_idx = 1; stage_idx < static_cast<size_t>(chonk_validation::Stage::COUNT); ++stage_idx) {
        const auto fingerprint =
            std::find_if(chonk_validation::FINGERPRINTS.begin(),
                         chonk_validation::FINGERPRINTS.end(),
                         [&](const auto& candidate) { return static_cast<size_t>(candidate.stage) == stage_idx; });
        ASSERT_NE(fingerprint, chonk_validation::FINGERPRINTS.end());

        const auto& range = valid.stages.at(stage_idx).ranges.at(fingerprint->block);
        ASSERT_NE(range.start, SIZE_MAX);
        auto& selector = blocks[fingerprint->block].q_c();
        const fr original = selector[range.start];
        selector.set(range.start, original + fr::one());

        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, constraint);
        EXPECT_FALSE(corrupted.all_valid) << "stage " << stage_idx;
        EXPECT_FALSE(corrupted.stages.at(stage_idx).fingerprint_valid) << "stage " << stage_idx;
        selector.set(range.start, original);
    }

    const uint32_t unused_witness = builder.add_variable(fr::random_element());
    {
        auto bad_constraint = constraint;
        bad_constraint.key_hash = unused_witness;
        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, bad_constraint);
        EXPECT_FALSE(corrupted.stages.at(static_cast<size_t>(chonk_validation::Stage::OINK_ONLY)).witness_link_valid);
    }
    {
        auto bad_constraint = constraint;
        std::fill(bad_constraint.key.begin(), bad_constraint.key.end(), unused_witness);
        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, bad_constraint);
        EXPECT_FALSE(corrupted.serialization_witness_link_valid);
    }

    constexpr size_t fixed_proof_size = MERGE_PROOF_SIZE + ECCVMFlavor::PROOF_LENGTH +
                                        ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH + ChonkProof::JOINT_PROOF_LENGTH;
    const size_t hiding_size = constraint.proof.size() - fixed_proof_size;
    auto expect_broken_link = [&](const size_t offset, const size_t size, const chonk_validation::Stage stage) {
        auto bad_constraint = constraint;
        std::fill_n(bad_constraint.proof.begin() + static_cast<std::ptrdiff_t>(offset), size, unused_witness);
        const auto corrupted = chonk_validation::validate<fr>(builder, analyzer, bad_constraint);
        EXPECT_FALSE(corrupted.stages.at(static_cast<size_t>(stage)).witness_link_valid);
    };
    expect_broken_link(0, hiding_size, chonk_validation::Stage::OINK_ONLY);
    expect_broken_link(hiding_size, MERGE_PROOF_SIZE, chonk_validation::Stage::MERGE);
    expect_broken_link(hiding_size + MERGE_PROOF_SIZE, ECCVMFlavor::PROOF_LENGTH, chonk_validation::Stage::ECCVM);
    expect_broken_link(hiding_size + MERGE_PROOF_SIZE + ECCVMFlavor::PROOF_LENGTH,
                       ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH,
                       chonk_validation::Stage::ACIR_OUTPUT_FINALIZATION);
    expect_broken_link(constraint.proof.size() - ChonkProof::JOINT_PROOF_LENGTH,
                       ChonkProof::JOINT_PROOF_LENGTH,
                       chonk_validation::Stage::JOINT_COMMITTED_SUMCHECK);

    const auto joint_pcs = std::find_if(
        chonk_validation::FINGERPRINTS.begin(), chonk_validation::FINGERPRINTS.end(), [](const auto& candidate) {
            return candidate.stage == chonk_validation::Stage::JOINT_SHPLEMINI_PCS;
        });
    ASSERT_NE(joint_pcs, chonk_validation::FINGERPRINTS.end());
    const auto& joint_range =
        valid.stages.at(static_cast<size_t>(chonk_validation::Stage::JOINT_SHPLEMINI_PCS)).ranges.at(joint_pcs->block);
    blocks[joint_pcs->block].q_c().set(joint_range.start,
                                       blocks[joint_pcs->block].q_c()[joint_range.start] + fr::one());

    AcirFormat constraint_system = program.constraints;
    cdg::StaticAnalyzerAcir top_level_analyzer(std::move(constraint_system), std::move(builder));
    EXPECT_TRUE(top_level_analyzer.get_incorrect_opcodes().contains(0));
}

} // namespace
