# BBup

BBup is a CLI tool that makes it easy to install the [Barretenberg](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/README.md) proving backend.

It assumes you are using [Noir](https://noir-lang.org) as the frontend language.

## Installation

BBup is an installer for whatever version of BB you may want. Install BBup with:

```bash
curl -L bbup.dev | bash
```

> [!IMPORTANT]
> *Always* check what scripts do. The above one redirects to [the install script](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/bbup/install) which installs [bbup](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/bbup/bbup) in your system's PATH

## Usage

To install the Barretenberg version compatible with the current installed Noir version (ex. installed with [noirup](https://github.com/noir-lang/noirup)), run:

```bash
bbup
```

Check if the installation was successful:

```bash
bb --version
```

If installation was successful, the command would print the version of `bb` installed.

### Options

You can install any specific version of `bb` with the `-v` flag. Example:

```bash
bbup -v 0.56.0
```

You can also pass [any Noir version](https://github.com/noir-lang/noir/tags) with the `-nv` flag, or specify `nightly` for the nightly version. Examples:

```bash
bbup # installs the barretenberg version matching your current nargo version
bbup -nv 0.34.0 # installs the barretenberg version compatible with Noir 0.34.0 release
bbup -nv nightly # installs the barretenberg version compatible with Noir nightly release
```
