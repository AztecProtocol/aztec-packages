/**
 * Executor interface for deployment operations.
 * Allows dependency injection for testing and plan mode.
 */

import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { isGcpSecret, type GcpSecret } from "../configs/types.ts";

export type TerraformVars = Record<string, string | number | boolean | null | string[] | undefined>;

/** Secret value that may be a GCP secret sentinel */
export type SecretValue<T> = T | GcpSecret;

/** Executor interface - high-level deployment operations */
export interface Executor {
  log(message: string): void;

  ensureNamespace(namespace: string): void;
  deleteNamespace(namespace: string): void;

  applyTerraform(module: string, vars: TerraformVars, cluster: string, namespace: string): void;
  destroyTerraform(module: string, cluster: string, namespace: string): void;
  getTerraformOutput(module: string, name: string): string;

  getKubernetesContext(): string;
  getFailedPodLogs(namespace: string, jobName: string): string[];

  computeAddress(mnemonic: string, index: number): string;
  computePrivateKey(mnemonic: string, index: number): string;

  writeBenchmark(path: string, data: unknown): void;

  /** Resolve a secret value - returns actual value or placeholder for plan mode */
  resolveSecret<T>(value: SecretValue<T>, secretName: string): T;
}

/** Format terraform variable value */
function formatTfValue(value: string | number | boolean | null | string[] | undefined): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Real executor that performs actual operations */
export class RealExecutor implements Executor {
  private spartanDir: string;

  constructor(spartanDir: string) {
    this.spartanDir = spartanDir;
  }

  private shell(command: string, args: string[]): { stdout: string; ok: boolean } {
    const result = spawnSync(command, args, { encoding: "utf-8", stdio: ["inherit", "pipe", "pipe"] });
    return { stdout: (result.stdout ?? "").trim(), ok: result.status === 0 };
  }

  private shellRun(command: string, args: string[]): void {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }
  }

  private moduleDir(module: string): string {
    return resolve(this.spartanDir, `terraform/${module}`);
  }

  private writeTfVars(dir: string, vars: TerraformVars): void {
    const content = Object.entries(vars)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k} = ${formatTfValue(v)}`)
      .join("\n");
    writeFileSync(`${dir}/terraform.tfvars`, content, "utf-8");
  }

  log(message: string): void {
    console.log(message);
  }

  ensureNamespace(namespace: string): void {
    const result = this.shell("kubectl", ["get", "namespace", namespace]);
    if (!result.ok) {
      this.shellRun("kubectl", ["create", "namespace", namespace]);
    }
  }

  deleteNamespace(namespace: string): void {
    this.shell("kubectl", ["delete", "all", "--all", "-n", namespace, "--ignore-not-found=true"]);
    this.shell("kubectl", ["delete", "namespace", namespace, "--ignore-not-found=true"]);
  }

  applyTerraform(module: string, vars: TerraformVars, cluster: string, namespace: string): void {
    const dir = this.moduleDir(module);
    const statePath = `${cluster}/${namespace}/${module}`;

    // Override backend
    const scriptPath = resolve(this.spartanDir, "scripts/override_terraform_backend.sh");
    this.shellRun("bash", [scriptPath, dir, cluster, statePath]);

    // Write vars and apply
    this.writeTfVars(dir, vars);
    this.shellRun("terraform", ["-chdir=" + dir, "init", "-reconfigure"]);
    this.shellRun("terraform", ["-chdir=" + dir, "plan", "-out=tfplan"]);
    this.shellRun("terraform", ["-chdir=" + dir, "apply", "tfplan"]);
  }

  destroyTerraform(module: string, cluster: string, namespace: string): void {
    const dir = this.moduleDir(module);
    const statePath = `${cluster}/${namespace}/${module}`;

    const scriptPath = resolve(this.spartanDir, "scripts/override_terraform_backend.sh");
    this.shellRun("bash", [scriptPath, dir, cluster, statePath]);

    this.shellRun("terraform", ["-chdir=" + dir, "init", "-reconfigure"]);
    this.shellRun("terraform", ["-chdir=" + dir, "destroy", "-auto-approve"]);
  }

  getTerraformOutput(module: string, name: string): string {
    const dir = this.moduleDir(module);
    return this.shell("terraform", ["-chdir=" + dir, "output", "-raw", name]).stdout;
  }

  getKubernetesContext(): string {
    return this.shell("kubectl", ["config", "current-context"]).stdout;
  }

  getFailedPodLogs(namespace: string, jobName: string): string[] {
    const podsResult = this.shell("kubectl", [
      "get", "pods", "-n", namespace, "-l", `job-name=${jobName}`,
      "--field-selector", "status.phase=Failed", "-o", "jsonpath={.items[*].metadata.name}"
    ]);
    const pods = podsResult.stdout.split(/\s+/).filter(Boolean);
    return pods.map(pod => {
      const logs = this.shell("kubectl", ["logs", "-n", namespace, pod]);
      return `=== ${pod} ===\n${logs.stdout}`;
    });
  }

  computeAddress(mnemonic: string, index: number): string {
    return this.shell("cast", ["wallet", "address", "--mnemonic", mnemonic, "--mnemonic-index", String(index)]).stdout;
  }

  computePrivateKey(mnemonic: string, index: number): string {
    return this.shell("cast", ["wallet", "private-key", "--mnemonic", mnemonic, "--mnemonic-index", String(index)]).stdout;
  }

  writeBenchmark(path: string, data: unknown): void {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  }

  resolveSecret<T>(value: SecretValue<T>, secretName: string): T {
    if (!isGcpSecret(value)) {
      return value;
    }
    // Fetch from GCP Secret Manager
    const result = this.shell("gcloud", [
      "secrets", "versions", "access", "latest",
      "--secret", secretName,
    ]);
    if (!result.ok) {
      throw new Error(`Failed to fetch secret: ${secretName}`);
    }
    // Parse JSON if it looks like JSON, otherwise return as string
    const secretValue = result.stdout;
    try {
      return JSON.parse(secretValue) as T;
    } catch {
      return secretValue as T;
    }
  }
}

/** Plan executor - records operations instead of executing */
export class PlanExecutor implements Executor {
  operations: string[] = [];
  terraformApplies: { module: string; vars: TerraformVars }[] = [];
  terraformDestroys: string[] = [];

  log(message: string): void {
    this.operations.push(`LOG: ${message}`);
  }

  ensureNamespace(namespace: string): void {
    this.operations.push(`KUBECTL: create namespace ${namespace}`);
  }

  deleteNamespace(namespace: string): void {
    this.operations.push(`KUBECTL: delete namespace ${namespace}`);
  }

  applyTerraform(module: string, vars: TerraformVars, cluster: string, namespace: string): void {
    this.operations.push(`TERRAFORM APPLY: ${module} (cluster=${cluster}, namespace=${namespace})`);
    this.terraformApplies.push({ module, vars });
  }

  destroyTerraform(module: string, cluster: string, namespace: string): void {
    this.operations.push(`TERRAFORM DESTROY: ${module} (cluster=${cluster}, namespace=${namespace})`);
    this.terraformDestroys.push(module);
  }

  getTerraformOutput(_module: string, name: string): string {
    return `<output:${name}>`;
  }

  getKubernetesContext(): string {
    return "<k8s-context>";
  }

  getFailedPodLogs(_namespace: string, _jobName: string): string[] {
    return [];
  }

  computeAddress(_mnemonic: string, index: number): string {
    return `0x${index.toString(16).padStart(40, "0")}`;
  }

  computePrivateKey(_mnemonic: string, index: number): string {
    return `0x${index.toString(16).padStart(64, "0")}`;
  }

  writeBenchmark(path: string, _data: unknown): void {
    this.operations.push(`WRITE: ${path}`);
  }

  resolveSecret<T>(value: SecretValue<T>, secretName: string): T {
    if (!isGcpSecret(value)) {
      return value;
    }
    this.operations.push(`RESOLVE SECRET: ${secretName}`);
    // Return placeholder value - for arrays return array with placeholder, for strings return placeholder string
    // We use a heuristic: if the secret name suggests it's an array (contains 'urls', 'keys', 'headers'), return array
    const isArraySecret = /urls|keys|headers/i.test(secretName);
    if (isArraySecret) {
      return [`<secret:${secretName}>`] as T;
    }
    return `<secret:${secretName}>` as T;
  }

  printPlan(): void {
    console.log(JSON.stringify({
      operations: this.operations,
      terraformApplies: this.terraformApplies,
      terraformDestroys: this.terraformDestroys,
    }, null, 2));
  }
}
