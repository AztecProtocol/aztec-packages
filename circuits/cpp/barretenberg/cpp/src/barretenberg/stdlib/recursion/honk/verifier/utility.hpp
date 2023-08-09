#pragma once
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/flavor/ultra_recursive.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

//WORKTODO: get rid of this utility entirely and place any methods in appropriate locations
namespace proof_system::plonk::stdlib::recursion::honk {
//WORKTODO: make RecursiveFlavor a thing
template <typename RecursiveFlavor> class RecursiveVerifierUtility {
    using FF = typename RecursiveFlavor::FF;
    using Commitment = typename RecursiveFlavor::Commitment;
    using VerificationKey = typename RecursiveFlavor::VerificationKey;
    using PCSVerificationKey = typename RecursiveFlavor::PCSParams::VerificationKey;
    using Builder = typename RecursiveFlavor::CircuitBuilder;

  public:
    static std::shared_ptr<VerificationKey> from_witness(Builder* builder, auto native_key)
    {
        std::shared_ptr<VerificationKey> key = std::make_shared<VerificationKey>();

        key->circuit_size = native_key->circuit_size;
        key->log_circuit_size = native_key->log_circuit_size;
        key->num_public_inputs = native_key->num_public_inputs;
        
        // Add commitments to the precomputed polynomials to the recursive VK
        key->q_m = Commitment::from_witness(builder, native_key->q_m);
        key->q_l = Commitment::from_witness(builder, native_key->q_l);
        key->q_r = Commitment::from_witness(builder, native_key->q_r);
        key->q_o = Commitment::from_witness(builder, native_key->q_o);
        key->q_4 = Commitment::from_witness(builder, native_key->q_4);
        key->q_c = Commitment::from_witness(builder, native_key->q_c);
        key->q_arith = Commitment::from_witness(builder, native_key->q_arith);
        key->q_sort = Commitment::from_witness(builder, native_key->q_sort);
        key->q_elliptic = Commitment::from_witness(builder, native_key->q_elliptic);
        key->q_aux = Commitment::from_witness(builder, native_key->q_aux);
        key->q_lookup = Commitment::from_witness(builder, native_key->q_lookup);
        key->sigma_1 = Commitment::from_witness(builder, native_key->sigma_1);
        key->sigma_2 = Commitment::from_witness(builder, native_key->sigma_2);
        key->sigma_3 = Commitment::from_witness(builder, native_key->sigma_3);
        key->sigma_4 = Commitment::from_witness(builder, native_key->sigma_4);
        key->id_1 = Commitment::from_witness(builder, native_key->id_1);
        key->id_2 = Commitment::from_witness(builder, native_key->id_2);
        key->id_3 = Commitment::from_witness(builder, native_key->id_3);
        key->id_4 = Commitment::from_witness(builder, native_key->id_4);
        key->table_1 = Commitment::from_witness(builder, native_key->table_1);
        key->table_2 = Commitment::from_witness(builder, native_key->table_2);
        key->table_3 = Commitment::from_witness(builder, native_key->table_3);
        key->table_4 = Commitment::from_witness(builder, native_key->table_4);
        key->lagrange_first = Commitment::from_witness(builder, native_key->lagrange_first);
        key->lagrange_last = Commitment::from_witness(builder, native_key->lagrange_last);

        return key;
    }
};

} // namespace proof_system::plonk::stdlib::recursion::honk
