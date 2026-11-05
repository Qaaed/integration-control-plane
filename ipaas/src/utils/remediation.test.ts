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
import { plainSummary, remediationStep } from './remediation';

describe('plainSummary', () => {
  it('replaces an entity tag with its name', () => {
    expect(plainSummary('errors in the <comp:json-to-xml-converter> component')).toBe('errors in the json-to-xml-converter component');
  });

  it('replaces every kind of entity tag', () => {
    expect(plainSummary('<comp:api> under <proj:acme> in <env:Development> (<ns:dp-1>)')).toBe('api under acme in Development (dp-1)');
  });

  it('drops the backticks around a tag', () => {
    expect(plainSummary('errors occurred in `<comp:frontend>` under `<proj:acme-app>`')).toBe('errors occurred in frontend under acme-app');
  });

  it('leaves text without tags as it is', () => {
    expect(plainSummary('Input JSON was malformed.')).toBe('Input JSON was malformed.');
  });

  it('leaves unknown tags as they are', () => {
    expect(plainSummary('see <foo:x> and <comp>')).toBe('see <foo:x> and <comp>');
  });
});

describe('remediationStep', () => {
  it('analyzes the logs until the backend opens a report', () => {
    expect(remediationStep(false, 60_000)).toBe('Analyzing recent error logs…');
  });

  it('starts the analysis steps once a report is open', () => {
    expect(remediationStep(true, 0)).toBe('Running root cause analysis…');
  });

  it('moves to the next step every 20 seconds', () => {
    expect(remediationStep(true, 20_000)).toBe('Tracing the failing flow…');
  });

  it('stays on the last step however long the run takes', () => {
    expect(remediationStep(true, 10 * 60_000)).toBe('Drafting a fix summary…');
  });

  it('treats a negative elapsed time as the start', () => {
    expect(remediationStep(true, -5_000)).toBe('Running root cause analysis…');
  });
});
