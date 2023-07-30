
#!/bin/bash

# Example:

# If you've compiled Noir from source:
# ./compile.sh --nargo-path=path/to/nargo --verbose zk_token ecdsa_account
# yarn noir:build --nargo-path=path/to/nargo zk_token ecdsa_account

# If nargo is installed properly in your PATH:
# yarn noir:build zk_token ecdsa_account

# Enable strict mode:
# Exit on error (set -e), treat unset variables as an error (set -u),
# and propagate the exit status of the first failing command in a pipeline (set -o pipefail).
set -eu;
artifacts_dir="src/artifacts"


# Create output directories
mkdir -p src/types
mkdir -p $artifacts_dir


ROOT=$(pwd)

write_import() {
    NAME=$1
    CONTRACT_NAME=`echo $NAME | sed -r 's/(^|_)(.)/\U\2/g'`
    echo "import ${CONTRACT_NAME}Json from './${NAME}_contract.json' assert { type: 'json' };"  >> "$artifacts_dir/index.ts";
}

write_export() {
    NAME=$1
    CONTRACT_NAME=`echo $NAME | sed -r 's/(^|_)(.)/\U\2/g'`
    echo "export const ${CONTRACT_NAME}ContractAbi = ${CONTRACT_NAME}Json as ContractAbi;"  >> "$artifacts_dir/index.ts";
    echo "Written typescript for $NAME"
}


process() {
  CONTRACT_NAME=$1

  cd $ROOT
  echo "Creating types for $CONTRACT_NAME"
  NODE_OPTIONS=--no-warnings yarn ts-node --esm src/scripts/copy_output.ts $CONTRACT_NAME
}

format(){
  echo "Formatting contract folders"
  yarn run -T prettier -w  ../aztec.js/src/abis/*.json ./src/types/*.ts
  echo -e "Done\n"
}


# Check if at least one CONTRACT_NAME is provided, if not, display usage information.
if [ $# -eq 0 ]; then
  usage
  exit 0
fi

# Make type files
for CONTRACT_NAME in "$@"; do
  process $CONTRACT_NAME &
done

# Wait for all background processes to finish
wait

# Write the index ts stuff
# Remove the output file
rm $artifacts_dir/index.ts || true

echo "// Auto generated module\n" > "$artifacts_dir/index.ts";
echo "import { ContractAbi } from '@aztec/foundation/abi';"  >> "$artifacts_dir/index.ts";
for CONTRACT_NAME in "$@"; do
    write_import $CONTRACT_NAME
done

for CONTRACT_NAME in "$@"; do
    write_export $CONTRACT_NAME
done

# only run the rest when the full flag is set
format
