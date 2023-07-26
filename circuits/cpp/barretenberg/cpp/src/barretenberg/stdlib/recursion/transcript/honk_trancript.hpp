#pragma once

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include "../../commitment/pedersen/pedersen.hpp"
#include "../../commitment/pedersen/pedersen_plookup.hpp"
#include "../../hash/blake3s/blake3s.hpp"
#include "../../primitives/bigfield/bigfield.hpp"
#include "../../primitives/biggroup/biggroup.hpp"
#include "../../primitives/bool/bool.hpp"
#include "../../primitives/curves/bn254.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/witness/witness.hpp"
#include "../verification_key/verification_key.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {
template <typename Composer> class Transcript {
  public:
    using field_pt = field_t<Composer>;
    using witness_pt = witness_t<Composer>;
    using fq_pt = bigfield<Composer, barretenberg::Bn254FqParams>;
    using group_pt = element<Composer, fq_pt, field_pt, barretenberg::g1>;
    using Key = verification_key<stdlib::bn254<Composer>>;
};
} // namespace proof_system::plonk::stdlib::recursion::honk
