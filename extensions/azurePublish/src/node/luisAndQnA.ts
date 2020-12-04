// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as path from 'path';
import { promisify } from 'util';

import * as fs from 'fs-extra';
import * as rp from 'request-promise';
import { ILuisConfig, FileInfo, IQnAConfig, IBotProject } from '@botframework-composer/types';

import { BotProjectDeployLoggerType } from './types';

const readdir: any = promisify(fs.readdir);

const botPath = (projPath: string) => path.join(projPath, 'ComposerDialogs')

type QnaConfigType = {
  subscriptionKey: string;
  qnaRegion: string | 'westus';
};

type Resources = {
  luResources: string[];
  qnaResources: string[];
}

type BuildSettingType = {
  luis: ILuisConfig,
  qna: QnaConfigType
} & Resources

function getAccount(accounts: any, filter: string) {
  for (const account of accounts) {
    if (account.AccountName === filter) {
      return account;
    }
  }
}

/**
* return an array of all the files in a given directory
* @param dir
*/
async function getFiles(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}

export async function publishLuisToPrediction(
  name: string,
  environment: string,
  accessToken: string,
  luisSettings: ILuisConfig,
  luisResource: string,
  path: string,
  logger
  ) {
    let { authoringKey: luisAuthoringKey, endpoint: luisEndpoint, authoringRegion: luisAuthoringRegion } = luisSettings;

    if (!luisSettings.endpoint) {
      luisEndpoint = `https://${luisAuthoringRegion}.api.cognitive.microsoft.com`;
    }

    // Find any files that contain the name 'luis.settings' in them
    // These are generated by the LuBuild process and placed in the generated folder
    // These contain dialog-to-luis app id mapping
    const luisConfigFiles = (await getFiles(botPath(path))).filter((filename) =>
      filename.includes('luis.settings')
    );
    const luisAppIds: any = {};

    // Read in all the luis app id mappings
    for (const luisConfigFile of luisConfigFiles) {
      const luisSettings = await fs.readJson(luisConfigFile);
      Object.assign(luisAppIds, luisSettings.luis);
    }

    if(!Object.keys(luisAppIds).length) return luisAppIds;
    logger({
      status: BotProjectDeployLoggerType.DEPLOY_INFO,
      message: 'start publish luis',
    });

    // In order for the bot to use the LUIS models, we need to assign a LUIS key to the endpoint of each app
    // First step is to get a list of all the accounts available based on the given luisAuthoringKey.
    let accountList;
    try {
      // Make a call to the azureaccounts api
      // DOCS HERE: https://westus.dev.cognitive.microsoft.com/docs/services/5890b47c39e2bb17b84a55ff/operations/5be313cec181ae720aa2b26c
      // This returns a list of azure account information objects with AzureSubscriptionID, ResourceGroup, AccountName for each.
      const getAccountUri = `${luisEndpoint}/luis/api/v2.0/azureaccounts`;
      const options = {
        headers: { Authorization: `Bearer ${accessToken}`, 'Ocp-Apim-Subscription-Key': luisAuthoringKey },
      } as rp.RequestPromiseOptions;
      const response = await rp.get(getAccountUri, options);

      // this should include an array of account info objects
      accountList = JSON.parse(response);
    } catch (err) {
      // handle the token invalid
      const error = JSON.parse(err.error);
      if (error?.error?.message && error?.error?.message.indexOf('access token expiry') > 0) {
        throw new Error(
          `Type: ${error?.error?.code}, Message: ${error?.error?.message}, run az account get-access-token, then replace the accessToken in your configuration`
        );
      } else {
        throw err;
      }
    }
    // Extract the accoutn object that matches the expected resource name.
    // This is the name that would appear in the azure portal associated with the luis endpoint key.
    const account = getAccount(accountList, luisResource ? luisResource : `${name}-${environment}-luis`);

    // Assign the appropriate account to each of the applicable LUIS apps for this bot.
    // DOCS HERE: https://westus.dev.cognitive.microsoft.com/docs/services/5890b47c39e2bb17b84a55ff/operations/5be32228e8473de116325515
    for (const dialogKey in luisAppIds) {
      const luisAppId = luisAppIds[dialogKey].appId;
      logger({
        status: BotProjectDeployLoggerType.DEPLOY_INFO,
        message: `Assigning to luis app id: ${luisAppId}`,
      });

      const luisAssignEndpoint = `${luisEndpoint}/luis/api/v2.0/apps/${luisAppId}/azureaccounts`;
      const options = {
        body: account,
        json: true,
        headers: { Authorization: `Bearer ${accessToken}`, 'Ocp-Apim-Subscription-Key': luisAuthoringKey },
      } as rp.RequestPromiseOptions;
      await rp.post(luisAssignEndpoint, options);
    }

    // The process has now completed.
    logger({
      status: BotProjectDeployLoggerType.DEPLOY_INFO,
      message: 'Luis Publish Success! ...',
    });

    // return the new settings that need to be added to the main settings file.
    return luisAppIds;
}

export async function build(project: IBotProject, path: string, settings: BuildSettingType) {
  const {luResources, qnaResources, luis: luisConfig, qna: qnaConfig} = settings;

  const {builder, files} = project;

  const luFiles: FileInfo[] = [];
  luResources.forEach((id) => {
    const fileName = `${id}.lu`;
    const f = files.get(fileName);
    if (f) {
      luFiles.push(f);
    }
  });
  const qnaFiles: FileInfo[] = [];
  qnaResources.forEach((id) => {
    const fileName = `${id}.qna`;
    const f = files.get(fileName);
    if (f) {
      qnaFiles.push(f);
    }
  });

  builder.rootDir = botPath(path);
  builder.setBuildConfig( {...luisConfig, ...qnaConfig},  project.settings.downsampling );
  await builder.build(luFiles, qnaFiles, Array.from(files.values()) as FileInfo[]);
  await builder.copyModelPathToBot();
}