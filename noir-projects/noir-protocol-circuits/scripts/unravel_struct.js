// Usage:
//   node scripts/unravel_struct.js target/rollup_tx_base_private.json PrivateTxBaseRollupPrivateInputs
//   node scripts/unravel_struct.js target/rollup_tx_base_private.json --all <-- all params and returns.

// Many protocol structs are huge, and span lots of files. That's fine. But sometimes
// humans like me want to read those structs in one go, when auditing.

const fs = require("fs");

function formatType(type) {
  if (type.kind === "field") return "Field";
  if (type.kind === "boolean") return "bool";
  if (type.kind === "integer")
    return `${type.sign === "unsigned" ? "u" : "i"}${type.width}`;
  if (type.kind === "struct") return type.path.split("::").pop();
  return type.kind;
}

INDENT_SIZE = 4;

function unravelStruct(type, indent = INDENT_SIZE) {
  const pad = " ".repeat(indent);
  const parent_pad = " ".repeat(indent - INDENT_SIZE);
  const child_pad = " ".repeat(indent + INDENT_SIZE);
  const name = type.path ? type.path.split("::").pop() : "";

  if (type.kind !== "struct") return formatType(type);

  let out = `${name} {\n`;
  for (const field of type.fields) {
    const fieldName = field.name;
    const fieldType = field.type;

    if (fieldType.kind === "array") {
      // If the field is an array of structs, unravel it
      const arrayLength = fieldType.length;
      append = `${pad}${fieldName}: [\n${child_pad}${unravelStruct(fieldType.type, indent + 2*INDENT_SIZE)};\n${child_pad}${arrayLength},\n${pad}],\n`;
      out += append;
    } else if (fieldType.kind === "struct") {
      out += `${pad}${fieldName}: ${unravelStruct(fieldType, indent + INDENT_SIZE)},\n`;
    } else {
      out += `${pad}${fieldName}: ${formatType(fieldType)},\n`;
    }
  }
  out += `${parent_pad}}`;
  return out;
}

// --- Entry Point ---
if (process.argv.length < 3) {
  console.error("Usage: node unravel_struct.js <abi.json> [<StructName> | --all]");
  process.exit(1);
}

const abiPath = process.argv[2];
const abi = JSON.parse(fs.readFileSync(abiPath));
const targetArg = process.argv[3];

// --- Handle --all ---
if (targetArg === "--all") {
  // const seen = new Set();

  const structs = [];
  const basic_types = [];

  // Input parameters
  for (const param of abi.abi.parameters || []) {
    if (param.type.kind === "struct") {
      const structName = param.type.path.split("::").pop();
      structs.push({ name: param.name, structName, type: param.type });
    } else {
      basic_types.push({ name: param.name, type: param.type.kind});
    }
  }

  // Return type
  const returnType = abi.abi.return_type?.abi_type;
  if (returnType && returnType.kind === "struct") {
    const structName = returnType.path.split("::").pop();
    structs.push({ name: returnType.name, structName, type: returnType });
  }

  if (structs.length === 0 && basic_types.length === 0) {
    console.error("No structs or types found in parameters or return type.");
    process.exit(1);
  }

  for (const t of basic_types) {
    console.log(`${t.name}: ${t.type};\n`);
  }

  for (const s of structs) {
    console.log(`${s.name}: ${unravelStruct(s.type)};\n`);
  }

  process.exit(0);
}

// --- Lookup by name ---
const targetShortName = targetArg;

let struct = abi.abi.parameters.find(p => {
  return (
    p.type.kind === "struct" &&
    p.type.path &&
    p.type.path.split("::").pop() === targetShortName
  );
});

if (!struct) {
  struct = [abi.abi.return_type].find(r => {
    return (
      r.abi_type.kind === "struct" &&
      r.abi_type.path &&
      r.abi_type.path.split("::").pop() === targetShortName
    );
  });
}

if (!struct) {
  console.error(`Struct '${targetShortName}' not found in ABI parameters or return type.`);
  process.exit(1);
}

const result = `${struct.name}: ${unravelStruct(struct.type ?? struct.abi_type)};`;
console.log(result);
