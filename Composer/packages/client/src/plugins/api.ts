// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AuthParameters } from '@botframework-composer/types';

import { AuthClient } from '../utils/authClient';

interface IAPI {
  auth: AuthAPI;
  page?: {};
  publish: PublishAPI;
  storage?: {};
}

interface PublishConfig {
  [key: string]: any;
}

interface AuthAPI {
  getAccessToken: (options: AuthParameters) => Promise<string>; // returns an access token
  logOut: () => Promise<void>;
}

interface PublishAPI {
  setConfigIsValid?: (valid: boolean) => void;
  setPublishConfig?: (config: PublishConfig) => void;
  useConfigBeingEdited?: (() => PublishConfig[]) | (() => void);
  startProvision?: (config: any) => void;
  currentProjectId?: () => string;
  closeDialog?: () => void;
  onBack?: () => void;
  setTitle?: (value) => void;
  getSchema?: () => any;
  getType?: () => string;
  savePublishConfig?: (config: PublishConfig) => void;
  getTokenFromCache?: () => any;
  isShowAuthDialog?: (needGraph: boolean) => boolean;
}

class API implements IAPI {
  auth: AuthAPI;
  publish: PublishAPI;

  constructor() {
    this.auth = {
      getAccessToken: (params: AuthParameters) => {
        return AuthClient.getAccessToken(params);
      },
      logOut: () => {
        return AuthClient.logOut();
      },
    };
    this.publish = {
      setConfigIsValid: undefined,
      setPublishConfig: undefined,
      useConfigBeingEdited: undefined,
      startProvision: undefined,
      currentProjectId: undefined,
      closeDialog: undefined,
      onBack: undefined,
      setTitle: undefined,
      getSchema: undefined,
      savePublishConfig: undefined,
      getTokenFromCache: undefined,
      isShowAuthDialog: undefined,
    };
  }
}

export const PluginAPI = new API();
