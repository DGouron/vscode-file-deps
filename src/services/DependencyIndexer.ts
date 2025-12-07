import * as vscode from "vscode";
import * as fs from "fs";
import { ImportParser } from "./ImportParser";
import { PathResolver } from "./PathResolver";
import type { DependencyIndex, CycleInfo, CycleSeverity } from "../types";

/**
 * Indexes all file dependencies in the workspace.
 * Maintains both forward (imports) and reverse (imported by) dependencies.
 */
export class DependencyIndexer {
  private index: DependencyIndex = {
    forward: new Map(),
    reverse: new Map(),
  };

  private importParser: ImportParser;
  private pathResolver: PathResolver;
  private isIndexing = false;

  constructor(workspaceRoot: string) {
    this.pathResolver = new PathResolver(workspaceRoot);
    this.importParser = new ImportParser();
  }

  /**
   * Index all TypeScript/JavaScript files in the workspace
   */
  async indexWorkspace(): Promise<void> {
    if (this.isIndexing) {
      return;
    }

    this.isIndexing = true;

    try {
      // Load path aliases first
      await this.pathResolver.loadAliases();
      this.importParser.setAliasPatterns(this.pathResolver.getAliasPatterns());

      // Clear existing index
      this.index.forward.clear();
      this.index.reverse.clear();

      // Find all TS/JS files
      const files = await vscode.workspace.findFiles(
        "**/*.{ts,tsx,js,jsx}",
        "**/node_modules/**"
      );

      // Index each file
      for (const file of files) {
        await this.indexFile(file.fsPath);
      }
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const imports = this.importParser.parseImports(content);

      // Clear old entries for this file
      this.removeFileFromIndex(filePath);

      const resolvedImports = new Set<string>();

      for (const importPath of imports) {
        const resolved = this.pathResolver.resolve(importPath, filePath);
        if (resolved) {
          resolvedImports.add(resolved);

          // Add to reverse index
          if (!this.index.reverse.has(resolved)) {
            this.index.reverse.set(resolved, new Set());
          }
          this.index.reverse.get(resolved)!.add(filePath);
        }
      }

      // Add to forward index
      this.index.forward.set(filePath, resolvedImports);
    } catch {
      // File might not exist or be readable
    }
  }

  /**
   * Remove a file from the index (for updates/deletions)
   */
  private removeFileFromIndex(filePath: string): void {
    // Remove from forward index and clean up reverse references
    const oldImports = this.index.forward.get(filePath);
    if (oldImports) {
      for (const imp of oldImports) {
        const reverseSet = this.index.reverse.get(imp);
        if (reverseSet) {
          reverseSet.delete(filePath);
          if (reverseSet.size === 0) {
            this.index.reverse.delete(imp);
          }
        }
      }
    }
    this.index.forward.delete(filePath);
  }

  /**
   * Get files that the given file imports (outgoing dependencies)
   */
  getOutgoingDependencies(filePath: string): string[] {
    const deps = this.index.forward.get(filePath);
    return deps ? Array.from(deps).sort() : [];
  }

  /**
   * Get files that import the given file (incoming dependencies)
   */
  getIncomingDependencies(filePath: string): string[] {
    const deps = this.index.reverse.get(filePath);
    return deps ? Array.from(deps).sort() : [];
  }

  /**
   * Parse imports for a single file without full indexing
   * Useful for getting outgoing deps of the current file quickly
   */
  async getImportsForFile(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const imports = this.importParser.parseImports(content);

      const resolved: string[] = [];
      for (const importPath of imports) {
        const resolvedPath = this.pathResolver.resolve(importPath, filePath);
        if (resolvedPath) {
          resolved.push(resolvedPath);
        }
      }

      return resolved.sort();
    } catch {
      return [];
    }
  }

  /**
   * Get the PathResolver for external use
   */
  getPathResolver(): PathResolver {
    return this.pathResolver;
  }

  /**
   * Detect circular dependencies involving the given file.
   * Returns an array of cycles, where each cycle is an array of file paths.
   * Example: [[A, B, C, A]] means A imports B, B imports C, C imports A
   */
  findCircularDependencies(filePath: string): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (current: string): void => {
      if (currentPath.includes(current)) {
        // Found a cycle - extract it
        const cycleStart = currentPath.indexOf(current);
        const cycle = [...currentPath.slice(cycleStart), current];

        // Only add if it involves our target file
        if (cycle.includes(filePath)) {
          cycles.push(cycle);
        }
        return;
      }

      if (visited.has(current)) {
        return;
      }

      visited.add(current);
      currentPath.push(current);

      const dependencies = this.index.forward.get(current);
      if (dependencies) {
        for (const dep of dependencies) {
          dfs(dep);
        }
      }

      currentPath.pop();
    };

    dfs(filePath);

    // Remove duplicate cycles (same cycle starting from different points)
    return this.deduplicateCycles(cycles);
  }

  /**
   * Remove duplicate cycles (same cycle but starting from different nodes)
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const seen = new Set<string>();
    const unique: string[][] = [];

    for (const cycle of cycles) {
      // Normalize cycle: start from the smallest path (alphabetically)
      const withoutLast = cycle.slice(0, -1);
      const minIndex = withoutLast.reduce(
        (minIdx, path, idx, arr) => (path < arr[minIdx] ? idx : minIdx),
        0
      );
      const normalized = [
        ...withoutLast.slice(minIndex),
        ...withoutLast.slice(0, minIndex),
        withoutLast[minIndex],
      ];

      const key = normalized.join(" -> ");
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(cycle);
      }
    }

    return unique;
  }

  /**
   * Find ALL circular dependencies in the entire project using Tarjan's SCC algorithm.
   * Returns cycles with severity information, sorted by criticality (most critical first).
   */
  getAllCircularDependencies(): CycleInfo[] {
    const allCycles = this.findAllCyclesWithTarjan();
    const totalFiles = this.index.forward.size;

    const cycleInfos: CycleInfo[] = allCycles.map((files) => {
      const dependentCount = this.countDependentsForCycle(files);
      const { severity, score } = this.calculateCycleSeverity(
        files.length,
        dependentCount,
        totalFiles
      );

      return {
        files,
        severity,
        score,
        dependentCount,
      };
    });

    // Sort by score descending (most critical first)
    return cycleInfos.sort((a, b) => b.score - a.score);
  }

  /**
   * Find all cycles using Tarjan's Strongly Connected Components algorithm.
   * Returns SCCs with more than one node (which indicate cycles).
   */
  private findAllCyclesWithTarjan(): string[][] {
    let index = 0;
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowLinks = new Map<string, number>();
    const sccs: string[][] = [];

    const strongConnect = (node: string): void => {
      indices.set(node, index);
      lowLinks.set(node, index);
      index++;
      stack.push(node);
      onStack.add(node);

      const successors = this.index.forward.get(node);
      if (successors) {
        for (const successor of successors) {
          if (!indices.has(successor)) {
            strongConnect(successor);
            lowLinks.set(
              node,
              Math.min(lowLinks.get(node)!, lowLinks.get(successor)!)
            );
          } else if (onStack.has(successor)) {
            lowLinks.set(
              node,
              Math.min(lowLinks.get(node)!, indices.get(successor)!)
            );
          }
        }
      }

      // If node is a root node, pop the stack and generate an SCC
      if (lowLinks.get(node) === indices.get(node)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== node);

        // Only keep SCCs with more than one node (actual cycles)
        if (scc.length > 1) {
          sccs.push(scc);
        }
      }
    };

    // Run Tarjan on all nodes
    for (const node of this.index.forward.keys()) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    return sccs;
  }

  /**
   * Count how many files depend on any file in the cycle
   * (excluding files that are part of the cycle itself)
   */
  private countDependentsForCycle(cycleFiles: string[]): number {
    const cycleSet = new Set(cycleFiles);
    const dependents = new Set<string>();

    for (const file of cycleFiles) {
      const fileDependents = this.index.reverse.get(file);
      if (fileDependents) {
        for (const dep of fileDependents) {
          if (!cycleSet.has(dep)) {
            dependents.add(dep);
          }
        }
      }
    }

    return dependents.size;
  }

  /**
   * Calculate severity based on cycle length and number of dependents.
   * Shorter cycles with more dependents are more critical.
   */
  private calculateCycleSeverity(
    cycleLength: number,
    dependentCount: number,
    totalFiles: number
  ): { severity: CycleSeverity; score: number } {
    // Score formula:
    // - Shorter cycles = more critical (weight: 40%)
    // - More dependents = more critical (weight: 60%)
    const lengthScore = cycleLength <= 2 ? 1 : cycleLength <= 4 ? 0.6 : 0.3;
    const dependentScore =
      totalFiles > 0 ? Math.min(dependentCount / totalFiles, 1) : 0;

    const score = lengthScore * 0.4 + dependentScore * 0.6;

    let severity: CycleSeverity;
    if (score >= 0.5) {
      severity = "critical";
    } else if (score >= 0.25) {
      severity = "moderate";
    } else {
      severity = "low";
    }

    return { severity, score };
  }

  /**
   * Get cycles grouped by severity level
   */
  getCyclesBySeverity(): Record<CycleSeverity, CycleInfo[]> {
    const allCycles = this.getAllCircularDependencies();

    return {
      critical: allCycles.filter((c) => c.severity === "critical"),
      moderate: allCycles.filter((c) => c.severity === "moderate"),
      low: allCycles.filter((c) => c.severity === "low"),
    };
  }
}
