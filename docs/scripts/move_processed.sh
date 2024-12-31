#!/usr/bin/env bash
echo "label: \"AztecJS\"" > ./docs/build/reference/aztecjs/_category_.yml
mv ./docs/build/reference/aztecjs ./processed-docs/build/reference/aztecjs
mv ./docs/build/reference/smart_contract_reference/aztec-nr ./processed-docs/build/reference/smart_contract_reference/aztec-nr
