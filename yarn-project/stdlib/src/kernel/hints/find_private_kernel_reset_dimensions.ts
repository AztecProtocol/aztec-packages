import {
  PrivateKernelResetDimensions,
  type PrivateKernelResetDimensionsConfig,
  type ResetCatalogEntry,
  privateKernelResetDimensionNames,
} from '../private_kernel_reset_dimensions.js';

interface DimensionOption {
  dimensions: PrivateKernelResetDimensions;
  cost: number;
  remainder?: PrivateKernelResetDimensions;
}

function getSize(dimensions: PrivateKernelResetDimensions) {
  return privateKernelResetDimensionNames.reduce((accum, name) => accum + dimensions[name], 0);
}

function getRemainder(
  requestedDimensions: PrivateKernelResetDimensions,
  foundDimensions: PrivateKernelResetDimensions,
) {
  const remainder = PrivateKernelResetDimensions.empty();
  let remainingDimensions = 0;
  privateKernelResetDimensionNames.forEach(name => {
    if (requestedDimensions[name] > foundDimensions[name]) {
      remainingDimensions++;
      remainder[name] = requestedDimensions[name] - foundDimensions[name];
    }
  });
  return remainingDimensions ? remainder : undefined;
}

// Returns the cheapest option that fully covers the request, or the option with the smallest
// remainder if none do. Caller must pass a non-empty list.
function pickBestOption(options: DimensionOption[]): DimensionOption {
  const fullCoverage = options.filter(opt => !opt.remainder);
  if (fullCoverage.length) {
    return fullCoverage.reduce((prev, curr) => (curr.cost < prev.cost ? curr : prev));
  }
  return options.reduce((prev, curr) => (getSize(curr.remainder!) < getSize(prev.remainder!) ? curr : prev));
}

function buildOption(entry: ResetCatalogEntry, requestedDimensions: PrivateKernelResetDimensions): DimensionOption {
  const dimensions = PrivateKernelResetDimensions.fromValues(entry.dimensions);
  return {
    dimensions,
    cost: entry.cost,
    remainder: getRemainder(requestedDimensions, dimensions),
  };
}

/**
 * Picks which catalog group the selector should search. Mid-tx resets go to `inner` (no
 * siloing); terminal kernels go to `finalTail` or `finalTailToPublic`, depending on whether
 * the tx has public function calls.
 */
export type ResetDimensionsMode = 'inner' | 'finalTail' | 'finalTailToPublic';

export function findPrivateKernelResetDimensions(
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
  mode: ResetDimensionsMode,
  allowRemainder = false,
) {
  const catalog = config[mode];
  const options = catalog
    .map(entry => buildOption(entry, requestedDimensions))
    .filter(option => allowRemainder || !option.remainder);

  if (!options.length) {
    throw new Error(`Cannot find an option for dimension: ${requestedDimensions.toValues()}`);
  }

  return pickBestOption(options).dimensions;
}
