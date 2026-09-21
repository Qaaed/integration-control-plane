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

import { SlidersHorizontal } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import type { OverviewHeaderActionsProps } from '../../../types/integration';
import { IS_CLOUD } from '../../../features';
import SharedOverviewHeaderActions from '../_shared/OverviewHeaderActions';
import ConfigureActionRow from '../_shared/ConfigureActionRow';

/**
 * MCP Server's Overview-header actions: the shared block (Configure Security +
 * Lifecycle + Dev Portal) PLUS a **Configure Policies** row, in the same style
 * as Configure Security — matching devant, which shows both for MCP. The
 * policies destination is a Coming Soon route until that page exists, so cloud
 * leaves the row out rather than offering a dead end.
 */
export default function OverviewHeaderActions({ component, apimId, orgHandler, projectHandler }: OverviewHeaderActionsProps): ReactNode {
  const navigate = useAppNavigate();
  const configurePolicies = IS_CLOUD ? undefined : (
    <ConfigureActionRow Icon={SlidersHorizontal} label="Configure Policies" onClick={() => navigate(`/organizations/${orgHandler}/projects/${projectHandler}/components/${component.handler}/manage/policies`)} />
  );

  return <SharedOverviewHeaderActions component={component} apimId={apimId} orgHandler={orgHandler} projectHandler={projectHandler} extraConfigureRows={configurePolicies} />;
}
