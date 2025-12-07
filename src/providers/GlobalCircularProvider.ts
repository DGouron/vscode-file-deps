import * as vscode from "vscode";
import * as path from "path";
import type { DependencyIndexer } from "../services/DependencyIndexer";
import type { CycleInfo, CycleSeverity } from "../types";

const SEVERITY_CONFIG: Record<
  CycleSeverity,
  { label: string; icon: string; color: string }
> = {
  critical: {
    label: "Critique",
    icon: "error",
    color: "errorForeground",
  },
  moderate: {
    label: "Modéré",
    icon: "warning",
    color: "editorWarning.foreground",
  },
  low: {
    label: "Faible",
    icon: "info",
    color: "editorInfo.foreground",
  },
};

/**
 * Represents a severity group in the tree view (Critical/Moderate/Low).
 */
class SeverityGroupNode extends vscode.TreeItem {
  constructor(
    public readonly severity: CycleSeverity,
    public readonly cycles: CycleInfo[],
    public readonly workspaceRoot: string
  ) {
    const config = SEVERITY_CONFIG[severity];
    const count = cycles.length;
    super(
      `${config.label} (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    this.iconPath = new vscode.ThemeIcon(
      config.icon,
      new vscode.ThemeColor(config.color)
    );
    this.tooltip = `${count} cycle${count > 1 ? "s" : ""} de niveau ${config.label.toLowerCase()}`;
    this.contextValue = `severityGroup-${severity}`;
  }
}

/**
 * Represents a single cycle in the tree view.
 */
class GlobalCycleNode extends vscode.TreeItem {
  constructor(
    public readonly cycleInfo: CycleInfo,
    public readonly workspaceRoot: string,
    public readonly index: number
  ) {
    const fileNames = cycleInfo.files.map((f) => path.basename(f, path.extname(f)));
    const cycleLabel = fileNames.join(" → ");
    const dependentInfo =
      cycleInfo.dependentCount > 0
        ? ` (${cycleInfo.dependentCount} dépendant${cycleInfo.dependentCount > 1 ? "s" : ""})`
        : "";

    super(
      `${cycleLabel}${dependentInfo}`,
      vscode.TreeItemCollapsibleState.Collapsed
    );

    const config = SEVERITY_CONFIG[cycleInfo.severity];
    this.iconPath = new vscode.ThemeIcon(
      "references",
      new vscode.ThemeColor(config.color)
    );

    const fullPaths = cycleInfo.files.map((f) =>
      path.relative(workspaceRoot, f)
    );
    this.tooltip = `${fullPaths.join(" → ")}\nFichiers: ${cycleInfo.files.length}\nDépendants: ${cycleInfo.dependentCount}`;
    this.contextValue = "globalCycle";
  }
}

/**
 * Represents a file in a cycle path.
 */
class GlobalCycleFileNode extends vscode.TreeItem {
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
 * Tree data provider for displaying ALL circular dependencies grouped by severity.
 */
export class GlobalCircularProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cyclesBySeverity: Record<CycleSeverity, CycleInfo[]> = {
    critical: [],
    moderate: [],
    low: [],
  };

  constructor(private readonly indexer: DependencyIndexer) {}

  refresh(): void {
    this.cyclesBySeverity = this.indexer.getCyclesBySeverity();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // If element is a GlobalCycleNode, return the files in the cycle
    if (element instanceof GlobalCycleNode) {
      const files = element.cycleInfo.files;
      // Add the first file at the end to show the cycle closure
      const filesWithClosure = [...files, files[0]];
      return filesWithClosure.map(
        (filePath, idx) =>
          new GlobalCycleFileNode(
            filePath,
            element.workspaceRoot,
            idx === filesWithClosure.length - 1
          )
      );
    }

    // If element is a SeverityGroupNode, return the cycles
    if (element instanceof SeverityGroupNode) {
      if (element.cycles.length === 0) {
        return [];
      }
      return element.cycles.map(
        (cycleInfo, index) =>
          new GlobalCycleNode(cycleInfo, element.workspaceRoot, index)
      );
    }

    // Other elements have no children
    if (element) {
      return [];
    }

    // Root level - return severity groups
    const workspaceRoot = this.indexer.getPathResolver().getWorkspaceRoot();

    // Check if any cycles exist
    const totalCycles =
      this.cyclesBySeverity.critical.length +
      this.cyclesBySeverity.moderate.length +
      this.cyclesBySeverity.low.length;

    if (totalCycles === 0) {
      return [new InfoNode("Aucune dépendance circulaire", true)];
    }

    // Return severity groups (only non-empty ones, but always show Critical first)
    const groups: SeverityGroupNode[] = [];
    const severities: CycleSeverity[] = ["critical", "moderate", "low"];

    for (const severity of severities) {
      const cycles = this.cyclesBySeverity[severity];
      // Always show the group if it has cycles
      if (cycles.length > 0) {
        groups.push(new SeverityGroupNode(severity, cycles, workspaceRoot));
      }
    }

    return groups;
  }
}
