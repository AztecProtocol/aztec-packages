barretenberg_module(mega_sumcheck_bench chonk)

# dsl (pulled in via chonk) calls create_avm2_recursion_constraints_goblin(), which must be provided by
# vm2_stub (AVM off) or vm2 (AVM on) -- mirrors how the bb / bb-avm binaries link.
if(AVM)
    target_link_libraries(mega_sumcheck_bench PRIVATE vm2)
else()
    target_link_libraries(mega_sumcheck_bench PRIVATE vm2_stub)
endif()
