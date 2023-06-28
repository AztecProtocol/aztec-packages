# Noir contracts

This package contains the source code and the Aztec ABIs for the example contracts used in tests.

## Setup

### Installing Noir

- Install [noirup](https://github.com/noir-lang/noirup)
  ```
  curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
  ```
- Nix is already globally installed but path to this installation needs to be added in $HOME/.zshenv so correct configuration can be found by VSCode, do so with:
  ```
  echo -e '\n# Nix path set globally\nexport PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"' >> $HOME/.zshenv
  ```
- Enable nix flake command in ~/.config/nix/nix.conf with commands:
  ```
  mkdir -p $HOME/.config/nix && echo -e '\nexperimental-features = nix-command\nextra-experimental-features = flakes' >> $HOME/.config/nix/nix.conf
  ```
- Install direnv into your Nix profile by running:
  ```
  nix profile install nixpkgs#direnv
  ```
- Add direnv to your shell following their guide
  ```
  echo -e '\n# Adds direnv initialization\neval "$(direnv hook zsh)"' >> $HOME/.zshenv
  ```
- VSCode needs to be resterted so direnv plugin can notice env changes with:
  ```
  kill -9 ps aux | grep $(whoami)/.vscode-server | awk '{print $2}'
  ```
- Restart shell

- Clone noir repo:
  ```
  git clone https://github.com/noir-lang/noir.git
  ```

- Checkout aztec3 branch
  ```
  cd noir
  git checkout aztec3
  ```

- Enable direnv
  ```
  direnv allow
  ```

- Restart shell

- Go to the noir dir and install Noir:
  ```
  cd noir
  noirup -p ./
  ```

### Building the contracts

- Use the `noir:build:all` script to compile the contracts you want and prepare the ABI for consumption
  ```
  yarn noir:build:all
  ```

  Alternatively you can run `yarn noir:build CONTRACT1 CONTRACT2...` to build a subset of contracts:

  ```
  yarn noir:build zk_token public_token
  ```

  To view compilation output, including errors, run with the `VERBOSE=1` flag:

  ```
  VERBOSE=1 yarn noir:build zk_token public_token
  ```
