# External Audit Scope: Sumcheck

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

## Files to Audit
| File | Description |
|------|-------------|
| **`sumcheck/sumcheck.hpp`** | Main header containing `SumcheckProver` and `SumcheckVerifier` class templates. Contains extensive documentation on the protocol implementation. |
| **`sumcheck/sumcheck.cpp`** |  empty, contains compile hack |
| **`sumcheck/sumcheck_round.hpp`** | Implements `SumcheckProverRound` and `SumcheckVerifierRound` for computing/verifying individual round univariates |
| **`sumcheck/sumcheck_output.hpp`** | Data structure for sumcheck output containing challenges and claimed evaluations  |
| **`sumcheck/zk_sumcheck_data.hpp`** | Required data for Zero-knowledge using Libra masking polynomials and their update mechanisms |
| **`polynomials/row_disabling_polynomial.hpp`** | Polynomials for removing the contribution of the last 4 rows of the trace |
| **`polynomials/gate_separator.hpp`** | $pow_{beta}$ polynomials for combining the rows to get the final relation |
| **`polynomials/univariate.hpp`** | implementation of univariates. Main method audited is `extend_to`|
| **`stdlib/primitives/padding_indicator_array/*.hpp`**| In circuit computation of the padding indicator array for skipping over padding rounds|
| **`relations/nested_containers.hpp`** | Nested container utilities for relations |
| **`relations/relation_types.hpp`** | Type definitions for relations |
| **`relations/utils.hpp`** | Utility functions for relations |


## Brief Summary of Module
We refer you to `sumcheck/Sumcheck.md` for an in-depth explainer.

The Sumcheck module is at the core of our proving system. It contains the implementation of the sumcheck prover and verifier logic. The classes in the module are often templated on Flavor and vary depending on:
- Whether the flavor uses Grumpkin scalars (`ECCVMFlavor`, `ECCVMRecursiveFlavor`)
    - Commiting to round univariates instead of sending them in clear
- The flavor is zero-knowledge
    - handling the adjustments based on randomness added to the last rows of the trace
    - handling randomness added to the relation polynomial for masking as done in [Libra](https://eprint.iacr.org/2019/317.pdf).
- Whether the Flavor is Recursive or not, using `assert_zero` for checking equalities.
## Test Files
| File | Description |
|------|-------------|
| **`flavor/sumcheck_test_flavor.hpp`** | Defines a simple test flavor with only couple of relations for testing purposes |
| **`sumcheck/sumcheck.test.cpp`** | Tests for sumcheck's prove and verify methods |
| **`sumcheck/sumcheck_round.test.cpp`** | Test  fine grained SumcheckRound functions and operations on tuples (and tuples of tuples) of Univariates |
| **`sumcheck/partial_evaluation.test.cpp`** | Tests partial evaluation of polynomials |
| **`sumcheck/row_disabling_polynomial.test.cpp`** | Tests the disabling mechanism for rows containing randomness |
| **`polynomials/gate_separator.test.cpp`** | Tests operations and evaluations of the $\textsf{pow}_\beta$ polynomials |
| **`sumcheck/row_disabling_polynomial.test.cpp`** | Tests the disabling mechanism for rows containing randomness |
| **`stdlib/primitives/padding_indicator_array/*.test.cpp`** | Tests the generation of padding indicator array |



## Security Mechanisms
