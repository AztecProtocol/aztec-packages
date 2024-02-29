set -eu

# Move above script dir.
cd $(dirname $0)/..

cmake --preset clang16
cmake --build --preset clang16

cd build/

./bin/client_ivc_tests
./bin/commitment_schemes_tests
./bin/dsl_tests
./bin/flavor_tests
./bin/goblin_tests
./bin/protogalaxy_tests
./bin/relations_tests
./bin/srs_tests
./bin/sumcheck_tests
./bin/transcript_tests
./bin/ultra_honk_tests