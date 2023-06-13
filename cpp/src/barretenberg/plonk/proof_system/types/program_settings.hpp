#pragma once

#include <cstdint>

#include "../../../transcript/transcript.hpp"
#include "../widgets/transition_widgets/arithmetic_widget.hpp"
#include "../widgets/transition_widgets/turbo_arithmetic_widget.hpp"
#include "../widgets/transition_widgets/plookup_arithmetic_widget.hpp"
#include "../widgets/transition_widgets/fixed_base_widget.hpp"
#include "../widgets/transition_widgets/turbo_logic_widget.hpp"
#include "../widgets/transition_widgets/turbo_range_widget.hpp"
#include "../widgets/transition_widgets/elliptic_widget.hpp"
#include "../widgets/transition_widgets/plookup_auxiliary_widget.hpp"
#include "../widgets/transition_widgets/genperm_sort_widget.hpp"
#include "../widgets/random_widgets/random_widget.hpp"
#include "../widgets/random_widgets/permutation_widget.hpp"
#include "../widgets/random_widgets/plookup_widget.hpp"
#include "./prover_settings.hpp"

namespace proof_system::plonk {

class standard_verifier_settings : public standard_settings {
  public:
    typedef barretenberg::fr fr;
    typedef barretenberg::g1 g1;
    typedef transcript::StandardTranscript Transcript;
    typedef VerifierArithmeticWidget<fr, g1::affine_element, Transcript, standard_settings> ArithmeticWidget;
    typedef VerifierPermutationWidget<fr, g1::affine_element, Transcript> PermutationWidget;

    static constexpr transcript::HashType hash_type = transcript::HashType::PedersenBlake3s;
    static constexpr size_t num_challenge_bytes = 16;
    static constexpr bool idpolys = false;

    static fr append_scalar_multiplication_inputs(verification_key* key,
                                                  const fr& alpha_base,
                                                  const Transcript& transcript,
                                                  std::map<std::string, fr>& scalars)
    {
        auto updated_alpha = PermutationWidget::append_scalar_multiplication_inputs(key, alpha_base, transcript);

        return ArithmeticWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
    }

    static barretenberg::fr compute_quotient_evaluation_contribution(verification_key* key,
                                                                     const barretenberg::fr& alpha_base,
                                                                     const transcript::StandardTranscript& transcript,
                                                                     barretenberg::fr& quotient_numerator_eval)
    {
        auto updated_alpha_base = VerifierPermutationWidget<
            barretenberg::fr,
            barretenberg::g1::affine_element,
            transcript::StandardTranscript>::compute_quotient_evaluation_contribution(key,
                                                                                      alpha_base,
                                                                                      transcript,
                                                                                      quotient_numerator_eval);

        return ArithmeticWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
    }
};

class turbo_verifier_settings : public turbo_settings {
  public:
    typedef barretenberg::fr fr;
    typedef barretenberg::g1 g1;
    typedef transcript::StandardTranscript Transcript;
    typedef VerifierTurboArithmeticWidget<fr, g1::affine_element, Transcript, turbo_settings> TurboArithmeticWidget;
    typedef VerifierTurboFixedBaseWidget<fr, g1::affine_element, Transcript, turbo_settings> TurboFixedBaseWidget;
    typedef VerifierTurboRangeWidget<fr, g1::affine_element, Transcript, turbo_settings> TurboRangeWidget;
    typedef VerifierTurboLogicWidget<fr, g1::affine_element, Transcript, turbo_settings> TurboLogicWidget;
    typedef VerifierPermutationWidget<fr, g1::affine_element, Transcript> PermutationWidget;

    static constexpr size_t num_challenge_bytes =
        16; // Challenges are only 128-bits (16-bytes) to reduce the number of constraints required in the verification
            // circuit. 128-bits is ample security, given the security of altBN254 snarks is in the low-100-bits.
    static constexpr transcript::HashType hash_type = transcript::HashType::PedersenBlake3s;
    static constexpr bool idpolys = false;

    static fr append_scalar_multiplication_inputs(verification_key* key,
                                                  const fr& alpha_base,
                                                  const Transcript& transcript,
                                                  std::map<std::string, fr>& scalars)
    {
        auto updated_alpha = PermutationWidget::append_scalar_multiplication_inputs(key, alpha_base, transcript);

        updated_alpha =
            TurboArithmeticWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha =
            TurboFixedBaseWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha = TurboRangeWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha = TurboLogicWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);

        return updated_alpha;
    }

    static barretenberg::fr compute_quotient_evaluation_contribution(verification_key* key,
                                                                     const barretenberg::fr& alpha_base,
                                                                     const Transcript& transcript,
                                                                     barretenberg::fr& quotient_numerator_eval)
    {
        auto updated_alpha_base = PermutationWidget::compute_quotient_evaluation_contribution(
            key, alpha_base, transcript, quotient_numerator_eval, idpolys);

        updated_alpha_base = TurboArithmeticWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = TurboFixedBaseWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = TurboRangeWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = TurboLogicWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);

        return updated_alpha_base;
    }
};

class ultra_verifier_settings : public ultra_settings {
  public:
    typedef barretenberg::fr fr;
    typedef barretenberg::g1 g1;
    typedef transcript::StandardTranscript Transcript;
    typedef VerifierPlookupArithmeticWidget<fr, g1::affine_element, Transcript, ultra_settings> PlookupArithmeticWidget;
    typedef VerifierGenPermSortWidget<fr, g1::affine_element, Transcript, ultra_settings> GenPermSortWidget;
    typedef VerifierTurboLogicWidget<fr, g1::affine_element, Transcript, ultra_settings> TurboLogicWidget;
    typedef VerifierPermutationWidget<fr, g1::affine_element, Transcript> PermutationWidget;
    typedef VerifierPlookupWidget<fr, g1::affine_element, Transcript> PlookupWidget;
    typedef VerifierEllipticWidget<fr, g1::affine_element, Transcript, ultra_settings> EllipticWidget;
    typedef VerifierPlookupAuxiliaryWidget<fr, g1::affine_element, Transcript, ultra_settings> PlookupAuxiliaryWidget;

    static constexpr size_t num_challenge_bytes = 16;
    static constexpr transcript::HashType hash_type = transcript::HashType::PlookupPedersenBlake3s;
    static constexpr bool idpolys = true;

    static fr append_scalar_multiplication_inputs(verification_key* key,
                                                  const fr& alpha_base,
                                                  const Transcript& transcript,
                                                  std::map<std::string, barretenberg::fr>& scalars)
    {
        auto updated_alpha = PermutationWidget::append_scalar_multiplication_inputs(key, alpha_base, transcript);
        updated_alpha = PlookupWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha =
            PlookupArithmeticWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha = GenPermSortWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha = EllipticWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);
        updated_alpha =
            PlookupAuxiliaryWidget::append_scalar_multiplication_inputs(key, updated_alpha, transcript, scalars);

        return updated_alpha;
    }

    static barretenberg::fr compute_quotient_evaluation_contribution(verification_key* key,
                                                                     const barretenberg::fr& alpha_base,
                                                                     const Transcript& transcript,
                                                                     barretenberg::fr& quotient_numerator_eval)
    {
        auto updated_alpha_base = PermutationWidget::compute_quotient_evaluation_contribution(
            key, alpha_base, transcript, quotient_numerator_eval, idpolys);
        updated_alpha_base = PlookupWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = PlookupArithmeticWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = GenPermSortWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = EllipticWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);
        updated_alpha_base = PlookupAuxiliaryWidget::compute_quotient_evaluation_contribution(
            key, updated_alpha_base, transcript, quotient_numerator_eval);

        return updated_alpha_base;
    }
};

// Only needed because ultra-to-standard recursion requires us to use a Pedersen hash which is common to both Ultra &
// Standard plonk i.e. the non-ultra version.
class ultra_to_standard_verifier_settings : public ultra_verifier_settings {
  public:
    typedef VerifierPlookupArithmeticWidget<fr, g1::affine_element, Transcript, ultra_to_standard_settings>
        PlookupArithmeticWidget;
    typedef VerifierGenPermSortWidget<fr, g1::affine_element, Transcript, ultra_to_standard_settings> GenPermSortWidget;
    typedef VerifierTurboLogicWidget<fr, g1::affine_element, Transcript, ultra_to_standard_settings> TurboLogicWidget;
    typedef VerifierPermutationWidget<fr, g1::affine_element, Transcript> PermutationWidget;
    typedef VerifierPlookupWidget<fr, g1::affine_element, Transcript> PlookupWidget;
    typedef VerifierEllipticWidget<fr, g1::affine_element, Transcript, ultra_to_standard_settings> EllipticWidget;
    typedef VerifierPlookupAuxiliaryWidget<fr, g1::affine_element, Transcript, ultra_to_standard_settings>
        PlookupAuxiliaryWidget;

    static constexpr transcript::HashType hash_type = transcript::HashType::PedersenBlake3s;
};

// This is neededed for the Noir backend. The ultra verifier contract uses 32-byte challenges generated with Keccak256.
class ultra_with_keccak_verifier_settings : public ultra_verifier_settings {
  public:
    typedef VerifierPlookupArithmeticWidget<fr, g1::affine_element, Transcript, ultra_with_keccak_settings>
        PlookupArithmeticWidget;
    typedef VerifierGenPermSortWidget<fr, g1::affine_element, Transcript, ultra_with_keccak_settings> GenPermSortWidget;
    typedef VerifierTurboLogicWidget<fr, g1::affine_element, Transcript, ultra_with_keccak_settings> TurboLogicWidget;
    typedef VerifierPermutationWidget<fr, g1::affine_element, Transcript> PermutationWidget;
    typedef VerifierPlookupWidget<fr, g1::affine_element, Transcript> PlookupWidget;
    typedef VerifierEllipticWidget<fr, g1::affine_element, Transcript, ultra_with_keccak_settings> EllipticWidget;
    typedef VerifierPlookupAuxiliaryWidget<fr, g1::affine_element, Transcript, ultra_with_keccak_settings>
        PlookupAuxiliaryWidget;

    static constexpr size_t num_challenge_bytes = 32;
    static constexpr transcript::HashType hash_type = transcript::HashType::Keccak256;
};
} // namespace proof_system::plonk
