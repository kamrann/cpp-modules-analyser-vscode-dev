/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { ServerOptions } from 'vscode-languageclient/node';
import { determineServerOptionsNative } from './server-options-configuration-native';
import { determineServerOptionsWasm } from './server-options-configuration-wasm';

export function determineServerOptionsDesktop(context: vscode.ExtensionContext, channel: vscode.OutputChannel, nativeServerLocation: string | undefined): ServerOptions {
  if (nativeServerLocation) {
    return determineServerOptionsNative(context, channel, nativeServerLocation);
  } else {
    return determineServerOptionsWasm(context, channel);
  }
}
