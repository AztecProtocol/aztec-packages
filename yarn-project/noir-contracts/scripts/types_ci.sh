# Run the types script for all files
mkdir -p src/types
./scripts/types.sh $(./scripts/get_all_contracts.sh)