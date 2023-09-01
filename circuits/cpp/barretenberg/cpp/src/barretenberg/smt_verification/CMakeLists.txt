#barretenberg_module(smt_verification common ${CMAKE_SOURCE_DIR}/src/cvc5/tmp-lib/lib/libcvc5.so.1)
barretenberg_module(smt_verification common $ENV{HOME}/cvc5/tmp-lib/lib/libcvc5.so.1)

barretenberg_module(smt_examples common proof_system stdlib_primitives smt_verification)