#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "multisig.hpp"

extern "C" {

using namespace barretenberg;
using affine_element = grumpkin::g1::affine_element;
using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;

WASM_EXPORT const char* rust_schnorr_compute_public_key(fr::in_buf private_key, fr::out_buf public_key_buf);
WASM_EXPORT const char* rust_schnorr_negate_public_key(fr::in_buf public_key_buffer, fr::out_buf output);

WASM_EXPORT const char* rust_schnorr_construct_signature(uint8_t const* message,
                                                    fr::in_buf private_key,
                                                    out_buf32 s,
                                                    out_buf32 e);

WASM_EXPORT const char* rust_schnorr_verify_signature(
    uint8_t const* message, fr::in_buf pub_key, in_buf32 sig_s, in_buf32 sig_e, bool* result);

WASM_EXPORT const char* rust_schnorr_multisig_create_multisig_public_key(fr::in_buf private_key,
                                                                    fr::out_buf multisig_pubkey_buf);

WASM_EXPORT const char* rust_schnorr_multisig_validate_and_combine_signer_pubkeys(fr::vec_in_buf signer_pubkey_buf,
                                                                             fr::out_buf combined_key_buf,
                                                                             bool* success);

WASM_EXPORT const char* rust_schnorr_multisig_construct_signature_round_1(fr::out_buf round_one_public_output_buf,
                                                                     fr::out_buf round_one_private_output_buf);

WASM_EXPORT const char* rust_schnorr_multisig_construct_signature_round_2(uint8_t const* message,
                                                                     fr::in_buf private_key,
                                                                     fr::in_buf signer_round_one_private_buf,
                                                                     fr::vec_in_buf signer_pubkeys_buf,
                                                                     fr::vec_in_buf round_one_public_buf,
                                                                     fr::out_buf round_two_buf,
                                                                     bool* success);

WASM_EXPORT const char* rust_schnorr_multisig_combine_signatures(uint8_t const* message,
                                                            fr::vec_in_buf signer_pubkeys_buf,
                                                            fr::vec_in_buf round_one_buf,
                                                            fr::vec_in_buf round_two_buf,
                                                            out_buf32 s,
                                                            out_buf32 e,
                                                            bool* success);
}