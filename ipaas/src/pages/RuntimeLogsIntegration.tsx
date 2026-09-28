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

import { Box, CircularProgress, PageContent, Stack } from '@wso2/oxygen-ui';
import { ScrollText } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX } from 'react';
import { useOrgs } from '../hooks/useOrg';
import { useProjectsByOrg } from '../hooks/useProjects';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEnvironments, useAllEnvironments } from '../hooks/useEnvironments';
import { useInfiniteComponentLogs, useInfiniteGatewayLogs, useVisibleLogs } from '../hooks/useLogs';
import { useGatewayLogScope } from '../hooks/useGatewayLogScope';
import { filterGatewayRows, startsBeyondGatewayRetention } from '../utils/gatewayLogs';
import { selectLogSources } from '../utils/logs';
import type { ComponentLogsRequest, GatewayLogsRequest } from '../types/logs';
import { choreologgingComponentLogsApiUrl, choreologgingComponentGatewayLogsApiUrl } from '../config/runtimeConfig';
import { GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { GATEWAY_LOGS_FAILED } from '../constants/gatewayLogs';
import { AUTO_FETCH_INTERVAL, DEFAULT_DP_REGION, PAGE_SIZE } from '../utils/logs';
import LogsFilters from '../components/Logs/LogsFilters';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import LogsNotices from '../components/Logs/LogsNotices';
import LogsStatus from '../components/Logs/LogsStatus';
import LogsPanel from '../components/Logs/LogsPanel';
import LogEntry from '../components/Logs/LogEntry';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import { useLogsFilters } from '../hooks/useLogsFilters';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

export default function RuntimeLogsIntegration(scope: ComponentScope): JSX.Element {
  const filters = useLogsFilters();
  const { envFilter, levelFilter, sortDir, searchPhrase, autoFetch, startTime, endTime, sourceFilter, hideHealthChecks } = filters;

  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const { data: projects, isLoading: loadingProjects } = useProjectsByOrg(scope.org);

  const project = projects?.find((p) => p.id === scope.project || p.handler === scope.project);
  const projectId = project?.id ?? '';
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);

  const { data: projectEnvs = [], isLoading: loadingProjectEnvs } = useEnvironments(orgUuid, projectId);
  const { data: globalEnvs = [], isLoading: loadingGlobalEnvs } = useAllEnvironments();
  // Prefer project-scoped environments (needs UUID); fall back to global when UUID unavailable
  const environments = orgUuid ? projectEnvs : globalEnvs;
  const loadingEnvironments = orgUuid ? loadingProjectEnvs : loadingGlobalEnvs;

  const selectedEnvIds = envFilter.length > 0 ? envFilter : environments.map((e) => e.id);
  const primaryEnv = environments.find((e) => selectedEnvIds.includes(e.id));

  const envIdsKey = selectedEnvIds.join(',');
  const levelFilterKey = levelFilter.join(',');

  const isGenericService = GENERIC_SERVICE_TYPES.has(component?.displayType ?? '');
  const logsApiUrl = isGenericService ? choreologgingComponentGatewayLogsApiUrl() : choreologgingComponentLogsApiUrl();

  const logsRequest = useMemo<ComponentLogsRequest | null>(() => {
    if (!component || !primaryEnv) return null;
    return {
      componentId: component.id,
      environmentId: primaryEnv.id,
      versionIdList: [],
      logLevels: levelFilter,
      startTime,
      endTime,
      limit: PAGE_SIZE,
      sort: sortDir,
      region: project?.region || DEFAULT_DP_REGION,
      searchPhrase,
      regexPhrase: '',
      ...(isGenericService ? { logType: 'singleLine' } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component?.id, isGenericService, envIdsKey, levelFilterKey, startTime, endTime, searchPhrase, sortDir, project?.region]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteComponentLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false, logsApiUrl);

  // The gateway fronts the whole organization, so the endpoint's context path is what narrows its lines.
  const gateway = useGatewayLogScope(scope.org, orgUuid, component, primaryEnv?.id ?? '');
  const gatewayRequest = useMemo<GatewayLogsRequest | null>(() => {
    if (!gateway.available || !primaryEnv) return null;
    return { environmentId: primaryEnv.id, searchPhrase: gateway.contextPath, startTime, endTime, limit: PAGE_SIZE, sort: sortDir };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway.available, gateway.contextPath, primaryEnv?.id, startTime, endTime, sortDir]);

  const {
    data: gatewayData,
    error: gatewayError,
    hasNextPage: hasMoreGateway,
    isFetchingNextPage: fetchingMoreGateway,
    fetchNextPage: fetchMoreGateway,
    refetch: refetchGateway,
  } = useInfiniteGatewayLogs(gatewayRequest, autoFetch ? AUTO_FETCH_INTERVAL : false);

  const componentLogs = useVisibleLogs(data, { levels: levelFilter });
  const gatewayRows = useVisibleLogs(gatewayData, { levels: levelFilter });

  // The query's searchPhrase carries the endpoint's path, so the user's own phrase narrows here instead.
  const gatewayLogs = useMemo(() => filterGatewayRows(gatewayRows, { hideHealthChecks, searchPhrase, contextPath: gateway.contextPath }), [gatewayRows, hideHealthChecks, searchPhrase, gateway.contextPath]);

  // Merged for display only: a shared cursor would step past rows the other source had not fetched.
  const logs = useMemo(() => (gateway.available ? selectLogSources(componentLogs, gatewayLogs, sourceFilter, sortDir) : componentLogs), [gateway.available, componentLogs, gatewayLogs, sourceFilter, sortDir]);
  const statusFailure = error ? "Couldn't load runtime logs" : gateway.available && gatewayError ? GATEWAY_LOGS_FAILED : undefined;

  // Gateway rows only: the integration's own logs outlive the gateway's, so the notice would misinform.
  const beyondRetention = gateway.available && startsBeyondGatewayRetention(startTime);

  const refetchAll = (): void => {
    void refetch();
    if (gateway.available) void refetchGateway();
  };
  const showsComponent = !gateway.available || sourceFilter !== 'gateway';
  const showsGateway = gateway.available && sourceFilter !== 'component';
  const fetchNextAll = (): void => {
    if (showsComponent && hasNextPage) void fetchNextPage();
    if (showsGateway && hasMoreGateway) void fetchMoreGateway();
  };

  if (loadingOrgs || loadingProjects || loadingComponent || loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!component) {
    return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  if (environments.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<ScrollText size={48} />} title="No environments available" description="No deployment environments were found for this project. Deploy your integration first." />
      </PageContent>
    );
  }

  return (
    <LogsPageLayout
      title="Runtime Logs"
      filtersElement={<LogsFilters filters={filters} environments={environments} logs={logs} logsRequest={logsRequest} onRefetch={refetchAll} gatewayControls={gateway.available} sourceControls={gateway.available} />}
      logPanelElement={
        <Stack sx={{ minHeight: 0, flex: 1 }}>
          <LogsNotices beyondRetention={beyondRetention} />
          <LogsStatus count={logs.length} live={autoFetch} failure={statusFailure} />
          <LogsPanel
            items={logs}
            getKey={(l, i) => `${i}-${l.timestamp}-${l.logLine.slice(0, 50)}`}
            renderRow={(l, ex, tg) => <LogEntry log={l} expanded={ex} onToggle={tg} envName={primaryEnv?.name} />}
            // Gated on the integration's own logs alone: the gateway query starts later and must not blank rows already shown.
            isLoading={isLoading}
            error={error}
            hasNextPage={(showsComponent && hasNextPage) || (showsGateway && hasMoreGateway)}
            isFetchingNextPage={isFetchingNextPage || fetchingMoreGateway}
            onRefetch={refetchAll}
            onFetchNextPage={fetchNextAll}
            onClearFilters={filters.clearFilters}
          />
        </Stack>
      }
    />
  );
}
