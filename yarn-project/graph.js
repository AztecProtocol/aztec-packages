#!/usr/bin/env node

// Outputs a Mermaid graph of the workspace dependencies.

const fs = require('fs');
const path = require('path');

/**
 * Scans the "packages" folder for subdirectories containing a package.json,
 * and returns an object mapping package names to their directory and an empty deps array.
 */
function getWorkspacePackages() {
  const packagesDir = path.resolve(process.cwd(), '.');
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(packagesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(packagesDir, dirent.name));
  } catch (err) {
    console.error(`Error reading packages directory: ${err.message}`);
    process.exit(1);
  }

  const packages = {}; // { packageName: { dir: string, deps: [] } }
  dirs.forEach(dir => {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (!pkgJson.name) {
          console.error(`Package in ${dir} does not have a name. Skipping.`);
          return;
        }
        packages[pkgJson.name] = {
          dir,
          deps: [], // Will be populated in the next step.
        };
      } catch (err) {
        console.error(`Error reading ${pkgJsonPath}: ${err.message}`);
      }
    }
  });

  return packages;
}

/**
 * Extracts workspace dependencies from a package.json object.
 * It looks in both "dependencies" and "devDependencies" and selects only those
 * whose version string starts with "workspace:" and are part of the workspace.
 */
function extractWorkspaceDependencies(pkgJson, workspacePackagesSet) {
  const workspaceDeps = [];
  const deps = Object.assign({}, pkgJson.dependencies || {}, pkgJson.devDependencies || {});
  for (const [dep, version] of Object.entries(deps)) {
    if (typeof version === 'string' && version.startsWith('workspace:')) {
      if (workspacePackagesSet.has(dep)) {
        workspaceDeps.push(dep);
      }
    }
  }
  return workspaceDeps;
}

/**
 * For each workspace package, read its package.json to extract its workspace dependencies.
 */
function buildDependencyMap(packages) {
  const workspacePackageNames = new Set(Object.keys(packages));
  for (const [pkgName, pkgInfo] of Object.entries(packages)) {
    const pkgJsonPath = path.join(pkgInfo.dir, 'package.json');
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const wsDeps = extractWorkspaceDependencies(pkgJson, workspacePackageNames);
      pkgInfo.deps = wsDeps;
    } catch (err) {
      console.error(`Error processing ${pkgJsonPath}: ${err.message}`);
    }
  }
  return packages;
}

function pkgToId(str) {
  return str.replace(/@aztec\//g, '').replace(/-/g, '_');
}

/**
 * Generates a Mermaid graph (in TD orientation) with each package as a single node.
 * Each dependency relation is output as an edge.
 */
function generateMermaidGraph(packages) {
  // Use a Set to track unique edges.
  const edgesSet = new Set();
  const lines = [];
  lines.push('graph TD');

  // Declare each package as a node.
  Object.keys(packages)
    .sort()
    .forEach(pkg => {
      // The node is declared with its label.
      lines.push(`  ${pkgToId(pkg)}["${pkg}"]`);
    });

  // Add edges based on workspace dependencies.
  Object.entries(packages).forEach(([pkgName, pkgInfo]) => {
    pkgInfo.deps.forEach(dep => {
      const edge = `${pkgToId(pkgName)} --> ${pkgToId(dep)}`;
      if (!edgesSet.has(edge)) {
        edgesSet.add(edge);
        lines.push(`  ${edge}`);
      }
    });
  });

  return lines.join('\n');
}

/**
 * Main function: gathers the workspace packages, builds the dependency map,
 * then outputs the Mermaid graph.
 */
function main() {
  const packages = getWorkspacePackages();
  buildDependencyMap(packages);
  const mermaidGraph = generateMermaidGraph(packages);
  console.log(mermaidGraph);
}

main();
