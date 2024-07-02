import React, { useContext, useEffect, useState } from "react";
import { TestContext } from "../../theme/Root";
import PropTypes from "prop-types";

export const Test = ({
  mode,
  at,
  begin,
  end,
  file,
  hidden,
  compare,
  children,
}) => {
  const { getNewId } = useContext(TestContext);
  const id = getNewId();

  return (
    <span
      data-testid={id}
      data-mode={mode}
      data-at={at}
      data-begin={begin}
      data-end={end}
      data-file={file}
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
