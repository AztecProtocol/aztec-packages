# recursion-benchmarks

This is a copy from 0xPARC recursion-benchmarks repo containing only benchmark code for the Barretenberg backend.

## Main idea
**Compare diverse properties** (proving time, proof size, etc) **for a recursive circuit** that does the same set of operations (recursion, hash, signature verification, etc) **across different proving systems**.

Having a reproducible setup that we can run on different devices.


## Run

- barretenberg:
	- setup:
		- install Noir v0.31.0 and the Barretenberg backend
			- `noirup --version 0.31.0`
				- (To get `noirup`, run `curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash`)
			- `bbup`
				- (To get `bbup`, run `curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash`)
		- `cd nonrust/barretenberg/browser`
		- `npm install && npm run build`
	- to run the benchmarks:
		- native:
			- `cd nonrust/barretenberg`
			- `python native.py`
		- browser:
			- `cd nonrust/barretenberg/browser`
			- `npm run preview`
			- go to http://localhost:4173/
