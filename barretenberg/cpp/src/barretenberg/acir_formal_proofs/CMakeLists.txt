barretenberg_module(acir_formal_proofs dsl circuit_checker smt_verification common)

# cvc5 headers are needed at compile time (transitive via smt_verification headers).
# include_directories() in smt_verification is directory-scoped, so we must add it here too.
target_include_directories(acir_formal_proofs_objects PRIVATE ${CVC5_INCLUDE_DIR})
target_include_directories(acir_formal_proofs_test_objects PRIVATE ${CVC5_INCLUDE_DIR})
add_dependencies(acir_formal_proofs_objects cvc5)
add_dependencies(acir_formal_proofs_test_objects cvc5)

# dsl format changes and now requires `create_avm2_recursion_constraints_goblin`
target_link_libraries(acir_formal_proofs PRIVATE vm2_stub)
target_link_libraries(acir_formal_proofs_tests PRIVATE vm2_stub)
