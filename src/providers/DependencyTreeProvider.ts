import * as vscode from "vscode";
import { FolderNode, FileNode, InfoNode, buildTree } from "./DependencyNode";
import type { DependencyIndexer } from "../services/DependencyIndexer";

export type DependencyDirection = "outgoing" | "incoming";

/**
 * Tree data provider for displaying file dependencies.
 */
export class DependencyTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentFile: vscode.Uri | undefined;
  private cachedTree: (FolderNode | FileNode | InfoNode)[] = [];

  constructor(
    private readonly direction: DependencyDirection,
    private readonly indexer: DependencyIndexer
  ) {}

  /**
   * Set the current file and refresh the tree
   */
  setCurrentFile(file: vscode.Uri | undefined): void {
    this.currentFile = file;
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.cachedTree = [];
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children (dependencies) for the tree
   */
  async getChildren(
    element?: vscode.TreeItem
  ): Promise<vscode.TreeItem[]> {
    // If element is a FolderNode, return its children
    if (element instanceof FolderNode) {
      return element.children;
    }

    // For file nodes or other nodes, no children
    if (element) {
      return [];
    }

    // Root level - build the tree
    if (!this.currentFile) {
      return [new InfoNode("No file open")];
    }

    const filePath = this.currentFile.fsPath;

    if (!this.isSupportedFile(filePath)) {
      return [new InfoNode("Not a TS/JS file")];
    }

    const workspaceRoot = this.indexer.getPathResolver().getWorkspaceRoot();

    let dependencies: string[];

    if (this.direction === "outgoing") {
      dependencies = await this.indexer.getImportsForFile(filePath);
    } else {
      dependencies = this.indexer.getIncomingDependencies(filePath);
    }

    if (dependencies.length === 0) {
      const message =
        this.direction === "outgoing"
          ? "No imports found"
          : "No files import this";
      return [new InfoNode(message)];
    }

    // Build tree structure grouped by folders
    this.cachedTree = buildTree(dependencies, workspaceRoot);
    return this.cachedTree;
  }

  /**
   * Check if a file is a supported TypeScript/JavaScript file
   */
  private isSupportedFile(filePath: string): boolean {
    const supportedExtensions = [".ts", ".tsx", ".js", ".jsx"];
    return supportedExtensions.some((ext) =>
      filePath.toLowerCase().endsWith(ext)
    );
  }
}
