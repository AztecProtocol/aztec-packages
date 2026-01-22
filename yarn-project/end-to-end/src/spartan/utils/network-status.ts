#!/usr/bin/env -S node --no-warnings --experimental-vm-modules --experimental-specifier-resolution=node --loader ts-node/esm
/* eslint-disable no-console */
/**
 * Network Status Diagnostic Script
 * Provides a comprehensive summary of all nodes in an Aztec network deployment.
 *
 * Usage:
 *   yarn ts-node src/spartan/utils/network-status.ts [namespace]
 *   # or from yarn-project/end-to-end:
 *   npx ts-node src/spartan/utils/network-status.ts upgrade-test
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ANSI color codes
const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  cyan: '\x1b[0;36m',
} as const;

interface PodInfo {
  name: string;
  ready: string;
  status: string;
  restarts: number;
  age: string;
}

interface NodeStatus {
  podName: string;
  health: 'OK' | 'FAILED' | 'UNKNOWN';
  lastLogAgeSeconds: number | null;
  peerCount: number | null;
  latestSlot: number | null;
  latestL2Block: number | null;
  syncedToL1Block: number | null;
  recentErrors: number;
  recentWarnings: number;
  latestIssue: string | null;
}

interface ServiceEndpoint {
  name: string;
  port: number;
  hasEndpoints: boolean;
}

interface ProverEvent {
  timestamp: number;
  type: 'epoch_start' | 'epoch_complete' | 'epoch_failed' | 'broker_error' | 'proof_submit' | 'proof_claim';
  epoch?: number;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

interface ProverHistory {
  proverNodeEvents: ProverEvent[];
  brokerEvents: ProverEvent[];
  agentEvents: ProverEvent[];
  epochsInProgress: number[];
  epochsCompleted: number[];
  epochsFailed: number[];
  brokerErrors: string[];
}

interface NetworkDiagnostics {
  namespace: string;
  l1BlockNumber: number | null;
  chainId: number | null;
  pods: PodInfo[];
  nodeStatuses: NodeStatus[];
  services: ServiceEndpoint[];
  reorgEvents: string[];
  committeeIssues: string[];
  slashingEvents: string[];
  connectionErrors: string[];
  contracts: {
    registryAddress: string | null;
    rollupAddress: string | null;
  };
  proverHistory: ProverHistory;
}

async function kubectl(args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`kubectl ${args}`, { maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function kubectlJson<T>(args: string): Promise<T | null> {
  const output = await kubectl(`${args} -o json`);
  if (!output) {
    return null;
  }
  try {
    return JSON.parse(output) as T;
  } catch {
    return null;
  }
}

async function namespaceExists(namespace: string): Promise<boolean> {
  const result = await kubectl(`get namespace ${namespace} --no-headers`);
  return result.length > 0;
}

async function getL1Status(namespace: string): Promise<{ blockNumber: number | null; chainId: number | null }> {
  // Try to get L1 block via exec into a specific validator pod (which has curl)
  const rpcCall = async (method: string): Promise<string | null> => {
    const ethSvc = `${namespace}-eth-execution`;
    const validatorPod = `${namespace}-validator-0`;
    const result = await kubectl(
      `exec -n ${namespace} ${validatorPod} -- curl -s --max-time 5 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"${method}","params":[],"id":1}' http://${ethSvc}:8545`,
    );
    const match = result.match(/"result":"([^"]*)"/);
    return match ? match[1] : null;
  };

  const blockHex = await rpcCall('eth_blockNumber');
  const chainIdHex = await rpcCall('eth_chainId');

  return {
    blockNumber: blockHex ? parseInt(blockHex, 16) : null,
    chainId: chainIdHex ? parseInt(chainIdHex, 16) : null,
  };
}

async function getPods(namespace: string): Promise<PodInfo[]> {
  const output = await kubectl(`get pods -n ${namespace} --no-headers`);
  if (!output) {
    return [];
  }

  return output.split('\n').map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      name: parts[0],
      ready: parts[1],
      status: parts[2],
      restarts: parseInt(parts[3]) || 0,
      age: parts[4] || '',
    };
  });
}

async function getNodeStatus(namespace: string, podName: string): Promise<NodeStatus> {
  const status: NodeStatus = {
    podName,
    health: 'UNKNOWN',
    lastLogAgeSeconds: null,
    peerCount: null,
    latestSlot: null,
    latestL2Block: null,
    syncedToL1Block: null,
    recentErrors: 0,
    recentWarnings: 0,
    latestIssue: null,
  };

  // Get recent logs
  const logs = await kubectl(`logs -n ${namespace} ${podName} --tail=200`);
  if (!logs) {
    return status;
  }

  const logLines = logs.split('\n');

  // Check health endpoint
  const healthResult = await kubectl(
    `exec -n ${namespace} ${podName} -- curl -s --max-time 5 http://localhost:8080/status`,
  );
  if (healthResult === 'OK') {
    status.health = 'OK';
  } else if (healthResult) {
    status.health = 'OK'; // Non-empty response is usually good
  } else {
    status.health = 'FAILED';
  }

  // Parse last log time
  const lastLogLine = logLines[logLines.length - 1];
  const timeMatch = lastLogLine?.match(/"time":(\d+)/);
  if (timeMatch) {
    const logTime = parseInt(timeMatch[1]);
    const now = Date.now();
    status.lastLogAgeSeconds = Math.floor((now - logTime) / 1000);
  }

  // Parse peer count
  for (let i = logLines.length - 1; i >= 0; i--) {
    const peerMatch = logLines[i].match(/"peerCount":(\d+)/);
    if (peerMatch) {
      status.peerCount = parseInt(peerMatch[1]);
      break;
    }
  }

  // Parse latest slot
  for (let i = logLines.length - 1; i >= 0; i--) {
    const slotMatch = logLines[i].match(/"(?:slot|slotNumber)":(\d+)/);
    if (slotMatch) {
      status.latestSlot = parseInt(slotMatch[1]);
      break;
    }
  }

  // Parse latest L2 block
  for (let i = logLines.length - 1; i >= 0; i--) {
    const blockMatch = logLines[i].match(/"blockNumber":(\d+)/);
    if (blockMatch) {
      status.latestL2Block = parseInt(blockMatch[1]);
      break;
    }
  }

  // Parse synced to L1
  for (let i = logLines.length - 1; i >= 0; i--) {
    const syncMatch = logLines[i].match(/"syncedToL1Block":(\d+)/);
    if (syncMatch) {
      status.syncedToL1Block = parseInt(syncMatch[1]);
      break;
    }
  }

  // Count errors and warnings
  status.recentErrors = logLines.filter(l => l.includes('"severity":"ERROR"')).length;
  status.recentWarnings = logLines.filter(l => l.includes('"severity":"WARNING"')).length;

  // Get latest issue
  const issueLines = logLines.filter(l => l.includes('"severity":"ERROR"') || l.includes('"severity":"WARNING"'));
  if (issueLines.length > 0) {
    const lastIssue = issueLines[issueLines.length - 1];
    const msgMatch = lastIssue.match(/"message":"([^"]*)"/);
    if (msgMatch) {
      status.latestIssue = msgMatch[1].slice(0, 70);
    }
  }

  return status;
}

async function getServiceEndpoints(namespace: string): Promise<ServiceEndpoint[]> {
  const services: ServiceEndpoint[] = [];

  interface K8sService {
    metadata: { name: string };
    spec: { clusterIP: string; ports: Array<{ port: number }> };
  }

  interface K8sServiceList {
    items: K8sService[];
  }

  const svcList = await kubectlJson<K8sServiceList>(`get svc -n ${namespace}`);
  if (!svcList) {
    return services;
  }

  for (const svc of svcList.items) {
    const name = svc.metadata.name;
    const clusterIP = svc.spec.clusterIP;

    if (clusterIP === 'None' || !clusterIP) {
      continue;
    }

    // Check endpoints
    interface K8sEndpoints {
      subsets?: Array<{ addresses?: Array<{ ip: string }> }>;
    }
    const endpoints = await kubectlJson<K8sEndpoints>(`get endpoints -n ${namespace} ${name}`);
    const hasEndpoints = !!endpoints?.subsets?.[0]?.addresses?.length;

    const port = svc.spec.ports?.[0]?.port || 0;
    services.push({ name, port, hasEndpoints });
  }

  return services;
}

async function getCriticalEvents(namespace: string): Promise<{
  reorgEvents: string[];
  committeeIssues: string[];
  slashingEvents: string[];
  connectionErrors: string[];
}> {
  const result = {
    reorgEvents: [] as string[],
    committeeIssues: [] as string[],
    slashingEvents: [] as string[],
    connectionErrors: [] as string[],
  };

  // Get logs from aztec-node pods
  const nodeLogs = await kubectl(`logs -n ${namespace} -l app.kubernetes.io/name=aztec-node --tail=500`);
  const validatorLogs = await kubectl(`logs -n ${namespace} -l app.kubernetes.io/name=validator --tail=500`);

  const extractMessages = (logs: string, pattern: RegExp): string[] => {
    const messages: string[] = [];
    for (const line of logs.split('\n')) {
      if (pattern.test(line)) {
        const msgMatch = line.match(/"message":"([^"]*)"/);
        if (msgMatch) {
          messages.push(msgMatch[1]);
        }
      }
    }
    return messages.slice(-5); // Last 5 unique
  };

  result.reorgEvents = extractMessages(nodeLogs, /reorg|Unwound/i);
  result.committeeIssues = extractMessages(validatorLogs, /committee/i).filter(m => !m.includes('"severity":"INFO"'));
  result.slashingEvents = extractMessages(validatorLogs, /slash/i);
  result.connectionErrors = extractMessages(validatorLogs, /connection refused|ECONNREFUSED|timeout/i);

  return result;
}

async function getProverHistory(namespace: string): Promise<ProverHistory> {
  const history: ProverHistory = {
    proverNodeEvents: [],
    brokerEvents: [],
    agentEvents: [],
    epochsInProgress: [],
    epochsCompleted: [],
    epochsFailed: [],
    brokerErrors: [],
  };

  // Get prover-node logs - use larger tail since errors may be older
  const proverNodeLogs = await kubectl(`logs -n ${namespace} -l app.kubernetes.io/component=prover-node --tail=5000`);
  // Get broker logs - use larger tail to capture older errors like PayloadTooLarge
  const brokerLogs = await kubectl(`logs -n ${namespace} -l app.kubernetes.io/component=prover-broker --tail=5000`);
  // Get agent logs
  const agentLogs = await kubectl(`logs -n ${namespace} -l app.kubernetes.io/component=prover-agent --tail=5000`);

  const parseLogLine = (line: string): { timestamp: number; message: string; severity: string } | null => {
    const timeMatch = line.match(/"time":(\d+)/);
    const msgMatch = line.match(/"message":"([^"]*)"/);
    const sevMatch = line.match(/"severity":"([^"]*)"/);
    if (!timeMatch || !msgMatch) {
      return null;
    }
    return {
      timestamp: parseInt(timeMatch[1]),
      message: msgMatch[1],
      severity: sevMatch ? sevMatch[1].toLowerCase() : 'info',
    };
  };

  // Parse prover-node logs for epoch events
  for (const line of proverNodeLogs.split('\n')) {
    const parsed = parseLogLine(line);
    if (!parsed) {
      continue;
    }

    // Look for epoch proving starts
    const startMatch =
      line.match(/Starting to prove epoch (\d+)/i) || line.match(/"epochNumber":(\d+).*(?:start|proving)/i);
    if (startMatch || line.includes('Starting epoch proving')) {
      const epochMatch = line.match(/"epochNumber":(\d+)/);
      const epoch = epochMatch ? parseInt(epochMatch[1]) : startMatch ? parseInt(startMatch[1]) : undefined;
      history.proverNodeEvents.push({
        timestamp: parsed.timestamp,
        type: 'epoch_start',
        epoch,
        message: parsed.message.slice(0, 80),
        severity: 'info',
      });
      if (epoch !== undefined && !history.epochsInProgress.includes(epoch)) {
        history.epochsInProgress.push(epoch);
      }
    }

    // Look for epoch proving completions
    if (line.includes('Submitted root rollup proof') || line.includes('epoch proof submitted')) {
      const epochMatch = line.match(/"epochNumber":(\d+)/);
      const epoch = epochMatch ? parseInt(epochMatch[1]) : undefined;
      history.proverNodeEvents.push({
        timestamp: parsed.timestamp,
        type: 'epoch_complete',
        epoch,
        message: parsed.message.slice(0, 80),
        severity: 'info',
      });
      if (epoch !== undefined) {
        history.epochsCompleted.push(epoch);
        history.epochsInProgress = history.epochsInProgress.filter(e => e !== epoch);
      }
    }

    // Look for epoch proving failures
    if (line.includes('ERROR') && (line.includes('epoch') || line.includes('proof'))) {
      const epochMatch = line.match(/"epochNumber":(\d+)/);
      const epoch = epochMatch ? parseInt(epochMatch[1]) : undefined;
      history.proverNodeEvents.push({
        timestamp: parsed.timestamp,
        type: 'epoch_failed',
        epoch,
        message: parsed.message.slice(0, 80),
        severity: 'error',
      });
      if (epoch !== undefined && !history.epochsFailed.includes(epoch)) {
        history.epochsFailed.push(epoch);
      }
    }

    // Look for 500 errors from broker
    if (line.includes('500') || line.includes('Error')) {
      history.proverNodeEvents.push({
        timestamp: parsed.timestamp,
        type: 'broker_error',
        message: parsed.message.slice(0, 80),
        severity: 'error',
      });
    }
  }

  // Parse broker logs for errors
  for (const line of brokerLogs.split('\n')) {
    const parsed = parseLogLine(line);
    if (!parsed) {
      continue;
    }

    // PayloadTooLarge errors - check the full line, not just parsed message
    if (line.includes('PayloadTooLarge') || line.includes('entity.too.large')) {
      // Extract the expected and limit values if present
      const expectedMatch = line.match(/expected:\s*(\d+)/);
      const limitMatch = line.match(/limit:\s*(\d+)/);
      const expected = expectedMatch ? parseInt(expectedMatch[1]) : null;
      const limit = limitMatch ? parseInt(limitMatch[1]) : null;

      const sizeInfo =
        expected && limit
          ? ` (${(expected / 1024 / 1024).toFixed(1)}MB request, ${(limit / 1024 / 1024).toFixed(1)}MB limit)`
          : '';

      history.brokerEvents.push({
        timestamp: parsed.timestamp,
        type: 'broker_error',
        message: `PayloadTooLarge: request body exceeds limit${sizeInfo}`,
        severity: 'error',
      });

      if (!history.brokerErrors.some(e => e.includes('PayloadTooLarge'))) {
        history.brokerErrors.push(`PayloadTooLarge: Request body exceeds limit${sizeInfo}`);
      }
      continue; // Don't process as other event types
    }

    // Job completions
    if (line.includes('Proving job complete')) {
      const epochMatch = line.match(/epochNumber[=:](\d+)/);
      const jobMatch = line.match(/id=([^\s]+)/);
      history.brokerEvents.push({
        timestamp: parsed.timestamp,
        type: 'proof_submit',
        epoch: epochMatch ? parseInt(epochMatch[1]) : undefined,
        message: jobMatch ? `Job complete: ${jobMatch[1].slice(0, 50)}` : parsed.message.slice(0, 80),
        severity: 'info',
      });
      continue;
    }

    // New proving jobs
    if (line.includes('New proving job')) {
      const epochMatch = line.match(/epochNumber[=:](\d+)/);
      const jobMatch = line.match(/id=([^\s]+)/);
      history.brokerEvents.push({
        timestamp: parsed.timestamp,
        type: 'proof_claim',
        epoch: epochMatch ? parseInt(epochMatch[1]) : undefined,
        message: jobMatch ? `New job: ${jobMatch[1].slice(0, 50)}` : parsed.message.slice(0, 80),
        severity: 'info',
      });
      continue;
    }

    // Other errors (excluding metrics collector errors)
    if (line.includes('"severity":"ERROR"') && !line.includes('metrics-opentelemetry')) {
      history.brokerEvents.push({
        timestamp: parsed.timestamp,
        type: 'broker_error',
        message: parsed.message.slice(0, 80),
        severity: 'error',
      });
    }
  }

  // Parse agent logs
  for (const line of agentLogs.split('\n')) {
    const parsed = parseLogLine(line);
    if (!parsed) {
      continue;
    }

    if (line.includes('Proving') || line.includes('proof')) {
      history.agentEvents.push({
        timestamp: parsed.timestamp,
        type: 'proof_submit',
        message: parsed.message.slice(0, 80),
        severity: 'info',
      });
    }

    if (line.includes('ERROR')) {
      history.agentEvents.push({
        timestamp: parsed.timestamp,
        type: 'broker_error',
        message: parsed.message.slice(0, 80),
        severity: 'error',
      });
    }
  }

  // Sort events by timestamp (most recent first) and limit
  history.proverNodeEvents.sort((a, b) => b.timestamp - a.timestamp);
  history.brokerEvents.sort((a, b) => b.timestamp - a.timestamp);
  history.agentEvents.sort((a, b) => b.timestamp - a.timestamp);

  // Keep only last 10 events per category
  history.proverNodeEvents = history.proverNodeEvents.slice(0, 10);
  history.brokerEvents = history.brokerEvents.slice(0, 10);
  history.agentEvents = history.agentEvents.slice(0, 10);

  return history;
}

async function getContractAddresses(namespace: string): Promise<{
  registryAddress: string | null;
  rollupAddress: string | null;
}> {
  interface K8sConfigMap {
    data?: Record<string, string>;
  }

  // Try to find contracts configmap
  const cmList = await kubectl(
    `get configmap -n ${namespace} -l app.kubernetes.io/component=contracts -o jsonpath='{.items[0].metadata.name}'`,
  );
  if (!cmList || cmList === "''") {
    return { registryAddress: null, rollupAddress: null };
  }

  const cmName = cmList.replace(/'/g, '');
  const cm = await kubectlJson<K8sConfigMap>(`get configmap -n ${namespace} ${cmName}`);

  return {
    registryAddress: cm?.data?.REGISTRY_ADDRESS || null,
    rollupAddress: cm?.data?.ROLLUP_ADDRESS || null,
  };
}

async function collectDiagnostics(namespace: string): Promise<NetworkDiagnostics> {
  const [l1Status, pods, services, criticalEvents, contracts, proverHistory] = await Promise.all([
    getL1Status(namespace),
    getPods(namespace),
    getServiceEndpoints(namespace),
    getCriticalEvents(namespace),
    getContractAddresses(namespace),
    getProverHistory(namespace),
  ]);

  // Get detailed status for aztec nodes (exclude L1 eth-validator pods)
  const aztecPods = pods.filter(
    p =>
      (p.name.includes('validator') && !p.name.includes('eth-validator')) ||
      p.name.includes('aztec-node') ||
      p.name.includes('prover-node'),
  );

  const nodeStatuses = await Promise.all(aztecPods.map(p => getNodeStatus(namespace, p.name)));

  return {
    namespace,
    l1BlockNumber: l1Status.blockNumber,
    chainId: l1Status.chainId,
    pods,
    nodeStatuses,
    services,
    ...criticalEvents,
    contracts,
    proverHistory,
  };
}

function colorize(text: string, color: keyof typeof Colors): string {
  return `${Colors[color]}${text}${Colors.reset}`;
}

function formatStatus(status: string): string {
  if (status === 'Running') {
    return colorize(status, 'green');
  }
  if (status === 'Completed') {
    return colorize(status, 'cyan');
  }
  return colorize(status, 'red');
}

function formatReady(ready: string): string {
  const [current, total] = ready.split('/');
  if (current === total) {
    return colorize(ready, 'green');
  }
  return colorize(ready, 'red');
}

function formatRestarts(restarts: number): string {
  if (restarts > 0) {
    return colorize(restarts.toString(), 'yellow');
  }
  return colorize(restarts.toString(), 'green');
}

function formatLogAge(seconds: number | null): string {
  if (seconds === null) {
    return colorize('Unable to determine', 'yellow');
  }
  if (seconds > 120) {
    return colorize(`${seconds}s ago (STALE!)`, 'red');
  }
  if (seconds > 30) {
    return colorize(`${seconds}s ago`, 'yellow');
  }
  return colorize(`${seconds}s ago`, 'green');
}

function formatHealth(health: 'OK' | 'FAILED' | 'UNKNOWN'): string {
  if (health === 'OK') {
    return colorize('OK', 'green');
  }
  if (health === 'FAILED') {
    return colorize('FAILED', 'red');
  }
  return colorize('UNKNOWN', 'yellow');
}

function formatPeerCount(count: number | null): string {
  if (count === null) {
    return '';
  }
  if (count === 0) {
    return colorize(count.toString(), 'red');
  }
  if (count < 3) {
    return colorize(count.toString(), 'yellow');
  }
  return colorize(count.toString(), 'green');
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const ageSeconds = Math.floor((now - timestamp) / 1000);
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  if (ageSeconds < 3600) {
    return `${Math.floor(ageSeconds / 60)}m ago`;
  }
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}

function formatProverEventType(type: ProverEvent['type']): string {
  switch (type) {
    case 'epoch_start':
      return colorize('EPOCH START', 'cyan');
    case 'epoch_complete':
      return colorize('EPOCH DONE', 'green');
    case 'epoch_failed':
      return colorize('EPOCH FAIL', 'red');
    case 'broker_error':
      return colorize('BROKER ERR', 'red');
    case 'proof_submit':
      return colorize('PROOF SUB', 'green');
    case 'proof_claim':
      return colorize('PROOF CLAIM', 'cyan');
    default:
      return type;
  }
}

function printDiagnostics(diag: NetworkDiagnostics): void {
  const hr = '═'.repeat(78);
  const thinHr = '─'.repeat(74);

  console.log(colorize(`╔${hr}╗`, 'bold'));
  console.log(colorize(`║               AZTEC NETWORK STATUS - ${diag.namespace.padEnd(39)}║`, 'bold'));
  console.log(colorize(`╚${hr}╝`, 'bold'));
  console.log();

  // L1 Status
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ L1 ETHEREUM STATUS                                                          │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  if (diag.l1BlockNumber !== null) {
    console.log(`  L1 Block:        ${colorize(diag.l1BlockNumber.toString(), 'green')}`);
  } else {
    console.log(`  L1 Block:        ${colorize('Unable to fetch', 'red')}`);
  }
  if (diag.chainId !== null) {
    console.log(`  Chain ID:        ${colorize(diag.chainId.toString(), 'green')}`);
  }
  console.log();

  // Pod Status
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ POD STATUS OVERVIEW                                                         │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  console.log(colorize(`  ${'POD'.padEnd(50)} ${'STATUS'.padEnd(12)} ${'READY'.padEnd(10)} RESTARTS`, 'bold'));
  console.log(`  ${thinHr}`);

  for (const pod of diag.pods) {
    console.log(
      `  ${pod.name.padEnd(50)} ${formatStatus(pod.status).padEnd(21)} ${formatReady(pod.ready).padEnd(19)} ${formatRestarts(pod.restarts)}`,
    );
  }
  console.log();

  // Node Detailed Status
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ AZTEC NODE DETAILED STATUS                                                  │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  for (const node of diag.nodeStatuses) {
    console.log();
    console.log(colorize(`  ${node.podName}`, 'bold'));
    console.log(`  ${thinHr}`);
    console.log(`  Last Log:        ${formatLogAge(node.lastLogAgeSeconds)}`);
    console.log(`  Health:          ${formatHealth(node.health)}`);

    const peerStr = formatPeerCount(node.peerCount);
    if (peerStr) {
      console.log(`  P2P Peers:       ${peerStr}`);
    }
    if (node.latestSlot !== null) {
      console.log(`  Latest Slot:     ${node.latestSlot}`);
    }
    if (node.latestL2Block !== null) {
      console.log(`  Latest L2 Block: ${node.latestL2Block}`);
    }
    if (node.syncedToL1Block !== null) {
      console.log(`  Synced to L1:    ${node.syncedToL1Block}`);
    }
    if (node.recentErrors > 0) {
      console.log(`  Recent Errors:   ${colorize(node.recentErrors.toString(), 'red')}`);
    }
    if (node.recentWarnings > 0) {
      console.log(`  Recent Warnings: ${colorize(node.recentWarnings.toString(), 'yellow')}`);
    }
    if (node.latestIssue) {
      console.log(`  Latest Issue:    ${colorize(`${node.latestIssue}...`, 'yellow')}`);
    }
  }
  console.log();

  // Critical Events
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ RECENT CRITICAL EVENTS (last 500 lines per pod)                             │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  if (diag.reorgEvents.length > 0) {
    console.log();
    console.log(colorize('  REORG EVENTS DETECTED:', 'red'));
    for (const event of diag.reorgEvents) {
      console.log(`    ${colorize('→', 'yellow')} ${event}`);
    }
  }

  if (diag.committeeIssues.length > 0) {
    console.log();
    console.log(colorize('  COMMITTEE ISSUES:', 'red'));
    for (const issue of diag.committeeIssues) {
      console.log(`    ${colorize('→', 'yellow')} ${issue}`);
    }
  }

  if (diag.slashingEvents.length > 0) {
    console.log();
    console.log(colorize('  SLASHING EVENTS:', 'red'));
    for (const event of diag.slashingEvents) {
      console.log(`    ${colorize('→', 'yellow')} ${event}`);
    }
  }

  if (diag.connectionErrors.length > 0) {
    console.log();
    console.log(colorize('  CONNECTION ERRORS:', 'red'));
    for (const error of diag.connectionErrors) {
      console.log(`    ${colorize('→', 'yellow')} ${error.slice(0, 80)}`);
    }
  }
  console.log();

  // Prover History
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ PROVER HISTORY                                                              │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  const ph = diag.proverHistory;

  // Epoch summary
  console.log();
  console.log(colorize('  Epoch Proving Summary:', 'bold'));
  console.log(
    `    In Progress: ${ph.epochsInProgress.length > 0 ? colorize(ph.epochsInProgress.join(', '), 'yellow') : 'none'}`,
  );
  console.log(
    `    Completed:   ${ph.epochsCompleted.length > 0 ? colorize(ph.epochsCompleted.join(', '), 'green') : 'none'}`,
  );
  console.log(`    Failed:      ${ph.epochsFailed.length > 0 ? colorize(ph.epochsFailed.join(', '), 'red') : 'none'}`);

  // Broker errors
  if (ph.brokerErrors.length > 0) {
    console.log();
    console.log(colorize('  Broker Errors:', 'red'));
    for (const err of ph.brokerErrors) {
      console.log(`    ${colorize('⚠', 'red')} ${err}`);
    }
  }

  // Prover Node Events
  if (ph.proverNodeEvents.length > 0) {
    console.log();
    console.log(colorize('  Recent Prover Node Events:', 'bold'));
    console.log(`    ${colorize('TIME'.padEnd(12), 'bold')} ${colorize('TYPE'.padEnd(15), 'bold')} MESSAGE`);
    for (const event of ph.proverNodeEvents.slice(0, 8)) {
      const timeStr = formatTimestamp(event.timestamp).padEnd(12);
      const typeStr = formatProverEventType(event.type);
      const epochStr = event.epoch !== undefined ? `[epoch ${event.epoch}] ` : '';
      console.log(`    ${timeStr} ${typeStr.padEnd(24)} ${epochStr}${event.message.slice(0, 40)}`);
    }
  }

  // Broker Events
  if (ph.brokerEvents.length > 0) {
    console.log();
    console.log(colorize('  Recent Broker Events:', 'bold'));
    console.log(`    ${colorize('TIME'.padEnd(12), 'bold')} ${colorize('TYPE'.padEnd(15), 'bold')} MESSAGE`);
    for (const event of ph.brokerEvents.slice(0, 5)) {
      const timeStr = formatTimestamp(event.timestamp).padEnd(12);
      const typeStr = formatProverEventType(event.type);
      console.log(`    ${timeStr} ${typeStr.padEnd(24)} ${event.message.slice(0, 45)}`);
    }
  }

  // Agent Events
  if (ph.agentEvents.length > 0) {
    console.log();
    console.log(colorize('  Recent Agent Events:', 'bold'));
    console.log(`    ${colorize('TIME'.padEnd(12), 'bold')} ${colorize('TYPE'.padEnd(15), 'bold')} MESSAGE`);
    for (const event of ph.agentEvents.slice(0, 5)) {
      const timeStr = formatTimestamp(event.timestamp).padEnd(12);
      const typeStr = formatProverEventType(event.type);
      console.log(`    ${timeStr} ${typeStr.padEnd(24)} ${event.message.slice(0, 45)}`);
    }
  }

  if (ph.proverNodeEvents.length === 0 && ph.brokerEvents.length === 0 && ph.agentEvents.length === 0) {
    console.log();
    console.log(colorize('  No prover activity detected (prover pods may not be running)', 'yellow'));
  }
  console.log();

  // Service Connectivity
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ SERVICE CONNECTIVITY                                                        │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  console.log();
  console.log(colorize(`  ${'SERVICE'.padEnd(45)} ${'PORT'.padEnd(10)} STATUS`, 'bold'));
  console.log(`  ${thinHr}`);

  for (const svc of diag.services) {
    const statusStr = svc.hasEndpoints ? colorize('Has endpoints', 'green') : colorize('No endpoints', 'red');
    console.log(`  ${svc.name.padEnd(45)} ${svc.port.toString().padEnd(10)} ${statusStr}`);
  }
  console.log();

  // Contract Status
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ CONTRACT DEPLOYMENT STATUS                                                  │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  if (diag.contracts.registryAddress || diag.contracts.rollupAddress) {
    console.log();
    if (diag.contracts.registryAddress) {
      console.log(`  Registry:        ${diag.contracts.registryAddress}`);
    }
    if (diag.contracts.rollupAddress) {
      console.log(`  Rollup:          ${diag.contracts.rollupAddress}`);
    }
  } else {
    console.log();
    console.log(colorize('  No contracts configmap found', 'yellow'));
  }
  console.log();

  // Summary
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ DIAGNOSIS SUMMARY                                                           │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));

  const runningPods = diag.pods.filter(p => p.status === 'Running').length;
  const completedPods = diag.pods.filter(p => p.status === 'Completed').length;
  const problemPods = diag.pods.length - runningPods - completedPods;

  console.log();
  console.log(`  Total Pods:      ${diag.pods.length}`);
  console.log(`  Running:         ${colorize(runningPods.toString(), 'green')}`);
  console.log(`  Completed:       ${colorize(completedPods.toString(), 'cyan')}`);
  if (problemPods > 0) {
    console.log(`  Problem Pods:    ${colorize(problemPods.toString(), 'red')}`);
  }

  // Check for known issues
  const hasCommitteeIssue = diag.nodeStatuses.some(n => n.latestIssue?.includes('committee does not exist'));
  const hasReorg = diag.reorgEvents.length > 0;

  console.log();
  if (hasCommitteeIssue) {
    console.log(colorize('  ⚠ COMMITTEE ISSUE: Validators cannot propose - committee not found on L1', 'red'));
    console.log(
      colorize("    → This typically happens after a reorg or if the validator lag period hasn't passed", 'yellow'),
    );
    console.log(
      colorize('    → Wait for AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET epochs, or redeploy the network', 'yellow'),
    );
  }

  if (hasReorg) {
    console.log(colorize('  ⚠ REORG DETECTED: Chain was reorganized, checkpoints were unwound', 'red'));
    console.log(colorize('    → Check L1 stability and contract deployment logs', 'yellow'));
  }

  // Check for epoch pruning/slashing
  const hasEpochPrune = diag.slashingEvents.some(e => e.includes('tally slashing round'));
  if (hasEpochPrune && hasCommitteeIssue) {
    console.log(colorize('  ⚠ EPOCH PRUNE SLASHING: Committee was slashed for failing to prove epochs', 'red'));
    console.log(colorize('    → Provers could not generate proofs before the epoch deadline', 'yellow'));
    console.log(
      colorize(
        '    → Solutions: (1) Redeploy network, (2) Increase slot duration, (3) Check prover capacity',
        'yellow',
      ),
    );
  }

  // Check for broker payload issues
  const hasPayloadError = diag.proverHistory.brokerErrors.some(e => e.includes('PayloadTooLarge'));
  if (hasPayloadError) {
    console.log(colorize('  ⚠ BROKER PAYLOAD ERROR: Prover broker rejecting requests (body too large)', 'red'));
    console.log(colorize('    → The prover broker has a 1MB body size limit but epoch proofs are larger', 'yellow'));
    console.log(colorize('    → Fix: Set RPC_MAX_BODY_SIZE env var on prover-broker to increase limit', 'yellow'));
    console.log(colorize('    → Example: RPC_MAX_BODY_SIZE=10485760 (10MB)', 'yellow'));
  }

  // Check for prover failures
  if (diag.proverHistory.epochsFailed.length > 0) {
    console.log(
      colorize(`  ⚠ PROVER FAILURES: Epochs ${diag.proverHistory.epochsFailed.join(', ')} failed to prove`, 'red'),
    );
    console.log(colorize('    → Check prover-node and prover-agent logs for errors', 'yellow'));
  }

  console.log();
  console.log(colorize('┌─────────────────────────────────────────────────────────────────────────────┐', 'cyan'));
  console.log(colorize('│ RECOMMENDED ACTIONS                                                         │', 'cyan'));
  console.log(colorize('└─────────────────────────────────────────────────────────────────────────────┘', 'cyan'));
  console.log();

  if (hasPayloadError) {
    console.log('  Fix the prover broker body size limit:');
    console.log(colorize('    1. Add to prover-broker deployment: RPC_MAX_BODY_SIZE=10485760', 'cyan'));
    console.log(colorize('    2. Or update Helm values: prover.broker.env.RPC_MAX_BODY_SIZE=10485760', 'cyan'));
    console.log(colorize('    3. Then restart the prover-broker pod', 'cyan'));
  } else if (hasCommitteeIssue) {
    console.log('  The network needs to be redeployed. Run:');
    console.log(colorize(`    cd spartan/terraform/deploy-aztec-infra/state/${diag.namespace}`, 'cyan'));
    console.log(colorize('    ./run.sh destroy && ./run.sh deploy', 'cyan'));
  } else if (diag.nodeStatuses.some(n => n.health === 'FAILED')) {
    console.log('  Some nodes are unhealthy. Check their logs:');
    console.log(colorize(`    kubectl logs -n ${diag.namespace} <pod-name> --tail=100`, 'cyan'));
  } else if (diag.proverHistory.epochsFailed.length > 0) {
    console.log('  Check prover logs for failure details:');
    console.log(
      colorize(`    kubectl logs -n ${diag.namespace} -l app.kubernetes.io/name=prover-node --tail=200`, 'cyan'),
    );
    console.log(
      colorize(`    kubectl logs -n ${diag.namespace} -l app.kubernetes.io/name=prover-broker --tail=200`, 'cyan'),
    );
  } else {
    console.log(colorize('  Network appears healthy!', 'green'));
  }

  console.log();
  console.log(colorize(`${'═'.repeat(79)}`, 'bold'));
}

async function main(): Promise<void> {
  const namespace = process.argv[2] || 'upgrade-test';

  if (!(await namespaceExists(namespace))) {
    console.error(colorize(`Error: Namespace '${namespace}' not found`, 'red'));
    console.error(`Usage: ${process.argv[1]} [namespace]`);
    process.exit(1);
  }

  const diagnostics = await collectDiagnostics(namespace);
  printDiagnostics(diagnostics);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
