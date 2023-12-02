#include "rust_bind.hpp"
#include "../acir_format/acir_to_constraint_buf.hpp"
#include "acir_composer.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/srs/global_crs.hpp"

extern "C" {

const char* rust_acir_get_circuit_sizes(uint8_t const* acir_vec, uint32_t* exact, uint32_t* total, uint32_t* subgroup)
{
    try {
        auto constraint_system = acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec));
        auto composer = acir_format::create_circuit(constraint_system, 1 << 19);
        *exact = (uint32_t)composer.get_num_gates();
        *total = (uint32_t)composer.get_total_circuit_size();
        *subgroup = (uint32_t)composer.get_circuit_subgroup_size(composer.get_total_circuit_size());
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_new_acir_composer(uint32_t const* size_hint, out_ptr out)
{
    try {
        *out = new acir_proofs::AcirComposer(*size_hint);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_delete_acir_composer(in_ptr acir_composer_ptr)
{
    try {
        delete reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_init_proving_key(in_ptr acir_composer_ptr, uint8_t const* acir_vec)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto constraint_system = acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec));

        acir_composer->init_proving_key(constraint_system);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_create_proof(in_ptr acir_composer_ptr,
                                   uint8_t const* acir_vec,
                                   uint8_t const* witness_vec,
                                   bool const* is_recursive,
                                   uint8_t** out)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto constraint_system = acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec));
        auto witness = acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec));

        auto proof_data = acir_composer->create_proof(constraint_system, witness, *is_recursive);
        *out = to_heap_buffer(proof_data);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_load_verification_key(in_ptr acir_composer_ptr, uint8_t const* vk_buf)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto vk_data = from_buffer<plonk::verification_key_data>(vk_buf);
        acir_composer->load_verification_key(std::move(vk_data));
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_init_verification_key(in_ptr acir_composer_ptr)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        acir_composer->init_verification_key();
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_get_verification_key(in_ptr acir_composer_ptr, uint8_t** out)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto vk = acir_composer->init_verification_key();
        // We flatten to a vector<uint8_t> first, as that's how we treat it on the calling side.
        *out = to_heap_buffer(*vk);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_verify_proof(in_ptr acir_composer_ptr,
                                   uint8_t const* proof_buf,
                                   bool const* is_recursive,
                                   bool* result)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto proof = from_buffer<std::vector<uint8_t>>(proof_buf);
        *result = acir_composer->verify_proof(proof, *is_recursive);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_get_solidity_verifier(in_ptr acir_composer_ptr, out_str_buf out)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto str = acir_composer->get_solidity_verifier();
        *out = to_heap_buffer(str);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_serialize_proof_into_fields(in_ptr acir_composer_ptr,
                                                  uint8_t const* proof_buf,
                                                  uint32_t const* num_inner_public_inputs,
                                                  fr::vec_out_buf out)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);
        auto proof = from_buffer<std::vector<uint8_t>>(proof_buf);
        auto proof_as_fields = acir_composer->serialize_proof_into_fields(proof, *num_inner_public_inputs);

        *out = to_heap_buffer(proof_as_fields);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

const char* rust_acir_serialize_verification_key_into_fields(in_ptr acir_composer_ptr,
                                                             fr::vec_out_buf out_vkey,
                                                             fr::out_buf out_key_hash)
{
    try {
        auto acir_composer = reinterpret_cast<acir_proofs::AcirComposer*>(*acir_composer_ptr);

        auto vkey_as_fields = acir_composer->serialize_verification_key_into_fields();
        auto vk_hash = vkey_as_fields.back();
        vkey_as_fields.pop_back();

        *out_vkey = to_heap_buffer(vkey_as_fields);
        write(out_key_hash, vk_hash);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}
}