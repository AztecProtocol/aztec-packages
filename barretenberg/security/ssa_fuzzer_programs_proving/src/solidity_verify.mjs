import { readFileSync } from "fs";
import { spawn } from "child_process";
import { ethers } from "ethers";
import solc from "solc";

const NUMBER_OF_ELEMENTS_IN_HONK_PROOF = 449;
const NUMBER_OF_ELEMENTS_IN_HONK_ZK_PROOF = 500;

const WRONG_PROOF_LENGTH = "0xed74ac0a";
const WRONG_PUBLIC_INPUTS_LENGTH = "0xfa066593";
const SUMCHECK_FAILED = "0x9fc3a218";
const SHPLEMINI_FAILED = "0xa5d82e8a";
const CONSISTENCY_FAILED = "0xa2a2ac83";
const GEMINI_CHALLENGE_IN_SUBGROUP = "0x835eb8f7";

const TEST_CONTRACT = `pragma solidity >=0.8.4;

import {HonkVerifier} from "./Verifier.sol";

contract Test {
    HonkVerifier verifier;

    constructor() {
        verifier = new HonkVerifier();
    }

    function test(bytes calldata proof, bytes32[] calldata publicInputs) public returns (bool) {
        return verifier.verify(proof, publicInputs);
    }
}
`;

function getEnvVar(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable ${name}`);
    }
    return value;
}

function binaryToFields(buffer) {
    const fields = [];
    for (let i = 0; i < buffer.length; i += 32) {
        fields.push(`0x${buffer.slice(i, i + 32).toString("hex")}`);
    }
    return fields;
}

function readPublicInputs(proofAsFields, numberOfFieldsInProof) {
    const publicInputs = [];
    const numPublicInputs = proofAsFields.length - numberOfFieldsInProof;
    for (let i = 0; i < numPublicInputs; i++) {
        publicInputs.push(proofAsFields[i]);
    }
    return [numPublicInputs, publicInputs];
}

async function waitForAnvil(handle) {
    await new Promise((resolve, reject) => {
        handle.stderr.on("data", (data) => {
            const output = data.toString();
            if (output.includes("error binding")) {
                reject(new Error(output));
            }
        });

        handle.stdout.on("data", (data) => {
            if (data.toString().includes("Listening on")) {
                resolve(undefined);
            }
        });

        handle.on("exit", (code) => {
            reject(new Error(`anvil exited early with code ${code}`));
        });
    });
}

async function launchAnvil(port) {
    const handle = spawn("anvil", ["-p", String(port)]);
    await waitForAnvil(handle);
    return handle;
}

async function getAnvil() {
    const port = Math.floor(Math.random() * 10000) + 10000;
    try {
        return [await launchAnvil(port), port];
    } catch {
        return getAnvil();
    }
}

function linkLibrary(bytecode, libraryAddress) {
    return bytecode.replace(/__\$[a-fA-F0-9]{34}\$__/g, libraryAddress.replace(/^0x/, ""));
}

async function deploy(signer, abi, bytecode) {
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const deployment = await factory.deploy();
    const deployed = await deployment.waitForDeployment();
    return deployed.getAddress();
}

function compileContracts(testSource, verifierSource) {
    const compilationInput = {
        language: "Solidity",
        sources: {
            "Test.sol": { content: testSource },
            "Verifier.sol": { content: verifierSource },
        },
        settings: {
            optimizer: { enabled: true, runs: 1 },
            metadata: {
                appendCBOR: false,
                bytecodeHash: "none",
            },
            outputSelection: {
                "*": {
                    "*": ["evm.bytecode.object", "abi"],
                },
            },
        },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(compilationInput)));
    for (const error of output.errors ?? []) {
        if (error.errorCode === "5574" || error.severity === "error") {
            throw new Error(JSON.stringify(output.errors, null, 2));
        }
    }

    return output;
}

async function main() {
    const proofPath = getEnvVar("PROOF");
    const publicInputsPath = getEnvVar("PUBLIC_INPUTS");
    const verifierPath = getEnvVar("VERIFIER_PATH");
    const testName = process.env.TEST_NAME ?? "solidity-verifier";
    const hasZK = getEnvVar("HAS_ZK") === "true";

    const verifierSource = readFileSync(verifierPath, "utf8");
    const output = compileContracts(TEST_CONTRACT, verifierSource);
    const testContract = output.contracts["Test.sol"]["Test"];

    const proof = readFileSync(proofPath);
    const proofAsFields = binaryToFields(proof);
    const numberOfFieldsInProof = hasZK ? NUMBER_OF_ELEMENTS_IN_HONK_ZK_PROOF : NUMBER_OF_ELEMENTS_IN_HONK_PROOF;
    let numExtraPublicInputs = 0;
    let extraPublicInputs = [];

    if (proofAsFields.length > numberOfFieldsInProof) {
        [numExtraPublicInputs, extraPublicInputs] = readPublicInputs(proofAsFields, numberOfFieldsInProof);
    }

    const innerPublicInputs = binaryToFields(readFileSync(publicInputsPath));
    const publicInputs = innerPublicInputs.concat(extraPublicInputs);
    const proofHex = `0x${proof.toString("hex").substring(64 * numExtraPublicInputs)}`;

    const [anvil, port] = await getAnvil();
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`);
    const signer = new ethers.NonceManager(new ethers.Wallet(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        provider,
    ));

    try {
        let finalBytecode = testContract.evm.bytecode.object;

        if (hasZK) {
            const placeholder = /__\$[a-fA-F0-9]{34}\$__/;
            if (placeholder.test(finalBytecode)) {
                const transcriptLib = output.contracts["Verifier.sol"]["ZKTranscriptLib"];
                if (transcriptLib) {
                    const libraryAddress = await deploy(signer, transcriptLib.abi, transcriptLib.evm.bytecode.object);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    finalBytecode = linkLibrary(finalBytecode, libraryAddress);
                }
            }
        }

        const testAddress = await deploy(signer, testContract.abi, finalBytecode);
        const contract = new ethers.Contract(testAddress, testContract.abi, signer);
        const result = await contract.test(proofHex, publicInputs);
        if (!result) {
            throw new Error(`${testName} returned false`);
        }
    } catch (error) {
        const errorType = error?.data;
        switch (errorType) {
            case WRONG_PROOF_LENGTH:
                throw new Error(
                    "Proof length wrong. Possible culprits: proof sizing constants, public input extraction, or zk/non-zk mismatch.",
                );
            case WRONG_PUBLIC_INPUTS_LENGTH:
                throw new Error("Number of public inputs is wrong");
            case SUMCHECK_FAILED:
                throw new Error("Sumcheck round failed");
            case SHPLEMINI_FAILED:
                throw new Error("PCS round failed");
            case CONSISTENCY_FAILED:
                throw new Error("ZK contract consistency check failed");
            case GEMINI_CHALLENGE_IN_SUBGROUP:
                throw new Error("ZK contract gemini challenge check failed");
            default:
                throw error;
        }
    } finally {
        anvil.kill();
    }
}

await main();
