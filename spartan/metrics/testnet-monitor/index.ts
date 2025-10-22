import express, { Request, Response } from "express";
import { createPublicClient, http } from "viem";
import client from "prom-client";

const { ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOST, NETWORK } = process.env;

if (!ROLLUP_CONTRACT_ADDRESS || !ETHEREUM_HOST || !NETWORK) {
  console.error(
    "ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOST and NETWORK are required. Provided: ",
    ROLLUP_CONTRACT_ADDRESS,
    ETHEREUM_HOST,
    NETWORK
  );
  throw new Error(
    "ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOST and NETWORK are required"
  );
}

if (!ROLLUP_CONTRACT_ADDRESS.startsWith("0x")) {
  throw new Error("ROLLUP_CONTRACT_ADDRESS must start with 0x");
}

const transport = http(ETHEREUM_HOST);

const publicClient = createPublicClient({
  transport,
});

const ROLLUP_ABI = [
  {
    type: "function",
    name: "getProvenBlockNumber",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPendingBlockNumber",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

// Add a default label to all metrics (including process metrics)
client.register.setDefaultLabels({ network: NETWORK as string });

const provenBlockNumberGauge = new client.Gauge({
  name: "rollup_proven_block_number",
  help: "The latest proven block number of the rollup",
});

const pendingBlockNumberGauge = new client.Gauge({
  name: "rollup_pending_block_number",
  help: "The latest pending block number of the rollup",
});

async function updateBlockNumbers(): Promise<void> {
  try {
    const provenBlockNumber = await publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getProvenBlockNumber",
    });
    provenBlockNumberGauge.set(Number(provenBlockNumber));

    const pendingBlockNumber = await publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getPendingBlockNumber",
    });
    pendingBlockNumberGauge.set(Number(pendingBlockNumber));
  } catch (error) {
    console.error("Error updating block numbers:", error);
  }
}

const app = express();
app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`Metrics server listening on port ${port}`);
});

setInterval(updateBlockNumbers, 36000);
updateBlockNumbers();

// Expose default process metrics, including process_start_time_seconds
client.collectDefaultMetrics();
