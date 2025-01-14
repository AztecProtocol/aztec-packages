export const formatAddressAsString = (addressAsString: string) => {
  return `${addressAsString.slice(0, 4)}...${addressAsString.slice(-4)}`;
};

const convertAztecAddressFromUTF8BufferAsString = (bufferAsString: string) => {
  return String.fromCharCode(...bufferAsString.split(",").map((x) => +x));
};

export const parseAliasedAddresses = (
  aliasedAddreses: { key: string; value: string }[]
) => {
  return aliasedAddreses
    .filter((account) => account.key !== "accounts:last")
    .map(({ key, value }) => ({
      key,
      value: convertAztecAddressFromUTF8BufferAsString(value),
    }));
};
