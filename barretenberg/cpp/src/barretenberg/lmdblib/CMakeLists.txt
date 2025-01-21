barretenberg_module(lmdblib lmdb numeric)

# add explicit dependencies to external C lib
add_dependencies(lmdblib lmdb)
add_dependencies(lmdblib_objects lmdb)
add_dependencies(lmdblib_tests lmdb)
add_dependencies(lmdblib_test_objects lmdb)

