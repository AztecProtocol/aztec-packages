import express, { Request, Response } from "express";
import { createPublicClient, http } from "viem";
import client from "prom-client";

const { ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOST, NETWORK } = process.env;

//////////////////////////////
// IMPORTANT: Bump VERSION file when making changes
//////////////////////////////

if (!ROLLUP_CONTRACT_ADDRESS || !ETHEREUM_HOST || !NETWORK) {
  console.error(
    "ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOST and NETWORK are required. Provided: ",
    ROLLUP_CONTRACT_ADDRESS,
    ETHEREUM_HOST,
    NETWORK,
  );
  throw new Error(
    "ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOST and NETWORK are required",
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

const POLL_INTERVAL_MS = 36_000;

let lastStartedUpdateId = 0;

async function updateCheckpointNumbers(): Promise<void> {
  const thisUpdateId = ++lastStartedUpdateId;
  const startedAt = Date.now();
  try {
    const provenCheckpointNumber = await publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getProvenCheckpointNumber",
    });

    const pendingCheckpointNumber = await publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getPendingCheckpointNumber",
    });

    if (thisUpdateId !== lastStartedUpdateId) {
      console.log("skipped stale checkpoint read", {
        updateId: thisUpdateId,
        latestUpdateId: lastStartedUpdateId,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const proven = Number(provenCheckpointNumber);
    const pending = Number(pendingCheckpointNumber);
    provenCheckpointNumberGauge.set(proven);
    pendingCheckpointNumberGauge.set(pending);
    console.log("checkpoints updated", {
      updateId: thisUpdateId,
      proven,
      pending,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error(`checkpoint update failed (updateId=${thisUpdateId})`, error);
  }
}

const app = express();
app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log("metrics server listening", {
    port,
    network: NETWORK,
    rollup: ROLLUP_CONTRACT_ADDRESS,
    ethereumHost: ETHEREUM_HOST,
    pollIntervalMs: POLL_INTERVAL_MS,
  });
});

setInterval(updateCheckpointNumbers, POLL_INTERVAL_MS);
updateCheckpointNumbers();

// Expose default process metrics, including process_start_time_seconds
client.collectDefaultMetrics();
