import json
import re

# Path to your data.js file
filename = "/Users/adomurad/aztec-packages/dev/bench/data.js"

# Bench names to remove

REMOVE_BENCHES = {
  "wasmamm-add-liquidity-ivc-proof-wasm",
  "wasmamm-add-liquidity-ivc-proof-wasm-memory",
  "wasmamm-swap-exact-tokens-ivc-proof-wasm",
  "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
  "wasmnft-mint-ivc-proof-wasm",
  "wasmnft-mint-ivc-proof-wasm-memory",
  "wasmnft-transfer-in-private-ivc-proof-wasm",
  "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
  "wasmtoken-transfer-ivc-proof-wasm",
  "wasmtoken-transfer-ivc-proof-wasm-memory",
  "ivc-amm-add-liquidity-ivc-proof",
  "ivc-amm-add-liquidity-ivc-proof-memory",
  "ivc-amm-swap-exact-tokens-ivc-proof",
  "ivc-amm-swap-exact-tokens-ivc-proof-memory",
  "ivc-nft-mint-ivc-proof",
  "ivc-nft-mint-ivc-proof-memory",
  "ivc-nft-transfer-in-private-ivc-proof",
  "ivc-nft-transfer-in-private-ivc-proof-memory",
  "ivc-token-transfer-ivc-proof",
  "ivc-token-transfer-ivc-proof-memory",
}

# Read file and extract JSON
with open(filename, "r") as f:
  content = f.read()

# Extract the JSON object from the JS assignment
match = re.search(r"window\.BENCHMARK_DATA\s*=\s*({.*});?\s*$", content, re.DOTALL)
if not match:
  raise Exception("Could not find BENCHMARK_DATA assignment in file.")

data = json.loads(match.group(1))

# Remove benches
for entry_list in data["entries"].values():
  for entry in entry_list:
    if "benches" in entry:
      entry["benches"] = [
        b for b in entry["benches"] if b.get("name") not in REMOVE_BENCHES
      ]

# Write back to file (preserving JS assignment)
with open(filename, "w") as f:
  f.write("window.BENCHMARK_DATA = ")
  json.dump(data, f, indent=2)
  f.write(";\n")
