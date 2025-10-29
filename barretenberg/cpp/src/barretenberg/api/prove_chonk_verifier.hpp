#pragma once
#include <string>

namespace bb {
/**
 * @brief Creates a Honk Proof for the ChonkVerifier circuit responsible for recursively verifying a Chonk proof.
 *
 * @param output_path the working directory from which the proof is read and output is written
 * @param vk_path the path to the verification key data to use when proving (this is the one of two Chonk VKs,
 * public or private tail)
 */
void prove_chonk_verifier(const std::string& output_path, const std::string& vk_path);

} // namespace bb
