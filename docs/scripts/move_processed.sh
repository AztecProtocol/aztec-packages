#!/usr/bin/env bash
echo "label: \"AztecJS\"" > ./docs/developers/reference/aztecjs/_category_.yml
mv ./docs/developers/reference/aztecjs ./processed-docs/developers/reference/aztecjs
mv ./docs/developers/reference/smart_contract_reference/aztec-nr ./processed-docs/developers/reference/smart_contract_reference/aztec-nr
