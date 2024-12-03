#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import axios from "axios";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import figlet from "figlet";
import chalk from "chalk";
import inquirer from "inquirer";
import input from "@inquirer/input";
const program = new Command();
// Global spinner instance used throughout the application
const spinner = ora({ color: "blue", discardStdin: false });
const logger = require("pino")();
// ASCII Art Banner
const showBanner = () => {
    console.log(chalk.blue(figlet.textSync("Aztec Testnet", {
        font: "Standard",
        horizontalLayout: "full",
    })));
};
// Check Docker Installation
const checkDocker = async () => {
    try {
        spinner.start("Checking Docker installation...");
        execSync("docker --version", { stdio: "ignore" });
        execSync("docker compose version", { stdio: "ignore" });
        spinner.succeed("Docker and Docker Compose are installed");
        return true;
    }
    catch (error) {
        spinner.fail("Docker or Docker Compose not found");
        spinner.stop();
        const { install } = await inquirer.prompt([
            {
                type: "confirm",
                name: "install",
                message: "Would you like to install Docker?",
                default: true,
            },
        ]);
        if (install) {
            return await installDocker();
        }
        return false;
    }
};
// Install Docker
const installDocker = async () => {
    try {
        spinner.start("Installing Docker...");
        // Docker installation script
        execSync("curl -fsSL https://get.docker.com | sh");
        // Add user to docker group
        execSync("sudo usermod -aG docker $USER");
        spinner.succeed("Docker installed successfully");
        spinner.stop();
        logger.info("Please log out and back in for group changes to take effect");
        return true;
    }
    catch (error) {
        spinner.fail("Failed to install Docker");
        spinner.stop();
        logger.error(error);
        return false;
    }
};
// Get Public IP
const getPublicIP = async () => {
    try {
        const { data } = await axios.get("https://api.ipify.org?format=json");
        return data.ip;
    }
    catch (error) {
        logger.error("Failed to get public IP");
        return null;
    }
};
// Environment configuration
const defaultConfig = {
    p2pPort: "40400",
    port: "8080",
    key: "0x0000000000000000000000000000000000000000000000000000000000000001",
    ip: "8.8.8.8",
    name: "validator-1",
};
const configureEnvironment = async (options) => {
    try {
        spinner.stopAndPersist({ text: "Configuring environment..." });
        // Get public IP first
        spinner.start("Fetching public IP...");
        const publicIP = await getPublicIP();
        spinner.succeed(`Public IP: ${publicIP}`);
        // Load existing config
        spinner.stopAndPersist({ text: "Loading configuration..." });
        const currentConfig = existsSync(".env")
            ? Object.fromEntries(readFileSync(".env", "utf8")
                .split("\n")
                .filter(Boolean)
                .map((line) => line.split("=")))
            : {};
        if (!options.name) {
            options.name = await input({
                message: "Validator Name:",
                default: currentConfig.name || defaultConfig.name,
            });
        }
        if (!options.p2pPort) {
            options.p2pPort = await input({
                message: "P2P Port:",
                default: currentConfig.p2pPort || defaultConfig.p2pPort,
            });
        }
        if (!options.port) {
            options.port = await input({
                message: "Node Port:",
                default: currentConfig.port || defaultConfig.port,
            });
        }
        if (!options.key) {
            options.key = await input({
                message: "Validator Private Key:",
                required: true,
            });
        }
        if (!options.ip) {
            options.ip = await input({
                message: "Public IP:",
                default: publicIP || defaultConfig.ip,
            });
        }
        // Restart spinner for saving config
        spinner.start("Saving configuration...");
        const envContent = Object.entries(options)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");
        writeFileSync(".env", envContent, {
            encoding: "utf8",
            flag: "w",
        });
        spinner.succeed("Environment configured successfully");
        // Generate docker-compose.yml
        spinner.start("Generating docker-compose configuration...");
        const composeConfig = `
name: ${options.name}
services:
    validator:
        network_mode: host
        restart: unless-stopped
        env_file:
            - .env
        environment:
            - P2P_UDP_ANNOUNCE_ADDR=${options.ip}:${options.p2pPort}
            - P2P_TCP_ANNOUNCE_ADDR=${options.ip}:${options.p2pPort}
            - COINBASE=0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
            - VALIDATOR_DISABLED=false
            - VALIDATOR_PRIVATE_KEY=${options.key}
            - SEQ_PUBLISHER_PRIVATE_KEY=${options.key}
            - L1_PRIVATE_KEY=${options.key}
            - DEBUG=aztec:*,-aztec:avm_simulator*,-aztec:circuits:artifact_hash,-aztec:libp2p_service,-json-rpc*,-aztec:world-state:database,-aztec:l2_block_stream*
            - LOG_LEVEL=debug
            - AZTEC_PORT=${options.port}
            - P2P_ENABLED=true
            - L1_CHAIN_ID=1337
            - PROVER_REAL_PROOFS=true
            - PXE_PROVER_ENABLED=true
            - ETHEREUM_SLOT_DURATION=12sec
            - AZTEC_SLOT_DURATION=36
            - AZTEC_EPOCH_DURATION=32
            - AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS=13
            - ETHEREUM_HOST=http://35.221.3.35:8545
            - BOOTSTRAP_NODES=enr:-Jq4QKIJisajcICBVMoMwFtbmPgmHt3KoonypbBIQCAMNjhMc6DKW0J4vJzDpGPFUX7T2fzyyjezHgKKzeZY_DbRz_kGjWF6dGVjX25ldHdvcmsBgmlkgnY0gmlwhCPdAyOJc2VjcDI1NmsxoQK92C7GObzDvCt9uwzW0lhKJKGCvOWkmAZjd2E2w-svuoN0Y3CCndCDdWRwgp3Q
            - REGISTRY_CONTRACT_ADDRESS=0x5fbdb2315678afecb367f032d93f642f64180aa3
            - GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0
            - FEE_JUICE_CONTRACT_ADDRESS=0xe7f1725e7734ce288f8367e1bb143e90bb3f0512
            - ROLLUP_CONTRACT_ADDRESS=0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6
            - REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=0x5fc8d32690cc91d4c39d9d3abcbd16989f875707
            - GOVERNANCE_CONTRACT_ADDRESS=0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9
            - COIN_ISSUER_CONTRACT_ADDRESS=0xdc64a140aa3e981100a9beca4e685f962f0cf6c9
            - FEE_JUICE_PORTAL_CONTRACT_ADDRESS=0x0165878a594ca255338adfa4d48449f69242eb8f
            - INBOX_CONTRACT_ADDRESS=0xed179b78d5781f93eb169730d8ad1be7313123f4
            - OUTBOX_CONTRACT_ADDRESS=0x1016b5aaa3270a65c315c664ecb238b6db270b64
            - P2P_UDP_LISTEN_ADDR=0.0.0.0:${options.p2pPort}
            - P2P_TCP_LISTEN_ADDR=0.0.0.0:${options.p2pPort}
        image: aztecprotocol/aztec:698cd3d62680629a3f1bfc0f82604534cedbccf3-${process.arch}
        command: start --node --archiver --sequencer
`;
        writeFileSync("docker-compose.yml", composeConfig);
        spinner.succeed("Docker compose file generated successfully, run `aztec-spartan start` to launch your node");
        return true;
    }
    catch (error) {
        spinner.fail("Failed to configure environment");
        logger.error(error);
        return false;
    }
};
// Docker commands
const dockerCommands = {
    start: async () => {
        try {
            spinner.start("Starting containers...");
            const child = require("child_process").spawn("docker", ["compose", "up", "-d"], {
                stdio: "inherit",
            });
            // Handle SIGINT (Ctrl+C)
            process.on("SIGINT", () => {
                child.kill("SIGINT");
                process.exit(0);
            });
            // Wait for the process to finish
            await new Promise((resolve, reject) => {
                child.on("exit", (code) => {
                    if (code === 0 || code === null) {
                        resolve();
                    }
                    else {
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });
                child.on("error", reject);
            });
            spinner.succeed("Containers started successfully");
        }
        catch (error) {
            spinner.fail("Failed to start containers. Is Docker running?");
            if (error instanceof Error) {
                const message = error.message.split("\n")[0];
                logger.error(message);
            }
        }
    },
    stop: async () => {
        try {
            spinner.start("Stopping containers...");
            execSync("docker compose down");
            spinner.succeed("Containers stopped successfully");
        }
        catch (error) {
            spinner.fail("Failed to stop containers. Is Docker running?");
            if (error instanceof Error) {
                const message = error.message.split("\n")[0];
                logger.error(message);
            }
        }
    },
    pull: async () => {
        spinner.start("Pulling latest images...");
        try {
            spinner.stop();
            execSync("docker compose pull");
            spinner.succeed("Images updated successfully");
        }
        catch (error) {
            spinner.fail("Failed to pull images. Is Docker running?");
            if (error instanceof Error) {
                const message = error.message.split("\n")[0];
                logger.error(message);
            }
        }
    },
    logs: async () => {
        try {
            spinner.start("Fetching logs...");
            // Use spawn instead of execSync to handle SIGINT properly
            const child = require("child_process").spawn("docker", ["compose", "logs", "-f"], {
                stdio: "inherit",
            });
            // Handle SIGINT (Ctrl+C)
            process.on("SIGINT", () => {
                child.kill("SIGINT");
                process.exit(0);
            });
            // Wait for the process to finish
            await new Promise((resolve, reject) => {
                child.on("exit", (code) => {
                    if (code === 0 || code === null) {
                        resolve();
                    }
                    else {
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });
                child.on("error", reject);
            });
        }
        catch (error) {
            spinner.fail("Failed to fetch logs. Is Docker running?");
            if (error instanceof Error) {
                const message = error.message.split("\n")[0];
                logger.error(message);
            }
        }
    },
};
// CLI Commands
program
    .name("aztec testnet")
    .description("Aztec Testnet Node CLI")
    .version("1.0.0");
program
    .command("install")
    .option("-p, --port <port>", "Node port")
    .option("-p2p, --p2p-port <port>", "P2P port")
    .option("-ip, --ip <ip>", "Public IP")
    .option("-k, --key <key>", "Validator private key")
    .option("-n, --name <name>", "Validator name")
    .option("-d, --skip-docker", "Skip Docker installation")
    .description("Install Aztec Testnet node configuration")
    .action(async (options) => {
    showBanner();
    if (options.skipDocker) {
        logger.warn("Skipping Docker installation");
    }
    else {
        await checkDocker();
    }
    await configureEnvironment(options);
    logger.info('Initialization complete! Use "aztec-spartan start" to launch your node.');
    process.exit(0);
});
program
    .command("start")
    .description("Start Aztec Testnet node")
    .action(async () => {
    if (!existsSync(".env")) {
        console.error('Configuration not found. Please run "aztec-spartan init" first.');
        process.exit(1);
    }
    await dockerCommands.start();
    process.exit(0);
});
program
    .command("stop")
    .description("Stop Aztec Testnet node")
    .action(async () => {
    await dockerCommands.stop();
    process.exit(0);
});
program
    .command("update")
    .description("Update Aztec Testnet node images")
    .action(async () => {
    await dockerCommands.pull();
    process.exit(0);
});
program
    .command("logs")
    .description("Show Aztec Testnet node logs")
    .action(async () => {
    await dockerCommands.logs();
    process.exit(0);
});
program.parse();
