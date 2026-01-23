barretenberg_module(acir_formal_proofs dsl circuit_checker smt_verification common)

# dsl format changes and now requires `create_avm2_recursion_constraints_goblin`
target_link_libraries(acir_formal_proofs PRIVATE vm2_stub)
