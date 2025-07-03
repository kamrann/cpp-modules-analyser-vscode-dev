/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { ServerOptions, TransportKind } from 'vscode-languageclient/node';

export function determineServerOptionsNative(context: vscode.ExtensionContext, channel: vscode.OutputChannel, nativeServerLocation: string): ServerOptions {
  const toolchainRoot = process.env.CPP_MODULES_ANALYSER_TOOLCHAIN_ROOT;
  const dumpTrace: boolean = process.env.CPP_MODULES_DUMP_TRACE !== undefined;

  const commonArgs: string[] = [];

  if (toolchainRoot) {
    commonArgs.push(`--toolchain-root="${toolchainRoot}"`);
  }
  if (dumpTrace) {
    commonArgs.push('--dump-trace');
  }

  const waitDebugger = process.env.CPP_MODULES_WAIT_DEBUGGER;

  const nativeArgs = [];

  if (waitDebugger) {
    nativeArgs.push(`--wait-debugger=${waitDebugger}`);
  }

  return {
    run: { command: nativeServerLocation, transport: TransportKind.stdio },
    debug: {
      command: nativeServerLocation,
      args: [...commonArgs, ...nativeArgs],
      transport: TransportKind.stdio,
    }
  };
}
