# Deploying contracts

Once you have [compiled](./compiling.md) your contracts you can proceed to deploying them using `aztec-cli`.

## Prerequisites
- aztec-cli installed
- contract artifacts ready

## Deploy

To deploy the contracts you can use `aztec-cli`:

```bash
aztec-cli deploy --contract-abi /path/to/contract/abi.json
```

Example with all the arguments:

```bash
aztec-cli deploy /path/to/contract/abi.json --rpc-url http://localhost:8080 --public-key 0x1234 --salt 0x1234
```

### Arguments
This command takes the following mandatory arguments:

- `--contract-abi <file>`: Path to the contract ABI file in JSON format (e.g. `build/contracts/PrivateToken.json`).
Alternatively you can pass here a name of a contract ABI as exported by `@aztec/noir-contracts` (run `aztec-cli example-contracts` to get the list).

and the following optional arguments:
- `-args <constructorArgs...>` (default: `[]`): Arguments to pass to the contract constructor.
- `--rpc-url <string>` (default: `http://localhost:8080`): URL of the Aztec node to connect to.
- `--public-key <string>` (default: `undefined`): Optional encryption public key for this contract. Set this only if this contract is expected to receive private notes, which will be encrypted using this public key.'
- `--salt <string>` (default: random value): Hexadecimal string used when computing the contract address of the contract being deployed.
By default is set to a random value.
Set it, if you need a deterministic contract address (same functionality as Ethereum's `CREATE2` opcode).

```bash
aztec-cli deploy --contract-abi <file> [-args <constructorArgs...>] [--rpc-url <string>] [--public-key <string>] [--salt <string>]
```