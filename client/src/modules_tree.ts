import * as vscode from 'vscode';
import * as path from 'path';
import { ModuleInfo, ModuleUnitInfo, ModulesModel } from './modules_model';

export class ModulesTreeProvider implements vscode.TreeDataProvider<ModulesTreeItem> {
  constructor(private modulesData: ModulesModel) {
    modulesData.onDidChangeModulesData((model: ModulesModel) => {
        this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: ModulesTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ModulesTreeItem): Thenable<ModulesTreeItem[]> {
    if (!this.modulesData) {
      //vscode.window.showInformationMessage('No dependency in empty workspace');
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve(
        element.children()
      );
    } else {
      return Promise.resolve(this.modulesData.modules.map(m => new ModuleItem(m)));
    }
  }

  private _onDidChangeTreeData: vscode.EventEmitter<ModulesTreeItem | undefined | null | void> = new vscode.EventEmitter<ModulesTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ModulesTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
}

abstract class ModulesTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}`;
    //this.description = this.version;
  }

  abstract children(): Array<ModulesTreeItem>;

  iconPath = {
    light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
  };
}

class ModuleItem extends ModulesTreeItem {
  constructor(
    private readonly moduleInfo: ModuleInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(moduleInfo.name, collapsibleState);
  }

  children()
  {
    return [
        new ModuleOwnedUnitItem(this.moduleInfo.primary),
    ];
  }
}

class ModuleOwnedUnitItem extends ModulesTreeItem {
  constructor(
    private readonly moduleUnitInfo: ModuleUnitInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(moduleUnitInfo.name, collapsibleState);
  }

  children()
  {
    return [];
  }
}
