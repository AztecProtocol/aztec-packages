// The packages config.json documents, and the npm names they are published under. A scope alone
// does not make a package one of these: `@aztec/viem` is a third-party fork.

const CONFIG = require("./config.json");

/** The documented packages, client SDKs first. */
const documentedPackages = (config = CONFIG) =>
  Object.values(config.packages)
    .flat()
    .filter((p) => p.status === "active");

/** The npm name of a documented package, e.g. `@aztec-labs/aztec.js`. */
const npmName = (name, config = CONFIG) => `${config.npm_scope}/${name}`;

/** Whether an npm package name is one of the documented packages. */
const isDocumentedPackage = (npmPackage, config = CONFIG) =>
  documentedPackages(config).some((p) => npmName(p.name, config) === npmPackage);

module.exports = { documentedPackages, isDocumentedPackage, npmName };
