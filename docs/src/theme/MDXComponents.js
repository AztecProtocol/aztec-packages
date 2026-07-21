import React from "react";
import MDXComponents from "@theme-original/MDXComponents";
import Version, { AztecPackagesVersion } from "@site/src/components/Version";
import CodeBlock from "@theme/CodeBlock";
import Card from '@site/src/components/TutorialCard';
import CardBody from '@site/src/components/TutorialCard/CardBody';
import CardFooter from '@site/src/components/TutorialCard/CardFooter';
import CardHeader from '@site/src/components/TutorialCard/CardHeader';
import CardImage from '@site/src/components/TutorialCard/CardImage';
import OperatorConfig from '@site/src/components/OperatorConfig';
import ConfigCode from '@site/src/components/OperatorConfig/ConfigCode';
import InlineCommand from '@site/src/components/OperatorConfig/InlineCommand';
import TrackPicker from '@site/src/components/OperatorConfig/TrackPicker';
import ForceStakeMode from '@site/src/components/OperatorConfig/ForceStakeMode';
import { IfChoice, IfNotChoice } from '@site/src/components/OperatorConfig/IfChoice';
import RecommendedVersion from '@site/src/components/OperatorConfig/RecommendedVersion';
import NetworkName from '@site/src/components/OperatorConfig/NetworkName';
import Count from '@site/src/components/OperatorConfig/Count';
import IfCount from '@site/src/components/OperatorConfig/IfCount';
import { EthTotal, AztecTotal, PublisherFundingCalculator } from '@site/src/components/OperatorConfig/Computed';
import ProverRewardClaimer from '@site/src/components/OperatorConfig/ProverRewardClaimer';

// https://docusaurus.io/docs/markdown-features/react#mdx-component-scope
export default {
  ...MDXComponents,
  Version,
  AztecPackagesVersion,
  CodeBlock,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardImage,
  OperatorConfig,
  ConfigCode,
  InlineCommand,
  TrackPicker,
  ForceStakeMode,
  IfChoice,
  IfNotChoice,
  RecommendedVersion,
  NetworkName,
  Count,
  IfCount,
  EthTotal,
  AztecTotal,
  PublisherFundingCalculator,
  ProverRewardClaimer,
};


