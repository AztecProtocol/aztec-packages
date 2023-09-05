## Why is this here?

For producing a verifier library that is able to verify a plonk proof, we want all data structures to be in one file instead of distributed over multiple files. This means that when one asks for an plonk verifier proof, we just need to paste in the verifier key and send the whole object as a string.

## Why is it only UltraPlonk?

This is currently only being used by the bb binary which exposes the ultra plonk proving system and so we only need to do this for the ultra plonk solidity library.

## Whats with the python script?

When the bb binary is produced, we want to embed the templated contract in the binary, so that we can concatenate it with the verification key. To do this, we need to embed the templated contract into the binary which requires either xxd or the python script which will escape the necessary characters. xxd was not chosen because it converts everything to bytes and is not remotely legible anymore

## Whats the final solution?

We want to ship the binary with a resource folder, that then references the `contract.sol` file and any other resources needed by the binary that we do not want to embed.

## Using the Python script

```
python3 sol_to_cpp_embed.py ultra_verifier_template_contract.sol > ultra
_verifier_templated.h
```