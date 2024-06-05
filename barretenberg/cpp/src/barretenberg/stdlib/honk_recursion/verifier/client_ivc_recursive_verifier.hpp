#pragma once
#include <algorithm>
#include <iomanip>
#include <memory>
#include <vector>

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/crypto/blake3s/blake3s.tcc"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"
#include "barretenberg/ecc/fields/field_impl_x64.hpp"
#include "barretenberg/ecc/groups/affine_element_impl.hpp"
#include "barretenberg/ecc/groups/element_impl.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256_impl.hpp"
#include "barretenberg/numeric/uintx/uintx_impl.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/recursive_instances.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield_impl.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup_impl.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursiveVerifier {
    using Builder = UltraCircuitBuilder;                   // The circuit will be an Ultra circuit
    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>; // The verifier algorithms are Mega
    using RecursiveVerifierInstances = RecursiveVerifierInstances_<RecursiveFlavor, 2>;
    using DeciderVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using FoldingVerifier = ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using GoblinVerifier = GoblinRecursiveVerifier;

  public:
    using FoldVerifierInput = FoldingVerifier::VerifierInput;
    using GoblinVerifierInput = GoblinVerifier::VerifierInput;
    struct VerifierInput {
        FoldVerifierInput fold_input;
        GoblinVerifierInput goblin_input;
    };

    ClientIVCRecursiveVerifier(std::shared_ptr<Builder> builder, VerifierInput& verifier_input)
        : builder(builder)
        , verifier_input(verifier_input){};

    void verify(const ClientIVC::Proof&);

  private:
    std::shared_ptr<Builder> builder;
    VerifierInput verifier_input;
};
} // namespace bb::stdlib::recursion::honk