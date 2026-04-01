# External Audit Scope: Ultra + MegaCircuitBuilder

Repository: https://github.com/AztecProtocol/aztec-packages-private

Commit hash: Most recent commit on branch 'next'

Status: Planned, [Luke, Raju]

## Files to Audit

Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Circuit Builders

1. `stdlib_circuit_builders/circuit_builder_base.hpp`
2. `stdlib_circuit_builders/circuit_builder_base_impl.hpp`
3. `stdlib_circuit_builders/ultra_circuit_builder.hpp`
4. `stdlib_circuit_builders/ultra_circuit_builder.cpp`
5. `stdlib_circuit_builders/mega_circuit_builder.hpp`
6. `stdlib_circuit_builders/mega_circuit_builder.cpp`
7. `honk/execution_trace/execution_trace_block.hpp`
8. `honk/execution_trace/ultra_execution_trace.hpp`
9. `honk/execution_trace/mega_execution_trace.hpp`
10. `honk/execution_trace/gate_data.hpp`

### Relations (Ultra)

11. `relations/ultra_arithmetic_relation.hpp`
12. `relations/permutation_relation.hpp`
13. `relations/logderiv_lookup_relation.hpp`
14. `relations/delta_range_constraint_relation.hpp`
15. `relations/elliptic_relation.hpp`
16. `relations/memory_relation.hpp`
17. `relations/non_native_field_relation.hpp`
18. `relations/poseidon2_external_relation.hpp`
19. `relations/poseidon2_internal_relation.hpp`

### Relations (Mega-only)

20. `relations/ecc_op_queue_relation.hpp`
21. `relations/databus_lookup_relation.hpp`

### Lookup infrastructure

22. `stdlib_circuit_builders/plookup_tables/plookup_tables.hpp`
23. `stdlib_circuit_builders/plookup_tables/plookup_tables.cpp`
24. `stdlib_circuit_builders/plookup_tables/types.hpp`
25. `stdlib_circuit_builders/plookup_tables/dummy.hpp`
26. `stdlib/primitives/plookup/plookup.hpp`
27. `stdlib/primitives/plookup/plookup.cpp`

### ECC Op Queue

The following is "joint" functionality for the ECCVM and the Mega circuit builder (called `UltraOps`. In this audit, we only care about how things are represented in the Mega circuit builder.

28. `op_queue/ecc_op_queue.hpp`
29. `op_queue/ecc_ops_table.hpp` (especially the `UltraEccOpsTable` class and its methods)

### Stdlib Goblin Components

We represent bn254 group elements in the Mega circuit builder using "Goblinized" representations. Particularly, the `goblin_field` represents bn254 base field elements (x, y coordinates), and the `biggroup_goblin` represents bn254 group elements.

30. `stdlib/primitives/bigfield/goblin_field.hpp`
31. `stdlib/primitives/biggroup/biggroup_goblin.hpp`
32. `stdlib/primitives/biggroup/biggroup_goblin_impl.hpp`

### Databus

Within this audit, it is important to make sure that the databus "correctly links up" with the Mega circuit builder. Therefore, the following file is also in the scope of the audit.

33. `stdlib_circuit_builders/databus.hpp`

### ACIR Format

34. `dsl/acir_format/range_constraint.hpp`

## Brief Summary of Module

The Ultra/MegaCircuitBuilder module implements the core circuit construction infrastructure for Barretenberg's proving system.

**Class Hierarchy:**

```
CircuitBuilderBase<FF>
    └── UltraCircuitBuilder_<ExecutionTrace>
            └── MegaCircuitBuilder_<FF>
```

- **CircuitBuilderBase**: Provides witness variable management, equivalence classes for copy constraints, public input tracking, and variable tagging
- **UltraCircuitBuilder**: Implements Ultra arithmetization with arithmetic gates, ROM/RAM memory operations, range constraints, table lookups, elliptic curve operations, non-native field arithmetic, and poseidon2 hashing
- **MegaCircuitBuilder**: Extends Ultra with "Goblinized" (deferred) ECC operations and databus functionality for efficient inter-circuit communication (calldata/returndata)

**Reference:** [stdlib_circuit_builders/README.md](https://github.com/AztecProtocol/aztec-packages-private/blob/next/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/README.md)

## Test Files

### Circuit Builder Tests

1. `circuit_checker/ultra_circuit_builder_basic.test.cpp`
2. `circuit_checker/ultra_circuit_builder_arithmetic.test.cpp`
3. `circuit_checker/ultra_circuit_builder_elliptic.test.cpp`
4. `circuit_checker/ultra_circuit_builder_lookup.test.cpp`
5. `circuit_checker/ultra_circuit_builder_memory.test.cpp`
6. `circuit_checker/ultra_circuit_builder_nonnative.test.cpp`
7. `circuit_checker/ultra_circuit_builder_range.test.cpp`
8. `circuit_checker/ultra_circuit_builder_sort_permutation.test.cpp`
9. `circuit_checker/mega_circuit_builder.test.cpp`

### Relation Tests

10. `relations/ultra_relation_consistency.test.cpp`

### Test Utilities

1. `circuit_checker/circuit_checker.hpp`
2. `circuit_checker/ultra_circuit_checker.hpp`
3. `circuit_checker/ultra_circuit_checker.cpp`

## Security Mechanisms

### SMT (Satisfiability Modulo Theories) Verification

1. `smt_verification/circuit/ultra_circuit.test.cpp`

### Boomerang Value Detection
2. `boomerang_value_detection/graph_description.test.cpp`
3. `boomerang_value_detection/graph_description_megacircuitbuilder.test.cpp`

## Misc. Tests (NOT part of the audit, but might be helpful to situation)

The full prove-verify testing package is more extensive than the mere `circuit_checker` tests. Therefore, the following tests might be helpful as reference points.

1. `ultra_honk/lookup.test.cpp`
2. `ultra_honk/permutation.test.cpp`
3. `ultra_honk/rom_ram.test.cpp`
4. `ultra_honk/ultra_honk.test.*pp`
