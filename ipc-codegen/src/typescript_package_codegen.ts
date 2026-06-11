import { toSnakeCase } from "./naming.ts";

export interface TypeScriptPackageOptions {
  prefix: string;
  packageName: string;
  binaryName: string;
  binaryEnvVar: string;
  ipcRuntimeDependency: string;
  ipcPathArgs: string[];
  transports: string[];
}

function className(prefix: string): string {
  return `${prefix}Service`;
}

function transportType(prefix: string): string {
  return `${prefix}Transport`;
}

function optionsType(prefix: string): string {
  return `${prefix}ServiceOptions`;
}

function binaryFinderName(prefix: string): string {
  return `find${prefix}Binary`;
}

function envName(binaryName: string): string {
  return `${binaryName.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_PATH`;
}

function packageStem(packageName: string): string {
  return packageName.startsWith("@")
    ? packageName.split("/")[1]!
    : packageName;
}

function archPackageNames(packageName: string): Record<string, string> {
  return {
    "linux-x64": `${packageName}-linux-x64`,
    "darwin-x64": `${packageName}-darwin-x64`,
    "linux-arm64": `${packageName}-linux-arm64`,
    "darwin-arm64": `${packageName}-darwin-arm64`,
  };
}

const ARCH_PACKAGES = [
  { buildDir: "amd64-linux", suffix: "linux-x64", os: "linux", cpu: "x64" },
  { buildDir: "arm64-linux", suffix: "linux-arm64", os: "linux", cpu: "arm64" },
  { buildDir: "amd64-macos", suffix: "darwin-x64", os: "darwin", cpu: "x64" },
  { buildDir: "arm64-macos", suffix: "darwin-arm64", os: "darwin", cpu: "arm64" },
] as const;

export function defaultBinaryEnvVar(binaryName: string): string {
  return envName(binaryName);
}

export class TypeScriptPackageCodegen {
  constructor(private opts: TypeScriptPackageOptions) {}

  generatePackageJson(): string {
    const archPackages = archPackageNames(this.opts.packageName);
    const scripts: Record<string, string> = {
      clean: "rm -rf dest .tsbuildinfo",
      build: "tsc -p tsconfig.json",
      prepare_arch_packages: "./scripts/prepare_arch_packages.sh",
    };

    const pkg = {
      name: this.opts.packageName,
      version: "0.1.0",
      type: "module",
      exports: {
        ".": {
          types: "./dest/index.d.ts",
          default: "./dest/index.js",
        },
      },
      files: ["dest/", "README.md"],
      scripts,
      dependencies: {
        "@aztec/ipc-runtime": this.opts.ipcRuntimeDependency,
        msgpackr: "^1.11.2",
        tslib: "^2.4.0",
      },
      optionalDependencies: Object.fromEntries(
        Object.values(archPackages).map((packageName) => [packageName, "0.1.0"]),
      ),
      devDependencies: {
        "@types/node": "^22.15.17",
        typescript: "^5.3.3",
      },
    };
    return JSON.stringify(pkg, null, 2) + "\n";
  }

  generateArchPackageJson(suffix: string, os: string, cpu: string): string {
    const pkg = {
      name: `${this.opts.packageName}-${suffix}`,
      version: "0.1.0",
      description: `Native binary for ${this.opts.packageName} (${suffix})`,
      license: "MIT",
      os: [os],
      cpu: [cpu],
      files: [this.opts.binaryName],
      preferUnplugged: true,
    };
    return JSON.stringify(pkg, null, 2) + "\n";
  }

  generateArchPackageManifests(): Array<{ path: string; content: string }> {
    const stem = packageStem(this.opts.packageName);
    return ARCH_PACKAGES.map(({ suffix, os, cpu }) => ({
      path: `packages/${stem}-${suffix}/package.json`,
      content: this.generateArchPackageJson(suffix, os, cpu),
    }));
  }

  generateTsconfig(): string {
    return JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          declaration: true,
          declarationMap: true,
          composite: true,
          outDir: "dest",
          rootDir: "src",
          tsBuildInfoFile: ".tsbuildinfo",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n";
  }

  generateIndex(): string {
    const prefix = this.opts.prefix;
    const serviceClass = className(prefix);
    const serviceOptions = optionsType(prefix);
    const serviceTransport = transportType(prefix);
    const findBinary = binaryFinderName(prefix);
    const supportsShm = this.opts.transports.includes("shm");
    const transports = this.opts.transports.map((t) => `'${t}'`).join(" | ");
    const ipcPathArgs = JSON.stringify(this.opts.ipcPathArgs);
    const defaultTransport = this.opts.transports.includes("uds")
      ? "uds"
      : this.opts.transports[0]!;

    return `import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { threadId } from 'node:worker_threads';
import {
  ${supportsShm ? "createNapiShmAsyncClient,\n  " : ""}UdsIpcClient,
  type IpcClientAsync,
} from '@aztec/ipc-runtime';
import { AsyncApi, type IpcErrorFactory } from './generated/async.js';
import { ${findBinary} } from './platform.js';

export * from './generated/api_types.js';
export { AsyncApi } from './generated/async.js';

export type ${serviceTransport} = ${transports};

export interface ${serviceOptions} {
  binaryPath?: string;
  transport?: ${serviceTransport};
  logger?: (msg: string) => void;
  connectTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  extraArgs?: string[];
  createError?: IpcErrorFactory;
${supportsShm ? "  napiPath?: string;\n  clientId?: number;\n" : ""}}

let instanceCounter = 0;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

class SpawnedBackend implements IpcClientAsync {
  private constructor(
    private child: ChildProcess,
    private client: IpcClientAsync,
    private ipcPath: string,
    private transport: ${serviceTransport},
    private exitPromise: Promise<void>,
  ) {}

  static async spawn(options: ${serviceOptions} = {}): Promise<SpawnedBackend> {
    const binaryPath = ${findBinary}(options.binaryPath);
    if (!binaryPath) {
      throw new Error('${this.opts.binaryName} binary not found');
    }

    const transport = options.transport ?? '${defaultTransport}';
    const instanceId = '${toSnakeCase(prefix)}-' + process.pid + '-' + threadId + '-' + instanceCounter++;
    const ipcPath = transport === 'shm'
      ? instanceId + '.shm'
      : join(tmpdir(), instanceId + '.sock');

    if (transport === 'uds' && existsSync(ipcPath)) {
      unlinkSync(ipcPath);
    }

    const ipcPathArgs = ${ipcPathArgs}.map((arg: string) => arg === '{path}' ? ipcPath : arg);
    const child = spawn(binaryPath, [...ipcPathArgs, ...(options.extraArgs ?? [])], {
      stdio: ['ignore', options.logger ? 'pipe' : 'ignore', options.logger ? 'pipe' : 'ignore'],
      env: { ...process.env, ...(options.env ?? {}) },
    });

    if (options.logger) {
      child.stdout?.on('data', (data: Buffer) => options.logger?.('[${this.opts.binaryName} stdout] ' + data.toString().trimEnd()));
      child.stderr?.on('data', (data: Buffer) => options.logger?.('[${this.opts.binaryName} stderr] ' + data.toString().trimEnd()));
    }

    const exitPromise = new Promise<void>(resolve => {
      child.on('exit', () => resolve());
    });

    const childReadyFailure = new Promise<never>((_, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        reject(
          new Error('${this.opts.binaryName} exited before IPC connection was ready (code=' + code + ', signal=' + signal + ')'),
        );
      });
    });

    const client = await Promise.race([connectClient(child, ipcPath, transport, options), childReadyFailure]);
    return new SpawnedBackend(child, client, ipcPath, transport, exitPromise);
  }

  getIpcPath(): string {
    return this.ipcPath;
  }

  call(input: Uint8Array): Promise<Uint8Array> {
    return this.client.call(input);
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
    if (this.child.exitCode === null) {
      this.child.kill('SIGTERM');
    }
    await this.exitPromise;
    this.child.stdout?.destroy();
    this.child.stderr?.destroy();
    this.child.removeAllListeners();
    cleanupIpcPath(this.ipcPath, this.transport);
  }
}

async function connectClient(
  child: ChildProcess,
  ipcPath: string,
  transport: ${serviceTransport},
  options: ${serviceOptions},
): Promise<IpcClientAsync> {
  const timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    if (child.exitCode !== null) {
      throw new Error('${this.opts.binaryName} exited before IPC connection was ready');
    }
    try {
      if (transport === 'uds') {
        return await UdsIpcClient.connect(ipcPath, { connectTimeoutMs: Math.max(1, deadline - Date.now()) });
      }
${supportsShm ? `      if (transport === 'shm') {
        return createNapiShmAsyncClient(ipcPath.replace(/\\.shm$/, ''), {
          clientId: options.clientId ?? 0,
          customAddonPath: options.napiPath,
        });
      }
` : ""}      throw new Error('Unsupported transport: ' + transport);
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  throw new Error('Timed out connecting to ${this.opts.binaryName}: ' + (lastError instanceof Error ? lastError.message : String(lastError)));
}

function cleanupIpcPath(ipcPath: string, transport: ${serviceTransport}) {
  try {
    if (transport === 'uds' && existsSync(ipcPath)) {
      unlinkSync(ipcPath);
    }
    if (transport === 'shm') {
      const shmName = ipcPath.replace(/\\.shm$/, '');
      for (const suffix of ['_request', '_response']) {
        const shmPath = '/dev/shm/' + shmName + suffix;
        if (existsSync(shmPath)) {
          unlinkSync(shmPath);
        }
      }
    }
  } catch {}
}

export class ${serviceClass} extends AsyncApi {
  private constructor(private spawnedBackend: SpawnedBackend, createError?: IpcErrorFactory) {
    super(spawnedBackend, createError);
  }

  static async spawn(options: ${serviceOptions} = {}): Promise<${serviceClass}> {
    const backend = await SpawnedBackend.spawn(options);
    return new ${serviceClass}(backend, options.createError);
  }

  getIpcPath(): string {
    return this.spawnedBackend.getIpcPath();
  }
}
`;
  }

  generatePlatform(): string {
    const packageName = this.opts.packageName;
    const findBinary = binaryFinderName(this.opts.prefix);
    const envVar = this.opts.binaryEnvVar;
    const stem = packageStem(packageName);
    const archPackages = archPackageNames(packageName);

    return `import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Platform = 'x86_64-linux' | 'x86_64-darwin' | 'aarch64-linux' | 'aarch64-darwin';

const PLATFORM_TO_PACKAGE: Record<Platform, string> = {
  'x86_64-linux': '${archPackages["linux-x64"]}',
  'x86_64-darwin': '${archPackages["darwin-x64"]}',
  'aarch64-linux': '${archPackages["linux-arm64"]}',
  'aarch64-darwin': '${archPackages["darwin-arm64"]}',
};

function currentDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function detectPlatform(): Platform | null {
  if (process.arch === 'x64' && process.platform === 'linux') return 'x86_64-linux';
  if (process.arch === 'x64' && process.platform === 'darwin') return 'x86_64-darwin';
  if (process.arch === 'arm64' && process.platform === 'linux') return 'aarch64-linux';
  if (process.arch === 'arm64' && process.platform === 'darwin') return 'aarch64-darwin';
  return null;
}

function findArchPackageDir(platform: Platform): string | null {
  const packageName = PLATFORM_TO_PACKAGE[platform];
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve(packageName + '/package.json'));
  } catch {
    const siblingPackageDir = path.join(currentDir(), '..', 'packages', packageName.split('/').pop()!);
    return fs.existsSync(path.join(siblingPackageDir, 'package.json')) ? siblingPackageDir : null;
  }
}

export function ${findBinary}(customPath?: string): string | null {
  if (customPath) {
    return fs.existsSync(customPath) ? path.resolve(customPath) : null;
  }

  const envPath = process.env.${envVar};
  if (envPath) {
    return fs.existsSync(envPath) ? path.resolve(envPath) : null;
  }

  const platform = detectPlatform();
  if (!platform) {
    return null;
  }

  const archDir = findArchPackageDir(platform);
  if (archDir) {
    const candidate = path.join(archDir, '${this.opts.binaryName}');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export const ARCH_PACKAGE_STEM = '${stem}';
`;
  }

  generatePrepareArchPackagesScript(): string {
    return `#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

declare -A PLATFORMS=(
${ARCH_PACKAGES.map(({ buildDir, suffix, os, cpu }) => `  ["${buildDir}"]="${suffix} ${os} ${cpu}"`).join("\n")}
)

version=$(node -p "require('./package.json').version")

declare -A BINARIES=()
for arg in "$@"; do
  case "$arg" in
    *=*)
      key="\${arg%%=*}"
      value="\${arg#*=}"
      BINARIES["$key"]="$value"
      ;;
    *)
      echo "Usage: npm run prepare_arch_packages -- [<platform>=<binary> ...]" >&2
      echo "Platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64" >&2
      exit 1
      ;;
  esac
done

for build_dir in "\${!PLATFORMS[@]}"; do
  read -r suffix os cpu <<< "\${PLATFORMS[$build_dir]}"
  pkg_name="${this.opts.packageName}-\${suffix}"
  out_dir="packages/${packageStem(this.opts.packageName)}-\${suffix}"
  binary_path="\${BINARIES[$suffix]:-\${BINARIES[$build_dir]:-}}"

  if [ -z "$binary_path" ]; then
    binary_path="build/\${build_dir}/${this.opts.binaryName}"
  fi

  if [ ! -f "$binary_path" ]; then
    echo "Skipping \${pkg_name}: no binary at \${binary_path}"
    continue
  fi

  rm -rf "\${out_dir}"
  mkdir -p "\${out_dir}"
  cp "$binary_path" "\${out_dir}/${this.opts.binaryName}"
  chmod +x "\${out_dir}/${this.opts.binaryName}" 2>/dev/null || true

  cat > "\${out_dir}/package.json" <<EOF
{
  "name": "\${pkg_name}",
  "version": "\${version}",
  "description": "Native binary for ${this.opts.packageName} (\${suffix})",
  "license": "MIT",
  "os": ["\${os}"],
  "cpu": ["\${cpu}"],
  "files": ["${this.opts.binaryName}"],
  "preferUnplugged": true
}
EOF
done
`;
  }

  generateReadme(): string {
    return `# ${this.opts.packageName}

Generated TypeScript IPC package for the ${this.opts.prefix} service.

\`\`\`ts
import { ${className(this.opts.prefix)} } from '${this.opts.packageName}';

const service = await ${className(this.opts.prefix)}.spawn({ transport: 'uds' });
try {
  const response = await service.bytes({ data: new Uint8Array([1, 2, 3]) });
} finally {
  await service.destroy();
}
\`\`\`

The package resolves \`${this.opts.binaryName}\` from \`${this.opts.binaryEnvVar}\`,
an explicit \`binaryPath\`, or an installed/prepared arch package.

## Build

\`\`\`sh
npm install --omit=optional
npm run build
\`\`\`

To prepare per-architecture binary packages:

\`\`\`sh
npm run prepare_arch_packages -- linux-x64=/path/to/${this.opts.binaryName}
\`\`\`
`;
  }
}
