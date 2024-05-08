const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const getLineNumberFromIndex = (fileContent, index) => {
  return fileContent.substring(0, index).split('\n').length;
};

/**
 * Parse a code file, looking for identifiers of the form:
 * `fg:start:${identifier}` and `fg:end:{identifier}`.
 * Extract that section of code.
 */
function extractCodeSnippet(fileContent, filePath, identifier) {
  const startRegex = /println\("fg::start::([a-zA-Z0-9-._:]+)/g; // `g` will iterate through the regex.exec loop
  const endRegex = /println\("fg::end::([a-zA-Z0-9-._:]+)/g;

  /**
   * Search for one of the regex statements in the code file. If it's found, return the line as a string and the line number.
   */
  const lookForMatch = regex => {
    let match;
    let matchFound = false;
    let matchedLineNum = null;
    let actualMatch = null;
    while ((match = regex.exec(fileContent))) {
      if (match !== null) {
        const identifiers = match[1].split('::');
        let tempMatch = identifiers.includes(identifier) ? match : null;

        if (tempMatch === null) {
          // Wrong identifier, do nothing.
        } else {
          if (matchFound === true) {
            throw new Error(`Duplicate for regex ${regex} and identifier ${identifier}`);
          }
          matchFound = true;
          matchedLineNum = getLineNumberFromIndex(fileContent, tempMatch.index);
          actualMatch = tempMatch;
        }
      }
    }

    return [actualMatch, matchedLineNum];
  };

  let [startMatch, startLineNum] = lookForMatch(startRegex);
  let [endMatch, endLineNum] = lookForMatch(endRegex);

  // Double-check that the extracted line actually contains the required start and end identifier.
  if (startMatch !== null) {
    const startIdentifiers = startMatch[1].split('::');
    startMatch = startIdentifiers.includes(identifier) ? startMatch : null;
  }
  if (endMatch !== null) {
    const endIdentifiers = endMatch[1].split('::');
    endMatch = endIdentifiers.includes(identifier) ? endMatch : null;
  }

  if (startMatch === null || endMatch === null) {
    if (startMatch === null && endMatch === null) {
      throw new Error(`Identifier "${identifier}" not found in file "${filePath}"`);
    } else if (startMatch === null) {
      throw new Error(`Start line "fg:start:${identifier}" not found in file "${filePath}"`);
    } else {
      throw new Error(`End line "fg:end:${identifier}" not found in file "${filePath}"`);
    }
  }

  let lines = fileContent.split('\n');

  // Remove lines from the snippet which fall outside the `docs:start` and `docs:end` values.
  lines = lines.filter((l, i) => {
    return i + 1 > startLineNum && i + 1 < endLineNum; // lines are indexed from 1
  });

  // We have our code snippet!
  let codeSnippet = lines.join('\n');

  return [codeSnippet, startLineNum, endLineNum];
}

function modifyFileToCommentOutCodeBlock(fileContent, snippet) {
  let { codeSnippet, startLineNum, endLineNum } = snippet;
  let codeSnippetLines = codeSnippet.split('\n');

  const replaceWithRegex = /^\s*\/\/ fg::replace_with:.*$/m;
  // const replacementRegex = /^(?!\s*\/\/ fg::replace_with:)[ \t\f\v]*\/\/.*$/gm;
  // const commentOutRegex = /^(?!\s*\/\/)(?=\s*\S).*$/gm;

  if (!replaceWithRegex.test(codeSnippetLines[0])) {
    throw new Error(`Expected code snippet ${codeSnippet} to start with "  // fg::replace_with:". Yes, it's janky.`);
  }

  let uncommentLine = line => {
    return line.trim().startsWith('//') ? line.replace(/^\s*\/\/\s*/, '') : line;
  };

  let commentOutLine = line => {
    return !line.trim().startsWith('//') ? '// ' + line.trim() : line;
  };

  let inReplacementSection = true;
  let modifiedCodeSnippetLines = codeSnippetLines;

  // We loop from _after_ the "fg::replace_with" line:
  for (let i = 1; i < codeSnippetLines.length; i++) {
    const line = codeSnippetLines[i];
    inReplacementSection &&= line.trim().startsWith('//');
    modifiedCodeSnippetLines[i] = inReplacementSection ? uncommentLine(line) : commentOutLine(line);
  }

  let modifiedFileLines = fileContent.split('\n');

  let j = 1;
  // Lines index from 1
  for (let i = startLineNum; i < endLineNum; i++) {
    modifiedFileLines[i] = modifiedCodeSnippetLines[j];
    ++j;
  }

  modifiedFileContent = modifiedFileLines.join('\n');

  return modifiedFileContent;
}

function extractCodeSnippetsAndModifyFileContents(noirFileContent, filePath, identifiersForThisFile, modifiedFileData) {
  let snippets = [];

  for (identifier of identifiersForThisFile) {
    const [codeSnippet, startLineNum, endLineNum] = extractCodeSnippet(noirFileContent, filePath, identifier);

    const snippet = {
      codeSnippet,
      startLineNum: startLineNum + 1, // ignore the "start" delineator
      endLineNum: endLineNum - 1, // ignore the "end" delineator
    };

    snippets.push(snippet);

    const modifiedFileContent = modifyFileToCommentOutCodeBlock(noirFileContent, snippet);

    modifiedFileData.push({
      filePath,
      identifier,
      modifiedFileContent,
    });
  }
}

function processFiles(cratesDir, filePaths, trace) {
  // let writePromises = [];
  let modifiedFileData = [];

  for (const filePath of filePaths) {
    const fullFilePath = path.join(cratesDir, filePath);

    const stat = fs.statSync(fullFilePath);

    if (stat.isFile() && fullFilePath.endsWith('.nr')) {
      const noirFileContent = fs.readFileSync(fullFilePath, 'utf-8');

      let identifiersForThisFile = trace.filter(item => item.filePath === filePath).map(item => item.identifier);

      if (identifiersForThisFile.length === 0) {
        throw new Error("Something's gone wrong; we shouldn't have got this far.");
      }
      // make them unique:
      identifiersForThisFile = [...new Set(identifiersForThisFile)];

      extractCodeSnippetsAndModifyFileContents(noirFileContent, filePath, identifiersForThisFile, modifiedFileData);

      // writePromises.push(writeProcessedFile(destDir, filePath, modifiedFileContent));
    } else {
      throw new Error("Something's wrong with the filepaths that were printed in your noir file.");
    }
  }

  return modifiedFileData;
}

// returns a promise
async function writeFile(filePath, fileContent) {
  return fs.promises.writeFile(filePath, fileContent, {
    encoding: 'utf8',
    flag: 'w', // overwrite
  });
}

function writeFileSync(filePath, fileContent) {
  fs.writeFileSync(filePath, fileContent, {
    encoding: 'utf8',
    flag: 'w', // overwrite
  });
}

function runShellCommand(command) {
  const execSync = require('child_process').execSync;
  const output = execSync(command, { encoding: 'utf-8' }); // the default is 'buffer'
  // console.log(`CMD:\n${command}:\n`);
  // console.log(output);
  return output;
}

function printLines(circuitPackageName, relPathToCircuitWorkspaceDir) {
  const nargo = '../../noir/noir-repo/target/release/nargo';

  // We only want to run the test with name "test_fg", otherwise our janky reading of the output lines won't work.
  const nargo_command = `${nargo} test --silence-warnings --show-output --package ${circuitPackageName} --exact test_fg`;

  runShellCommand(`export NARGO_BACKEND_PATH=~/packages/barretenberg/cpp/build/bin/bb`);
  const output = runShellCommand(`cd ${relPathToCircuitWorkspaceDir} && ${nargo_command}`);

  // The nargo test command should return printlns of the form:
  // `fn::in::some/file/path`.
  // Let's extract those lines and remove duplicates:
  const lines = output.split('\n');

  return lines;
}

function getPertinentFilePaths(lines) {
  const pertinentFilePaths = lines.filter(l => l.startsWith('fg::in::')).map(l => l.replace('fg::in::', ''));

  const unique = [...new Set(pertinentFilePaths)];

  return unique;
}

function createTrace(lines) {
  let prev = '';
  let trace = [];
  let depth = 0;
  for (let l of lines) {
    if (prev.startsWith('fg::in::')) {
      if (!l.startsWith('fg::start::')) {
        throw new Error(
          `Expected the printed line '${prev}' to be followed by a printed line which starts 'fg::start::'. Yes, it's janky.`,
        );
      }
      // So the printed line starts with "fg::start". Let's record its identifier.
      let identifier = l.replace('fg::start::', '');
      let filePath = prev.replace('fg::in::', '');
      trace.push({
        identifier,
        filePath,
        depth,
      });

      depth++;
    } else if (l.startsWith('fg::end::')) {
      // TODO: we would ensure there aren't dangling `fg::end` lines, if we wanted to.
      depth--;
    }

    prev = l;
  }

  return trace;
}

function extractBackendCircuitSize(table) {
  // Find the index of the 'Backend Circuit Size' column
  const headerRow = table[1];
  const headerCells = headerRow.split('|').map(cell => cell.trim());
  const backendCircuitSizeIndex = headerCells.indexOf('Backend Circuit Size');

  let backendCircuitSizes = [];

  // If the header exists, proceed to extract the value
  if (backendCircuitSizeIndex !== -1) {
    // Iterate through each row to find the value in the specified column
    for (let i = 3; i < table.length; i += 2) {
      // Start from index 2 to skip header and separator
      const row = table[i];
      const cells = row.split('|').map(cell => cell.trim());

      // Extract the value from the specified column
      const backendCircuitSize = cells[backendCircuitSizeIndex];

      // If the value is not empty, return it
      if (backendCircuitSize) {
        backendCircuitSizes.push(parseInt(backendCircuitSize));
      }
    }
  }

  return backendCircuitSizes;
}

function noirInfo(circuitPackageName, relPathToDestWorkspaceDir) {
  const nargo = '../../../noir/noir-repo/target/release/nargo';

  // We only want to run the test with name "test_fg", otherwise our janky reading of the output lines won't work.
  const nargo_command = `${nargo} info --silence-warnings --package ${circuitPackageName}`;

  runShellCommand(`export NARGO_BACKEND_PATH=~/packages/barretenberg/cpp/build/bin/bb`);
  const output = runShellCommand(`cd ${relPathToDestWorkspaceDir} && ${nargo_command}`);

  // The nargo test command should return info about the circuit.
  // Let's extract those lines and remove duplicates:
  const lines = output.split('\n');

  return lines;
}

function getConstraintCountsForModifiedFiles(
  packageName,
  modifiedFileData,
  destWorkspaceDir,
  relPathToDestWorkspaceDir,
) {
  const destCratesDir = path.join(destWorkspaceDir, 'crates');

  console.log(`\nMeasuring original circuit ${packageName}`);
  let originalTable = noirInfo(packageName, relPathToDestWorkspaceDir);
  let originalBackendCircuitSize = extractBackendCircuitSize(originalTable)[0];

  let summary = [
    {
      packageName,
      size: originalBackendCircuitSize,
    },
  ];

  modifiedFileData.forEach(datum => {
    console.log(`\nMeasuring modified circuit for id ${datum.identifier}`);

    const fullFilePath = path.join(destCratesDir, datum.filePath);
    const originalFileContent = fs.readFileSync(fullFilePath, 'utf-8');
    writeFileSync(fullFilePath, datum.modifiedFileContent);

    let table = noirInfo(packageName, relPathToDestWorkspaceDir);

    let backendCircuitSize = extractBackendCircuitSize(table)[0];
    // console.log(backendCircuitSize);

    approxSnippetSize = originalBackendCircuitSize - backendCircuitSize;

    summary.push({
      filePath: datum.filePath,
      identifier: datum.identifier,
      approxSize: approxSnippetSize,
    });

    // Revert to the original, so as to not skew other results:
    writeFileSync(fullFilePath, originalFileContent);
  });

  return summary;
}

async function run() {
  // should be abs path to noir-protocol-circuits-janky-flamegraph/
  const pwd = runShellCommand('pwd').trim();
  const rootDir = path.join(pwd, '../../');
  const circuitWorkspaceDir = path.join(rootDir, 'noir-projects', 'noir-protocol-circuits');
  const relPathToCircuitWorkspaceDir = path.relative(pwd, circuitWorkspaceDir);
  const cratesDir = path.join(circuitWorkspaceDir, 'crates');
  const destWorkspaceDir = path.join(pwd, 'dest');
  const relPathToDestWorkspaceDir = path.relative(pwd, destWorkspaceDir);

  if (!fs.existsSync(destWorkspaceDir)) {
    fs.mkdirSync(destWorkspaceDir, { recursive: true });
  }

  fs.cpSync(circuitWorkspaceDir, destWorkspaceDir, { recursive: true, force: true });
  // TODO: could instead use fs-extra to specify files to _not_ copy over in the first place.
  const destTargetDir = path.join(destWorkspaceDir, 'target');
  if (fs.existsSync(destTargetDir)) {
    fs.rmSync(destTargetDir, { recursive: true });
  }

  for (const packageName of circuitPackageNames) {
    const lines = printLines(packageName, relPathToCircuitWorkspaceDir);
    const pertinentFilePaths = getPertinentFilePaths(lines);
    let trace = createTrace(lines);

    const modifiedFileData = processFiles(cratesDir, pertinentFilePaths, trace);

    const summary = getConstraintCountsForModifiedFiles(
      packageName,
      modifiedFileData,
      destWorkspaceDir,
      relPathToDestWorkspaceDir,
    );

    console.log('\n\n\nSUMMARY:');
    console.log(
      "Note: the `approxSize` field shows the _cumulative_ cost of that section of code, if it's called multiple times; not just the cost of a single call to that section of code.\n\n",
    );
    console.log(summary);
  }
}

// CONFIGURE THIS TO INCLUDE ALL THE PROTOCOL CIRCUITS YOU WANT TO MEASURE!!!
// Notice: use underscores; not dashes, as per the package's Nargo.toml.
const circuitPackageNames = ['rollup_merge'];

run();
