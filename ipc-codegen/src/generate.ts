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
 * Run with no arguments for the full flag reference.
 *
 * Zero npm dependencies — runs with Node.js 22+ via --experimental-strip-types.
 */

import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "fs";
import { execSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  SchemaVisitor,
  friendlyToPositional,
  isFriendlySchema,
  stripJsonc,
  type CompiledSchema,
} from "./schema_visitor.ts";
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

function usage(): never {
  console.error(`Usage: generate.ts --schema <file> --lang <lang> --out <dir> [flags]

Required:
  --schema <file>    JSON schema file
  --lang <lang>      Target language (ts, rust, zig, cpp)
  --out <dir>        Output directory

Optional:
  --server                 Generate server dispatch
  --client                 Generate client
  --package <dir>          Generate a TS package shell around a spawned IPC service (ts only)
  --package-name <name>    TS package name for --package
  --binary-name <name>     Native service binary name for --package
  --binary-env-var <name>  Env var overriding the binary path for --package
  --package-transports <t> Comma-separated transports for --package (uds,shm)
  --package-ipc-path-args <args>
                           Comma-separated binary args for IPC path; use {path}
  --ipc-runtime-dependency <spec>
                           package.json dependency spec for @aztec/ipc-runtime
  --prefix <str>           Type prefix (auto-detected when >= 2 commands share one)
  --strip-method-prefix    Strip the prefix from generated method names in all
                           languages (e.g. BbCircuitProve -> circuitProve)
  --uds                    Copy UDS backend templates (rust, zig only)
  --ffi                    Copy in-process FFI backend templates (rust, zig only)
  --cpp-namespace <ns>     C++ namespace (e.g. my::ns)
  --cpp-wire-namespace <ns> Wire types sub-namespace (default: wire)
  --cpp-include-dir <path> Include path for generated dir (e.g. myservice/generated)
  --curve-constants <path> Generate TS curve constants from JSON at <path>`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    schema: "",
    lang: "",
    out: "",
    prefix: "",
    server: false,
    client: false,
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
    const flag = argv[i];
    const takeValue = (): string => {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        console.error(`Flag ${flag} requires a value`);
        process.exit(1);
      }
      return value;
    };
    switch (flag) {
      case "--schema":
        args.schema = takeValue();
        break;
      case "--lang":
        args.lang = takeValue();
        break;
      case "--out":
        args.out = takeValue();
        break;
      case "--prefix":
        args.prefix = takeValue();
        break;
      case "--server":
        args.server = true;
        break;
      case "--client":
        args.client = true;
        break;
      case "--package":
        args.packageDir = takeValue();
        break;
      case "--package-name":
        args.packageName = takeValue();
        break;
      case "--binary-name":
        args.binaryName = takeValue();
        break;
      case "--binary-env-var":
        args.binaryEnvVar = takeValue();
        break;
      case "--package-transports":
        args.packageTransports = takeValue();
        break;
      case "--package-ipc-path-args":
        args.packageIpcPathArgs = takeValue();
        break;
      case "--ipc-runtime-dependency":
        args.ipcRuntimeDependency = takeValue();
        break;
      case "--cpp-namespace":
        args.cppNamespace = takeValue();
        break;
      case "--cpp-wire-namespace":
        args.cppWireNamespace = takeValue();
        break;
      case "--cpp-include-dir":
        args.cppIncludeDir = takeValue();
        break;
      case "--uds":
        args.uds = true;
        break;
      case "--ffi":
        args.ffi = true;
        break;
      case "--curve-constants":
        args.curveConstants = takeValue();
        break;
      case "--strip-method-prefix":
        args.stripMethodPrefix = true;
        break;
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  if (!args.schema || !args.lang || !args.out) {
    usage();
  }
  if (args.packageDir && args.lang !== "ts") {
    console.error(`--package is only supported for --lang ts`);
    process.exit(1);
  }
  if ((args.uds || args.ffi) && args.lang !== "rust" && args.lang !== "zig") {
    console.error(
      `--uds/--ffi copy backend templates and only apply to rust and zig; ` +
        `ts and cpp consume transports from ipc-runtime directly`,
    );
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
  service?: string;
} {
  const rawJson = readFileSync(schemaPath, "utf-8").trim();
  const parsed = JSON.parse(stripJsonc(rawJson));
  let commandsUnion: any;
  let responsesUnion: any;
  let service: string | undefined;
  if (isFriendlySchema(parsed)) {
    ({
      commands: commandsUnion,
      responses: responsesUnion,
      service,
    } = friendlyToPositional(parsed));
  } else {
    commandsUnion = parsed.commands;
    responsesUnion = parsed.responses;
  }
  const visitor = new SchemaVisitor();
  const compiled = visitor.visit(commandsUnion, responsesUnion);
  const schemaHash = computeSchemaHash(rawJson);
  return { compiled, schemaHash, service };
}

/** Detect common prefix from command names (e.g. WsdbGetTreeInfo, WsdbCreateFork → Wsdb) */
function detectPrefix(compiled: CompiledSchema): string {
  const names = compiled.commands.map((c) => c.name);
  // With a single command the longest common prefix is the entire name and
  // stripping it would erase the method name; require an explicit --prefix.
  if (names.length < 2) return "";
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

  const { compiled, schemaHash, service } = loadSchema(absSchema);
  // Friendly schemas fold the type prefix and method-prefix stripping into
  // `service`: generated type names are `service + command`, method names are
  // the bare command. Positional schemas keep the legacy --prefix/--strip flags.
  const prefix = service || args.prefix || detectPrefix(compiled);
  const stripMethodPrefix = service ? true : args.stripMethodPrefix;

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
        stripMethodPrefix: stripMethodPrefix ? prefix : undefined,
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
        if (binaryName) {
          writePackage("src/bin.ts", packageGen.generateBin());
        }
        for (const manifest of packageGen.generateArchPackageManifests()) {
          writePackage(manifest.path, manifest.content);
        }
        writePackage(
          "scripts/prepare_arch_packages.sh",
          packageGen.generatePrepareArchPackagesScript(),
          { executable: true },
        );
      }
      break;
    }
    case "rust": {
      const gen = new RustCodegen({
        prefix,
        stripMethodPrefix: stripMethodPrefix,
      });
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
      // Backend templates (force-overwritten on regeneration). The `Backend` trait
      // and `IpcError` type stay shared; ipc-runtime is consumed via the
      // separate `ipc-runtime` crate.
      if (args.uds || args.ffi) {
        copyTemplate("rust", "backend.rs", absOut);
        copyTemplate("rust", "error.rs", absOut);
      }
      if (args.ffi) {
        copyTemplate("rust", "ffi_backend.rs", absOut);
      }
      break;
    }
    case "zig": {
      const gen = new ZigCodegen({
        prefix,
        clientName: `${prefix}Client`,
        stripMethodPrefix: stripMethodPrefix,
      });
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
        copyTemplate("zig", "backend.zig", absOut);
      }
      if (args.ffi) {
        copyTemplate("zig", "ffi_backend.zig", absOut);
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
        stripMethodPrefix: stripMethodPrefix,
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
  const path = join(outputDir, "curve_constants.ts");
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, path);
  console.log(`  ${path}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
generate(args);
