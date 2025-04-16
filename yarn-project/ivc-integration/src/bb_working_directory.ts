import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function getWorkingDirectory(prefix: string): Promise<string> {
  const baseFolder = process.env.BB_WORKING_DIRECTORY || os.tmpdir();
  await fs.mkdir(baseFolder, { recursive: true });
  return await fs.mkdtemp(path.join(baseFolder, prefix));
}
