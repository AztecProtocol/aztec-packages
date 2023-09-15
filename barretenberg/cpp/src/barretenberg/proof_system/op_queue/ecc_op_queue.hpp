#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"

namespace proof_system {

enum EccOpCode { NULL_OP, ADD_ACCUM, MUL_ACCUM, EQUALITY };

/**
 * @brief Raw description of an ECC operation used to produce equivalent descriptions over different curves.
 */
struct ECCOp {
    const bool add = false;
    const bool mul = false;
    const bool eq = false;
    const bool reset = false;
    const barretenberg::g1::affine_element base_point = barretenberg::g1::affine_element{ 0, 0 };
    const uint256_t scalar_1 = 0;
    const uint256_t scalar_2 = 0;
    const barretenberg::fr mul_scalar_full = 0;
};

/**
 * @brief Used to construct execution trace representations of elliptic curve operations.
 *
 * @details Currently the targets in execution traces are: four advice wires in UltraCircuitBuilder and 5 wires in the
 * ECCVM. In each case, the variable values are stored in this class, since the same values will need to be used later
 * by the TranslationVMCircuitBuilder. The circuit builders will store witness indices which are indices in the
 * ultra (resp. eccvm) ops members of this class (rather than in the builder's variables array).
 */
class ECCOpQueue {
    using Point = curve::BN254::AffineElement;
    Point point_at_infinity = curve::BN254::Group::affine_point_at_infinity;
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField; // Grumpkin's scalar field

    // The operations written to the queue are also performed natively; the result is stored in accumulator
    Point accumulator = point_at_infinity;

  public:
    std::vector<ECCOp> raw_ops;
    std::array<std::vector<Fr>, 4> ultra_ops; // ops encoded in the width-4 Ultra format
    std::vector<std::array<Fq, 5>> eccvm_ops;

    size_t current_ultra_ops_size = 0;  // M_i
    size_t previous_ultra_ops_size = 0; // M_{i-1}

    std::array<Point, 4> ultra_ops_commitments;
    std::array<Point, 4> previous_ultra_ops_commitments;

    uint32_t get_number_of_muls()
    {
        uint32_t num_muls = 0;
        for (auto& op : raw_ops) {
            if (op.mul) {
                if (op.scalar_1 != 0) {
                    num_muls++;
                }
                if (op.scalar_2 != 0) {
                    num_muls++;
                }
            }
        }
        return num_muls;
    }

    Point get_accumulator() { return accumulator; }

    /**
     * @brief Set the current and previous size of the ultra_ops transcript
     *
     * @details previous_ultra_ops_size = M_{i-1} is needed by the prover to extract the previous aggregate op
     * queue transcript T_{i-1} from the current one T_i. This method should be called when a circuit is 'finalized'.
     */
    void set_size_data()
    {
        previous_ultra_ops_size = current_ultra_ops_size;
        current_ultra_ops_size = ultra_ops[0].size();
    }

    [[nodiscard]] size_t get_previous_size() const { return previous_ultra_ops_size; }

    void set_commitment_data(std::array<Point, 4>& commitments)
    {
        previous_ultra_ops_commitments = ultra_ops_commitments;
        ultra_ops_commitments = commitments;
    }

    /**
     * @brief Get a 'view' of the current ultra ops object
     *
     * @return std::vector<std::span<Fr>>
     */
    std::vector<std::span<Fr>> get_aggregate_transcript()
    {
        std::vector<std::span<Fr>> result;
        result.reserve(ultra_ops.size());
        for (auto& entry : ultra_ops) {
            result.emplace_back(entry);
        }
        return result;
    }

    /**
     * @brief Get a 'view' of the previous ultra ops object
     *
     * @return std::vector<std::span<Fr>>
     */
    std::vector<std::span<Fr>> get_previous_aggregate_transcript()
    {
        std::vector<std::span<Fr>> result;
        result.reserve(ultra_ops.size());
        // Construct T_{i-1} as a view of size M_{i-1} into T_i
        for (auto& entry : ultra_ops) {
            result.emplace_back(entry.begin(), previous_ultra_ops_size);
        }
        return result;
    }

    /**
     * @brief TESTING PURPOSES ONLY: Populate ECC op queue with mock data as stand in for "previous circuit" in tests
     * @details (Issue #723) We currently cannot support Goblin proofs (specifically, transcript aggregation) if there
     * is not existing data in the ECC op queue (since this leads to zero-commitment issues). This method populates the
     * op queue with mock data so that the prover of an arbitrary 'first' circuit can behave as if it were not the
     * prover over the first circuit in the stack.
     *
     * @param op_queue
     */
    void populate_with_mock_initital_data()
    {
        // Add a single row of data to the op queue and commit to each column as [1] * FF(data)
        std::array<Point, 4> mock_op_queue_commitments;
        size_t idx = 0;
        for (auto& entry : this->ultra_ops) {
            auto mock_data = Fr::random_element();
            entry.emplace_back(mock_data);
            mock_op_queue_commitments[idx++] = Point::one() * mock_data;
        }
        // Set some internal data based on the size of the op queue data
        this->set_size_data();
        // Add the commitments to the op queue data for use by the next circuit
        this->set_commitment_data(mock_op_queue_commitments);
    }

    /**
     * @brief Write point addition op to queue and natively perform addition
     *
     * @param to_add
     */
    void add_accumulate(const Point& to_add)
    {
        // Update the accumulator natively
        accumulator = accumulator + to_add;

        // Store the operation
        raw_ops.emplace_back(ECCOp{
            .add = true,
            .mul = false,
            .eq = false,
            .reset = false,
            .base_point = to_add,
            .scalar_1 = 0,
            .scalar_2 = 0,
            .mul_scalar_full = 0,
        });
    }

    /**
     * @brief Write multiply and add op to queue and natively perform operation
     *
     * @param to_add
     */
    void mul_accumulate(const Point& to_mul, const Fr& scalar)
    {
        // Update the accumulator natively
        accumulator = accumulator + to_mul * scalar;

        // Store the operation
        Fr scalar_1 = 0;
        Fr scalar_2 = 0;
        auto converted = scalar.from_montgomery_form();
        Fr::split_into_endomorphism_scalars(converted, scalar_1, scalar_2);
        scalar_1 = scalar_1.to_montgomery_form();
        scalar_2 = scalar_2.to_montgomery_form();
        raw_ops.emplace_back(ECCOp{
            .add = false,
            .mul = true,
            .eq = false,
            .reset = false,
            .base_point = to_mul,
            .scalar_1 = scalar_1,
            .scalar_2 = scalar_2,
            .mul_scalar_full = scalar,
        });
    }

    /**
     * @brief Write equality op using internal accumulator point
     *
     * @return current internal accumulator point (prior to reset to 0)
     */
    Point eq()
    {
        auto expected = accumulator;
        accumulator.self_set_infinity(); // TODO(luke): is this always desired?

        raw_ops.emplace_back(ECCOp{
            .add = false,
            .mul = false,
            .eq = true,
            .reset = true,
            .base_point = expected,
            .scalar_1 = 0,
            .scalar_2 = 0,
            .mul_scalar_full = 0,
        });

        return expected;
    }

    /**
     * @brief Write empty row to queue
     *
     */
    void empty_row()
    {
        raw_ops.emplace_back(ECCOp{
            .add = false,
            .mul = false,
            .eq = false,
            .reset = false,
            .base_point = point_at_infinity,
            .scalar_1 = 0,
            .scalar_2 = 0,
            .mul_scalar_full = 0,
        });
    }
};

} // namespace proof_system
