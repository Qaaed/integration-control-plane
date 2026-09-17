/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { describe, expect, it } from 'vitest';
import { buildAuthorizationUrl } from './authorizeUrl';

const request = {
  clientId: 'IPAAS_CONSOLE',
  redirectUri: 'https://console.example/signin',
  scope: 'openid profile email amp:agent:read',
  state: 'state',
  codeChallenge: 'challenge',
};

describe('buildAuthorizationUrl', () => {
  it('sends the resource indicator and requested scopes on authorization', () => {
    const url = new URL(buildAuthorizationUrl('https://idp.example/oauth2/authorize', {
      ...request,
      resource: 'urn:wso2:amp',
      fidp: 'example-idp',
    }));

    expect(url.searchParams.get('scope')).toBe(request.scope);
    expect(url.searchParams.getAll('resource')).toEqual(['urn:wso2:amp']);
    expect(url.searchParams.get('fidp')).toBe('example-idp');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('omits resource when it is not configured', () => {
    const url = new URL(buildAuthorizationUrl('https://idp.example/oauth2/authorize', request));
    expect(url.searchParams.has('resource')).toBe(false);
    expect(url.searchParams.get('client_id')).toBe('IPAAS_CONSOLE');
  });
});
