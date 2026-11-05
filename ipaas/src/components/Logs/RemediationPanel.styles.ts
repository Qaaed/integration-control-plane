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

// A narrow window wraps the text beside a button, never squeezes the button below its label.
export const actionSx = {
  whiteSpace: 'nowrap',
  flexShrink: 0,
} as const;

export const textSx = {
  minWidth: 0,
} as const;

// The agent's reasons start lower case ("nothing logged at ERROR level…").
export const bodySx = {
  '&::first-letter': { textTransform: 'uppercase' },
} as const;

export const resultSx = {
  p: 2,
  mb: 2,
} as const;

// A narrow window must not squeeze the spinner out of shape.
export const spinnerSx = {
  flexShrink: 0,
} as const;
