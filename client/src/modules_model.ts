import * as vscode from 'vscode';

type RawModuleInfo = any;
type RawModuleUnitInfo = any;

export interface ModuleInfo {
  readonly name: string;
  readonly primary: ModuleUnitInfo;
  readonly interfacePartitions: Array<ModuleUnitInfo>;
  readonly implementationPartitions: Array<ModuleUnitInfo>;
  readonly implementationUnits: Array<ModuleUnitInfo>;
}

export interface ModuleUnitInfo {
  readonly name: string;
}

function createModuleInfo(name: string, primary: ModuleUnitInfo): ModuleInfo {
  return {
    name: name,
    primary: primary,
    interfacePartitions: [],
    implementationPartitions: [],
    implementationUnits: [],
  };
}

export class ModulesModel {
  moduleUnits: Array<ModuleUnitInfo> = [];
  modules: Array<ModuleInfo> = [];

  constructor() {}

  private _onDidChangeModulesData: vscode.EventEmitter<ModulesModel> = new vscode.EventEmitter<ModulesModel>();
  readonly onDidChangeModulesData: vscode.Event<ModulesModel> = this._onDidChangeModulesData.event;

  public update(rawModules: Array<RawModuleInfo>, rawModuleUnits: Array<RawModuleUnitInfo>): void {
    const moduleUnitFilter = (tu: any) => tu.result.module_unit.variant == 0;
    const moduleUnitConverter = (tu: any) => {
      return {
        name: tu.result.module_unit.value.module_name.join("."),
      };
    }
    this.moduleUnits = rawModuleUnits
      .filter(moduleUnitFilter)
      .map(moduleUnitConverter);

    const findUnit = (name: string): ModuleUnitInfo => {
      const entry = this.moduleUnits.find(mu => mu.name == name);
      if (entry === undefined)
      {
        throw new Error("Invalid modules data");
      }
      return entry;
    }

    this.modules = rawModules.map(m => createModuleInfo(m.name.join("."), findUnit(m.name.join("."))));

    this._onDidChangeModulesData.fire(this);
  }
}
