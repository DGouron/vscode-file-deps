import * as vscode from "vscode";
import { DependencyTreeProvider } from "./providers/DependencyTreeProvider";
import { CircularDependencyProvider } from "./providers/CircularDependencyProvider";
import { DependencyIndexer } from "./services/DependencyIndexer";

let outgoingProvider: DependencyTreeProvider;
let incomingProvider: DependencyTreeProvider;
let circularProvider: CircularDependencyProvider;
let indexer: DependencyIndexer;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showWarningMessage(
      "File Dependencies: No workspace folder open"
    );
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;

  // Initialize the dependency indexer
  indexer = new DependencyIndexer(workspaceRoot);

  // Create tree providers
  outgoingProvider = new DependencyTreeProvider("outgoing", indexer);
  incomingProvider = new DependencyTreeProvider("incoming", indexer);
  circularProvider = new CircularDependencyProvider(indexer);

  // Register tree views
  vscode.window.registerTreeDataProvider("fileDepsOutgoing", outgoingProvider);
  vscode.window.registerTreeDataProvider("fileDepsIncoming", incomingProvider);
  vscode.window.registerTreeDataProvider("fileDepsCircular", circularProvider);

  // Index workspace in background
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Indexing file dependencies...",
      cancellable: false,
    },
    async () => {
      await indexer.indexWorkspace();
      // Refresh views after indexing
      updateCurrentFile(vscode.window.activeTextEditor?.document.uri);
    }
  );

  // Listen to active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateCurrentFile(editor?.document.uri);
    })
  );

  // Listen to file saves for re-indexing
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (isSupportedFile(document.uri.fsPath)) {
        await indexer.indexFile(document.uri.fsPath);
        // Refresh all views
        outgoingProvider.refresh();
        incomingProvider.refresh();
        circularProvider.refresh();
      }
    })
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("fileDeps.refresh", async () => {
      await indexer.indexWorkspace();
      updateCurrentFile(vscode.window.activeTextEditor?.document.uri);
    })
  );

  // Register open file command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "fileDeps.openFile",
      async (uri: vscode.Uri) => {
        await vscode.window.showTextDocument(uri);
      }
    )
  );

  // Set initial file
  updateCurrentFile(vscode.window.activeTextEditor?.document.uri);
}

function updateCurrentFile(uri: vscode.Uri | undefined): void {
  outgoingProvider.setCurrentFile(uri);
  incomingProvider.setCurrentFile(uri);
  circularProvider.setCurrentFile(uri);
}

function isSupportedFile(filePath: string): boolean {
  const supportedExtensions = [".ts", ".tsx", ".js", ".jsx"];
  return supportedExtensions.some((ext) =>
    filePath.toLowerCase().endsWith(ext)
  );
}

export function deactivate(): void {
  // Cleanup if needed
}
