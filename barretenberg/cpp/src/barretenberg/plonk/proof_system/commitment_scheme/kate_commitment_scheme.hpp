#pragma once
#include <iomanip>
#include <map>
#include <memory>
#include <stddef.h>
#include <string>

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"
#include "barretenberg/ecc/fields/field_impl_x64.hpp"
#include "barretenberg/ecc/groups/affine_element_impl.hpp"
#include "barretenberg/numeric/uint256/uint256_impl.hpp"
#include "barretenberg/plonk/proof_system/types/commitment_open_proof.hpp"
#include "commitment_scheme.hpp"

namespace bb {
namespace plonk {
class work_queue;
namespace transcript {
class StandardTranscript;
} // namespace transcript
struct proving_key;
struct verification_key;
} // namespace plonk
} // namespace bb

namespace bb::plonk {

template <typename settings> class KateCommitmentScheme : public CommitmentScheme {
  public:
    KateCommitmentScheme();

    void commit(std::shared_ptr<fr[]> coefficients, std::string tag, fr item_constant, work_queue& queue) override;

    void compute_opening_polynomial(const fr* src, fr* dest, const fr& z, const size_t n) override;

    void generic_batch_open(const fr* src,
                            fr* dest,
                            const size_t num_polynomials,
                            const fr* z_points,
                            const size_t num_z_points,
                            const fr* challenges,
                            const size_t n,
                            std::string* tags,
                            fr* item_constants,
                            work_queue& queue) override;

    void batch_open(const transcript::StandardTranscript& transcript,
                    work_queue& queue,
                    std::shared_ptr<plonk::proving_key> input_key = nullptr) override;

    void batch_verify(const transcript::StandardTranscript& transcript,
                      std::map<std::string, g1::affine_element>& kate_g1_elements,
                      std::map<std::string, fr>& kate_fr_elements,
                      std::shared_ptr<plonk::verification_key> input_key = nullptr) override;

    void add_opening_evaluations_to_transcript(transcript::StandardTranscript& transcript,
                                               std::shared_ptr<plonk::proving_key> input_key = nullptr,
                                               bool in_lagrange_form = false) override;

  private:
    plonk::commitment_open_proof kate_open_proof;
};

} // namespace bb::plonk
