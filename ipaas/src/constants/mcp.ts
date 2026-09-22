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

/**
 * A freshly minted test key is rejected by the data-plane gateway until it propagates —
 * measured at 10-22s, so the budget covers the worst case with room to spare. The same key
 * is retried, not a new one: minting again restarts the wait.
 */
export const KEY_ACTIVATION_ATTEMPTS = 9;
export const KEY_ACTIVATION_DELAY_MS = 3_000;
