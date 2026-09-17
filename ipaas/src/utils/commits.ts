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

import type { Commit } from '../types/repository';

/** Git's default abbreviation, and the shortest prefix worth matching on. */
const MIN_SHA_LENGTH = 7;

/**
 * Resolves a build's commit against the fetched history. A build records an
 * abbreviated SHA while history carries the full one, so either side may be the
 * prefix. Returns null when the build is older than the fetched window — the
 * caller shows the SHA alone rather than another commit's message.
 */
export function findCommitBySha(commits: Commit[] | undefined, sha: string | undefined): Commit | null {
  if (!commits?.length || !sha || sha.length < MIN_SHA_LENGTH) return null;
  const target = sha.toLowerCase();
  return (
    commits.find((c) => {
      const candidate = c.sha?.toLowerCase();
      if (!candidate || candidate.length < MIN_SHA_LENGTH) return false;
      return candidate.startsWith(target) || target.startsWith(candidate);
    }) ?? null
  );
}

/** The repo's newest commit: what the source header shows, and what a "build latest" action targets. */
export function latestCommitOf(commits: Commit[] | undefined): Commit | null {
  if (!commits?.length) return null;
  return commits.find((c) => c.isLatest) ?? commits[0] ?? null;
}
