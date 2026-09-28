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

import { useMemo } from 'react';
import { useComponentDeployment, useEnvEndpoints } from './useDeployments';
import { useEndpointSecurity } from './useConsumers';
import { IS_CLOUD } from '../features';
import { endpointContextPath, gatewayFrontedEndpoint } from '../utils/gatewayLogs';
import type { ComponentDetail } from '../types/component';

/** What an integration needs before its gateway traffic can be read: an endpoint the gateway fronts, and its path. */
export interface GatewayLogScope {
  /** The endpoint's context path, matched against the log line — the only narrowing the log backend offers. */
  contextPath: string;
  /** False when nothing is exposed through the gateway, or on a product with no observability proxy. */
  available: boolean;
}

export function useGatewayLogScope(orgHandler: string, orgUuid: string, component: ComponentDetail | null | undefined, environmentId: string): GatewayLogScope {
  const versionId = useMemo(() => {
    const versions = component?.apiVersions ?? [];
    return (versions.find((v) => v.latest) ?? versions[0])?.id ?? '';
  }, [component]);

  // The endpoint is the signal, not the type: wire type names differ from the console's vocabulary.
  const { data: deployment } = useComponentDeployment(IS_CLOUD ? orgHandler : '', orgUuid, component?.id ?? '', versionId, environmentId);
  const releaseId = deployment?.releaseId ?? '';
  const { data: endpoints = [] } = useEnvEndpoints(IS_CLOUD ? (component?.id ?? '') : '', versionId, releaseId);

  const endpoint = gatewayFrontedEndpoint(endpoints);
  const securityRef = IS_CLOUD && component && endpoint ? { componentName: component.id, environmentName: environmentId, endpointName: endpoint.id } : null;
  const { data: security } = useEndpointSecurity(securityRef, !!securityRef);

  // An API exposed through the platform gateway has no external URL on the release, only the security publicUrl.
  const contextPath = endpoint ? endpointContextPath(endpoint.apiContext, security?.publicUrl || endpoint.publicUrl) : '';

  return { contextPath, available: IS_CLOUD && contextPath !== '' };
}
