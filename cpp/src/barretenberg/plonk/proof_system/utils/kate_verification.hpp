#pragma once

#include <map>

namespace proof_system::plonk {

template <typename Field, typename Transcript, typename program_settings>
Field compute_kate_batch_evaluation(typename Transcript::Key* key, const Transcript& transcript)
{
    // In this method, we compute the scalar multiplicand of the batch evaluation commitment
    // described in step 11 of verifier's algorithm.
    //
    // Step 11: Compute batch evaluation commitment [E]_1
    //          [E]_1  :=  (t_eval
    //                      + \nu_{a}.a_eval + \nu_{b}.b_eval + \nu_{c}.c_eval
    //                      + \nu_{\sigma1}.sigma1_eval + \nu_{\sigma2}.sigma2_eval + \nu_{\sigma3}.sigma3_eval
    //                      + \nu_q_l.separator.q_l_eval + \nu_q_r.separator.q_r_eval + \nu_q_o.separator.q_o_eval
    //                        + \nu_q_c.separator.q_c_eval + \nu_q_m.separator.q_m_eval
    //                      + nu_z_omega.separator.z_eval_omega) . [1]_1
    //
    // The challenges nu_{string} depend on the scalar they are being multiplied to.
    //
    Field batch_eval(0);

    const auto separator_challenge = transcript.get_challenge_field_element("separator", 0);
    const auto& polynomial_manifest = key->polynomial_manifest;
    for (size_t i = 0; i < key->polynomial_manifest.size(); ++i) {
        const auto& item = polynomial_manifest[i];

        const std::string poly_label(item.polynomial_label);

        bool has_shifted_evaluation = item.requires_shifted_evaluation;

        const auto nu_challenge = transcript.get_challenge_field_element_from_map("nu", poly_label);
        const auto poly_at_zeta = transcript.get_field_element(poly_label);
        batch_eval += nu_challenge * poly_at_zeta;

        if (has_shifted_evaluation) {
            const auto nu_challenge = transcript.get_challenge_field_element_from_map("nu", poly_label + "_omega");
            const auto poly_at_zeta_omega = transcript.get_field_element(poly_label + "_omega");
            batch_eval += separator_challenge * nu_challenge * poly_at_zeta_omega;
        }
    }

    const auto quotient_eval = transcript.get_field_element("t");
    const auto quotient_challenge = transcript.get_challenge_field_element_from_map("nu", "t");

    batch_eval += (quotient_eval * quotient_challenge);
    return batch_eval;
}

template <typename Field, typename Group, typename Transcript, typename program_settings>
void populate_kate_element_map(verification_key* key,
                               const Transcript& transcript,
                               std::map<std::string, Group>& kate_g1_elements,
                               std::map<std::string, Field>& kate_fr_elements)
{
    const auto separator_challenge = transcript.get_challenge_field_element("separator", 0);

    const auto& polynomial_manifest = key->polynomial_manifest;
    for (size_t i = 0; i < key->polynomial_manifest.size(); ++i) {
        const auto& item = polynomial_manifest[i];
        const std::string label(item.commitment_label);
        const std::string poly_label(item.polynomial_label);
        switch (item.source) {
        case PolynomialSource::WITNESS: {
            const auto element = transcript.get_group_element(label);
            kate_g1_elements.insert({ label, element });
            break;
        }
        case PolynomialSource::SELECTOR:
        case PolynomialSource::PERMUTATION: {
            const auto element = key->commitments.at(label);
            kate_g1_elements.insert({ label, element });
            break;
        }
        case PolynomialSource::OTHER: {
            break;
        }
        }
        Field kate_fr_scalar(0);
        if (item.requires_shifted_evaluation) {
            const auto challenge = transcript.get_challenge_field_element_from_map("nu", poly_label + "_omega");
            kate_fr_scalar += (separator_challenge * challenge);
        }

        const auto challenge = transcript.get_challenge_field_element_from_map("nu", poly_label);
        kate_fr_scalar += challenge;

        kate_fr_elements.insert({ label, kate_fr_scalar });
    }

    const auto zeta = transcript.get_challenge_field_element("z", 0);
    const auto quotient_nu = transcript.get_challenge_field_element_from_map("nu", "t");

    Field z_pow_n = zeta.pow(key->circuit_size);
    Field z_power = 1;
    for (size_t i = 0; i < program_settings::program_width; ++i) {
        std::string quotient_label = "T_" + std::to_string(i + 1);
        const auto element = transcript.get_group_element(quotient_label);

        kate_g1_elements.insert({ quotient_label, element });
        kate_fr_elements.insert({ quotient_label, quotient_nu * z_power });
        z_power *= z_pow_n;
    }
}

/**
 * Debug method for Turbo plonk proofs - prints verification key in the format required by our smart contracts
 **/
inline void print_turbo_verification_key(verification_key* key)
{
    const auto print_fr = [](const std::string& name, const barretenberg::fr& element) {
        std::cerr << "vk." << name << " = PairingsBn254.new_fr(" << std::endl;
        std::cerr << "  " << element << std::endl;
        std::cerr << ");" << std::endl;
    };
    const auto print_g1 = [](const std::string& name, const barretenberg::g1::affine_element& element) {
        std::cerr << "vk." << name << " = PairingsBn254.new_g1(" << std::endl;
        std::cerr << "  " << element.x << "," << std::endl;
        std::cerr << "  " << element.y << std::endl;
        std::cerr << ");" << std::endl;
    };
    std::cerr << "### vk" << std::endl;
    std::cerr << "vk.circuit_size = " << key->domain.size << ";" << std::endl;
    std::cerr << "vk.num_inputs = " << key->num_public_inputs << ";" << std::endl;
    print_fr("work_root", key->domain.root);
    print_fr("domain_inverse", key->domain.domain_inverse);
    print_fr("work_root_inverse", key->domain.root_inverse);
    print_g1("Q1", key->commitments.at("Q_1"));
    print_g1("Q2", key->commitments.at("Q_2"));
    print_g1("Q3", key->commitments.at("Q_3"));
    print_g1("Q4", key->commitments.at("Q_4"));
    print_g1("Q5", key->commitments.at("Q_5"));
    print_g1("QM", key->commitments.at("Q_M"));
    print_g1("QC", key->commitments.at("Q_C"));
    print_g1("QARITH", key->commitments.at("Q_ARITHMETIC"));
    print_g1("QFIXEDBASE", key->commitments.at("Q_FIXED_BASE"));
    print_g1("QRANGE", key->commitments.at("Q_RANGE"));
    print_g1("QLOGIC", key->commitments.at("Q_LOGIC"));
    print_g1("sigma_commitments[0]", key->commitments.at("SIGMA_1"));
    print_g1("sigma_commitments[1]", key->commitments.at("SIGMA_2"));
    print_g1("sigma_commitments[2]", key->commitments.at("SIGMA_3"));
    print_g1("sigma_commitments[3]", key->commitments.at("SIGMA_4"));
    print_fr("permutation_non_residues[0]", 5);
    print_fr("permutation_non_residues[1]", 6);
    print_fr("permutation_non_residues[2]", 7);
}
} // namespace proof_system::plonk