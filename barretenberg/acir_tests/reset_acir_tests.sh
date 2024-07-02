# Run from within barretenberg/acir_tests
cd ../../noir/noir-repo
noirup -p .
cd test_programs && ./rebuild.sh

cd ../../../barretenberg/acir_tests
rm -rf acir_tests
