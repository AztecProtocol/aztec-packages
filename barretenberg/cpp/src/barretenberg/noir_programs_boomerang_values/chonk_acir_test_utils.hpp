#pragma once

#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::chonk_boomerang {

struct ProductionChonkData {
    std::shared_ptr<MegaZKFlavor::VerificationKey> mega_vk;
    ChonkProof proof;
};

inline const ProductionChonkData& get_production_chonk_data()
{
    static const ProductionChonkData data = []() {
        srs::init_file_crs_factory(srs::bb_crs_path());
        srs::init_grumpkin_mem_crs_factory(srs::generate_grumpkin_srs(ECCVMFlavor::ECCVM_FIXED_SIZE));

        constexpr size_t NUM_APP_CIRCUITS = 1;
        PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        Chonk ivc{ circuit_producer.circuit_kinds() };
        for (size_t idx = 0; idx < circuit_producer.total_num_circuits; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }
        return ProductionChonkData{ .mega_vk = ivc.get_hiding_kernel_vk_and_hash()->vk, .proof = ivc.prove() };
    }();
    return data;
}

inline acir_format::AcirProgram make_production_chonk_acir_program(const size_t num_acir_public_inputs = 0)
{
    const auto& data = get_production_chonk_data();
    BB_ASSERT_LTE(num_acir_public_inputs,
                  static_cast<size_t>(data.mega_vk->num_public_inputs) - HidingKernelIO::PUBLIC_INPUTS_SIZE);

    acir_format::AcirProgram program;
    acir_format::RecursionConstraint constraint =
        acir_format::recursion_data_to_recursion_constraint(program.witness,
                                                            data.proof.to_field_elements(),
                                                            data.mega_vk->to_field_elements(),
                                                            data.mega_vk->hash(),
                                                            fr::zero(),
                                                            num_acir_public_inputs,
                                                            acir_format::PROOF_TYPE::CHONK);
    program.witness.pop_back();
    constraint.predicate = acir_format::WitnessOrConstant<fr>::from_constant(fr::one());

    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.chonk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .chonk_recursion_constraints = { 0 } };
    return program;
}

inline acir_format::AcirProgram make_mock_chonk_acir_program(const size_t num_acir_public_inputs)
{
    using Builder = UltraCircuitBuilder;
    using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;

    const auto vk =
        acir_format::create_mock_honk_vk<MegaZKFlavor, IO>(1 << MegaZKFlavor::VIRTUAL_LOG_N, num_acir_public_inputs);
    const HonkProof proof = acir_format::create_mock_chonk_proof<Builder>(num_acir_public_inputs);

    acir_format::AcirProgram program;
    auto constraint = acir_format::recursion_data_to_recursion_constraint(program.witness,
                                                                          proof,
                                                                          vk->to_field_elements(),
                                                                          vk->hash(),
                                                                          fr::zero(),
                                                                          num_acir_public_inputs,
                                                                          acir_format::PROOF_TYPE::CHONK);
    program.witness.pop_back();
    constraint.predicate = acir_format::WitnessOrConstant<fr>::from_constant(fr::one());
    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.chonk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .chonk_recursion_constraints = { 0 } };
    return program;
}

} // namespace bb::chonk_boomerang
