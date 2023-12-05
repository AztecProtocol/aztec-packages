# The Aztec Installation Script

```
bash -c "$(curl https://up.aztec.network)"
```

That is all.

This will install into `~/.aztec/bin` a collection of scripts to help running aztec containers, and will update
a users `PATH` variable in their shell startup script so they can be found.

- `aztec` - The infrastructure container.
- `aztec-cli` - A command line tool for interacting with infrastructure.
- `aztec-nargo` - A build of `nargo` from `noir` that is guaranteed to be version aligned. Provides compiler, lsp and more.

Run any of these commands to get more help.

To upgrade, re-run the install script as above. To install a specific version you can e.g.

```
VERSION=master bash -c "$(curl https://up.aztec.network)"
```

This will install the container built from master branch.

```
VERSION=v1.2.3 bash -c "$(curl https://up.aztec.network)"
```

This will install tagged release version 1.2.3.
