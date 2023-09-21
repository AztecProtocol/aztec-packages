# End to End

This package includes end-to-end tests that cover Aztec's user-facing features.
End-to-end tests should be configurable to run against an Aztec environment, whether local
or a persistent test-net. They should use only packages we expect a user to use, using idioms that
we recommend. If lower level tests are desired, they are best done as package-level tests.

End-to-end tests are:

- A part of the CI of every commit, ran against a local Aztec environment
- Ran against deployed NPM packages and sandbox in CI (TODO)

These can be run locally either by starting anvil on a different terminal.

```
anvil -p 8545 --host 0.0.0.0 --chain-id 31337
```

and then running

```
yarn test
```

Or by running

```
yarn test:integration
```

which will spawn the two processes.

You can also run this by `docker-compose up` which will spawn 2 different containers for Anvil and the test runner.
