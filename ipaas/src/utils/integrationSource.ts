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

import { RAG_NO_SOURCE_SUBTYPES } from '../constants/ragIngestion';

/**
 * Whether the integration builds from a git repo, so it has source to show and open in an editor.
 * Proxy and converted integrations (an MCP proxy built from an HTTP API) have none, nor do
 * RAG-provisioned ones, which deploy a prebuilt image.
 */
export function hasSourceRepo(component: { displayType?: string | null; componentSubType?: string | null }): boolean {
  const isProxy = component.displayType === 'proxy' || component.displayType === 'gitProxy';
  return !isProxy && !RAG_NO_SOURCE_SUBTYPES.has(component.componentSubType ?? '');
}
