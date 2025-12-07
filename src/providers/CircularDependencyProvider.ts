import * as vscode from "vscode";
import * as path from "path";
import type { DependencyIndexer } from "../services/DependencyIndexer";

/**
 * Represents a cycle in the tree view.
 */
class CycleNode extends vscode.TreeItem {
  constructor(
    public readonly cycle: string[],
    public readonly workspaceRoot: string,
    public readonly index: number
  ) {
    super(`Cycle ${index + 1}`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("editorWarning.foreground"));
    this.tooltip = cycle.map(f => path.relative(workspaceRoot, f)).join(" → ");
  }
}

/**
 * Represents a file in a cycle path.
 */
class CycleFileNode extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly workspaceRoot: string,
    public readonly isLast: boolean
  ) {
    const relativePath = path.relative(workspaceRoot, filePath);
    const prefix = isLast ? "↩️ " : "→ ";
    super(prefix + relativePath, vscode.TreeItemCollapsibleState.None);

    this.tooltip = filePath;
    this.resourceUri = vscode.Uri.file(filePath);

    this.command = {
      command: "fileDeps.openFile",
      title: "Open File",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

/**
 * Info node for when there are no circular dependencies.
 */
class InfoNode extends vscode.TreeItem {
  constructor(message: string, isSuccess: boolean = false) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      isSuccess ? "check" : "info",
      isSuccess ? new vscode.ThemeColor("testing.iconPassed") : undefined
    );
  }
}

/**
 * Tree data provider for displaying circular dependencies.
 */
export class CircularDependencyProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentFile: vscode.Uri | undefined;
  private cycles: string[][] = [];

  constructor(private readonly indexer: DependencyIndexer) {}

  setCurrentFile(file: vscode.Uri | undefined): void {
    this.currentFile = file;
    this.refresh();
  }

  refresh(): void {
    this.cycles = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // If element is a CycleNode, return the files in the cycle
    if (element instanceof CycleNode) {
      return element.cycle.map(
        (filePath, idx) =>
          new CycleFileNode(
            filePath,
            element.workspaceRoot,
            idx === element.cycle.length - 1
          )
      );
    }

    // Other elements have no children
    if (element) {
      return [];
    }

    // Root level
    if (!this.currentFile) {
      return [new InfoNode("No file open")];
    }

    const filePath = this.currentFile.fsPath;

    if (!this.isSupportedFile(filePath)) {
      return [new InfoNode("Not a TS/JS file")];
    }

    const workspaceRoot = this.indexer.getPathResolver().getWorkspaceRoot();

    // Find circular dependencies
    this.cycles = this.indexer.findCircularDependencies(filePath);

    if (this.cycles.length === 0) {
      return [new InfoNode("No circular dependencies", true)];
    }

    // Return cycle nodes
    return this.cycles.map(
      (cycle, index) => new CycleNode(cycle, workspaceRoot, index)
    );
  }

  private isSupportedFile(filePath: string): boolean {
    const supportedExtensions = [".ts", ".tsx", ".js", ".jsx"];
    return supportedExtensions.some((ext) =>
      filePath.toLowerCase().endsWith(ext)
    );
  }
}
