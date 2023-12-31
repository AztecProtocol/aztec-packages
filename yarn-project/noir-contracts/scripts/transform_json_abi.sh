#!/bin/bash
# Sadly, yarn-project expects ABI files in a format different to what is output from nargo.
# We need to transform every ABI into this adjusted format.
# TODO: Should aztec conform to nargo format, or nargo to aztec format?
#
# Lowercase function_type value.
# Camel case function_type and is_internal.
# Discard first parameter (input).
# Hoist parameters out of abi.
# Hoist return_type out of abi, make an array of 1 element.
#
jq '
  .functions |= map(
    (.functionType = (.function_type | ascii_downcase)) |
    (.isInternal = .is_internal) |
    del(.function_type, .is_internal) |
    (.parameters = .abi.parameters[1:]) |
    (.returnTypes = [ .abi.return_type.abi_type ]) |
    del(.abi)
  )
' $1
