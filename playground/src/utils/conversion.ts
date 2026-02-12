export const formatFrAsString = (addressAsString: string, sliceLength: number = 4) => {
  return `${addressAsString.slice(0, sliceLength + 2)}...${addressAsString.slice(-sliceLength)}`;
};
