/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, RequestType, TransportKind } from 'vscode-languageclient/node';
import { Wasm, ProcessOptions } from '@vscode/wasm-wasi/v1';
import { WasmContext, Memory } from '@vscode/wasm-component-model';
import { createStdioOptions, createUriConverters, startServer } from '@vscode/wasm-wasi-lsp';
import { ModulesTreeProvider } from './modules_tree';
import { ModulesModel } from './modules_model';

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const channel = vscode.window.createOutputChannel('C++ Modules Analyser');

	const determineServerOptions = (): ServerOptions => {
		const nativeExePath = process.env.CPP_MODULES_ANALYSER_NATIVE_PATH;

		if (nativeExePath !== undefined)
		{
			channel.appendLine(`Configuring with native LSP server at ${nativeExePath}`);

			const nativeServerLocation = nativeExePath;

			return {
				run: { command: nativeServerLocation, transport: TransportKind.stdio },
				debug: {
					command: nativeServerLocation,
					args: ["--wait-debugger=2"],
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
					]
				};

				const bits = await vscode.workspace.fs.readFile(wasiModulePath);
				const module = await WebAssembly.compile(bits);

				const wasm: Wasm = await Wasm.load();
				const process = await wasm.createProcess('lsp-server', module, { initial: 160, maximum: 160, shared: true }, options);

				const decoder = new TextDecoder('utf-8');
				process.stderr!.onData((data) => {
					channel.append(decoder.decode(data));
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
	vscode.window.registerTreeDataProvider(
		'cppModules',
		modulesTreeProvider
	);

	client.onNotification('cppModulesAnalyzer/publishModulesInfo', (params) => {
		if (params !== null) {
			modulesData.update(params.modules, params.moduleUnits);
		} else {
			modulesData.setError();
		}		
	});

	// interface CountFileParams {
	// 	readonly folder: string
	// };
	// const CountFilesRequest = new RequestType<CountFileParams, number, void>('kantan-wasi-lsp-server/countFiles');
	// context.subscriptions.push(vscode.commands.registerCommand('tokamak.kantan-wasi-lsp-server.countFiles', async () => {
	// 	// We assume we do have a folder.
	// 	const folder = vscode.workspace.workspaceFolders![0].uri;
	// 	// We need to convert the folder URI to a URI that maps to the mounted WASI file system. This is something
	// 	// @vscode/wasm-wasi-lsp does for us.
	// 	const result = await client.sendRequest(CountFilesRequest, { folder: client.code2ProtocolConverter.asUri(folder) });
	// 	vscode.window.showInformationMessage(`The workspace contains ${result} files.`);
	// }));
}

export function deactivate() {
	return client.stop();
}