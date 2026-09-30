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
import { isFixtureProject, projectNameFor, projectStartedAt, STALE_AGE_MS, staleProjects } from './journey-project';

const AT = new Date('2026-09-28T10:03:00Z');
const older = (ms: number): string => projectNameFor(new Date(AT.getTime() - ms));
const OWN = projectNameFor(AT);

describe('projectNameFor / projectStartedAt', () => {
  it('carries the creation minute in the name', () => {
    expect(projectNameFor(AT)).toBe('IPAAS-E2E-260928-1003');
  });

  it('reads back what it wrote, to the minute', () => {
    expect(projectStartedAt(projectNameFor(AT))?.toISOString()).toBe('2026-09-28T10:03:00.000Z');
  });

  it.each([['IPAAS-E2E'], ['IPAAS-E2E-manual'], ['IPAAS-E2E-260928-99'], ['something-else'], ['']])('cannot date %s', (name) => {
    expect(projectStartedAt(name)).toBeNull();
  });

  it('recognises any fixture project by its prefix, dated or not', () => {
    expect(isFixtureProject('IPAAS-E2E')).toBe(true);
    expect(isFixtureProject('IPAAS-E2E-260928-1003')).toBe(true);
    expect(isFixtureProject('Default Project')).toBe(false);
  });
});

describe('staleProjects', () => {
  it('sweeps a project older than the abandonment age', () => {
    const abandoned = older(STALE_AGE_MS + 60_000);
    expect(staleProjects([abandoned, older(20 * 60_000)], AT, OWN)).toEqual([abandoned]);
  });

  // A run can take an hour, so anything younger than the age may still be using its project.
  it('leaves a project a live run could still hold', () => {
    expect(staleProjects([older(90 * 60_000)], AT, OWN)).toEqual([]);
  });

  it('never sweeps the project this run owns, however old the name looks', () => {
    expect(staleProjects([OWN], new Date(AT.getTime() + STALE_AGE_MS + 60_000), OWN)).toEqual([]);
  });

  it('leaves a project it cannot date, since nothing here knows whose it is', () => {
    expect(staleProjects(['IPAAS-E2E', 'IPAAS-E2E-manual'], AT, OWN)).toEqual([]);
  });

  it('sweeps every stale project, not just the oldest', () => {
    const a = older(STALE_AGE_MS + 60_000);
    const b = older(STALE_AGE_MS + 90 * 60_000);
    expect(staleProjects([a, b, older(10 * 60_000)], AT, OWN).sort()).toEqual([a, b].sort());
  });
});
