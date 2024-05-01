#!/usr/bin/env bash
set -eu

NARGO=${NARGO:-nargo}
TRANSPILER=${TRANSPILER:-avm-transpiler}

if [ "${1:-}" != "compile" ]; then
	echo "Usage: $0 compile"
	exit 1
fi
shift # remove the compile arg so we can inject --show-artifact-paths

# Create a temporary file to capture and parse nargo's stdout while still printing it to the console.
# To avoid a situation where the script fails and the temporary file isn't removed,
# create file descriptors for writing/reading the temporary file and then remove the file.
tmpfile=$(mktemp)
exec 3>"$tmpfile"
exec 4<"$tmpfile"
rm "$tmpfile"

# Forward all arguments to nargo, tee output to the tmp file
echo "Running nargo ($NARGO compile --show-artifact-paths) with args: $@"
$NARGO compile --show-artifact-paths "$@" | tee /dev/fd/3

# Parse nargo's output (captured in the tmp file) to determine which artifacts to transpile
artifacts_to_transpile=$(grep -oP 'Saved contract artifact to: \K.*' <&4)

# Transpile each artifact
for artifact in "$artifacts_to_transpile"; do
	# transpiler input and output files are the same (modify in-place)
	$TRANSPILER "$artifact" "$artifact"
done
