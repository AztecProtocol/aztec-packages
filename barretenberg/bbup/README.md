# BBup

BBup is a CLI tool that makes it easy to install the [Barretenberg](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/README.md) proving backend.

It assumes you are using [Noir](https://noir-lang.org) as the frontend language.

## Installation

BBup is an installer for whatever version of BB you may want. Install BBup with:

```bash
curl -L bbup.dev | bash
```

> [!IMPORTANT]
> *Always* check what scripts do. The above one redirects to [the install script](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/bbup/install) which checks if you have `npm`, installing it with `nvm` otherwise. It then installs [bbup](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/bbup/bbup.ts) globally.

## Usage

To install the Barretenberg version compatible with the current installed Noir version (ex. installed with [noirup](https://github.com/noir-lang/noirup)), run:

```bash
bbup
```

### Options

You can specify the `-f` flag to match a different frontend language. At the moment only Noir is available, so `-f noir` is defaulted.

You can pass [any Noir version](https://github.com/noir-lang/noir/tags) with the `-v` flag, or specify `nightly` for the nightly version. Examples:

```bash
bbup -v 0.34.0 # installs the barretenberg version compatible with Noir 0.34.0 release
bbup -v nightly # installs the barretenberg version compatible with Noir nightly release
```
