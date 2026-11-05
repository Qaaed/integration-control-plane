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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

// BffError stays real: the 504 branch is an `instanceof` check.
vi.mock('./_client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_client')>()),
  bff: { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { BffError } from './_client';
import { decideRemediation, toRemediationDecision } from './remediation';

const target = { projectId: 'proj-1', componentId: 'comp-1', environmentId: 'env-1' };

describe('decideRemediation', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('sends no reportId before the backend has issued one', async () => {
    post.mockResolvedValue({ status: 'pending', rcaNeeded: true, reason: '' });
    await decideRemediation(target);
    expect(post).toHaveBeenCalledWith('/remediation/decide', { project: 'proj-1', component: 'comp-1', environment: 'env-1' });
  });

  it('sends the reportId back once known', async () => {
    post.mockResolvedValue({ status: 'pending', rcaNeeded: true, reason: '', reportId: 'r-1' });
    await decideRemediation(target, 'r-1');
    expect(post).toHaveBeenCalledWith('/remediation/decide', { project: 'proj-1', component: 'comp-1', environment: 'env-1', reportId: 'r-1' });
  });

  it('treats a 504 as still pending and keeps the reportId', async () => {
    post.mockRejectedValue(new BffError(504, 'upstream request timeout'));
    await expect(decideRemediation(target, 'r-1')).resolves.toMatchObject({ status: 'pending', reportId: 'r-1' });
  });

  it('still fails on any other error', async () => {
    post.mockRejectedValue(new BffError(500, '{"message":"boom"}'));
    await expect(decideRemediation(target)).rejects.toMatchObject({ status: 500, message: 'boom' });
  });
});

describe('toRemediationDecision', () => {
  it('keeps the known reportId when a pending answer omits it', () => {
    expect(toRemediationDecision({ status: 'pending', rcaNeeded: true, reason: '' }, 'r-1').reportId).toBe('r-1');
  });

  it('carries the summary of a ready answer', () => {
    expect(toRemediationDecision({ status: 'ready', rcaNeeded: true, reason: 'why', summary: 'what to fix' })).toMatchObject({ status: 'ready', summary: 'what to fix' });
  });

  it('reads a ready answer without a summary as no analysis needed', () => {
    expect(toRemediationDecision({ status: 'ready', rcaNeeded: false, reason: 'nothing logged at ERROR level in the last 15 minutes' })).toEqual({
      status: 'unneeded',
      rcaNeeded: false,
      reason: 'nothing logged at ERROR level in the last 15 minutes',
      reportId: undefined,
    });
  });

  it('passes the reason of an unavailable answer through', () => {
    expect(toRemediationDecision({ status: 'unavailable', rcaNeeded: false, reason: 'No runtime found' })).toMatchObject({ status: 'unavailable', reason: 'No runtime found' });
  });
});
