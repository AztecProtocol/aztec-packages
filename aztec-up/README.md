# The Aztec Installation Script

```
bash -i <(curl -s https://install.aztec.network)
```

That is all.

This will install into `~/.aztec/bin` a collection of scripts to help with running aztec containers, and will update
the user's `PATH` variable in their shell startup script so they can be found.

- `aztec` - The infrastructure container.
- `aztec-cli` - A command-line tool for interacting with infrastructure.
- `aztec-nargo` - A build of `nargo` from `noir` that is guaranteed to be version-aligned. Provides compiler, lsp and more. On `aztec-nargo compile <...>`, automatically transpiles artifacts using `avm-transpiler` and generates verification keys using `bb`.
- `aztec-sandbox` - A wrapper around docker-compose that launches services needed for sandbox testing.
- `aztec-up` - A tool to upgrade the aztec toolchain to the latest, or specific versions.
- `aztec-builder` - A useful tool for projects to generate ABIs and update their dependencies.

After installed, you can use `aztec-up` to upgrade or install specific versions.

```
VERSION=nightly aztec-up
```

This will install the nightly build.

```
VERSION=1.2.3 aztec-up
```

This will install the tagged release version 1.2.3.
