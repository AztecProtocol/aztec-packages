// heavily inspired by https://github.com/trufflesuite/truffle/blob/develop/packages/box/lib/utils/unbox.ts
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import * as fs from 'fs';


function getGlobalNpmPath(): string {
    try {
        const npmGlobalDirectory = execSync('npm root -g', { encoding: 'utf8' }).trim();
        return npmGlobalDirectory;
    } catch (error) {
        console.error('Error fetching global npm directory:', error);
        return '';
    }
}


function copyFolderRecursive(source: string, target: string) {
    // Check if folder needs to be created or integrated
    const targetFolder = resolve(target, '..', source.split('/').slice(-1)[0]);
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
    }

    // Copy each file inside the folder
    if (fs.lstatSync(source).isDirectory()) {
        fs.readdirSync(source).forEach(file => {
            const curSource = join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursive(curSource, targetFolder);
            } else {
                fs.copyFileSync(curSource, join(targetFolder, file));
            }
        });
    }
}


// Example usage:
// copyFolderFromGlobalPackage('your-package-name', 'path/to/source/folder');
// i think we can leave destination blank to copy to current working directory
function copyFolderFromGlobalPackage(packageName: string, sourceFolder: string, destination: string = process.cwd()) {
    const globalNpmPath = getGlobalNpmPath();

    if (!globalNpmPath) {
        console.error('Could not determine the global npm path.');
        return;
    }

    const packagePath = join(globalNpmPath, packageName);
    const sourceFolderPath = join(packagePath, sourceFolder);

    try {
        copyFolderRecursive(sourceFolderPath, destination);
        console.log(`Folder copied from ${sourceFolderPath} to ${destination}`);
    } catch (error) {
        console.error('Error copying folder:', error);
    }
}



// not sure if we need the temp part, think we can grab from the install directory directly
// but temp would be needed to support copying from a branch
async function copyTempIntoDestination(
    tmpDir: string,
    destination: string,
  ) {
    fse.ensureDirSync(destination);
    const boxContents = fse.readdirSync(tmpDir);
    const destinationContents = fse.readdirSync(destination);
  
    const newContents = boxContents.filter(
      filename => !destinationContents.includes(filename)
    );
  
    const contentCollisions = boxContents.filter(filename =>
      destinationContents.includes(filename)
    );
  
    let shouldCopy;
    if (force) {
      shouldCopy = boxContents;
    } else {
      shouldCopy = [...newContents];
    }
    copyFolderFromGlobalPackage('@aztec/cli', 'node_modules/@aztec/noir-contracts/{contract_here}');
  
    for (const file of shouldCopy) {
      fse.copySync(`${tmpDir}/${file}`, `${destination}/${file}`);
    }
  }
