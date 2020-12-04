// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AuthParameters } from '@botframework-composer/types';
import { authConfig } from '../constants';
import {
  getTokenFromCache,
  createPopupWindow,
  monitorWindowForQueryParam,
  createHidenIframe,
  getIdTokenUrl,
  getAccessTokenUrl,
  isTokenExpired,
  cleanTokenFromCache,
} from './auth';
import { isElectron } from './electronUtil';
import storage from './storage';

let idToken = getTokenFromCache('idToken');

async function getAccessToken(options: AuthParameters): Promise<string> {
  const { targetResource = '', scopes = [] } = options;
  try {
    if (isElectron()) {
      const { __csrf__ = '' } = window;

      let url = '/api/auth/getAccessToken?';
      const params = new URLSearchParams();
      if (targetResource) {
        params.append('targetResource', targetResource);
      }
      url += params.toString();

      const result = await fetch(url, { method: 'GET', headers: { 'X-CSRF-Token': __csrf__ } });
      const { accessToken = '' } = await result.json();
      return accessToken;
    } else {
      // get access token from cache
      const key = authConfig.clientId + JSON.stringify(scopes);
      let token = getTokenFromCache(key);
      if (token && !isTokenExpired(token)) {
        return token;
      }

      // get id token
      if (!idToken) {
        // pop up window if token not exist
        const popup = createPopupWindow(getIdTokenUrl(options));
        if (popup) {
          idToken = await monitorWindowForQueryParam(popup, 'id_token');
          storage.set('idToken', idToken || '');
          console.log('idtoken', idToken);
        }
      } else if (isTokenExpired(idToken)) {
        // refresh idToken
        const notDisplayFrame = createHidenIframe(getIdTokenUrl(options));
        idToken =
          notDisplayFrame.contentWindow &&
          (await monitorWindowForQueryParam(notDisplayFrame.contentWindow, 'id_token'));
        storage.set('idToken', idToken || '');
      }

      // use id token to get access token
      if (typeof idToken === 'string') {
        const notDisplayFrame = createHidenIframe(getAccessTokenUrl(options, idToken));
        token =
          notDisplayFrame.contentWindow &&
          (await monitorWindowForQueryParam(notDisplayFrame.contentWindow, 'access_token'));
        console.log('access', token);
        notDisplayFrame.remove();
        // update cache
        storage.set(key, token);
        return token || '';
      }

      return '';
    }
  } catch (e) {
    // error handling
    console.error('Did not receive an access token back from the server: ', e);
    return '';
  }
}

async function logOut() {
  if (isElectron()) {
    try {
      let url = '/api/auth/logOut';
      await fetch(url, { method: 'GET' });
    } catch (e) {
      // error handling
      console.error('Can not log out');
    }
  } else {
    // clean token cache in storage
    cleanTokenFromCache('idToken');
    cleanTokenFromCache(authConfig.clientId);
  }
}

export const AuthClient = {
  getAccessToken,
  logOut,
};
