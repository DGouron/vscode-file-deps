import * as vscode from "vscode";
import * as path from "path";

/**
 * Represents a folder node in the tree view.
 */
export class FolderNode extends vscode.TreeItem {
  public readonly children: FileNode[] = [];

  constructor(
    public readonly folderPath: string,
    public readonly workspaceRoot: string
  ) {
    const relativePath = path.relative(workspaceRoot, folderPath);
    super(relativePath || ".", vscode.TreeItemCollapsibleState.Expanded);

    this.tooltip = folderPath;
    this.iconPath = vscode.ThemeIcon.Folder;
    this.contextValue = "folder";
  }

  addChild(node: FileNode): void {
    this.children.push(node);
  }
}

/**
 * Represents a file node in the tree view.
 */
export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly workspaceRoot: string
  ) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);

    this.tooltip = filePath;
    this.iconPath = vscode.ThemeIcon.File;
    this.contextValue = "file";

    // Make the item clickable to open the file
    this.command = {
      command: "fileDeps.openFile",
      title: "Open File",
      arguments: [vscode.Uri.file(filePath)],
    };

    // Set resource URI for proper file icon
    this.resourceUri = vscode.Uri.file(filePath);
  }
}

/**
 * Represents an info node when there are no dependencies or no file is open.
 */
export class InfoNode extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

/**
 * Build a tree structure from a list of file paths.
 * Groups files by their parent folder.
 */
export function buildTree(
  filePaths: string[],
  workspaceRoot: string
): (FolderNode | FileNode)[] {
  // Group files by folder
  const folderMap = new Map<string, string[]>();

  for (const filePath of filePaths) {
    const folderPath = path.dirname(filePath);
    if (!folderMap.has(folderPath)) {
      folderMap.set(folderPath, []);
    }
    folderMap.get(folderPath)!.push(filePath);
  }

  // If only one folder, return files directly (no folder wrapper)
  if (folderMap.size === 1) {
    const files = Array.from(folderMap.values())[0];
    return files
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
      .map((f) => new FileNode(f, workspaceRoot));
  }

  // Build folder nodes with children
  const result: FolderNode[] = [];

  // Sort folders by path
  const sortedFolders = Array.from(folderMap.keys()).sort();

  for (const folderPath of sortedFolders) {
    const files = folderMap.get(folderPath)!;
    const folderNode = new FolderNode(folderPath, workspaceRoot);

    // Sort files within folder
    files
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
      .forEach((f) => folderNode.addChild(new FileNode(f, workspaceRoot)));

    result.push(folderNode);
  }

  return result;
}
