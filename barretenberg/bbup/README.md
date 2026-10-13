# BBup

BBup is a CLI tool that makes it easy to install the [Barretenberg](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/README.md) proving backend.

It assumes you are using [Noir](https://noir-lang.org) as the frontend language.

## Installation

Install BBup with:

```bash
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/next/barretenberg/bbup/install | bash
```

> [!IMPORTANT]
> *Always* check what scripts do. The above one redirects to [the install script](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/bbup/install) which installs [bbup](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/bbup/bbup) in your system's PATH

## Usage

To install the Barretenberg version compatible with the current installed Noir version (ex. installed with [noirup](https://github.com/noir-lang/noirup)), run:

```bash
bbup
```

bbup looks up `nargo --version` in [`bb-versions.json`](./bb-versions.json), which it fetches from the `next` branch on GitHub, not from your checkout. Only Noir versions listed in that map are supported; for any other version bbup exits with `couldn't determine version from noir`. A local edit to `bb-versions.json` has no effect until it is merged to `next`.

Check the installation:

```bash
bb --version
```

### Options

| Option | Meaning |
| --- | --- |
| `-v`, `--version <bb-version>` | Install this `bb` version. |
| `-nv`, `--noir-version <noir-version>` | Install the `bb` version mapped to this Noir version in `bb-versions.json`. `stable` and `nightly` resolve to the latest Noir release or nightly first. |
| `--no-modify-path` | Do not update shell configuration files. |
| `BB_PATH` (env) | Install destination; default `~/.bb`. |

You can install any specific version of `bb` with the `-v` flag. Example:

```bash
bbup -v 6.0.0-rc.6
```

For scripted or CI use, `--no-modify-path` skips updating shell configuration files (`.bashrc`, `.zshrc`, fish config). Combine with `BB_PATH` to control the install destination:

```bash
BB_PATH=/some/dir bbup -v 6.0.0-rc.6 --no-modify-path
```

You can also pass a [Noir version](https://github.com/noir-lang/noir/tags) that has an entry in `bb-versions.json` with the `-nv` flag. Examples:

```bash
bbup # installs the barretenberg version matching your current nargo version
bbup -nv 1.0.0-beta.22 # installs the barretenberg version compatible with Noir 1.0.0-beta.22
```

## Where the binary comes from

bbup installs from npm first — `@aztec-foundation/bb-<platform>` (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`), the same bytes as the GitHub release tarball of that version — and falls back to the GitHub release assets for versions that predate the packages. `BBUP_SOURCE=github` forces the release assets.
