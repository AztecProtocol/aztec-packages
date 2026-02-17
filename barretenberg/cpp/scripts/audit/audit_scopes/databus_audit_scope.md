# External Audit Scope: Databus

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

## Files to Audit
#### Relations:
1. `barretenberg/cpp/src/barretenberg/relations/databus_lookup_relation.hpp`
    ##### Brief Description:
    - the logderivative style lookup relation for databus
#### stdlib:
1. `barretenberg/cpp/src/barretenberg/stdlib/primitives/databus/databus.hpp`
    ##### Brief Description:
    - defines `DatabusDepot` class
    - defines `BusVector`
    - setters and getters

2. `barretenberg/cpp/src/barretenberg/stdlib/primitives/databus/databus.cpp`
    ##### Brief Description:
    - operators such as `[]`

#### stdlib circuit builder:
3. `barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/databus.hpp`

#### circuit builders:
4. `barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp`
    ##### Brief Description:
    - adding calldata/return_data. Handling databus related operations in a Mega circuit
5. `barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.cpp`

#### Provers:
6. `barretenberg/cpp/src/barretenberg/ultra_honk/prover_instance.hpp`
    ##### Brief Description:
    allocation and construction of databus polynomials
7. `barretenberg/cpp/src/barretenberg/ultra_honk/oink_prover.cpp`
    ##### Brief Description:
    - committing to databus polynomials and the logderivative inverses
8. `barretenberg/cpp/src/barretenberg/ultra_honk/witness_computation.cpp`
    Brief Description:
    - computing the logderivative inverses
#### Flavors:
9. `barretenberg/cpp/src/barretenberg/flavor/mega_flavor.hpp`
    ##### Brief Description:
    - declaration of the databus columns/polynomials
#### ACIR:
10. `barretenberg/cpp/src/barretenberg/dsl/acir_format/block_constraint.cpp`
    ##### Brief Description:
    - handling of acir opcodes related to databus, called BlockConstraints
11. `barretenberg/cpp/src/barretenberg/dsl/acir_format/acir_format.cpp`
    ##### Brief Description:
    - envoking calls to block constraints functions
#### CHONK (ClientIVC)
12. `barretenberg/cpp/src/barretenberg/chonk/chonk.hpp`
13. `barretenberg/cpp/src/barretenberg/chonk/chonk.cpp`
    ##### Brief Description:
    - consistancy checks related to databus in the ClientIVC flow
<!-- 14. `barretenberg/cpp/src/barretenberg/chonk/mock_circuit_producer.hpp`
    ##### Brief Desription:
    - creates mock databus  -->
## Brief Summary of Module
The `Databus` module provides an efficient mechanism for transfering data between circuits. More concretely `Mega` circuits will have 3 colums called `calldata`, `secondary_calldata` and `return_data` which can be used for lookups with logderivative style lookup relations.
Morever, the consistency checks (commitment equality checks) in CHONK (ClientIVC) ensure that call data and return data used are consistent.

## Test Files
1. `barretenberg/cpp/src/barretenberg/stdlib/primitives/databus/databus.test.cpp`
     #### description:
     - tests for databus read/write
2. `barretenberg/cpp/src/barretenberg/chonk/chonk.test.cpp`
    #### description:
    - contains tests for databus consistency checks

## Security Mechanisms
1. Apparently none (According to Sasha, tbd)
