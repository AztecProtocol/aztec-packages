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

function computeCost(dimensions: PrivateKernelResetDimensions, config: PrivateKernelResetDimensionsConfig) {
  return privateKernelResetDimensionNames.reduce(
    (accum, name) => accum + dimensions[name] * config.dimensions[name].cost,
    0,
  );
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

function pickCheapest(options: DimensionOption[]) {
  return options.reduce((prev, curr) => (curr.cost < prev.cost ? curr : prev), options[0]);
}

function pickSmallestRemainder(options: DimensionOption[]) {
  const optionsWithSize = options
    .filter(o => o.remainder)
    .map(option => ({ option, size: getSize(option.remainder!) }));
  return optionsWithSize.reduce((prev, curr) => (curr.size < prev.size ? curr : prev), optionsWithSize[0])?.option;
}

function pickBestOption(options: DimensionOption[]) {
  const optionsResetAll = options.filter(opt => !opt.remainder);
  const optionsResetPartial = options.filter(opt => opt.remainder);
  // The best option is the cheapest one that can reset all dimensions.
  // If no such option exists, find one that can reset the most data.
  return pickCheapest(optionsResetAll) || pickSmallestRemainder(optionsResetPartial);
}

function buildOption(
  entry: ResetCatalogEntry,
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
): DimensionOption {
  const dimensions = PrivateKernelResetDimensions.fromValues(entry.dimensions);
  return {
    dimensions,
    cost: computeCost(dimensions, config),
    remainder: getRemainder(requestedDimensions, dimensions),
  };
}

export function findPrivateKernelResetDimensions(
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
  isInner = false,
  allowRemainder = false,
) {
  const catalog = isInner ? config.inner : config.final;
  const options = catalog
    .map(entry => buildOption(entry, requestedDimensions, config))
    .filter(option => allowRemainder || !option.remainder);

  if (!options.length) {
    throw new Error(`Cannot find an option for dimension: ${requestedDimensions.toValues()}`);
  }

  return pickBestOption(options)!.dimensions;
}
