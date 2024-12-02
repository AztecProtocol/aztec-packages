# Aztec Spartan

This tool helps easing the entry barrier to boot an Aztec Sequencer and Prover (S&P) Testnet.

![Aztec Sparta Meme](./assets/banner.jpeg)

For once, there's no rocket science here. This script does the following:

- Checks for the presence of Docker in your machine
- Prompts you for some environment variables
- Outputs a templated docker-compose file with your variables
- Runs the docker compose file

## Prerequisites

This script should work in most UNIX-based machines. You should [have Node installed](https://github.com/nvm-sh/nvm/blob/master/README.md#install--update-script).

## Installation

To configure a new node, create a new directory and run the install script:

```bash
cd val1
npx aztec-spartan install
```

If you don't have Docker installed, the script will do it for you. It will then prompt for any required environment variables and output a `docker-compose.yml` file and a `.env` file.

You can run the command with `-h` to see all available options, and pass them as flags, i.e. `npx aztec-spartan install -p 8080 -p2p 40400 -n nameme`.

## Running

To spare you a few keystrokes, you can use `npx aztec-spartan [start/stop/logs/update]` to start, stop, output logs or pull the latest docker images.
