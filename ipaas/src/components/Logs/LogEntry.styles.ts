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

/** Every chip in a log row is the same monospace pill; only its colours and weight differ. */
export const logChipSx = (bgcolor: string, color: string, fontWeight = 700) =>
  ({
    fontFamily: 'monospace',
    fontSize: 10,
    height: 18,
    mr: 1,
    bgcolor,
    color,
    fontWeight,
  }) as const;

/** The gateway's own palette, so a gateway row is distinguishable at a glance from the integration's. */
export const GATEWAY_CHIP_COLORS = { bgcolor: '#e8eaf6', color: '#283593' } as const;
