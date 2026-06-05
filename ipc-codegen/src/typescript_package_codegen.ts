import { toSnakeCase } from "./naming.ts";

export interface TypeScriptPackageOptions {
  prefix: string;
  packageName: string;
  binaryName: string;
  binaryEnvVar: string;
  ipcRuntimeDependency: string;
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

export function defaultBinaryEnvVar(binaryName: string): string {
  return envName(binaryName);
}

export class TypeScriptPackageCodegen {
  constructor(private opts: TypeScriptPackageOptions) {}

  generatePackageJson(): string {
    const optionalDependencies = Object.fromEntries(
      Object.values(archPackageNames(this.opts.packageName)).map((name) => [
        name,
        "0.1.0",
      ]),
    );
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
      files: ["dest/", "build/", "README.md"],
      scripts: {
        clean: "rm -rf dest tsconfig.tsbuildinfo",
        build: "tsc -p tsconfig.json",
        test: "tsx src/package_test.ts",
        prepare_arch_packages: "./scripts/prepare_arch_packages.sh",
      },
      dependencies: {
        "@aztec/ipc-runtime": this.opts.ipcRuntimeDependency,
        msgpackr: "^1.10.0",
        tslib: "^2.4.0",
      },
      optionalDependencies,
      devDependencies: {
        "@types/node": "^22.15.17",
        tsx: "^4.19.0",
        typescript: "^5.3.3",
      },
    };
    return JSON.stringify(pkg, null, 2) + "\n";
  }

  generateTsconfig(): string {
    return JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          declaration: true,
          outDir: "dest",
          rootDir: "src",
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

    const child = spawn(binaryPath, ['--socket', ipcPath, ...(options.extraArgs ?? [])], {
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

    const client = await connectClient(child, ipcPath, transport, options);
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
  const timeoutMs = options.connectTimeoutMs ?? 5000;
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

const PLATFORM_TO_BUILD_DIR: Record<Platform, string> = {
  'x86_64-linux': 'amd64-linux',
  'x86_64-darwin': 'amd64-macos',
  'aarch64-linux': 'arm64-linux',
  'aarch64-darwin': 'arm64-macos',
};

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

function findPackageRoot(): string | null {
  let dir = currentDir();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      if (fs.existsSync(path.join(dir, 'build')) || fs.existsSync(path.join(dir, 'dest'))) {
        return dir;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

function findArchPackageDir(platform: Platform): string | null {
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve(PLATFORM_TO_PACKAGE[platform] + '/package.json'));
  } catch {
    return null;
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

  const packageRoot = findPackageRoot();
  if (!packageRoot) {
    return null;
  }

  const localCandidate = path.join(packageRoot, 'build', PLATFORM_TO_BUILD_DIR[platform], '${this.opts.binaryName}');
  return fs.existsSync(localCandidate) ? localCandidate : null;
}

export const ARCH_PACKAGE_STEM = '${stem}';
`;
  }

  generatePrepareArchPackagesScript(): string {
    return `#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

declare -A PLATFORMS=(
  ["amd64-linux"]="linux-x64 linux x64"
  ["arm64-linux"]="linux-arm64 linux arm64"
  ["amd64-macos"]="darwin-x64 darwin x64"
  ["arm64-macos"]="darwin-arm64 darwin arm64"
)

version=$(node -p "require('./package.json').version")

for build_dir in "\${!PLATFORMS[@]}"; do
  read -r suffix os cpu <<< "\${PLATFORMS[$build_dir]}"
  pkg_name="${this.opts.packageName}-\${suffix}"
  out_dir="packages/${packageStem(this.opts.packageName)}-\${suffix}"

  if [ ! -d "build/\${build_dir}" ]; then
    echo "Skipping \${pkg_name}: no build/\${build_dir} directory"
    continue
  fi

  rm -rf "\${out_dir}"
  mkdir -p "\${out_dir}"
  cp "build/\${build_dir}/${this.opts.binaryName}" "\${out_dir}/${this.opts.binaryName}"

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
an installed arch package, or \`build/<platform>/${this.opts.binaryName}\`.

## Build

\`\`\`sh
npm install --omit=optional
npm run build
\`\`\`

To prepare per-architecture binary packages from local \`build/<platform>\`
directories:

\`\`\`sh
npm run prepare_arch_packages
\`\`\`
`;
  }
}
