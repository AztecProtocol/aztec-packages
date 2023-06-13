#include "c_bind.hpp"
#include "acir_composer.hpp"
#include <cstdint>
#include <memory>
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/srs/global_crs.hpp"

WASM_EXPORT void acir_get_circuit_sizes(uint8_t const* constraint_system_buf,
                                        uint32_t* exact,
                                        uint32_t* total,
                                        uint32_t* subgroup)
{
    auto constraint_system = from_buffer<acir_format::acir_format>(constraint_system_buf);
    free_mem_slab_raw((void*)constraint_system_buf);
    auto composer = acir_format::create_circuit(constraint_system, nullptr, 1 << 19);
    *exact = htonl((uint32_t)composer.get_num_gates());
    *total = htonl((uint32_t)composer.get_total_circuit_size());
    *subgroup = htonl((uint32_t)composer.get_circuit_subgroup_size(composer.get_total_circuit_size()));
}

WASM_EXPORT void acir_new_acir_composer(uint32_t const* size_hint, out_ptr out)
{
    *out = new acir_proofs::AcirComposer(ntohl(*size_hint));
}

WASM_EXPORT void acir_delete_acir_composer(in_ptr acir_composer_ptr)
{
    delete reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
}

WASM_EXPORT void acir_init_proving_key(in_ptr acir_composer_ptr, uint8_t const* constraint_system_buf)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto constraint_system = from_buffer<acir_format::acir_format>(constraint_system_buf);

    // The binder would normally free the the constraint_system_buf, but we need the memory now.
    free_mem_slab_raw((void*)constraint_system_buf);

    acir_composer->init_proving_key(barretenberg::srs::get_crs_factory(), constraint_system);
}

WASM_EXPORT void acir_create_proof(in_ptr acir_composer_ptr,
                                   uint8_t const* constraint_system_buf,
                                   uint8_t const* witness_buf,
                                   bool const* is_recursive,
                                   uint8_t** out)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto constraint_system = from_buffer<acir_format::acir_format>(constraint_system_buf);
    auto witness = from_buffer<std::vector<fr, ContainerSlabAllocator<fr>>>(witness_buf);

    // The binder would normally free the the constraint_system_buf, but we need the memory now.
    free_mem_slab_raw((void*)constraint_system_buf);
    free_mem_slab_raw((void*)witness_buf);

    auto proof_data =
        acir_composer->create_proof(barretenberg::srs::get_crs_factory(), constraint_system, witness, *is_recursive);
    *out = to_heap_buffer(proof_data);
}

WASM_EXPORT void acir_load_verification_key(in_ptr acir_composer_ptr, uint8_t const* vk_buf)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto vk_data = from_buffer<plonk::verification_key_data>(vk_buf);
    acir_composer->load_verification_key(barretenberg::srs::get_crs_factory(), std::move(vk_data));
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
    // to_buffer gives a vector<uint8_t>.
    // to_heap_buffer serializes that into the heap (i.e. length prefixes).
    // if you just did: to_heap_buffer(*vk) you get the un-prefixed buffer. no good.
    *out = to_heap_buffer(to_buffer(*vk));
}

WASM_EXPORT void acir_verify_proof(in_ptr acir_composer_ptr,
                                   uint8_t const* proof_buf,
                                   bool const* is_recursive,
                                   bool* result)
{
    auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
    auto proof = from_buffer<std::vector<uint8_t>>(proof_buf);
    *result = acir_composer->verify_proof(proof, *is_recursive);
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
