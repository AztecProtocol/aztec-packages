#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * K8s Enricher - Watches kubernetes events, pod statuses, jobs, and streams logs.
 *
 * Usage:
 *   k8s_enricher.ts <namespace>              # Print filtered hints to stdout
 *   k8s_enricher.ts <namespace> --cache-log  # Pipe all per-pod logs to cache_log (CI links only)
 *
 * Features:
 * - Watches K8s events (scheduling failures, image pull errors, probe failures, etc.)
 * - Watches pod status changes (deaths, exit codes like OOM)
 * - Watches init container failures in Pending pods
 * - Watches Job lifecycle (attempts, backoff limits, completion/failure)
 * - Streams pod logs filtered for errors/warnings/milestones (all containers)
 * - Forwards prover agent job start/completion logs
 * - Prints GCP Logs Explorer links when running on GKE
 * - Optional: capture all per-pod logs via cache_log for CI links and post-mortem analysis
 *
 * Cleans itself up if the parent process dies.
 */

import { spawn, ChildProcess, execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

// Parse arguments
const args = process.argv.slice(2);
const cacheLogIndex = args.indexOf('--cache-log');
const cacheLogMode = cacheLogIndex !== -1;

if (cacheLogMode) {
  args.splice(cacheLogIndex, 1); // Remove --cache-log flag from args
  // In cache-log mode, suppress stdout hints. Errors (stderr) and cache_log CI links still show.
  console.log = () => {};
}

const namespace = args[0];

if (!namespace) {
  console.error('Usage: k8s_enricher.ts <namespace> [--cache-log]');
  process.exit(1);
}

// Per-pod cache_log processes (only used in --cache-log mode).
// Each pod gets its own cache_log process that generates a CI link and uploads to redis.
const podCacheLogProcs = new Map<string, ChildProcess>();

function getPodCacheLog(podName: string, containerName?: string): NodeJS.WritableStream | null {
  if (!cacheLogMode) return null;

  const key = containerName ? `${podName}/${containerName}` : podName;
  if (!podCacheLogProcs.has(key)) {
    const displayName = containerName ? `${podName}/${containerName}` : podName;
    // Spawn cache_log (ci3 script) which handles UUID generation, CI link printing, and redis upload.
    // stderr is inherited so CI links appear in our output.
    const proc = spawn('cache_log', [displayName], {
      stdio: ['pipe', 'ignore', 'inherit'],
    });
    proc.on('error', err => {
      console.error(`${PREFIX} cache_log error for ${displayName}: ${err.message}`);
    });
    podCacheLogProcs.set(key, proc);
  }
  return podCacheLogProcs.get(key)!.stdin!;
}

// Colors - always enabled (denoise handles TTY detection)
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

const PREFIX = `${colors.gray}[k8s_enricher]${colors.reset}`;

function time(): string {
  return new Date().toISOString().substring(11, 23);
}

function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const color = level === 'error' ? colors.red : level === 'warn' ? colors.yellow : colors.cyan;
  console.log(`${PREFIX} ${color}[${time()}] [${level.toUpperCase()}]${colors.reset} ${msg}`);
}

// GKE detection and log link generation
interface GkeContext {
  project: string;
  location: string;
  cluster: string;
}

function getGkeContext(): GkeContext | null {
  try {
    const context = execSync('kubectl config current-context', { encoding: 'utf-8' }).trim();
    if (!context.startsWith('gke_')) return null;
    const parts = context.split('_');
    if (parts.length < 4) return null;
    return {
      project: parts[1],
      location: parts[2],
      cluster: parts.slice(3).join('_'),
    };
  } catch {
    return null;
  }
}

function getPodLogsUrl(podName: string, gke: GkeContext): string {
  const query = `resource.type="k8s_container"
resource.labels.project_id="${gke.project}"
resource.labels.location="${gke.location}"
resource.labels.cluster_name="${gke.cluster}"
resource.labels.namespace_name="${namespace}"
resource.labels.pod_name="${podName}"`;
  const encoded = encodeURIComponent(query);
  return `https://console.cloud.google.com/logs/query%3Bquery%3D${encoded}%3Bduration%3DPT1H?project=${gke.project}`;
}

function printGcpLogLink(podName: string, gke: GkeContext | null): void {
  if (!gke) return;
  const url = getPodLogsUrl(podName, gke);
  console.log(`${PREFIX} ${colors.gray}[LOGS] ${podName}: ${url}${colors.reset}`);
}

const gkeContext = getGkeContext();

/** Patterns that indicate important messages worth logging. */
const IMPORTANT_PATTERNS = [
  /unschedulable/i,
  /insufficient\s+(cpu|memory)/i,
  /oom|out\s*of\s*memory/i,
  /evicted|preempted/i,
  /disk\s*pressure|memory\s*pressure|pid\s*pressure/i,
  /no\s+space\s+left/i,
  /killed|crashloop|backoff/i,
  /image\s*pull.*error/i,
  /failed\s+to\s+(pull|create|start)/i,
  // Probe failures
  /startup\s*probe.*failed/i,
  /liveness\s*probe.*failed/i,
  /readiness\s*probe.*failed/i,
  // Init container failures
  /init.*container.*failed/i,
  /init.*container.*error/i,
  /init.*container.*crash/i,
  // Job failures
  /job.*failed/i,
  /backoff.*limit.*exceeded/i,
];

/** Patterns to ignore entirely (always noisy, never useful). */
const IGNORE_PATTERNS = [
  /metrics.*export.*failed/i,
  /PeriodicExportingMetricReader/i,
  /Could not publish message/i,  // eth-beacon noise
  /Low peer count/i,  // eth-beacon noise
];

/** Patterns for milestone logs that should always be forwarded (block proposals, checkpoints, proofs). */
const MILESTONE_PATTERNS = [
  /Validated block proposal for slot/,
  /Attesting to.*checkpoint proposal for slot/,
  /Checkpoint.*building SUCCEEDED/,
  /Submitted proof for epoch/,
  /Published epoch proof/,
  /Updated proven chain to checkpoint/,
  /Downloaded checkpoint/,
  /Job id=\S+ type=\S+ completed/,
];

const LIFECYCLE_REASONS = new Set([
  'Killing', 'Preempting', 'FailedKillPod', 'Started', 'Created', 'Pulled',
  'BackOff', 'Unhealthy', 'ProbeWarning', 'FailedScheduling', 'FailedMount',
  'FailedAttachVolume', 'FailedCreatePodSandBox', 'NetworkNotReady', 'Scheduled',
  'Failed', 'ErrImagePull', 'ErrImageNeverPull', 'InspectFailed',
]);

// State tracking
const seenEvents = new Set<string>();
const lastPodStatuses = new Map<string, any>();
const logStreams = new Map<string, ChildProcess>();
const seenPods = new Set<string>();
// Track last known restart count per pod/container to detect restarts
const lastRestartCounts = new Map<string, number>();
// Track init container states to detect failures
const lastInitContainerStates = new Map<string, string>();
// Track job states
const lastJobStates = new Map<string, { active: number; succeeded: number; failed: number }>();
// Track when pods first entered Pending (for stuck-pending detection)
const podFirstSeen = new Map<string, number>();
const pendingWarned = new Set<string>();

function shouldIgnore(message: string): boolean {
  return IGNORE_PATTERNS.some(p => p.test(message));
}

function isImportant(message: string): boolean {
  return IMPORTANT_PATTERNS.some(p => p.test(message));
}

function formatExitCode(exitCode: number, reason: string): string {
  const meanings: Record<number, string> = {
    0: 'Success', 1: 'Failed', 137: 'OOMKilled', 139: 'SIGSEGV', 143: 'SIGTERM',
  };
  const meaning = meanings[exitCode] || (exitCode > 128 ? `Signal ${exitCode - 128}` : 'Unknown');
  return `exit ${exitCode} (${meaning})${reason !== 'Completed' ? `, ${reason}` : ''}`;
}

/** Check if pod should be excluded (eth-* pods). */
function shouldExcludePod(podName: string): boolean {
  // Match -eth- anywhere in the name (e.g., namespace-eth-beacon-0)
  return /-eth-/.test(podName);
}

/** Check if pod is a prover agent. */
function isProverAgentPod(podName: string): boolean {
  return /prover-agent/.test(podName);
}

/** Check if pod is a deploy job (e.g., deploy-rollup-contracts). All logs should be forwarded. */
function isDeployJobPod(podName: string): boolean {
  return /deploy-/.test(podName);
}

/** Patterns for prover agent logs that should be forwarded regardless of level. */
const PROVER_AGENT_PATTERNS = [
  /Starting job id=\S+ type=\S+/,
  /Job id=\S+ type=\S+ completed/,
  /Aborting job id=\S+ type=\S+/,
];

// Event watcher
function startEventWatcher(): ChildProcess {
  const proc = spawn('kubectl', ['get', 'events', '-n', namespace, '--watch', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  proc.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleEvent(event);
      } catch {}
    }
  });

  proc.on('exit', code => {
    if (code !== 0) setTimeout(() => startEventWatcher(), 1000);
  });

  return proc;
}

function handleEvent(event: any): void {
  const objName = event.involvedObject?.name || 'unknown';

  // Skip eth-* pod events
  if (shouldExcludePod(objName)) return;

  const eventKey = `${objName}:${event.reason}:${event.message}`;
  if (seenEvents.has(eventKey)) return;
  seenEvents.add(eventKey);

  const message = event.message || '';
  if (shouldIgnore(message)) return;

  const shouldPrint = event.type === 'Warning' ||
    LIFECYCLE_REASONS.has(event.reason) ||
    isImportant(message);

  if (!shouldPrint) return;

  const objKind = event.involvedObject?.kind || 'unknown';
  const msg = `${objKind}/${objName}: ${event.reason} - ${message}`;

  if (event.type === 'Warning') {
    log('warn', msg);
  } else {
    log('info', msg);
  }
}

// Job watcher (HIGH PRIORITY)
function startJobWatcher(): ChildProcess {
  const proc = spawn('kubectl', ['get', 'jobs', '-n', namespace, '--watch', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  proc.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const job = JSON.parse(line);
        handleJobStatus(job);
      } catch {}
    }
  });

  proc.on('exit', code => {
    if (code !== 0) setTimeout(() => startJobWatcher(), 1000);
  });

  return proc;
}

function handleJobStatus(job: any): void {
  const name = job.metadata?.name;
  if (!name) return;

  const status = job.status || {};
  const active = status.active || 0;
  const succeeded = status.succeeded || 0;
  const failed = status.failed || 0;

  const lastState = lastJobStates.get(name);
  const currentState = { active, succeeded, failed };
  lastJobStates.set(name, currentState);

  // Check for state changes
  if (lastState) {
    // Job became active (pod started running)
    if (active > 0 && lastState.active === 0) {
      log('info', `Job/${name}: pod running`);
    }
    // Job completed successfully
    if (succeeded > lastState.succeeded) {
      const duration = status.completionTime && status.startTime
        ? `${Math.round((new Date(status.completionTime).getTime() - new Date(status.startTime).getTime()) / 1000)}s`
        : '';
      console.log(`${PREFIX} ${colors.green}[${time()}] [JOB COMPLETED]${colors.reset} ${name} (succeeded${duration ? ` in ${duration}` : ''})`);
    }
    // Job failed
    if (failed > lastState.failed) {
      const backoffLimit = job.spec?.backoffLimit ?? 6;
      const remaining = backoffLimit - failed;
      log('error', `Job/${name}: attempt ${failed} failed (${remaining} retries remaining)`);
    }
  } else {
    // First time seeing this job
    if (succeeded > 0) {
      log('info', `Job/${name}: already completed`);
    } else if (active > 0) {
      log('info', `Job/${name}: running`);
    } else {
      log('info', `Job/${name}: created (waiting for pod)`);
    }
  }

  // Check conditions for terminal states
  for (const condition of status.conditions || []) {
    if (condition.type === 'Failed' && condition.status === 'True') {
      const reason = condition.reason || 'Unknown';
      if (reason === 'BackoffLimitExceeded') {
        log('error', `Job/${name}: FAILED - backoff limit exceeded after ${failed} attempts`);
      } else if (reason === 'DeadlineExceeded') {
        log('error', `Job/${name}: FAILED - deadline exceeded`);
      } else {
        log('error', `Job/${name}: FAILED - ${reason}: ${condition.message || ''}`);
      }
    }
    if (condition.type === 'Complete' && condition.status === 'True') {
      // Already handled above via succeeded count, but log if we missed it
      if (!lastState || succeeded <= (lastState.succeeded || 0)) {
        log('info', `Job/${name}: complete`);
      }
    }
  }
}

// Pod status watcher
function startPodWatcher(): ChildProcess {
  const proc = spawn('kubectl', ['get', 'pods', '-n', namespace, '--watch', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  proc.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const pod = JSON.parse(line);
        handlePodStatus(pod);
      } catch {}
    }
  });

  proc.on('exit', code => {
    if (code !== 0) setTimeout(() => startPodWatcher(), 1000);
  });

  return proc;
}

function handlePodStatus(pod: any): void {
  const name = pod.metadata?.name;
  if (!name || shouldExcludePod(name)) return;

  const status = pod.status || {};
  const lastStatus = lastPodStatuses.get(name);
  lastPodStatuses.set(name, status);

  // Track first-seen time for pending detection
  if (!podFirstSeen.has(name)) {
    podFirstSeen.set(name, Date.now());
  }

  // Phase transitions
  if (lastStatus && lastStatus.phase !== status.phase) {
    if (status.phase === 'Failed' || status.phase === 'Unknown') {
      log('warn', `${name}: Pod entered ${status.phase} state`);
    }
  }

  // Detect Pending pods with scheduling problems
  if (status.phase === 'Pending') {
    for (const condition of status.conditions || []) {
      if (condition.type === 'PodScheduled' && condition.status === 'False') {
        const reason = condition.reason || 'Unknown';
        const message = condition.message || '';
        const warnKey = `${name}:${reason}`;
        if (!pendingWarned.has(warnKey)) {
          pendingWarned.add(warnKey);
          log('warn', `${name}: Pending - ${reason}: ${message}`);
        }
      }
    }
  } else {
    // Pod is no longer Pending, clear warnings so they can re-trigger
    pendingWarned.forEach(key => { if (key.startsWith(`${name}:`)) pendingWarned.delete(key); });
  }

  // Init container status changes (HIGH PRIORITY)
  for (const initContainer of status.initContainerStatuses || []) {
    const containerKey = `${name}/init:${initContainer.name}`;
    const currentState = initContainer.state?.waiting?.reason ||
                         initContainer.state?.running ? 'Running' :
                         initContainer.state?.terminated?.reason || 'Unknown';

    const lastState = lastInitContainerStates.get(containerKey);
    lastInitContainerStates.set(containerKey, currentState);

    // Detect init container failures
    if (initContainer.state?.terminated) {
      const term = initContainer.state.terminated;
      if (term.exitCode !== 0 && lastState !== currentState) {
        log('error', `${containerKey}: init container failed - ${formatExitCode(term.exitCode, term.reason || 'Error')}`);
        // Try to stream init container logs
        streamInitContainerLogs(name, initContainer.name);
      }
    } else if (initContainer.state?.waiting) {
      const { reason, message } = initContainer.state.waiting;
      if (['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerConfigError'].includes(reason)) {
        if (lastState !== currentState) {
          log('warn', `${containerKey}: ${reason}${message ? ` - ${message}` : ''}`);
        }
      }
    }
  }

  // Container status changes
  for (const container of status.containerStatuses || []) {
    const containerKey = `${name}/${container.name}`;
    const restartCount = container.restartCount || 0;
    const lastRestartCount = lastRestartCounts.get(containerKey);

    // Detect restart by comparing restart counts
    if (lastRestartCount !== undefined && restartCount > lastRestartCount) {
      const term = container.lastState?.terminated;
      const exitCode = term?.exitCode ?? '?';
      console.log(`${PREFIX} ${colors.magenta}[${time()}] [K8S RESTART]${colors.reset} ${containerKey} (#${restartCount}, exit ${exitCode})`);
    }
    lastRestartCounts.set(containerKey, restartCount);

    // Waiting states (CrashLoopBackOff, etc.)
    if (container.state?.waiting) {
      const { reason } = container.state.waiting;
      if (['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'ErrImageNeverPull', 'InvalidImageName'].includes(reason)) {
        // Only log once per restart count
        const lastLogged = lastPodStatuses.get(`${containerKey}:waiting:${reason}`);
        if (lastLogged !== restartCount) {
          lastPodStatuses.set(`${containerKey}:waiting:${reason}`, restartCount);
          let exitInfo = '';
          if (container.lastState?.terminated) {
            const term = container.lastState.terminated;
            exitInfo = ` [${formatExitCode(term.exitCode, term.reason || 'Unknown')}]`;
          }
          log('warn', `${containerKey}: ${reason} (restarts: ${restartCount})${exitInfo}`);
        }
      }
    }
  }
}

// Stream init container logs (HIGH PRIORITY)
function streamInitContainerLogs(podName: string, containerName: string): void {
  const streamKey = `${podName}/init:${containerName}`;
  if (logStreams.has(streamKey)) return;

  const proc = spawn('kubectl', ['logs', '-n', namespace, podName, '-c', containerName], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const rl = createInterface({ input: proc.stdout! });
  rl.on('line', line => handleLogLine(podName, line, `init:${containerName}`));

  proc.on('close', () => logStreams.delete(streamKey));
  proc.on('error', () => logStreams.delete(streamKey));

  logStreams.set(streamKey, proc);
}

// Log streaming
interface PodContainerInfo {
  podName: string;
  containers: string[];
}

async function getRunningPodsWithContainers(): Promise<PodContainerInfo[]> {
  return new Promise(resolve => {
    const proc = spawn('kubectl', [
      'get', 'pods', '-n', namespace,
      '-o', 'json',
      '--field-selector=status.phase=Running',
    ]);
    let output = '';
    proc.stdout?.on('data', data => (output += data.toString()));
    proc.on('close', () => {
      try {
        const podList = JSON.parse(output);
        const result: PodContainerInfo[] = [];
        for (const pod of podList.items || []) {
          const podName = pod.metadata?.name;
          if (!podName) continue;
          const containers = (pod.spec?.containers || []).map((c: any) => c.name);
          result.push({ podName, containers });
        }
        resolve(result);
      } catch {
        resolve([]);
      }
    });
    proc.on('error', () => resolve([]));
  });
}

function startPodLogStream(podName: string, containerName?: string): void {
  const streamKey = containerName ? `${podName}/${containerName}` : podName;
  if (logStreams.has(streamKey)) return;

  const args = ['logs', '-f', '-n', namespace, podName, '--since=5s'];
  if (containerName) {
    args.push('-c', containerName);
  }

  const proc = spawn('kubectl', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const rl = createInterface({ input: proc.stdout! });
  rl.on('line', line => handleLogLine(podName, line, containerName));

  proc.on('close', () => logStreams.delete(streamKey));
  proc.on('error', () => logStreams.delete(streamKey));

  logStreams.set(streamKey, proc);

  if (!seenPods.has(podName)) {
    seenPods.add(podName);
    printGcpLogLink(podName, gkeContext);
  }
}

function handleLogLine(podName: string, line: string, containerName?: string): void {
  // In cache-log mode: pipe raw line to pod's cache_log process and skip stdout hints
  const cacheLog = getPodCacheLog(podName, containerName);
  if (cacheLog) {
    cacheLog.write(line + '\n');
    return; // Don't print inline hints in cache mode
  }

  let message = line;
  let level = '';
  let module = '';

  // Try to parse JSON
  try {
    if (line.trim().startsWith('{')) {
      const json = JSON.parse(line);
      message = json.message || json.msg || line;
      level = String(json.level || json.severity || '').toLowerCase();
      module = String(json.module || json.name || '').toLowerCase();
    }
  } catch {}

  // Skip always-ignored patterns
  if (shouldIgnore(message)) return;

  // Determine log level
  const isError = level === 'error' || level === '50';
  const isWarn = level === 'warn' || level === 'warning' || level === '40';
  const isMilestone = MILESTONE_PATTERNS.some(p => p.test(message));
  const isProverJobLog = isProverAgentPod(podName) && PROVER_AGENT_PATTERNS.some(p => p.test(message));
  const isSequencerVote = module.includes('sequencer') && /vote/i.test(message);
  const isDeployLog = isDeployJobPod(podName);

  // Forward: errors, warnings, milestones, prover job logs, sequencer votes, deploy job logs
  if (!isError && !isWarn && !isMilestone && !isProverJobLog && !isSequencerVote && !isDeployLog) return;

  // Truncate long messages (e.g., stack traces) - just show first line
  const firstLine = message.split('\n')[0];
  const truncated = firstLine.length > 200 ? firstLine.substring(0, 197) + '...' : firstLine;

  // Include container name if specified (for multi-container pods)
  const podIdentifier = containerName ? `${podName}/${containerName}` : podName;

  if (isError) {
    log('error', `${podIdentifier}: ${truncated}`);
  } else if (isWarn) {
    log('warn', `${podIdentifier}: ${truncated}`);
  } else if (isMilestone || isSequencerVote) {
    console.log(`${PREFIX} ${colors.green}[${time()}] [MILESTONE]${colors.reset} ${podIdentifier}: ${truncated}`);
  } else {
    log('info', `${podIdentifier}: ${truncated}`);
  }
}

async function startLogStreaming(): Promise<void> {
  const poll = async () => {
    const podsWithContainers = await getRunningPodsWithContainers();
    for (const { podName, containers } of podsWithContainers) {
      if (shouldExcludePod(podName)) continue;

      // For multi-container pods, stream each container separately
      if (containers.length > 1) {
        for (const container of containers) {
          startPodLogStream(podName, container);
        }
      } else {
        // Single container pod - no need to specify container
        startPodLogStream(podName);
      }
    }
  };
  poll();
  setInterval(poll, 2000);
}

/** Periodically poll pod status to reliably detect restarts and stuck-pending pods. */
async function startStatusPoller(): Promise<void> {
  const STUCK_PENDING_THRESHOLD_MS = 30_000; // Warn after 30s in Pending

  const checkPods = async () => {
    const proc = spawn('kubectl', ['get', 'pods', '-n', namespace, '-o', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('close', () => {
      try {
        const podList = JSON.parse(output);
        for (const pod of podList.items || []) {
          const podName = pod.metadata?.name;
          if (!podName || shouldExcludePod(podName)) continue;

          // Detect pods stuck in Pending
          const phase = pod.status?.phase;
          if (phase === 'Pending') {
            if (!podFirstSeen.has(podName)) {
              podFirstSeen.set(podName, Date.now());
            }
            const elapsed = Date.now() - podFirstSeen.get(podName)!;
            if (elapsed > STUCK_PENDING_THRESHOLD_MS && !pendingWarned.has(podName)) {
              pendingWarned.add(podName);
              // Collect scheduling info from conditions
              const conditions = pod.status?.conditions || [];
              const schedCondition = conditions.find((c: any) => c.type === 'PodScheduled');
              if (schedCondition && schedCondition.status === 'False') {
                log('warn', `${podName}: stuck Pending for ${Math.round(elapsed / 1000)}s - ${schedCondition.reason}: ${schedCondition.message || ''}`);
              } else {
                log('warn', `${podName}: stuck Pending for ${Math.round(elapsed / 1000)}s`);
              }
            }
          }

          // Check init containers
          for (const initContainer of pod.status?.initContainerStatuses || []) {
            const containerKey = `${podName}/init:${initContainer.name}`;
            if (initContainer.state?.terminated && initContainer.state.terminated.exitCode !== 0) {
              const lastState = lastInitContainerStates.get(containerKey);
              const currentState = initContainer.state.terminated.reason || 'Failed';
              if (lastState !== currentState) {
                lastInitContainerStates.set(containerKey, currentState);
                const term = initContainer.state.terminated;
                log('error', `${containerKey}: init container failed - ${formatExitCode(term.exitCode, term.reason || 'Error')}`);
                streamInitContainerLogs(podName, initContainer.name);
              }
            }
          }

          // Check regular containers
          for (const container of pod.status?.containerStatuses || []) {
            const containerKey = `${podName}/${container.name}`;
            const restartCount = container.restartCount || 0;
            const lastRestartCount = lastRestartCounts.get(containerKey);

            if (lastRestartCount !== undefined && restartCount > lastRestartCount) {
              const term = container.lastState?.terminated;
              const exitCode = term?.exitCode ?? '?';
              console.log(`${PREFIX} ${colors.magenta}[${time()}] [K8S RESTART]${colors.reset} ${containerKey} (#${restartCount}, exit ${exitCode})`);
            }
            lastRestartCounts.set(containerKey, restartCount);
          }
        }
      } catch {}
    });
  };

  // Poll every 3 seconds
  setInterval(checkPods, 3000);
}

// Main
function main(): void {
  if (gkeContext) {
    log('info', `GKE cluster detected: ${gkeContext.cluster} (${gkeContext.project}/${gkeContext.location})`);
  }

  const eventProc = startEventWatcher();
  const podProc = startPodWatcher();
  const jobProc = startJobWatcher();
  startLogStreaming();
  startStatusPoller();

  const shutdown = () => {
    eventProc.kill();
    podProc.kill();
    jobProc.kill();
    for (const proc of logStreams.values()) proc.kill();

    // Close cache_log stdin pipes so they can finalize and upload to redis.
    // Wait for all cache_log processes to exit before we exit.
    const cacheLogProcs = [...podCacheLogProcs.values()];
    if (cacheLogProcs.length === 0) {
      process.exit(0);
    }
    let remaining = cacheLogProcs.length;
    for (const proc of cacheLogProcs) {
      proc.stdin?.end();
      proc.on('close', () => {
        remaining--;
        if (remaining === 0) process.exit(0);
      });
    }
    // Safety timeout: exit after 10s even if cache_log processes haven't finished
    setTimeout(() => process.exit(0), 10000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Exit when parent shell dies (ppid becomes 1/init) - helps with sticky cleanup.
  // This is portable across Linux/macOS.
  // See: https://stackoverflow.com/questions/284325/how-to-make-child-process-die-after-parent-exits
  const parentPid = process.ppid;
  setInterval(() => {
    if (process.ppid !== parentPid) {
      shutdown();
    }
  }, 1000);
}

main();
