#pragma once
#include "barretenberg/plonk/proof_system/constants.hpp"
#include "barretenberg/proof_system/op_queue/ecc_op_queue.hpp"
#include "ultra_circuit_builder.hpp"

namespace proof_system {

using namespace barretenberg;

/**
 * @brief Builder for Goblin-style Ultra circuits
 * @details This class extends the UltraCircuitBuilder_ to allow for Goblin-style EC point operations. When an EC point
 * operation is needed, it is written to an operation queue. The operands are written to the ecc_op_wires which index
 * into the same "variables" array as the convetional wires. The operation itself is performed directly (i.e. natively,
 * without adding constraints) for use elsewhere in the circuit. The fidelity of each operation in the queue is proven
 * later via the Translator and ECCVM circuits.
 *
 * @tparam FF
 */
template <typename FF> class GoblinUltraCircuitBuilder_ : public UltraCircuitBuilder_<FF> {
  public:
    static constexpr std::string_view NAME_STRING = "GoblinUltraArithmetization";
    static constexpr CircuitType CIRCUIT_TYPE = CircuitType::ULTRA;
    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS =
        UltraCircuitBuilder_<FF>::DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;

    size_t num_ecc_op_gates = 0; // number of ecc op "gates" (rows); these are placed at the start of the circuit

    // Stores record of ecc operations and performs corresponding native operations internally
    ECCOpQueue op_queue;

    // Wires storing ecc op queue data; values are indices into the variables array
    using typename UltraCircuitBuilder_<FF>::WireVector;
    std::array<WireVector, arithmetization::Ultra<FF>::NUM_WIRES> ecc_op_wires;

    WireVector& ecc_op_wire_1 = std::get<0>(ecc_op_wires);
    WireVector& ecc_op_wire_2 = std::get<1>(ecc_op_wires);
    WireVector& ecc_op_wire_3 = std::get<2>(ecc_op_wires);
    WireVector& ecc_op_wire_4 = std::get<3>(ecc_op_wires);

    [[nodiscard]] size_t get_num_gates() const override
    {
        auto num_ultra_gates = UltraCircuitBuilder_<FF>::get_num_gates();
        return num_ultra_gates + num_ecc_op_gates;
    }

    void queue_ecc_add_accum(const g1::affine_element& point);
    void queue_ecc_mul_accum(const g1::affine_element& point, const fr& scalar);
    g1::affine_element queue_ecc_eq();
    g1::affine_element batch_mul(const std::vector<g1::affine_element>& points, const std::vector<fr>& scalars);

  private:
    void record_ecc_op(const ecc_op_tuple& in);
    void add_ecc_op_gates(uint32_t op, const g1::affine_element& point, const fr& scalar = fr::zero());
    ecc_op_tuple make_ecc_op_tuple(uint32_t op, const g1::affine_element& point, const fr& scalar = fr::zero());
};
extern template class GoblinUltraCircuitBuilder_<barretenberg::fr>;

using GoblinUltraCircuitBuilder = GoblinUltraCircuitBuilder_<barretenberg::fr>;
} // namespace proof_system
