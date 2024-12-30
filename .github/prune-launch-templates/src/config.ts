import * as core from "@actions/core";

export interface ConfigInterface {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  awsIamRoleArn: string;
  awsAssumeRole: boolean;

  maxAgeInDays: number;
  dryRun?: boolean;
}

export class ActionConfig implements ConfigInterface {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  awsIamRoleArn: string;
  awsAssumeRole: boolean;

  maxAgeInDays: number;
  dryRun?: boolean;

  constructor() {
    // AWS account and credentials params
    this.awsAccessKeyId = core.getInput("aws_access_key_id");
    this.awsSecretAccessKey = core.getInput("aws_secret_access_key");
    this.awsRegion = core.getInput("aws_region");
    this.awsIamRoleArn = core.getInput("aws_iam_role_arn");
    this.awsAssumeRole = this.awsIamRoleArn ? true : false;

    const maxAge = +core.getInput("max_age_in_days");
    if (isNaN(maxAge) || maxAge < 0) {
      throw new Error("max_age_in_days must be a non-negative number");
    }
    this.maxAgeInDays = maxAge;
    this.dryRun = core.getInput("dry_run") === "true";
  }
}
