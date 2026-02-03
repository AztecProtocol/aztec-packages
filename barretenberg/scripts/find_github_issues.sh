RESULT=../issues
> $RESULT
find acir_tests/ -name "*.sh" -exec grep "barretenberg/issues/" {} + >> ../issues
find cpp/src/    -type f      -exec grep "barretenberg/issues/" {} + >> ../issues
find ts/src      -type f      -exec grep "barretenberg/issues/" {} + >> ../issues
find sol/src     -type f      -exec grep "barretenberg/issues/" {} + >> ../issues
