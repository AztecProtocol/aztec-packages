import { readdir, stat } from 'fs/promises';

const TARGET_DIR = 'target';

export async function contractArtifactFromWorkspace(pkg?: string, contractName?: string) {
  const cwd = process.cwd();
  await stat(`${cwd}/Nargo.toml`);
  const filesInTarget = await readdir(`${cwd}/${TARGET_DIR}`);
  const bestMatch = filesInTarget.filter(
    file => file.endsWith('.json') && file.includes(pkg || '') && file.includes(contractName || ''),
  );
  if (bestMatch.length === 0) {
    throw new Error('No contract artifacts found in target directory with the specified criteria');
  } else if (bestMatch.length > 1) {
    throw new Error(
      `Multiple contract artifacts found in target directory with the specified criteria ${bestMatch.join(', ')}`,
    );
  }
  return `${cwd}/${TARGET_DIR}/${bestMatch[0]}`;
}
