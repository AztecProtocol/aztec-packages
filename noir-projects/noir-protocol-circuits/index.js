const toml = require("toml");
const fs = require("fs");

const nargoTomlTemplate = toml.parse(
  fs.readFileSync("./Nargo.template.toml", "utf8")
);

function generateResetVariants() {
  const resetVariants = require("./reset_variants.json");
}

const entriesToAdd = generateResetVariants();
for (entry of entriesToAdd) {
  nargoTomlTemplate.workspace.members.push(entry);
}

fs.writeFileSync("./Nargo.toml", toml.stringify(nargoTomlTemplate));
