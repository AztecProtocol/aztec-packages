// Usage: node unravel_struct.js abi.json PrivateCircuitPublicInputs

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

if (process.argv.length < 4) {
  console.error("Usage: node unravel_struct.js <abi.json> <StructName>");
  process.exit(1);
}

const abi = JSON.parse(fs.readFileSync(process.argv[2]));
const targetShortName = process.argv[3];

// TODO: traverse the abi beyond just the params and return values.
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

console.log(struct);

if (!struct) {
  console.error(`Struct '${targetShortName}' not found in ABI parameters.`);
  process.exit(1);
}

// Include the outer struct in the output
const result = `${struct.name}: ${unravelStruct(struct.type ?? struct.abi_type)};`;
console.log(result);
