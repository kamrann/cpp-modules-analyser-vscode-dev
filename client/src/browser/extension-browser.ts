/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/browser';
import { createUriConverters } from '@vscode/wasm-wasi-lsp';
import { determineServerOptionsWasm } from '../server-config/server-options-configuration-wasm';
import { initializeClient } from '../lsp-client';

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel('C++ Modules Analyser');

  const toolchainRoot = process.env.CPP_MODULES_ANALYSER_TOOLCHAIN_ROOT;
  const dumpTrace: boolean = process.env.CPP_MODULES_DUMP_TRACE !== undefined;

  const commonArgs: string[] = [];

  if (toolchainRoot) {
    commonArgs.push(`--toolchain-root="${toolchainRoot}"`);
  }
  if (dumpTrace) {
    commonArgs.push('--dump-trace');
  }

  const serverOptions: ServerOptions = determineServerOptionsWasm(context, channel);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ pattern: "**/*.{cpp,cppm,mpp,ipp,cxx,cxxm,mxx,ixx,cc}" }], //hpp,hxx,h  // language: 'c++', 
    outputChannel: channel,
    uriConverters: createUriConverters(),
    initializationOptions: {
      tempDefines: [
        "k_enable_modules",
        "k_enable_tp_modules",
        "k_enable_import_std",
        "kdeps_enable_modules",
        "kdeps_enable_import_std",
      ],
      tempExternalModules: [
        "std",
        "k3p.fmt",
        "k3p.boost.json",
        "function2",
        "anyany",
        "kcore",
      ],
    },
  };

  client = new LanguageClient('lspClient', 'C++ Modules Analyser LSP Client', serverOptions, clientOptions);

  initializeClient(context, client);

  try {
    await client.start();
  }
  catch (error) {
    client.error(`Start failed`, error, 'force');
  }
}

export function deactivate() {
  return client.stop();
}
