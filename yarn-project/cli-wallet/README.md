# Aztec wallet Documentation

### Run tests locally

1) Start a local Ethereum node (Anvil) in one terminal:

```bash
anvil --host 127.0.0.1 --port 8545
```

2) In another terminal, start the Aztec sandbox from `yarn-project/aztec`:

```bash
cd yarn-project/aztec
NODE_NO_WARNINGS=1 ETHEREUM_HOSTS=http://127.0.0.1:8545 node ./dest/bin/index.js start --sandbox
```

3) Run the wallet tests from `yarn-project/cli-wallet/test`:

```bash
cd yarn-project/cli-wallet/test
./test.sh --filter <partialnameoftest>
```

Notes:
- **Filter tests**: Omit `--filter` to run all tests, or pass part of a test filename to run a subset.
- **Docker mode**: You can run tests using Docker by adding `--docker`:

```bash
./test.sh --docker --filter <partialnameoftest>
```

