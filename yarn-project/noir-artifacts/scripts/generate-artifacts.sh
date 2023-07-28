
#!/bin/bash

noir_path=..

# create target dir if it doesn't exist
target_dir=./generated
mkdir -p "$target_dir";

# Copies contract artifacts into the artifacts folder
contracts=$(ls -d $noir_path/noir-contracts/src/contracts/*_contract/Nargo.toml | sed 's#^\.\.\/##' | sed -r "s/noir-contracts\\/src\\/contracts\\/(.+)_contract\\/Nargo.toml/\\1/")

process() {
    NAME=$1

    echo "Copying output for $NAME"

    # Set the folder and CONTRACT_NAME variables
    folder="$noir_path/noir-contracts/src/contracts/${NAME}_contract"
    echo "$folder"
    CONTRACT_NAME=`echo $NAME | sed -r 's/(^|_)(.)/\U\2/g'`
    echo "$CONTRACT_NAME"

    ARTIFACT=$(cat "${folder}/target/main-${CONTRACT_NAME}.json")
    echo $ARTIFACT >> $target_dir/${NAME}_contract.json
    echo "Copied output for $NAME"
}

write_import() {
    NAME=$1
    CONTRACT_NAME=`echo $NAME | sed -r 's/(^|_)(.)/\U\2/g'`

    echo "Writing typescript for $NAME"
    echo "import ${CONTRACT_NAME}Json from './${NAME}_contract.json' assert { type: 'json' };"  >> "$target_dir/index.ts";
}

write_export() {
    NAME=$1
    CONTRACT_NAME=`echo $NAME | sed -r 's/(^|_)(.)/\U\2/g'`

    echo "Writing typescript for $NAME"
    echo "export const ${CONTRACT_NAME}Abi = ${CONTRACT_NAME}Json as ContractAbi;"  >> "$target_dir/index.ts";
}

# Write the index ts stuff
echo "// Auto generated module\n" > "$target_dir/index.ts";
echo "import { ContractAbi } from '@aztec/foundation/abi';"  >> "$target_dir/index.ts";

# Process contracts
for CONTRACT_NAME in $contracts; do
  process $CONTRACT_NAME &
done

# Wait for all background processes to finish
wait

for CONTRACT_NAME in $contracts; do
    write_import $CONTRACT_NAME &
done

for CONTRACT_NAME in $contracts; do
    write_export $CONTRACT_NAME &
done
