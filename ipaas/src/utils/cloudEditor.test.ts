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

import { describe, it, expect } from 'vitest';
import { buildCloudEditorUrl, displayableEditorUrl, editorUrlKeepingFiles } from './cloudEditor';

const base = {
  userId: 'u1',
  orgUuid: 'org-uuid',
  orgHandle: 'acme',
  projectId: 'proj-1',
  codeServerSample: { name: 'Code Server' },
};

describe('buildCloudEditorUrl', () => {
  it('serializes the required params onto the /editor deep link', () => {
    const url = new URL(buildCloudEditorUrl(base, 'https://example.com'));
    expect(url.pathname).toBe('/editor');
    expect(url.searchParams.get('userId')).toBe('u1');
    expect(url.searchParams.get('orgHandle')).toBe('acme');
    expect(url.searchParams.get('componentId')).toBe('null');
    expect(JSON.parse(url.searchParams.get('codeServerSample') ?? '{}')).toEqual({ name: 'Code Server' });
  });

  it('omits scaffoldKey when not provided and includes it when set', () => {
    expect(new URL(buildCloudEditorUrl(base, 'https://example.com')).searchParams.has('scaffoldKey')).toBe(false);
    const withKey = new URL(buildCloudEditorUrl({ ...base, scaffoldKey: 'ai-scaffold-9' }, 'https://example.com'));
    expect(withKey.searchParams.get('scaffoldKey')).toBe('ai-scaffold-9');
  });
});

describe('editorUrlKeepingFiles', () => {
  const editor = 'https://editor-abc.example.com/?tkn=deadbeef';

  it('marks the open with the report it comes from', () => {
    const url = new URL(editorUrlKeepingFiles(editor, 'comp-1', 'fixit-comp_1'));
    expect(url.searchParams.get('reset')).toBe('fixit-comp_1');
    expect(url.searchParams.get('tkn')).toBe('deadbeef');
  });

  // Steps from an earlier analysis can still be on the editor, so a plain open needs it too.
  it('marks a plain open of an existing integration with its component', () => {
    expect(new URL(editorUrlKeepingFiles(editor, 'comp-1')).searchParams.get('reset')).toBe('comp-1');
  });

  // The new-project scaffold is meant to start from an empty folder.
  it('leaves a new project alone', () => {
    expect(editorUrlKeepingFiles(editor, 'null')).toBe(editor);
    expect(editorUrlKeepingFiles(editor, '')).toBe(editor);
  });

  it('returns an unparseable value unchanged', () => {
    expect(editorUrlKeepingFiles('not a url', 'comp-1')).toBe('not a url');
  });
});

describe('displayableEditorUrl', () => {
  // The address is on screen for the whole of a cold start; the token must not be.
  it('strips the connection token', () => {
    expect(displayableEditorUrl('https://editor-abc.gateway.example.com/?tkn=deadbeef')).toBe('https://editor-abc.gateway.example.com/');
  });

  it('keeps every other query parameter', () => {
    expect(displayableEditorUrl('https://editor-abc.example.com/?folder=%2Fworkspace&tkn=deadbeef')).toBe('https://editor-abc.example.com/?folder=%2Fworkspace');
  });

  it('is a no-op for a URL with no token', () => {
    expect(displayableEditorUrl('https://editor-abc.example.com/')).toBe('https://editor-abc.example.com/');
  });

  // Display only — navigation uses the URL held in state.
  it('returns an unparseable value unchanged', () => {
    expect(displayableEditorUrl('not a url')).toBe('not a url');
  });
});
