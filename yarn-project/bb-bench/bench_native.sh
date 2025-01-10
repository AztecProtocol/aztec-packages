# WORKTODO: create proof dir if it doesn't exist
CIRCUIT=recursion
BB=../../../barretenberg/cpp/build/bin/bb
cd $CIRCUIT && BB_VERBOSE=1 $BB prove_and_verify_ultra_honk -b ./target/$CIRCUIT.json -w ./target/$CIRCUIT.gz -v