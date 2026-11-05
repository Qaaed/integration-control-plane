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

import { Box, CircularProgress, PageContent } from '@wso2/oxygen-ui';
import { ScrollText } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useOrgs } from '../hooks/useOrg';
import { useProjects } from '../hooks/useProjects';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEnvironments, useAllEnvironments } from '../hooks/useEnvironments';
import IntegrationLogs from '../components/Logs/IntegrationLogs';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import { AnalyzeErrorsButton, RemediationResult } from '../components/Logs/RemediationPanel';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import { useRemediation } from '../hooks/useRemediation';
import { useChoreoSampleImages } from '../hooks/useRepository';
import { useIntegrationIdentity } from '../hooks/useIntegrationIdentity';
import { useIntegrationModule } from '../hooks/useIntegrationModule';
import { useAuth } from '../auth';
import { errorEnvironment, recentErrorRows } from '../utils/logs';
import { hasSourceRepo } from '../utils/integrationSource';
import { withBase } from '../utils/basePath';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

export default function RuntimeLogsIntegration(scope: ComponentScope): JSX.Element {
  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const { data: projects, isLoading: loadingProjects } = useProjects();

  const project = projects?.find((p) => p.id === scope.project || p.handler === scope.project);
  const projectId = project?.id ?? '';
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const remediation = useRemediation(component?.id);
  const { userId } = useAuth();
  const { data: sampleImages } = useChoreoSampleImages(orgUuid, projectId);
  const codeServerSample = sampleImages?.find((img) => img.name === 'Code Server');
  // The type's Overview module says whether it opts out of the editor, as the overview header reads it.
  const identity = useIntegrationIdentity(component);
  const overviewModule = useIntegrationModule(identity?.type ?? null);

  const { data: projectEnvs = [], isLoading: loadingProjectEnvs } = useEnvironments(orgUuid, projectId);
  const { data: globalEnvs = [], isLoading: loadingGlobalEnvs } = useAllEnvironments();
  // Prefer project-scoped environments (needs UUID); fall back to global when UUID unavailable
  const environments = orgUuid ? projectEnvs : globalEnvs;
  const loadingEnvironments = orgUuid ? loadingProjectEnvs : loadingGlobalEnvs;

  if (loadingOrgs || loadingProjects || loadingComponent || loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!component) {
    return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to project" />;
  }

  if (environments.length === 0) {
    return (
      <PageContent fullWidth>
        <EmptyListing icon={<ScrollText size={48} />} title="No environments available" description="No deployment environments were found for this project. Deploy your integration first." />
      </PageContent>
    );
  }

  const openInCloudEditor =
    codeServerSample && hasSourceRepo(component) && overviewModule && !overviewModule.hideOpenInEditor
      ? (analysis?: { reportId: string; environment: string }): void => {
          // Same launch as the overview header's Open in Cloud Editor.
          const params = new URLSearchParams({ userId, orgUuid, orgHandle: scope.org, projectId, componentId: component.id, codeServerSample: JSON.stringify(codeServerSample) });
          // Only the report's id travels; the backend fetches its steps itself.
          if (analysis) {
            params.set('reportId', analysis.reportId);
            params.set('environment', analysis.environment);
          }
          window.open(`${window.location.origin}${withBase('/editor')}?${params}`, '_blank');
        }
      : undefined;

  return (
    <IntegrationLogs orgHandler={scope.org} orgUuid={orgUuid} component={component} environments={environments} region={project?.region} filtersKey={`${scope.org}/${scope.project}/${scope.component}`}>
      {({ toolbar, viewer, logs, selectedEnvIds }) => {
        // Only errors the remediation agent can still read count, so the button never leads to "nothing logged".
        const recentErrors = recentErrorRows(logs, Date.now());
        const fixEnvironment = errorEnvironment(recentErrors, environments, selectedEnvIds);
        const remediationTarget = fixEnvironment && { projectId, componentId: component.id, environmentId: fixEnvironment.id };
        return (
          <LogsPageLayout
            title="Runtime logs"
            titleAction={<AnalyzeErrorsButton remediation={remediation} hasErrors={recentErrors.length > 0} target={remediationTarget} />}
            filtersElement={
              <>
                <RemediationResult remediation={remediation} target={remediationTarget} onOpenEditor={openInCloudEditor} />
                {toolbar}
              </>
            }
            logPanelElement={viewer}
          />
        );
      }}
    </IntegrationLogs>
  );
}
