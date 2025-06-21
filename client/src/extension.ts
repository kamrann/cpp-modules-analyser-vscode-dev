/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { Wasm, ProcessOptions } from '@vscode/wasm-wasi/v1';
//import { WasmContext, Memory } from '@vscode/wasm-component-model';
import { createStdioOptions, createUriConverters, startServer } from '@vscode/wasm-wasi-lsp';
import { ModulesTreeProvider } from './modules_tree';
import { ModulesModel } from './modules_model';

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const channel = vscode.window.createOutputChannel('C++ Modules Analyser');

	const determineServerOptions = (): ServerOptions => {
		const nativeExePath = process.env.CPP_MODULES_ANALYSER_NATIVE_PATH;
		const toolchainRoot = process.env.CPP_MODULES_ANALYSER_TOOLCHAIN_ROOT;
		const dumpTrace: boolean = process.env.CPP_MODULES_DUMP_TRACE !== undefined;
		
		const commonArgs: string[] = [];

		if (toolchainRoot) {
			commonArgs.push(`--toolchain-root="${toolchainRoot}"`);
		}
		if (dumpTrace) {
			commonArgs.push('--dump-trace');
		}

		if (nativeExePath !== undefined)
		{
			channel.appendLine(`Configuring with native LSP server at ${nativeExePath}`);

			const nativeServerLocation = nativeExePath;
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
		else
		{
			const defaultWasiModulePath = vscode.Uri.joinPath(context.extensionUri, 'server', 'out', 'wasm', 'modules-lsp.wasm');
			const wasiModulePath = process.env.CPP_MODULES_ANALYSER_WASI_PATH !== undefined ? vscode.Uri.file(process.env.CPP_MODULES_ANALYSER_WASI_PATH) : defaultWasiModulePath;

			channel.appendLine(`Configuring with WASI LSP server at ${wasiModulePath}`);

			return async () => {
				const options: ProcessOptions = {
					stdio: createStdioOptions(),
					mountPoints: [
						// A descriptor signaling that the workspace folder is mapped as `/workspace` or in case of a multi-root workspace each folder is mapped as `/workspaces/folder-name`.
						{ kind: 'workspaceFolder' },
						// Feels like should be using this but don't understand expectation of `path`. Keeps throwing file not found errors relating to ...\.dir.json
						//{ kind: 'extensionLocation', extension: context, path: '/', mountPoint: '/funk' },
						{ kind: 'vscodeFileSystem', uri: vscode.Uri.joinPath(context.extensionUri, 'resources'), mountPoint: '/resources' },
					],
					args: [...commonArgs]
				};

				const bits = await vscode.workspace.fs.readFile(wasiModulePath);
				const module = await WebAssembly.compile(bits);

				const wasm: Wasm = await Wasm.load();
				const process = await wasm.createProcess('lsp-server', module, { initial: 160, maximum: 160, shared: true }, options);

				const decoder = new TextDecoder('utf-8');
				const buffer: string[] = [];
				process.stderr!.onData((data) => {
					const decoded = decoder.decode(data);
					const newline = decoded.indexOf("\n");
					if (newline !== -1) {
						buffer.push(decoded.substring(0, newline + 1));
						channel.append(buffer.join(""));
						buffer.length = 0;
						buffer.push(decoded.substring(newline + 1));
					} else {
						buffer.push(decoded);
					}					
				});

				return startServer(process);
			};
		}		
	};

	const serverOptions: ServerOptions = determineServerOptions();

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
	try {
		await client.start();
	}
	catch (error) {
		client.error(`Start failed`, error, 'force');
	}

	const modulesData = new ModulesModel();
	const modulesTreeProvider = new ModulesTreeProvider(modulesData);
	const modulesTreeView = vscode.window.createTreeView('cppModules', {
  	treeDataProvider: modulesTreeProvider,
  	showCollapseAll: true,
	});

	const formatModulesPendingMessage = () => {
		return `${modulesData.isEmpty == false ? "⚠️ Below modules information is out of date. " : ""}Recalculating...`;
	};
	
	modulesTreeView.message = formatModulesPendingMessage();

	client.onNotification('cppModulesAnalyzer/publishModulesInfo', (params) => {
		switch (params.event) {
			case 'update':
				if (params.modules) {
					modulesData.update(params.modules, params.moduleUnits);
					modulesTreeView.message = undefined;
				} else {
					//modulesData.setError();
					modulesTreeView.message = "⚠️ Below modules information is stale. Fix items in Problems window to refresh.";
				}
				break;
			case 'pending':
				//modulesData.setError();
				modulesTreeView.message = formatModulesPendingMessage();
				break;
		}
	});
}

export function deactivate() {
	return client.stop();
}