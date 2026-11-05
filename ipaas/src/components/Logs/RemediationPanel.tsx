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

import { Button, CircularProgress, Paper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Cloud, Sparkles } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import type { Remediation } from '../../hooks/useRemediation';
import type { RemediationTarget } from '../../types/remediation';
import { plainSummary } from '../../utils/remediation';
import { actionSx, bodySx, resultSx, spinnerSx, textSx } from './RemediationPanel.styles';

interface AnalyzeErrorsButtonProps {
  remediation: Remediation;
  /** Whether the visible logs have ERROR rows recent enough for the agent to read. */
  hasErrors: boolean;
  /** Absent when the errors span environments and none is selected. */
  target: RemediationTarget | undefined;
}

/** Keeps one label and size whatever the run's state, so the title row never shifts. */
export function AnalyzeErrorsButton({ remediation, hasErrors, target }: AnalyzeErrorsButtonProps): JSX.Element | null {
  const { started, start, working } = remediation;
  // Once a run has started the button stays, even if a filter later hides the errors.
  if (!started && !hasErrors) return null;

  return (
    <Tooltip title={target ? '' : 'Select one environment to analyze its errors.'}>
      <span>
        <Button variant="contained" sx={actionSx} startIcon={working ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={16} />} disabled={!target || working} onClick={() => target && start(target)}>
          Analyze errors
        </Button>
      </span>
    </Tooltip>
  );
}

interface RemediationResultProps {
  remediation: Remediation;
  target: RemediationTarget | undefined;
  /**
   * Opens the integration in the Cloud Editor; absent when it cannot be opened there.
   * `analysis` names the report whose fix steps the editor's Copilot starts on.
   */
  onOpenEditor: ((analysis?: { reportId: string; environment: string }) => void) | undefined;
}

/** The run's progress, then its summary once ready, or why there is none. */
export function RemediationResult({ remediation, target, onOpenEditor }: RemediationResultProps): JSX.Element | null {
  const { query, start, working, step } = remediation;
  const retry = target && (
    <Button size="small" sx={actionSx} onClick={() => start(target)}>
      Retry
    </Button>
  );
  if (query.isError) return <ResultBlock title="Root cause analysis failed" text={query.error.message} color="error" action={retry} />;

  const decision = query.data;
  if (decision?.status === 'unavailable') return <ResultBlock title="Root cause analysis failed" text={decision.reason} color="error" action={retry} />;
  if (working) return <ResultBlock icon={<CircularProgress size={20} sx={spinnerSx} />} title="Analyzing errors" text={step} color="text.secondary" />;
  if (decision?.status === 'unneeded') return <ResultBlock title="No root cause analysis needed" text={decision.reason} color="text.secondary" />;
  if (decision?.status !== 'ready') return null;

  const ranOn = remediation.runTarget;
  const analysis = decision.reportId && ranOn ? { reportId: decision.reportId, environment: ranOn.environmentId } : undefined;
  const openEditor = onOpenEditor && (
    <Button variant="outlined" size="small" sx={actionSx} startIcon={<Cloud size={14} />} onClick={() => onOpenEditor(analysis)}>
      Open in Cloud Editor
    </Button>
  );
  return <ResultBlock title="Root cause analysis summary" text={plainSummary(decision.summary)} action={openEditor} />;
}

interface ResultBlockProps {
  title: string;
  text: string;
  color?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

function ResultBlock({ title, text, color, icon, action }: ResultBlockProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={resultSx}>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={1.5} alignItems="center" sx={textSx}>
          {icon}
          <Stack sx={textSx}>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="body2" color={color} sx={bodySx}>
              {text}
            </Typography>
          </Stack>
        </Stack>
        {action}
      </Stack>
    </Paper>
  );
}
