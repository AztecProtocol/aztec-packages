import { ContractAbi } from '@aztec/foundation/abi';

import fs from 'fs';
import path from 'path';

const dataDirectory = path.join(process.cwd(), 'noir-contracts');

/**
 * Reads all JSON files in the `noir-contracts` subdirectory and returns them as an array.
 * There should only be one - TODO: make this more robust.
 * @returns An array of JSON data.
 */
function getAllJsonData(): ContractAbi[] {
  // Consider using a more specific type than `any` if you know the structure of your JSON data
  const fileNames = fs.readdirSync(dataDirectory);

  const allData = fileNames
    .filter(fileName => /\.json$/.test(fileName))
    .map(fileName => {
      const fullPath = path.join(dataDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');

      return JSON.parse(fileContents);
    });

  return allData;
}

/**
 * Simple api route that returns all ABI JSON found in the noir-contracts/ subdirectory.
 * @param req - the request object
 * @param res - the response object
 */
export default function handler(req, res) {
  res.status(200).json(getAllJsonData());
}
