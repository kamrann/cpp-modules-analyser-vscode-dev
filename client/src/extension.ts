/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, RequestType } from 'vscode-languageclient/node';
import { Wasm, ProcessOptions } from '@vscode/wasm-wasi/v1';
import { WasmContext, Memory } from '@vscode/wasm-component-model';
import { createStdioOptions, createUriConverters, startServer } from '@vscode/wasm-wasi-lsp';

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const wasm: Wasm = await Wasm.load();

	const channel = vscode.window.createOutputChannel('LSP WASM Server');
	const serverOptions: ServerOptions = async () => {
		const options: ProcessOptions = {
			stdio: createStdioOptions(),
			mountPoints: [
				{ kind: 'workspaceFolder' },
			]
		};
		// const filename = Uri.joinPath(context.extensionUri, 'server', 'target', 'wasm32-wasip1-threads', 'release', 'server.wasm');
		// const bits = await workspace.fs.readFile(filename);
		// const module = await WebAssembly.compile(bits);

		const filename = vscode.Uri.joinPath(context.extensionUri, 'server', 'modules_lsp.wasm');
		const bits = await vscode.workspace.fs.readFile(filename);
		const module = await WebAssembly.compile(bits);

		const process = await wasm.createProcess('lsp-server', module, { initial: 160, maximum: 160, shared: true }, options);

		const decoder = new TextDecoder('utf-8');
		process.stderr!.onData((data) => {
			channel.append(decoder.decode(data));
		});

		return startServer(process);
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: 'plaintext' }],
		outputChannel: channel,
		uriConverters: createUriConverters(),
	};

	client = new LanguageClient('lspClient', 'LSP Client', serverOptions, clientOptions);
	try {
		await client.start();
	} catch (error) {
		client.error(`Start failed`, error, 'force');
	}

	interface CountFileParams {
		readonly folder: string
	};
	const CountFilesRequest = new RequestType<CountFileParams, number, void>('kantan-wasi-lsp-server/countFiles');
	context.subscriptions.push(vscode.commands.registerCommand('tokamak.kantan-wasi-lsp-server.countFiles', async () => {
		// We assume we do have a folder.
		const folder = vscode.workspace.workspaceFolders![0].uri;
		// We need to convert the folder URI to a URI that maps to the mounted WASI file system. This is something
		// @vscode/wasm-wasi-lsp does for us.
		const result = await client.sendRequest(CountFilesRequest, { folder: client.code2ProtocolConverter.asUri(folder) });
		vscode.window.showInformationMessage(`The workspace contains ${result} files.`);
	}));
}

export function deactivate() {
	return client.stop();
}