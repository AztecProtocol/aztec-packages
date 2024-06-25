import React, { useContext, useEffect, useState } from "react";
import { TestContext } from "../../theme/Root";
import PropTypes from "prop-types";

export const Test = ({ replaceLines, file, hidden, compare, children }) => {
  const { getNewId } = useContext(TestContext);
  const id = getNewId();

  return (
    <span
      data-testid={id}
      data-replacelines={replaceLines}
      data-file={file}
      data-compare={compare}
      style={hidden && { display: "none" }}
    >
      {children}
    </span>
  );
};

Test.propTypes = {
  replaceLines: PropTypes.string,
  file: PropTypes.string,
  children: PropTypes.node.isRequired,
};
