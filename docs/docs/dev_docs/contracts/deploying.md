# Deploying contracts

Once you have [compiled](./compiling.md) your contracts you can proceed to deploying them using `aztec-cli`.

## Prerequisites
- aztec-cli installed
- contract artifacts ready

## Deploy

To deploy the contracts you can use `aztec-cli`:

```bash
aztec-cli deploy /path/to/contract/abi.json
```

### Arguments
This command takes 1 mandatory positional argument which is the path to the contract ABI file in JSON format (e.g. `build/contracts/PrivateToken.json`). Alternatively you can pass here a name of a contract ABI as exported by `@aztec/noir-contracts` (run `aztec-cli example-contracts` to get the list).

The command also takes the following optional arguments:
- `-args <constructorArgs...>` (default: `[]`): Arguments to pass to the contract constructor.
- `--rpc-url <string>` (default: `http://localhost:8080`): URL of the Aztec node to connect to.
- `--public-key <string>` (default: `undefined`): Optional encryption public key for this contract.
Set this only if this contract is expected to receive private notes, which will be encrypted using this public key.
(Contracts which are expected to receive notes are called account contracts.)
- `--salt <string>` (default: random value): Hexadecimal string used when computing the contract address of the contract being deployed.
By default is set to a random value.
Set it, if you need a deterministic contract address (same functionality as Ethereum's `CREATE2` opcode).

Bellow is a full example of deploying a private token contract.
The contract has `initial_supply` and `owner` as constructor arguments.
Because the contract send a note to the owner inside the constructor, we first need to register the owner as a recipient with the following command:

```bash
aztec-cli register-recipient --address 0x147392a39e593189902458f4303bc6e0a39128c5a1c1612f76527a162d36d529 --public-key 0x26e193aef4f83c70651485b5526c6d01a36d763223ab24efd1f9ff91b394ac0c20ad99d0ef669dc0dde8d5f5996c63105de8e15c2c87d8260b9e6f02f72af622 --partial-address 0x200e9a6c2d2e8352012e51c6637659713d336405c29386c7c4ac56779ab54fa7
```

Once the recipient is registered we can deploy the contract:

```bash
aztec-cli deploy PrivateTokenContractAbi --args 1000 0x147392a39e593189902458f4303bc6e0a39128c5a1c1612f76527a162d36d529
```

If everything went as expected you should see the following output (with a different address):
> Contract deployed at 0x151de6120ae6628129ee852c5fc7bcbc8531055f76d4347cdc86003bbea96906

If we pass in the salt argument:

```bash
aztec-cli deploy PrivateTokenContractAbi --args 1000 0x147392a39e593189902458f4303bc6e0a39128c5a1c1612f76527a162d36d529 --salt 0x123
```

the resulting address will be deterministic.