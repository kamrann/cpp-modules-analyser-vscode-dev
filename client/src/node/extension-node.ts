/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { createUriConverters } from '@vscode/wasm-wasi-lsp';
import { determineServerOptionsDesktop } from '../server-config/server-options-configuration-desktop';
import { initializeClient } from '../lsp-client';
import { getEnvConfigurationOverrides } from '../server-config/server-config-env';

let client: LanguageClient;

const platformNotSupported = 'Error: extension does not support this platform.';

function locateNativeBinary(extensionUri: vscode.Uri): string | undefined {
  const determineExecutableExt = () => {
    switch (process.platform) {
      case 'win32': return '.exe';
      case 'linux': return '';
      default: return undefined;
    }
  };

  const executableExt = determineExecutableExt();
  if (!executableExt) {
    return undefined;
  }

  const uri = vscode.Uri.joinPath(extensionUri, 'dist', process.platform, process.arch, 'modules-lsp' + executableExt);
  return uri.fsPath;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel('C++ Modules Analyser');

  const defaultExePath = locateNativeBinary(context.extensionUri);
  if (!defaultExePath) {
    channel.appendLine(platformNotSupported);
    return;
  }

  const nativeExePath = process.env.CPP_MODULES_ANALYSER_NATIVE_PATH ?? defaultExePath;
  const envOverrides = getEnvConfigurationOverrides();
  const serverOptions: ServerOptions = determineServerOptionsDesktop(context, channel, nativeExePath, envOverrides);

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