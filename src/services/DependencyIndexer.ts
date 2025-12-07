import * as vscode from "vscode";
import * as fs from "fs";
import { ImportParser } from "./ImportParser";
import { PathResolver } from "./PathResolver";
import type { DependencyIndex } from "../types";

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
}
