
#!/bin/bash

# Runs tests scripts for all contracts, then for all libraries.

./scripts/test.sh CONTRACT $(./scripts/get_all_contracts.sh)
./scripts/test.sh LIB $(./scripts/get_all_libraries.sh)