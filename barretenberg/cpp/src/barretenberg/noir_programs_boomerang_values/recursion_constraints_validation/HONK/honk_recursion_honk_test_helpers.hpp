#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_validation.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/honk_recursion_test_helpers.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

#include <algorithm>
#include <memory>
#include <set>
#include <vector>

namespace honk_recursion_test_helpers {

using NativeFlavor = RecursiveFlavor::NativeFlavor;
using IO = bb::stdlib::recursion::honk::DefaultIO<Builder>;
using field_ct = bb::stdlib::field_t<Builder>;
using RecursiveVK = RecursiveFlavor::VerificationKey;
using VKAndHash = RecursiveFlavor::VKAndHash;
using StdlibProof = bb::stdlib::Proof<Builder>;

struct HonkVerifierComponents {
    std::unique_ptr<Builder> builder_ptr;
    std::shared_ptr<VKAndHash> vk_and_hash;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierInst> verifier_instance;
    StdlibProof stdlib_proof;
    acir_format::RecursionConstraint constraint;
    size_t num_public_inputs = 0;
    size_t log_n = 0;

    Builder& builder() { return *builder_ptr; }
    const Builder& builder() const { return *builder_ptr; }
};

inline acir_format::AcirProgram make_mock_acir_program(size_t num_acir_pub_inputs = 0)
{
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t dyadic_size = size_t{ 1 } << log_n;
    auto native_vk = acir_format::create_mock_honk_vk<NativeFlavor, IO>(dyadic_size, num_acir_pub_inputs);
    auto native_proof = acir_format::create_mock_honk_proof<NativeFlavor, IO>(num_acir_pub_inputs);

    acir_format::AcirProgram program;
    auto constraint = acir_format::recursion_data_to_recursion_constraint(program.witness,
                                                                          native_proof,
                                                                          native_vk->to_field_elements(),
                                                                          native_vk->hash(),
                                                                          bb::fr::one(),
                                                                          num_acir_pub_inputs,
                                                                          acir_format::PROOF_TYPE::HONK);
    // recursion_data_to_recursion_constraint always wraps predicate as a witness (is_constant=false),
    // even though the value passed is a compile-time constant (bb::fr::one()). This module's baseline
    // is documented as constant-true predicate (see honk_recursion_validation.hpp), and
    // create_honk_recursion_constraints takes a materially different (much larger) gate path when
    // predicate.is_constant()==false (conditional_assign over every vk/proof field — see
    // honk_recursion_constraint.cpp's `if (!predicate.is_constant())` branch). Force it constant here
    // so the real ACIR build matches the documented baseline instead of silently taking that branch.
    constraint.predicate = acir_format::WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());
    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.honk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0 } };
    return program;
}

inline HonkVerifierComponents setup_honk_verifier_components(size_t num_acir_pub_inputs = 0)
{
    acir_format::AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];

    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder = *builder_ptr;

    auto key_fields = acir_format::fields_from_witnesses(builder, constraint.key);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    auto vk_hash_ct = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);

    std::vector<uint32_t> proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    auto proof_fields = acir_format::fields_from_witnesses(builder, proof_indices);
    StdlibProof stdlib_proof(proof_fields);

    auto transcript = std::make_shared<Transcript>();
    transcript->load_proof(stdlib_proof);
    auto verifier_instance = std::make_shared<VerifierInst>(vk_and_hash);

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t num_public_inputs =
        bb::ProofLength::Honk<RecursiveFlavor>::derive_num_public_inputs(stdlib_proof.size(), log_n);

    HonkVerifierComponents vc;
    vc.builder_ptr = std::move(builder_ptr);
    vc.vk_and_hash = vk_and_hash;
    vc.transcript = transcript;
    vc.verifier_instance = verifier_instance;
    vc.stdlib_proof = std::move(stdlib_proof);
    vc.constraint = constraint;
    vc.num_public_inputs = num_public_inputs;
    vc.log_n = log_n;
    return vc;
}

// Builder + constraint only — no eager VK/proof/transcript field_ct construction. Kept for future
// production-chain discovery work; not currently used (see HonkValidatorContext below — reverted to the
// mirrored build after production-chain wiring surfaced a witness-linkage mismatch that needs its own
// dedicated investigation: HonkRecursionValidation::Oink::validate_oink's witness-based NNF/vk_hash checks
// failed against this real build even though HonkMirroredBuildMatchesRealAcirCircuit proved block-level
// gate counts match exactly through KZG).
inline HonkVerifierComponents setup_honk_verifier_components_for_acir_build(size_t num_acir_pub_inputs = 0)
{
    acir_format::AcirProgram program = make_mock_acir_program(num_acir_pub_inputs);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];

    HonkVerifierComponents vc;
    vc.builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    vc.constraint = constraint;
    return vc;
}

struct HonkValidatorContext {
    HonkVerifierComponents vc;
    std::unique_ptr<cdg::StaticAnalyzer_<bb::fr, Builder>> analyzer;
    HonkRecursionValidation::ArithBoundaries bounds;
    std::vector<size_t> all_squeezes;

    explicit HonkValidatorContext(size_t num_pub_inputs = 0)
        : vc(setup_honk_verifier_components(num_pub_inputs))
    {
        build_full_honk_circuit<IO>(vc);
        analyzer = std::make_unique<cdg::StaticAnalyzer_<bb::fr, Builder>>(vc.builder(), false);
        all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
        bounds = HonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    }
};

} // namespace honk_recursion_test_helpers
