import * as core from "@actions/core";

import { DescribeLaunchTemplatesCommandInput, EC2 } from '@aws-sdk/client-ec2';
import { ActionConfig } from "./config";

// Main function to prune instances older than 2 weeks
async function pruneOldInstances(config: ActionConfig) {
  // Initialize EC2 client
if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
  core.setFailed("AWS credentials are missing");
  return;
}

const credentials = {
  accessKeyId: config.awsAccessKeyId,
  secretAccessKey: config.awsSecretAccessKey,
};

  const ec2 = new EC2({
    region: config.awsRegion,
    credentials,
  });
  try {
    // Fetch all instances
    const describeLaunchTemplatesCommand: DescribeLaunchTemplatesCommandInput = {
        Filters: [
            {
                Name: 'launch-template-name',
                Values: ['aztec-packages-spot*']
            }
        ]
    };
    core.info(`Searching for launch templates with params: ${JSON.stringify(describeLaunchTemplatesCommand, null, 2)}`);

    const response = await ec2.describeLaunchTemplates(describeLaunchTemplatesCommand);

    core.info(`Raw response contains ${response.LaunchTemplates?.length || 0} launch templates`);

    if (!response.LaunchTemplates || response.LaunchTemplates.length === 0) {
      core.info('No launch templates found. Please check:');
      core.info(`1. Region is correct: ${config.awsRegion}`);
      core.info('2. AWS credentials have correct permissions');
      return;
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.maxAgeInDays);

    // Find launch templates older than cutoff date
    const launchTemplatesToDelete = response.LaunchTemplates.filter(template => {
      if (!template.CreateTime) return false;
      const templateDate = new Date(template.CreateTime);
      return templateDate < cutoffDate;
    });

    core.info('\nLaunch Template Analysis:');
    core.info(`Total launch templates found: ${response.LaunchTemplates.length}`);
    core.info(`Cutoff date: ${cutoffDate.toISOString()}`);
    core.info(`Launch templates older than ${config.maxAgeInDays} days: ${launchTemplatesToDelete.length}`);

    // Log all found launch templates for debugging
    core.info('\nAll found launch templates:');
    response.LaunchTemplates.forEach(template => {
      core.info(`- ${template.LaunchTemplateId} | ${template.LaunchTemplateName} | Created: ${template.CreateTime}`);
    });

    if (launchTemplatesToDelete.length === 0) {
      core.info('\nNo launch templates old enough to delete.');
      return;
    }

    core.info('\nLaunch templates to be deleted:');
    for (const template of launchTemplatesToDelete) {
      core.info(`Processing launch template: ${template.LaunchTemplateId} (${template.LaunchTemplateName}) | Created: ${template.CreateTime}`);

      if (!config.dryRun) {
        if (template.LaunchTemplateId) {
          await ec2.deleteLaunchTemplate({
            LaunchTemplateId: template.LaunchTemplateId
          });
          core.info(`Deleted launch template: ${template.LaunchTemplateId}`);
        }
      } else {
        core.info(`[DRY RUN] Would have deleted launch template: ${template.LaunchTemplateId}`);
      }
    }
  } catch (error) {
    core.error("Error pruning instances:", error);
  }
}

// Run the script
(async function () {
  try {
    const config = new ActionConfig();
    await pruneOldInstances(config);
  } catch (error) {
    core.error(error.message);
    core.setFailed(error.message);
  }
})();

