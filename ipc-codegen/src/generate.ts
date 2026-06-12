// CI trigger
/**
 * IPC code generation CLI.
 *
 * Usage:
 *   generate.ts --schema <file> --lang <ts|rust|zig|cpp> --out <dir> [flags]
 *
 * Required:
 *   --schema <file>    JSON schema file
 *   --lang <lang>      Target language
 *   --out <dir>        Output directory for always-regenerated code
 *
 * Optional:
 *   --prefix <str>           Type prefix (auto-detected if omitted)
 *   --server                 Generate server dispatch
 *   --client                 Generate client
 *   --skeleton <dir>         Generate handler stubs + main (one-time, not regenerated)
 *   --package <dir>          Generate a TS package shell around a spawned IPC service
 *   --cpp-namespace <ns>     C++ namespace (e.g. my::service)
 *   --cpp-wire-namespace <ns> Wire types sub-namespace (default: wire)
 *   --curve-constants <path> Generate TS curve constants from JSON at <path>
 *
 * Zero npm dependencies — runs with Node.js 22+ via --experimental-strip-types.
 */

import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  cpSync,
  rmSync,
} from "fs";
import { execSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { SchemaVisitor, type CompiledSchema } from "./schema_visitor.ts";
import { TypeScriptCodegen } from "./typescript_codegen.ts";
import {
  defaultBinaryEnvVar,
  TypeScriptPackageCodegen,
} from "./typescript_package_codegen.ts";
import { RustCodegen } from "./rust_codegen.ts";
import { ZigCodegen } from "./zig_codegen.ts";
import { CppCodegen } from "./cpp_codegen.ts";
import { toSnakeCase } from "./naming.ts";

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  schema: string;
  lang: string;
  out: string;
  prefix: string;
  server: boolean;
  client: boolean;
  skeleton: string;
  packageDir: string;
  packageName: string;
  binaryName: string;
  binaryEnvVar: string;
  packageTransports: string;
  packageIpcPathArgs: string;
  ipcRuntimeDependency: string;
  cppNamespace: string;
  cppWireNamespace: string;
  cppIncludeDir: string;
  uds: boolean;
  ffi: boolean;
  curveConstants: string;
  stripMethodPrefix: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    schema: "",
    lang: "",
    out: "",
    prefix: "",
    server: false,
    client: false,
    skeleton: "",
    packageDir: "",
    packageName: "",
    binaryName: "",
    binaryEnvVar: "",
    packageTransports: "uds",
    packageIpcPathArgs: "--socket,{path}",
    ipcRuntimeDependency: "@aztec/ipc-runtime",
    cppNamespace: "",
    cppWireNamespace: "wire",
    cppIncludeDir: "",
    uds: false,
    ffi: false,
    curveConstants: "",
    stripMethodPrefix: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--schema":
        args.schema = argv[++i];
        break;
      case "--lang":
        args.lang = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "--prefix":
        args.prefix = argv[++i];
        break;
      case "--server":
        args.server = true;
        break;
      case "--client":
        args.client = true;
        break;
      case "--skeleton":
        args.skeleton = argv[++i];
        break;
      case "--package":
        args.packageDir = argv[++i];
        break;
      case "--package-name":
        args.packageName = argv[++i];
        break;
      case "--binary-name":
        args.binaryName = argv[++i];
        break;
      case "--binary-env-var":
        args.binaryEnvVar = argv[++i];
        break;
      case "--package-transports":
        args.packageTransports = argv[++i];
        break;
      case "--package-ipc-path-args":
        args.packageIpcPathArgs = argv[++i];
        break;
      case "--ipc-runtime-dependency":
        args.ipcRuntimeDependency = argv[++i];
        break;
      case "--cpp-namespace":
        args.cppNamespace = argv[++i];
        break;
      case "--cpp-wire-namespace":
        args.cppWireNamespace = argv[++i];
        break;
      case "--cpp-include-dir":
        args.cppIncludeDir = argv[++i];
        break;
      case "--uds":
        args.uds = true;
        break;
      case "--ffi":
        args.ffi = true;
        break;
      case "--curve-constants":
        args.curveConstants = argv[++i];
        break;
      case "--strip-method-prefix":
        args.stripMethodPrefix = true;
        break;
      default:
        console.error(`Unknown flag: ${argv[i]}`);
        process.exit(1);
    }
  }

  if (!args.schema || !args.lang || !args.out) {
    console.error(`Usage: generate.ts --schema <file> --lang <lang> --out <dir> [flags]

Required:
  --schema <file>    JSON schema file
  --lang <lang>      Target language (ts, rust, zig, cpp)
  --out <dir>        Output directory

Optional:
  --server                 Generate server dispatch
  --client                 Generate client
  --skeleton <dir>         Generate handler stubs + main (one-time)
  --package <dir>          Generate a TS package shell around a spawned IPC service
  --package-name <name>    TS package name for --package
  --binary-name <name>     Native service binary name for --package
  --package-transports <t> Comma-separated transports for --package (uds,shm)
  --package-ipc-path-args <args>
                           Comma-separated binary args for IPC path; use {path}
  --prefix <str>           Type prefix (auto-detected if omitted)
  --cpp-namespace <ns>     C++ namespace (e.g. my::ns)
  --cpp-wire-namespace <ns> Wire types sub-namespace (default: wire)
  --cpp-include-dir <path> Include path for generated dir (e.g. myservice/generated)
  --curve-constants <path> Generate TS curve constants from JSON at <path>
  --strip-method-prefix    Strip prefix from TS method names (e.g. BbCircuitProve -> circuitProve)`);
    process.exit(1);
  }

  return args;
}

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

function computeSchemaHash(schemaJson: string): string {
  return createHash("sha256").update(schemaJson).digest("hex");
}

function loadSchema(schemaPath: string): {
  compiled: CompiledSchema;
  schemaHash: string;
} {
  const rawJson = readFileSync(schemaPath, "utf-8").trim();
  const schema = JSON.parse(rawJson);
  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(schema.commands, schema.responses);
  const schemaHash = computeSchemaHash(rawJson);
  return { compiled, schemaHash };
}

/** Detect common prefix from command names (e.g. WsdbGetTreeInfo, WsdbCreateFork → Wsdb) */
function detectPrefix(compiled: CompiledSchema): string {
  const names = compiled.commands.map((c) => c.name);
  if (names.length === 0) return "";
  let prefix = names[0];
  for (const name of names.slice(1)) {
    while (prefix && !name.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  const words = prefix.match(/[A-Z][a-z]*/g) || [];
  let result = "";
  for (const word of words) {
    const candidate = result + word;
    if (names.every((n) => n.startsWith(candidate))) {
      result = candidate;
    } else {
      break;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Template copying
// ---------------------------------------------------------------------------

function copyTemplate(lang: string, filename: string, outDir: string) {
  const templatePath = join(__dirname, "..", "templates", lang, filename);
  const destPath = join(outDir, filename);
  // Atomic write — see writeFile() above for the race this guards.
  const tmpPath = `${destPath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, readFileSync(templatePath, "utf-8"));
  renameSync(tmpPath, destPath);
  console.log(`  ${destPath} (template)`);
}

/** Copy template only if destination doesn't exist (idempotent, one-time) */
function copyTemplateOnce(lang: string, filename: string, outDir: string) {
  const destPath = join(outDir, filename);
  if (existsSync(destPath)) {
    console.log(`  ${destPath} (exists, skipped)`);
    return;
  }
  copyTemplate(lang, filename, outDir);
}

function copyTemplateDir(lang: string, dirname: string, outDir: string) {
  const templatePath = join(__dirname, "..", "templates", lang, dirname);
  const destPath = join(outDir, dirname);
  rmSync(destPath, { recursive: true, force: true });
  cpSync(templatePath, destPath, { recursive: true });
  console.log(`  ${destPath} (template)`);
}

// ---------------------------------------------------------------------------
// C++ clang-format
// ---------------------------------------------------------------------------

function formatCpp(files: string[]) {
  if (files.length === 0) return;
  try {
    execSync(`clang-format-20 -i ${files.join(" ")}`, { stdio: "ignore" });
  } catch {
    // clang-format-20 may not be available
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function generate(args: Args) {
  const absSchema = resolve(args.schema);
  const absOut = resolve(args.out);
  mkdirSync(absOut, { recursive: true });

  const { compiled, schemaHash } = loadSchema(absSchema);
  const prefix = args.prefix || detectPrefix(compiled);

  console.log(
    `Schema: ${absSchema} (${compiled.commands.length} commands, prefix=${prefix})`,
  );

  function writeFile(name: string, content: string) {
    const path = join(absOut, name);
    mkdirSync(dirname(path), { recursive: true });
    // Atomic write: write to a sibling tempfile then rename. Multiple build
    // trees can invoke this codegen concurrently against the same source-tree
    // output dir; non-atomic writeFileSync can leave a half-written file
    // visible to a parallel compiler include, showing up as embedded NUL bytes.
    const tmpPath = `${path}.${process.pid}.tmp`;
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, path);
    console.log(`  ${path}`);
    return path;
  }

  const cppFiles: string[] = [];

  switch (args.lang) {
    case "ts": {
      const gen = new TypeScriptCodegen({
        stripMethodPrefix: args.stripMethodPrefix ? prefix : undefined,
      });
      writeFile("api_types.ts", gen.generateTypes(compiled, schemaHash));
      if (args.server) {
        writeFile("server.ts", gen.generateServerApi(compiled));
        // No transport template copy — consumers import UdsIpcServer from
        // '@aztec/ipc-runtime' (or hand a compatible byte-handler in).
      }
      if (args.client || args.packageDir) {
        writeFile("async.ts", gen.generateAsyncApi(compiled));
        writeFile("sync.ts", gen.generateSyncApi(compiled));
        // No transport template copy — consumers import IpcClient from
        // '@aztec/ipc-runtime' (or hand in a compatible byte backend).
      }
      if (args.curveConstants) {
        generateCurveConstants(absOut, resolve(args.curveConstants));
      }
      if (args.packageDir) {
        const packageDir = resolve(args.packageDir);
        const binaryName =
          args.binaryName || toSnakeCase(prefix).replace(/_/g, "-");
        const packageName =
          args.packageName || `${toSnakeCase(prefix).replace(/_/g, "-")}-ipc`;
        const packageGen = new TypeScriptPackageCodegen({
          prefix,
          packageName,
          binaryName,
          binaryEnvVar: args.binaryEnvVar || defaultBinaryEnvVar(binaryName),
          ipcRuntimeDependency: args.ipcRuntimeDependency,
          transports: args.packageTransports
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          ipcPathArgs: args.packageIpcPathArgs
            .split(",")
            .map((arg) => arg.trim())
            .filter(Boolean),
        });
        const writePackage = (
          name: string,
          content: string,
          opts?: { executable?: boolean },
        ) => {
          const path = join(packageDir, name);
          mkdirSync(dirname(path), { recursive: true });
          const tmpPath = `${path}.${process.pid}.tmp`;
          writeFileSync(tmpPath, content);
          renameSync(tmpPath, path);
          if (opts?.executable) {
            try {
              execSync(`chmod +x ${path}`);
            } catch {}
          }
          console.log(`  ${path} (package)`);
        };
        writePackage("package.json", packageGen.generatePackageJson());
        writePackage("tsconfig.json", packageGen.generateTsconfig());
        writePackage("README.md", packageGen.generateReadme());
        writePackage("src/index.ts", packageGen.generateIndex());
        writePackage("src/platform.ts", packageGen.generatePlatform());
        for (const manifest of packageGen.generateArchPackageManifests()) {
          writePackage(manifest.path, manifest.content);
        }
        writePackage(
          "scripts/prepare_arch_packages.sh",
          packageGen.generatePrepareArchPackagesScript(),
          { executable: true },
        );
      }
      // Skeleton (one-time handler stubs + main + build files)
      if (args.skeleton) {
        const skelDir = resolve(args.skeleton);
        mkdirSync(skelDir, { recursive: true });
        const writeSkeleton = (
          name: string,
          content: string,
          opts?: { executable?: boolean },
        ) => {
          const path = join(skelDir, name);
          if (existsSync(path)) {
            console.log(`  ${path} (exists, skipped)`);
            return;
          }
          writeFileSync(path, content);
          if (opts?.executable) {
            try {
              execSync(`chmod +x ${path}`);
            } catch {}
          }
          console.log(`  ${path} (skeleton)`);
        };
        writeSkeleton(
          `${toSnakeCase(prefix)}_handlers.ts`,
          gen.generateHandlerStubs(compiled, prefix),
        );
        writeSkeleton("main.ts", gen.generateMain(compiled, prefix));
        writeSkeleton("package.json", gen.generateBuildFile(prefix));
        writeSkeleton(".gitignore", gen.generateGitignore());
        writeSkeleton(
          "generate.sh",
          gen.generateGenerateScript(args.schema, prefix),
          { executable: true },
        );
      }
      break;
    }
    case "rust": {
      const gen = new RustCodegen({ prefix });
      writeFile(
        `${toSnakeCase(prefix)}_types.rs`,
        gen.generateTypes(compiled, schemaHash),
      );
      if (args.server) {
        writeFile(
          `${toSnakeCase(prefix)}_server.rs`,
          gen.generateServer(compiled),
        );
      }
      if (args.client) {
        writeFile(
          `${toSnakeCase(prefix)}_client.rs`,
          gen.generateApi(compiled),
        );
      }
      // Backend templates (copied once, not overwritten). The `Backend` trait
      // and `IpcError` type stay shared; ipc-runtime is consumed via the
      // separate `ipc-runtime` crate.
      if (args.uds || args.ffi) {
        copyTemplateOnce("rust", "backend.rs", absOut);
        copyTemplateOnce("rust", "error.rs", absOut);
      }
      if (args.ffi) {
        copyTemplateOnce("rust", "ffi_backend.rs", absOut);
      }
      // Skeleton (one-time handler stubs + main + build files)
      if (args.skeleton) {
        const skelDir = resolve(args.skeleton);
        mkdirSync(skelDir, { recursive: true });
        const writeSkeleton = (
          name: string,
          content: string,
          opts?: { executable?: boolean },
        ) => {
          const path = join(skelDir, name);
          if (existsSync(path)) {
            console.log(`  ${path} (exists, skipped)`);
            return;
          }
          writeFileSync(path, content);
          if (opts?.executable) {
            try {
              execSync(`chmod +x ${path}`);
            } catch {}
          }
          console.log(`  ${path} (skeleton)`);
        };
        writeSkeleton(
          `${toSnakeCase(prefix)}_handlers.rs`,
          gen.generateHandlerStubs(compiled),
        );
        writeSkeleton("main.rs", gen.generateMain(compiled));
        writeSkeleton("Cargo.toml", gen.generateBuildFile(compiled));
        writeSkeleton(".gitignore", gen.generateGitignore());
        writeSkeleton("generate.sh", gen.generateGenerateScript(args.schema), {
          executable: true,
        });
      }
      break;
    }
    case "zig": {
      const gen = new ZigCodegen({ prefix, clientName: `${prefix}Client` });
      writeFile(
        `${toSnakeCase(prefix)}_types.zig`,
        gen.generateTypes(compiled, schemaHash),
      );
      if (args.server) {
        writeFile(
          `${toSnakeCase(prefix)}_server.zig`,
          gen.generateServer(compiled),
        );
        // No transport template copy — consumers wire @import("ipc_runtime")
        // (the Zig binding shipped from ipc-runtime/zig/) and use its
        // Server.fromPath / listen / run loop directly.
      }
      if (args.client) {
        writeFile(
          `${toSnakeCase(prefix)}_client.zig`,
          gen.generateClient(compiled),
        );
      }
      // Backend trait — keep so FFI consumers can plug in their own
      // implementation. ipc_runtime.Client satisfies the same contract,
      // so UDS/SHM consumers don't need a separate backend file.
      if (args.uds || args.ffi) {
        copyTemplateOnce("zig", "backend.zig", absOut);
      }
      if (args.ffi) {
        copyTemplateOnce("zig", "ffi_backend.zig", absOut);
      }
      // Skeleton (one-time handler stubs + main + build files)
      if (args.skeleton) {
        const skelDir = resolve(args.skeleton);
        mkdirSync(skelDir, { recursive: true });
        const writeSkeleton = (
          name: string,
          content: string,
          opts?: { executable?: boolean },
        ) => {
          const path = join(skelDir, name);
          if (existsSync(path)) {
            console.log(`  ${path} (exists, skipped)`);
            return;
          }
          writeFileSync(path, content);
          if (opts?.executable) {
            try {
              execSync(`chmod +x ${path}`);
            } catch {}
          }
          console.log(`  ${path} (skeleton)`);
        };
        writeSkeleton(
          `${toSnakeCase(prefix)}_handlers.zig`,
          gen.generateHandlerStubs(compiled),
        );
        writeSkeleton("main.zig", gen.generateMain(compiled));
        writeSkeleton("build.zig", gen.generateBuildFile(compiled));
        writeSkeleton("build.zig.zon", gen.generateBuildZon(compiled));
        writeSkeleton(".gitignore", gen.generateGitignore());
        writeSkeleton("generate.sh", gen.generateGenerateScript(args.schema), {
          executable: true,
        });
      }
      break;
    }
    case "cpp": {
      const ns = args.cppNamespace || prefix.toLowerCase();
      const wireNs = args.cppWireNamespace;
      const gen = new CppCodegen({
        namespace: ns,
        prefix,
        wireNamespace: wireNs,
        generatedIncludeDir: args.cppIncludeDir,
      });

      cppFiles.push(
        writeFile(
          `${toSnakeCase(prefix)}_types.hpp`,
          gen.generateStandaloneTypes(compiled),
        ),
      );
      copyTemplateDir("cpp", "ipc_codegen", absOut);
      if (args.server) {
        cppFiles.push(
          writeFile(
            `${toSnakeCase(prefix)}_dispatch.hpp`,
            gen.generateDispatchHeader(compiled),
          ),
        );
        cppFiles.push(
          writeFile(
            `${toSnakeCase(prefix)}_ipc_server.hpp`,
            gen.generateServerHeader(),
          ),
        );
      }
      if (args.client) {
        cppFiles.push(
          writeFile(
            `${toSnakeCase(prefix)}_ipc_client.hpp`,
            gen.generateHeader(compiled, schemaHash),
          ),
        );
        cppFiles.push(
          writeFile(
            `${toSnakeCase(prefix)}_ipc_client.cpp`,
            gen.generateImpl(compiled),
          ),
        );
      }

      // Skeleton (one-time handler stubs + main + build files)
      if (args.skeleton) {
        const skelDir = resolve(args.skeleton);
        mkdirSync(skelDir, { recursive: true });
        const writeSkeleton = (
          name: string,
          content: string,
          opts?: { executable?: boolean },
        ) => {
          const path = join(skelDir, name);
          if (existsSync(path)) {
            console.log(`  ${path} (exists, skipped)`);
            return;
          }
          writeFileSync(path, content);
          if (opts?.executable) {
            try {
              execSync(`chmod +x ${path}`);
            } catch {}
          }
          console.log(`  ${path} (skeleton)`);
          if (path.endsWith(".cpp") || path.endsWith(".hpp")) {
            cppFiles.push(path);
          }
        };
        writeSkeleton(
          `${toSnakeCase(prefix)}_handlers.cpp`,
          gen.generateHandlerStubs(compiled),
        );
        writeSkeleton("main.cpp", gen.generateMain(compiled));
        writeSkeleton("CMakeLists.txt", gen.generateBuildFile(compiled));
        writeSkeleton(".gitignore", gen.generateGitignore());
        writeSkeleton("generate.sh", gen.generateGenerateScript(args.schema), {
          executable: true,
        });
      }

      formatCpp(cppFiles);
      break;
    }
    default:
      console.error(
        `Unknown language: ${args.lang}. Available: ts, rust, zig, cpp`,
      );
      process.exit(1);
  }

  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Curve constants
// ---------------------------------------------------------------------------

function hexToBigInt(hex: string): bigint {
  return BigInt("0x" + hex);
}

function hexToByteList(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2)
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  return `new Uint8Array([${bytes.join(", ")}])`;
}

function serializeCoordinate(coord: string | string[]): string {
  return Array.isArray(coord)
    ? `[${coord.map((c) => hexToByteList(c)).join(", ")}]`
    : hexToByteList(coord);
}

function generateCurveConstants(outputDir: string, constantsPath: string) {
  const constants = JSON.parse(readFileSync(constantsPath, "utf-8"));
  const content = `// AUTOGENERATED FILE - DO NOT EDIT
export const BN254_FR_MODULUS = ${hexToBigInt(constants.bn254_fr_modulus)}n;
export const BN254_FQ_MODULUS = ${hexToBigInt(constants.bn254_fq_modulus)}n;
export const BN254_G1_GENERATOR = { x: ${serializeCoordinate(constants.bn254_g1_generator.x)}, y: ${serializeCoordinate(constants.bn254_g1_generator.y)} } as const;
export const BN254_G2_GENERATOR = { x: ${serializeCoordinate(constants.bn254_g2_generator.x)}, y: ${serializeCoordinate(constants.bn254_g2_generator.y)} } as const;
export const GRUMPKIN_FR_MODULUS = ${hexToBigInt(constants.grumpkin_fr_modulus)}n;
export const GRUMPKIN_FQ_MODULUS = ${hexToBigInt(constants.grumpkin_fq_modulus)}n;
export const GRUMPKIN_G1_GENERATOR = { x: ${serializeCoordinate(constants.grumpkin_g1_generator.x)}, y: ${serializeCoordinate(constants.grumpkin_g1_generator.y)} } as const;
export const SECP256K1_FR_MODULUS = ${hexToBigInt(constants.secp256k1_fr_modulus)}n;
export const SECP256K1_FQ_MODULUS = ${hexToBigInt(constants.secp256k1_fq_modulus)}n;
export const SECP256K1_G1_GENERATOR = { x: ${serializeCoordinate(constants.secp256k1_g1_generator.x)}, y: ${serializeCoordinate(constants.secp256k1_g1_generator.y)} } as const;
export const SECP256R1_FR_MODULUS = ${hexToBigInt(constants.secp256r1_fr_modulus)}n;
export const SECP256R1_FQ_MODULUS = ${hexToBigInt(constants.secp256r1_fq_modulus)}n;
export const SECP256R1_G1_GENERATOR = { x: ${serializeCoordinate(constants.secp256r1_g1_generator.x)}, y: ${serializeCoordinate(constants.secp256r1_g1_generator.y)} } as const;
`;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "curve_constants.ts"), content);
  console.log(`  ${join(outputDir, "curve_constants.ts")}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
generate(args);
