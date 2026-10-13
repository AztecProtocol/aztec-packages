# External Audit Scope: Databus

Repository: https://github.com/AztecProtocol/aztec-packages-private
Commit hash: set when the audit starts. File list checked against `a18e6e7` (branch `v6`).

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

This scope owns the databus files. `chonk_audit_scope.md` also lists some of them because Chonk depends on them.

### Relations
1. `relations/databus_lookup_relation.hpp`: the log-derivative lookup relation for the databus

### stdlib
2. `stdlib/primitives/databus/databus.hpp`: defines the `databus` class with its `bus_vector`, and the `DataBusDepot` class; setters and getters
3. `stdlib/primitives/databus/databus.cpp`: operators such as `[]`

### Circuit builders
4. `stdlib_circuit_builders/databus.hpp`: the bus layout (`NUM_BUS_COLUMNS`, `BusId`)
5. `stdlib_circuit_builders/mega_circuit_builder.hpp`: adds calldata and return data; handles databus operations in a Mega circuit
6. `stdlib_circuit_builders/mega_circuit_builder.cpp`

### Provers
7. `ultra_honk/prover_instance.hpp`: allocates and constructs the databus polynomials
8. `ultra_honk/oink_prover.cpp`: commits to the databus polynomials and the log-derivative inverses
9. `honk/proof_system/logderivative_library.hpp`: computes the log-derivative inverses (called from `oink_prover.cpp`)

### Flavors
10. `flavor/mega_flavor.hpp`: declares the databus columns and polynomials

### ACIR
11. `dsl/acir_format/block_constraint.cpp`: handles the ACIR databus opcodes (block constraints)
12. `dsl/acir_format/acir_format.cpp`: calls the block constraint functions

### Chonk
13. `chonk/chonk.hpp`
14. `chonk/chonk.cpp`: databus consistency checks in the Chonk flow

## Brief Summary of Module
The databus transfers data between circuits. Circuits read bus columns through a log-derivative lookup relation.

`MegaFlavor` and `MegaKernelFlavor` have 7 bus columns: `kernel_calldata`, one calldata column per app (up to `MAX_APPS_PER_KERNEL` = 5), and `return_data`. `MegaAppFlavor` keeps only `return_data`, and `MegaZKFlavor` keeps only `kernel_calldata`.

The Chonk consistency checks (commitment equality checks) ensure that the calldata and return data used across circuits are consistent.

## Test Files
1. `stdlib/primitives/databus/databus.test.cpp`: databus read and write
2. `relations/databus_lookup_relation_consistency.test.cpp`: databus lookup relation
3. `chonk/chonk.test.cpp`: databus consistency checks

## Security Mechanisms
None.
