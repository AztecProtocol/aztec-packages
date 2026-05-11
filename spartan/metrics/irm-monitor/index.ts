import express, { Request, Response } from "express";
import { createPublicClient, http } from "viem";
import client from "prom-client";

const { ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOSTS, NETWORK } = process.env;

//////////////////////////////
// IMPORTANT: Bump VERSION file when making changes
//////////////////////////////

const ethereumRpcUrls = (ETHEREUM_HOSTS ?? "")
  .split(",")
  .map((u: string) => u.trim())
  .filter(Boolean);

if (!ROLLUP_CONTRACT_ADDRESS || ethereumRpcUrls.length === 0 || !NETWORK) {
  console.error(
    "ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOSTS and NETWORK are required. Provided: ",
    ROLLUP_CONTRACT_ADDRESS,
    ETHEREUM_HOSTS,
    NETWORK,
  );
  throw new Error(
    "ROLLUP_CONTRACT_ADDRESS, ETHEREUM_HOSTS and NETWORK are required",
  );
}

if (!ROLLUP_CONTRACT_ADDRESS.startsWith("0x")) {
  throw new Error("ROLLUP_CONTRACT_ADDRESS must start with 0x");
}

const RPC_TIMEOUT_MS = 12_000;

const publicClientsByRpcUrl = new Map<
  string,
  ReturnType<typeof createPublicClient>
>();

function getPublicClient(rpcUrl: string) {
  let c = publicClientsByRpcUrl.get(rpcUrl);
  if (!c) {
    c = createPublicClient({
      transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS }),
    });
    publicClientsByRpcUrl.set(rpcUrl, c);
  }
  return c;
}

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

async function readCheckpointsFromRpc(
  rpcUrl: string,
  blockNumber: bigint,
): Promise<{ proven: number; pending: number }> {
  const publicClient = getPublicClient(rpcUrl);
  const [provenCheckpointNumber, pendingCheckpointNumber] = await Promise.all([
    publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getProvenCheckpointNumber",
      blockNumber,
    }),
    publicClient.readContract({
      address: ROLLUP_CONTRACT_ADDRESS as `0x${string}`,
      abi: ROLLUP_ABI,
      functionName: "getPendingCheckpointNumber",
      blockNumber,
    }),
  ]);
  return {
    proven: Number(provenCheckpointNumber),
    pending: Number(pendingCheckpointNumber),
  };
}

async function updateCheckpointNumbers(): Promise<void> {
  const thisUpdateId = ++lastStartedUpdateId;
  const startedAt = Date.now();
  try {
    const blockNumber = await getPublicClient(
      ethereumRpcUrls[0]!,
    ).getBlockNumber();
    const settled = await Promise.allSettled(
      ethereumRpcUrls.map((url) => readCheckpointsFromRpc(url, blockNumber)),
    );

    if (thisUpdateId !== lastStartedUpdateId) {
      console.log("skipped stale checkpoint read", {
        updateId: thisUpdateId,
        latestUpdateId: lastStartedUpdateId,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const successes: { proven: number; pending: number }[] = [];
    const failures: { rpcUrl: string; reason: unknown }[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]!;
      const rpcUrl = ethereumRpcUrls[i]!;
      if (r.status === "fulfilled") {
        successes.push(r.value);
      } else {
        failures.push({ rpcUrl, reason: r.reason });
      }
    }

    if (successes.length === 0) {
      console.error(
        `checkpoint update failed: all ${ethereumRpcUrls.length} RPC host(s) failed (updateId=${thisUpdateId})`,
        failures,
      );
      return;
    }

    const proven = Math.max(...successes.map((s) => s.proven));
    const pending = Math.max(...successes.map((s) => s.pending));
    provenCheckpointNumberGauge.set(proven);
    pendingCheckpointNumberGauge.set(pending);
    console.log("checkpoints updated", {
      updateId: thisUpdateId,
      proven,
      pending,
      rpcHostsOk: successes.length,
      rpcHostsFailed: failures.length,
      elapsedMs: Date.now() - startedAt,
    });
    if (failures.length > 0) {
      console.warn(
        `checkpoint read: ${failures.length} RPC host(s) failed; using max across ${successes.length} successful response(s)`,
        failures.map((f) => ({ rpcUrl: f.rpcUrl, reason: f.reason })),
      );
    }
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
    ethereumRpcUrls,
    pollIntervalMs: POLL_INTERVAL_MS,
  });
});

setInterval(updateCheckpointNumbers, POLL_INTERVAL_MS);
updateCheckpointNumbers();

// Expose default process metrics, including process_start_time_seconds
client.collectDefaultMetrics();
