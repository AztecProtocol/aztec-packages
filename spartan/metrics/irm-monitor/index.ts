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
    name: "getProvenCheckpointNumber",
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
    name: "getPendingCheckpointNumber",
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

const provenCheckpointNumberGauge = new client.Gauge({
  name: "rollup_proven_checkpoint_number",
  help: "The latest proven checkpoint number of the rollup",
  labelNames: ["network"],
});

const pendingCheckpointNumberGauge = new client.Gauge({
  name: "rollup_pending_checkpoint_number",
  help: "The latest pending checkpoint number of the rollup",
  labelNames: ["network"],
});

async function updateCheckpointNumbers(): Promise<void> {
  try {
    const provenCheckpointNumber = await publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getProvenCheckpointNumber",
    });
    provenCheckpointNumberGauge.set(Number(provenCheckpointNumber));

    const pendingCheckpointNumber = await publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getPendingCheckpointNumber",
    });
    pendingCheckpointNumberGauge.set(Number(pendingCheckpointNumber));
  } catch (error) {
    console.error("Error updating checkpoint numbers:", error);
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

setInterval(updateCheckpointNumbers, 36000);
updateCheckpointNumbers();

// Expose default process metrics, including process_start_time_seconds
client.collectDefaultMetrics();
