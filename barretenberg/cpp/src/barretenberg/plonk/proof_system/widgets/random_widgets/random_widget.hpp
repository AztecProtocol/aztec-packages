#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/plonk/transcript/transcript.hpp"
#include "barretenberg/plonk/work_queue/work_queue.hpp"

#include <map>
namespace transcript {
class Transcript;
}
namespace proof_system::plonk {

struct proving_key;

class ReferenceString;

class ProverRandomWidget {
  protected:
    typedef barretenberg::fr fr;
    typedef barretenberg::polynomial polynomial;

  public:
    ProverRandomWidget(proving_key* input_key)
        : key(input_key)
    {}
    ProverRandomWidget(const ProverRandomWidget& other)
        : key(other.key)
    {}
    ProverRandomWidget(ProverRandomWidget&& other)
        : key(other.key)
    {}

    ProverRandomWidget& operator=(const ProverRandomWidget& other)
    {
        key = other.key;
        return *this;
    }

    ProverRandomWidget& operator=(ProverRandomWidget&& other)
    {
        key = other.key;
        return *this;
    }

    virtual ~ProverRandomWidget() {}

    virtual void compute_round_commitments(transcript::StandardTranscript&, const size_t, work_queue&){};

    virtual barretenberg::fr compute_quotient_contribution(const barretenberg::fr& alpha_base,
                                                           const transcript::StandardTranscript& transcript) = 0;

    proving_key* key;
};

} // namespace proof_system::plonk
