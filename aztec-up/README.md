# The Aztec Installation Script

```
bash -i <(curl -s https://install.aztec.network)
```

That is all.

This will install into `~/.aztec/bin` a collection of scripts to help with running aztec containers, and will update
the user's `PATH` variable in their shell startup script so they can be found.

- `aztec` - a collection of tools to compile and test contracts, to launch subsystems and interact with the aztec network."
- `aztec-up` - a tool to upgrade the aztec toolchain to the latest, or specific versions."
- `aztec-wallet` - our minimalistic CLI wallet"

After installed, you can use `aztec-up` to upgrade or install specific versions.

```
VERSION=nightly aztec-up
```

This will install the nightly build.

```
VERSION=1.2.3 aztec-up
```

This will install the tagged release version 1.2.3.
