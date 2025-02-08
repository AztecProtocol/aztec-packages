#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <cstdint>
#include <string>
#include <vector>

/**
 * @brief Class for loading ACIR (Arithmetic Circuit Intermediate Representation) programs and converting them to SMT
 * format
 *
 * This class handles loading ACIR programs from files and provides functionality to:
 * - Convert the ACIR program to various SMT circuit representations
 * - Access the underlying constraint systems
 * - Build circuits for verification
 *
 * The loader reads an ACIR program file, creates constraint systems, and allows conversion
 * to different SMT circuit types (bitvector, field, integer) for formal verification.
 */
class AcirToSmtLoader {
  public:
    // Deleted constructors/operators to prevent copying/moving
    AcirToSmtLoader() = delete;
    AcirToSmtLoader(const AcirToSmtLoader& other) = delete;
    AcirToSmtLoader(AcirToSmtLoader&& other) = delete;
    AcirToSmtLoader& operator=(const AcirToSmtLoader other) = delete;
    AcirToSmtLoader&& operator=(AcirToSmtLoader&& other) = delete;

    ~AcirToSmtLoader() = default;

    /**
     * @brief Constructs loader from an ACIR program file
     * @param filename Path to the ACIR program file to load
     *
     * Reads the ACIR program from file, initializes the constraint system,
     * and prepares the circuit buffer for later use.
     */
    AcirToSmtLoader(std::string filename);

    /**
     * @brief Gets the constraint systems from the loaded ACIR program
     * @return Reference to the ACIR format constraint systems
     */
    acir_format::AcirFormat& get_constraint_systems() { return this->constraint_system; }

    /**
     * @brief Creates a circuit builder for the loaded program
     * @return UltraCircuitBuilder instance
     *
     * Creates and returns a circuit builder with predefined variable names:
     * - Variable 0 named "a"
     * - Variable 1 named "b"
     * - Variable 2 named "c"
     */
    bb::UltraCircuitBuilder get_circuit_builder();

    /**
     * @brief Gets an SMT solver instance
     * @return Solver instance for SMT solving
     *
     * Creates a solver configured with:
     * - Circuit modulus from schema
     * - Default solver configuration
     * - Minimum bit width of 16
     * - Maximum bit width of 240
     */
    smt_solver::Solver get_smt_solver();

    /**
     * @brief Creates an SMT circuit for bitvector operations
     * @param solver Pointer to SMT solver to use
     * @return UltraCircuit configured for bitvector operations
     */
    smt_circuit::UltraCircuit get_bitvec_smt_circuit(smt_solver::Solver* solver);

    /**
     * @brief Creates an SMT circuit for field operations
     * @param solver Pointer to SMT solver to use
     * @return UltraCircuit configured for field operations
     */
    smt_circuit::UltraCircuit get_field_smt_circuit(smt_solver::Solver* solver);

    /**
     * @brief Creates an SMT circuit for integer operations
     * @param solver Pointer to SMT solver to use
     * @return UltraCircuit configured for integer operations
     */
    smt_circuit::UltraCircuit get_integer_smt_circuit(smt_solver::Solver* solver);

  private:
    std::string instruction_name;              ///< Name of the instruction/filename being processed
    std::vector<uint8_t> acir_program_buf;     ///< Buffer containing the raw ACIR program data read from file
    acir_format::AcirFormat constraint_system; ///< The parsed constraint system from the ACIR program
    msgpack::sbuffer circuit_buf;              ///< Buffer for circuit serialization using MessagePack
};