# WORKTODO: create proof dir if it doesn't exist
BB=../../../barretenberg/cpp/build/bin/bb
cd recursion && BB_VERBOSE=1 $BB prove_and_verify_ultra_honk -b ./target/recursion.json -w ./target/recursion.gz -v