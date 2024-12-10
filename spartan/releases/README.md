# Aztec Spartan

This tool helps easing the entry barrier to boot an Aztec Sequencer and Prover (S&P) Testnet.

![Aztec Sparta Meme](./assets/banner.jpeg)

For once, there's no rocket science here. This script does the following:

- Checks for the presence of Docker in your machine
- Prompts you for some environment variables
- Outputs a templated docker-compose file with your variables
- Runs the docker compose file

It should work in most UNIX-based machines.

## Installation

To configure a new node, create a new directory and run the install script:

```bash
mkdir val1 && cd val1
curl -L sp-testnet.aztec.network | bash
```

This will install `aztec-spartan.sh` in the current directory. You can now run it:

```bash
./aztec-spartan.sh config
```

If you don't have Docker installed, the script will do it for you. It will then prompt for any required environment variables and output both a `docker-compose.yml` and an `.env` file.

You will also be prompted to choose whether to use a [named volume](https://docs.docker.com/engine/storage/volumes/) (default) or if you want to use a local directory to store the node's data.

Run `./aztec-spartan.sh` without any command to see all available options, and pass them as flags, i.e. `npx aztec-spartan config -p 8080 -p2p 40400`.

If you want to use a different key for p2p peer id, pass it with `-pk <your_key>`.

## Running

To spare you a few keystrokes, you can use `npx aztec-spartan [start/stop/logs/update]` to start, stop, output logs or pull the latest docker images.
