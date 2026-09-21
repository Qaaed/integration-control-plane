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

/** atob yields Latin-1 bytes, so they are decoded as UTF-8 to keep a non-ASCII spec intact. */
export function decodeBase64Spec(base64: string | null | undefined): string | null {
  if (!base64?.trim()) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/** The workload annotation holds either form, and a spec opening with `{` is JSON. */
export function specFileType(spec: string): { extension: 'json' | 'yaml'; mimeType: string } {
  return spec.trimStart().startsWith('{') ? { extension: 'json', mimeType: 'application/json' } : { extension: 'yaml', mimeType: 'application/yaml' };
}
