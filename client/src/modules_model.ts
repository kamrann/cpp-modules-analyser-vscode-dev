import * as vscode from 'vscode';
import * as path from 'path';
import { createUriConverters } from '@vscode/wasm-wasi-lsp';

type RawModuleInfo = any;
type RawModuleUnitInfo = any;

export interface ModuleInfo {
  readonly name: string;
  readonly primary: ModuleUnitInfo;
  readonly interfacePartitions: Array<ModuleUnitInfo>;
  readonly implementationPartitions: Array<ModuleUnitInfo>;
  readonly implementationUnits: Array<ModuleUnitInfo>;
}

export enum ModuleUnitKind {
  primaryInterface,
  interfacePartition,
  implementationPartition,
  implementation,
}

export const moduleKindNames: Record<ModuleUnitKind, string> = {
  [ModuleUnitKind.primaryInterface]: "Primary interface unit",
  [ModuleUnitKind.interfacePartition]: "Interface partition unit",
  [ModuleUnitKind.implementationPartition]: "Non-interface partition unit",
  [ModuleUnitKind.implementation]: "Implementation unit",
};

export interface ModuleUnitInfo {
  readonly moduleName: string;
  readonly kind: ModuleUnitKind;
  readonly partitionName: string | undefined;
  readonly uri: vscode.Uri;
}

export function moduleUnitCount(m: ModuleInfo): number {
  return 1 + m.interfacePartitions.length + m.implementationPartitions.length + m.implementationUnits.length;
}

// @NOTE: Not unique, all implementation units will yield the same name.
export function moduleUnitQualifiedName(mu: ModuleUnitInfo): string {
  return mu.partitionName ? (mu.moduleName + ":" + mu.partitionName) : mu.moduleName;
}

export function moduleUnitLocalName(mu: ModuleUnitInfo): string {
  switch (mu.kind)
  {
    case ModuleUnitKind.primaryInterface:
      return mu.moduleName;
    case ModuleUnitKind.interfacePartition:
    case ModuleUnitKind.implementationPartition:
      return ":" + mu.partitionName;
    case ModuleUnitKind.implementation:
      return path.basename(mu.uri.path);
  }
}

export function moduleUnitLocalDisplayName(mu: ModuleUnitInfo): string {
  return moduleUnitLocalName(mu);
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
  isValid: boolean = false;
  moduleUnits: Array<ModuleUnitInfo> = [];
  modules: Array<ModuleInfo> = [];

  constructor() { }

  private _onDidChangeModulesData: vscode.EventEmitter<ModulesModel> = new vscode.EventEmitter<ModulesModel>();
  readonly onDidChangeModulesData: vscode.Event<ModulesModel> = this._onDidChangeModulesData.event;

  onError(error: string): never {
    this.isValid = false;
    this._onDidChangeModulesData.fire(this);
    throw new Error(error);
  }

  public update(rawModules: Array<RawModuleInfo>, rawModuleUnits: Array<RawModuleUnitInfo>): void {
    const uriConverters = createUriConverters();
    if (!uriConverters) {
      this.onError("URI converters unavailable");
    }

    const moduleUnitFilter = (tu: any) => tu.result.module_unit.variant === 0;
    const moduleUnitConverter = (tu: any) => {
      const mu = tu.result.module_unit.value;
      const isPartition: boolean = mu.partition_name.variant === 0;
      const extractKind = () => {
        return mu.is_interface ?
          (isPartition ? ModuleUnitKind.interfacePartition : ModuleUnitKind.primaryInterface) :
          (isPartition ? ModuleUnitKind.implementationPartition : ModuleUnitKind.implementation);
      }
      return {
        moduleName: mu.module_name.join("."),
        kind: extractKind(),
        partitionName: isPartition ? mu.partition_name.value.join(".") : null,
        // @note: seems iffy to use this function imported from vscode/wasm-wasi-lsp, since this is just a VS Code <-> LSP conversion.
        // but seems to work (despite added a / before the drive letter), whereas Uri.parse gives us /workspace/... which is apparently not what VS Code wants...
        uri: uriConverters.protocol2Code(tu.identifier), //vscode.Uri.parse(tu.identifier),
      };
    }
    this.moduleUnits = rawModuleUnits
      .filter(moduleUnitFilter)
      .map(moduleUnitConverter);

    const findPrimaryUnit = (name: string): ModuleUnitInfo => {
      const entry = this.moduleUnits.find(mu => mu.kind === ModuleUnitKind.primaryInterface && mu.moduleName === name);
      if (entry === undefined) {
        throw new Error("Invalid modules data");
      }
      return entry;
    }

    const findModule = (name: string): ModuleInfo => {
      const entry = this.modules.find(m => m.name === name);
      if (entry === undefined) {
        throw new Error("Invalid modules data");
      }
      return entry;
    }

    this.modules = rawModules.map(m => createModuleInfo(m.name.join("."), findPrimaryUnit(m.name.join("."))));
    for (const mu of this.moduleUnits) {
      switch (mu.kind) {
        case ModuleUnitKind.primaryInterface:
          break;
        case ModuleUnitKind.interfacePartition:
          findModule(mu.moduleName).interfacePartitions.push(mu);
          break;
        case ModuleUnitKind.implementationPartition:
          findModule(mu.moduleName).implementationPartitions.push(mu);
          break;
        case ModuleUnitKind.implementation:
          findModule(mu.moduleName).implementationUnits.push(mu);
          break;
      }
    }

    this.isValid = true;
    this._onDidChangeModulesData.fire(this);
  }

  public setError() {
    this.isValid = false;
    this._onDidChangeModulesData.fire(this);
  }
}
