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
import { ModuleUnitImportsTreeProvider } from './module_unit_imports_tree';
import { ModuleUnitImporteesTreeProvider } from './module_unit_importees_tree';
import { ModulesModel } from './modules_model';

let client: LanguageClient;

class DelegatingTreeDataProvider<T> implements vscode.TreeDataProvider<T> {
  private _activeProvider: vscode.TreeDataProvider<T>;

  private _onDidChangeTreeData = new vscode.EventEmitter<T | undefined>();
  readonly onDidChangeTreeData: vscode.Event<T | undefined> = this._onDidChangeTreeData.event;

	constructor(initialProvider: vscode.TreeDataProvider<T>) {
		this._activeProvider = initialProvider;
		this.forwardOnChanged();
	}

	forwardOnChanged() {
		// Forward refresh requests
    if (this._activeProvider.onDidChangeTreeData) {
      this._activeProvider.onDidChangeTreeData(() => this.refresh());
    }
	}

  setProvider(provider: vscode.TreeDataProvider<T>) {
    this._activeProvider = provider;
    this.forwardOnChanged();
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return this._activeProvider.getTreeItem(element);
  }

  getChildren(element?: T): vscode.ProviderResult<T[]> {
    return this._activeProvider.getChildren(element);
  }

  getParent?(element: T): vscode.ProviderResult<T> {
    return this._activeProvider.getParent?.(element);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const channel = vscode.window.createOutputChannel('C++ Modules Analyser');

	const commandId = (id: string) => {
		return `tokamak.cpp-modules-analyser-vscode.${id}`;
	};

	enum ViewMode {
		modules,
		importers,
		importees,
	}

	const modulesData = new ModulesModel();

	const formatModulesPendingMessage = () => {
		return `${modulesData.isEmpty == false ? "⚠️ Below modules information is out of date. " : ""}Recalculating...`;
	};
	
	interface ViewModeState {
		displayName: string,
		provider: vscode.TreeDataProvider<vscode.TreeItem>;
		message: string | undefined;
	}

	const viewModes: Record<ViewMode, ViewModeState> = {
		[ViewMode.modules]: { displayName: "Basic Info", provider: new ModulesTreeProvider(modulesData), message: formatModulesPendingMessage() },
		[ViewMode.importers]: { displayName: "Imports", provider: new ModuleUnitImportsTreeProvider(modulesData), message: formatModulesPendingMessage() },
		[ViewMode.importees]: { displayName: "Importees", provider: new ModuleUnitImporteesTreeProvider(modulesData), message: formatModulesPendingMessage() },
	};

	let currentViewMode = ViewMode.modules;
	
	const delegatingProvider = new DelegatingTreeDataProvider<vscode.TreeItem>(viewModes[currentViewMode].provider);

	const treeView = vscode.window.createTreeView('cppModules', {
		treeDataProvider: delegatingProvider,
		showCollapseAll: true,
	});
	treeView.description = viewModes[currentViewMode].displayName,
	treeView.message = viewModes[currentViewMode].message;

	function activateViewMode(mode: ViewMode) {
		if (currentViewMode !== mode) {
			treeView.description = viewModes[mode].displayName,
			treeView.message = viewModes[mode].message;
			delegatingProvider.setProvider(viewModes[mode].provider);
			currentViewMode = mode;
		}
	}

	// @todo: maybe messages should just be specified as a function, and this just triggers an invocation
	function updateViewModeMessage(mode: ViewMode, message: string | undefined) {
		viewModes[mode].message = message;
		if (mode === currentViewMode) {
			treeView.message = message;
		}
	}
	
	context.subscriptions.push(vscode.commands.registerCommand(commandId('viewMode.modulesInfo'), async () => {
		activateViewMode(ViewMode.modules);
	}));
	context.subscriptions.push(vscode.commands.registerCommand(commandId('viewMode.importers'), async () => {
		activateViewMode(ViewMode.importers);
	}));
	context.subscriptions.push(vscode.commands.registerCommand(commandId('viewMode.importees'), async () => {
		activateViewMode(ViewMode.importees);
	}));
	context.subscriptions.push(vscode.commands.registerCommand(commandId('viewMode.select'), async () => {
		interface ModePickItem extends vscode.QuickPickItem {
			mode: ViewMode;
		}
		const options: ModePickItem[] = [
			{ label: 'Modules', description: 'Basic module information', picked: currentViewMode === ViewMode.modules, mode: ViewMode.modules },
			{ label: 'Importers', description: 'Tree of module imports', picked: currentViewMode === ViewMode.importers, mode: ViewMode.importers },
			{ label: 'Importees', description: 'Tree of module importees', picked: currentViewMode === ViewMode.importees, mode: ViewMode.importees },
		];
		const selection = await vscode.window.showQuickPick(options, {
			placeHolder: "Select modules view mode",
		});
		if (selection) {
			activateViewMode(selection.mode);
		}
	}));

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

	client.onNotification('cppModulesAnalyzer/publishModulesInfo', (params) => {
		let message: string | undefined = undefined;
		switch (params.event) {
			case 'update':
				if (params.modules) {
					modulesData.update(params.modules, params.translationUnits);
					message = undefined;
				} else {
					//modulesData.setError();
					message = "⚠️ Below modules information is stale. Fix items in Problems window to refresh.";
				}
				break;
			case 'pending':
				//modulesData.setError();
				message = formatModulesPendingMessage();
				break;
		}
		// @note: for now at least, these use the same datasource and are always in sync
		updateViewModeMessage(ViewMode.modules, message);
		updateViewModeMessage(ViewMode.importers, message);
		updateViewModeMessage(ViewMode.importees, message);
	});
}

export function deactivate() {
	return client.stop();
}