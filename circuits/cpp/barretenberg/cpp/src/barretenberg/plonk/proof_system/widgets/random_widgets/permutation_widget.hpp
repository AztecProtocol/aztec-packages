#pragma once
#include "random_widget.hpp"

namespace proof_system::plonk {
template <typename Field,
          typename Group,
          typename Transcript,
          const size_t num_roots_cut_out_of_vanishing_polynomial = 4>
class VerifierPermutationWidget {
  public:
    VerifierPermutationWidget();

    static Field compute_quotient_evaluation_contribution(typename Transcript::Key*,
                                                          const Field& alpha_base,
                                                          const Transcript& transcript,
                                                          Field& quotient_numerator_eval,
                                                          const bool idpolys = false);

    static Field append_scalar_multiplication_inputs(typename Transcript::Key*,
                                                     const Field& alpha_base,
                                                     const Transcript& transcript);
};

extern template class VerifierPermutationWidget<barretenberg::fr,
                                                barretenberg::g1::affine_element,
                                                transcript::StandardTranscript>;

template <size_t program_width, bool idpolys = false, const size_t num_roots_cut_out_of_vanishing_polynomial = 4>
class ProverPermutationWidget : public ProverRandomWidget {
  public:
    ProverPermutationWidget(proving_key*);
    ProverPermutationWidget(const ProverPermutationWidget& other);
    ProverPermutationWidget(ProverPermutationWidget&& other);
    ProverPermutationWidget& operator=(const ProverPermutationWidget& other);
    ProverPermutationWidget& operator=(ProverPermutationWidget&& other);

    void compute_round_commitments(transcript::StandardTranscript& transcript,
                                   const size_t round_number,
                                   work_queue& queue) override;

    barretenberg::fr compute_quotient_contribution(const barretenberg::fr& alpha_base,
                                                   const transcript::StandardTranscript& transcript) override;
};

} // namespace proof_system::plonk

#include "./permutation_widget_impl.hpp"