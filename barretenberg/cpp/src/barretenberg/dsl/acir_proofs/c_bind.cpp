#include "c_bind.hpp"
#include "../acir_format/acir_to_constraint_buf.hpp"
#include "acir_composer.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
#include <cstdint>
#include <memory>

WASM_EXPORT void acir_get_circuit_sizes(
    uint8_t const* acir_vec, bool const* honk_recursion, uint32_t* exact, uint32_t* total, uint32_t* subgroup)
{
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), *honk_recursion);
    auto builder = acir_format::create_circuit(constraint_system, 1 << 19, {}, *honk_recursion);
    *exact = htonl((uint32_t)builder.get_num_gates());
    *total = htonl((uint32_t)builder.get_total_circuit_size());
    *subgroup = htonl((uint32_t)builder.get_circuit_subgroup_size(builder.get_total_circuit_size()));
}

WASM_EXPORT void acir_new_acir_composer(uint32_t const* size_hint, out_ptr out)
{
    *out = new acir_proofs::AcirComposer(ntohl(*size_hint));
}

WASM_EXPORT void acir_delete_acir_composer(in_ptr acir_composer_ptr)
{
    delete reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
}

WASM_EXPORT void acir_init_proving_key(in_ptr acir_composer_ptr, uint8_t const* acir_vec)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/false);
    acir_composer->create_circuit(constraint_system);

    acir_composer->init_proving_key();
}

WASM_EXPORT void acir_create_proof(in_ptr acir_composer_ptr,
                                   uint8_t const* acir_vec,
                                   uint8_t const* witness_vec,
                                   uint8_t** out)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/false);
    auto witness = acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec));

    acir_composer->create_circuit(constraint_system, witness);

    acir_composer->init_proving_key();
    auto proof_data = acir_composer->create_proof();
    *out = to_heap_buffer(proof_data);
}

WASM_EXPORT void acir_prove_and_verify_ultra_honk(uint8_t const* acir_vec, uint8_t const* witness_vec, bool* result)
{
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/true);
    auto witness = acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec));

    auto builder =
        acir_format::create_circuit<UltraCircuitBuilder>(constraint_system, 0, witness, /*honk_recursion=*/true);

    UltraProver prover{ builder };
    auto proof = prover.construct_proof();

    auto verification_key = std::make_shared<UltraFlavor::VerificationKey>(prover.instance->proving_key);
    UltraVerifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_fold_and_verify_program_stack(uint8_t const* acir_vec, uint8_t const* witness_vec, bool* result)
{
    using ProgramStack = acir_format::AcirProgramStack;
    using Builder = MegaCircuitBuilder;

    auto constraint_systems =
        acir_format::program_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/false);
    auto witness_stack = acir_format::witness_buf_to_witness_stack(from_buffer<std::vector<uint8_t>>(witness_vec));

    ProgramStack program_stack{ constraint_systems, witness_stack };

    ClientIVC ivc;
    ivc.trace_structure = TraceStructure::SMALL_TEST;

    while (!program_stack.empty()) {
        auto stack_item = program_stack.back();

        // Construct a bberg circuit from the acir representation
        auto builder = acir_format::create_circuit<Builder>(
            stack_item.constraints, 0, stack_item.witness, /*honk_recursion=*/false, ivc.goblin.op_queue);

        ivc.accumulate(builder);

        program_stack.pop_back();
    }
    *result = ivc.prove_and_verify();
}

WASM_EXPORT void acir_verify_client_ivc(uint8_t const* proof_vec,
                                        uint8_t const* accumulator_vec,
                                        uint8_t const* final_vk_vec,
                                        uint8_t const* eccvm_vk_vec,
                                        uint8_t const* translator_vk_vec,
                                        bool* result)
{
    info("loading proof");
    const auto proof = from_buffer<ClientIVC::Proof>(proof_vec);
    info("loading accumulator");
    const auto accumulator =
        std::make_shared<ClientIVC::VerifierInstance>(from_buffer<ClientIVC::VerifierInstance>(accumulator_vec));
    info("setting accumulator pcs verification key");
    accumulator->verification_key->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();
    info("loading final vk");
    const auto final_vk =
        std::make_shared<ClientIVC::VerificationKey>(from_buffer<ClientIVC::VerificationKey>(final_vk_vec));
    info("loading eccvm vk");
    const auto eccvm_vk =
        std::make_shared<ECCVMFlavor::VerificationKey>(from_buffer<ECCVMFlavor::VerificationKey>(eccvm_vk_vec));
    info("setting eccvm pcs verification key ");
    eccvm_vk->pcs_verification_key =
        std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(eccvm_vk->circuit_size + 1);
    info("loading translator vk");
    const auto translator_vk = std::make_shared<TranslatorFlavor::VerificationKey>(
        from_buffer<TranslatorFlavor::VerificationKey>(translator_vk_vec));
    info("setting translator pcs verification key");
    translator_vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();
    info("loaded all data");
    const bool verified = ClientIVC::verify(
        proof, accumulator, std::make_shared<ClientIVC::VerifierInstance>(final_vk), eccvm_vk, translator_vk);
    info("verify_client_ivc verified: ", verified);
    *result = verified;
}

WASM_EXPORT void acir_prove_and_verify_mega_honk(uint8_t const* acir_vec, uint8_t const* witness_vec, bool* result)
{
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/false);
    auto witness = acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec));

    auto builder =
        acir_format::create_circuit<MegaCircuitBuilder>(constraint_system, 0, witness, /*honk_recursion=*/false);

    MegaProver prover{ builder };
    auto proof = prover.construct_proof();

    auto verification_key = std::make_shared<MegaFlavor::VerificationKey>(prover.instance->proving_key);
    MegaVerifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_load_verification_key(in_ptr acir_composer_ptr, uint8_t const* vk_buf)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto vk_data = from_buffer<plonk::verification_key_data>(vk_buf);
    acir_composer->load_verification_key(std::move(vk_data));
}

WASM_EXPORT void acir_init_verification_key(in_ptr acir_composer_ptr)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    acir_composer->init_verification_key();
}

WASM_EXPORT void acir_get_verification_key(in_ptr acir_composer_ptr, uint8_t** out)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto vk = acir_composer->init_verification_key();
    // We flatten to a vector<uint8_t> first, as that's how we treat it on the calling side.
    *out = to_heap_buffer(to_buffer(*vk));
}

WASM_EXPORT void acir_get_proving_key(in_ptr acir_composer_ptr, uint8_t const* acir_vec, uint8_t** out)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/false);
    acir_composer->create_circuit(constraint_system);
    auto pk = acir_composer->init_proving_key();
    // We flatten to a vector<uint8_t> first, as that's how we treat it on the calling side.
    *out = to_heap_buffer(to_buffer(*pk));
}

WASM_EXPORT void acir_verify_proof(in_ptr acir_composer_ptr, uint8_t const* proof_buf, bool* result)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto proof = from_buffer<std::vector<uint8_t>>(proof_buf);
    *result = acir_composer->verify_proof(proof);
}

WASM_EXPORT void acir_get_solidity_verifier(in_ptr acir_composer_ptr, out_str_buf out)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto str = acir_composer->get_solidity_verifier();
    *out = to_heap_buffer(str);
}

WASM_EXPORT void acir_serialize_proof_into_fields(in_ptr acir_composer_ptr,
                                                  uint8_t const* proof_buf,
                                                  uint32_t const* num_inner_public_inputs,
                                                  fr::vec_out_buf out)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto proof = from_buffer<std::vector<uint8_t>>(proof_buf);
    auto proof_as_fields = acir_composer->serialize_proof_into_fields(proof, ntohl(*num_inner_public_inputs));

    *out = to_heap_buffer(proof_as_fields);
}

WASM_EXPORT void acir_serialize_verification_key_into_fields(in_ptr acir_composer_ptr,
                                                             fr::vec_out_buf out_vkey,
                                                             fr::out_buf out_key_hash)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);

    auto vkey_as_fields = acir_composer->serialize_verification_key_into_fields();
    auto vk_hash = vkey_as_fields.back();
    vkey_as_fields.pop_back();

    *out_vkey = to_heap_buffer(vkey_as_fields);
    write(out_key_hash, vk_hash);
}

WASM_EXPORT void acir_prove_ultra_honk(uint8_t const* acir_vec, uint8_t const* witness_vec, uint8_t** out)
{
    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/true);
    auto witness = acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec));

    auto builder =
        acir_format::create_circuit<UltraCircuitBuilder>(constraint_system, 0, witness, /*honk_recursion=*/true);

    UltraProver prover{ builder };
    auto proof = prover.construct_proof();
    *out = to_heap_buffer(to_buffer</*include_size=*/true>(proof));
}

WASM_EXPORT void acir_verify_ultra_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result)
{
    using VerificationKey = UltraFlavor::VerificationKey;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;
    using Verifier = UltraVerifier_<UltraFlavor>;

    auto proof = from_buffer<std::vector<bb::fr>>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));
    verification_key->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();

    Verifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_write_vk_ultra_honk(uint8_t const* acir_vec, uint8_t** out)
{
    using ProverInstance = ProverInstance_<UltraFlavor>;
    using VerificationKey = UltraFlavor::VerificationKey;

    auto constraint_system =
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec), /*honk_recursion=*/true);
    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(constraint_system, 0, {}, /*honk_recursion=*/true);

    ProverInstance prover_inst(builder);
    VerificationKey vk(prover_inst.proving_key);
    *out = to_heap_buffer(to_buffer(vk));
}

WASM_EXPORT void acir_proof_as_fields_ultra_honk(uint8_t const* proof_buf, fr::vec_out_buf out)
{
    auto proof = from_buffer<std::vector<bb::fr>>(from_buffer<std::vector<uint8_t>>(proof_buf));
    *out = to_heap_buffer(proof);
}

WASM_EXPORT void acir_vk_as_fields_ultra_honk(uint8_t const* vk_buf, fr::vec_out_buf out_vkey)
{
    using VerificationKey = UltraFlavor::VerificationKey;

    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));
    std::vector<bb::fr> vkey_as_fields = verification_key->to_field_elements();
    *out_vkey = to_heap_buffer(vkey_as_fields);
}