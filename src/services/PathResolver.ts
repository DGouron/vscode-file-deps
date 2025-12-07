import * as path from "path";
import * as fs from "fs";
import type { PathAliases } from "../types";

/**
 * Resolves import paths to absolute file paths.
 * Supports relative paths and TypeScript path aliases.
 */
export class PathResolver {
  private static readonly EXTENSIONS = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.jsx",
  ];

  private aliases: Map<string, string> = new Map();
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Load path aliases from tsconfig.json
   */
  async loadAliases(): Promise<PathAliases> {
    const tsconfigPath = path.join(this.workspaceRoot, "tsconfig.json");

    try {
      if (!fs.existsSync(tsconfigPath)) {
        return { aliases: new Map(), baseUrl: "." };
      }

      const content = fs.readFileSync(tsconfigPath, "utf-8");
      // Remove comments (simple approach for single-line comments)
      const cleanContent = content.replace(/\/\/.*$/gm, "");
      const tsconfig = JSON.parse(cleanContent);

      const paths = tsconfig.compilerOptions?.paths || {};
      const baseUrl = tsconfig.compilerOptions?.baseUrl || ".";

      this.aliases.clear();

      for (const [alias, targets] of Object.entries(paths)) {
        if (Array.isArray(targets) && targets.length > 0) {
          // "@/*" -> ["src/*"] => "@/" -> "/absolute/path/to/src/"
          const cleanAlias = alias.replace("/*", "/");
          const cleanTarget = (targets[0] as string).replace("/*", "/");
          const resolvedTarget = path.join(
            this.workspaceRoot,
            baseUrl,
            cleanTarget
          );
          this.aliases.set(cleanAlias, resolvedTarget);
        }
      }

      return { aliases: this.aliases, baseUrl };
    } catch {
      return { aliases: new Map(), baseUrl: "." };
    }
  }

  /**
   * Get alias patterns for ImportParser
   */
  getAliasPatterns(): string[] {
    return Array.from(this.aliases.keys());
  }

  /**
   * Resolve an import path to an absolute file path
   * @param importPath The import path (e.g., "./utils" or "@/lib/helper")
   * @param fromFile The file containing the import (for relative resolution)
   */
  resolve(importPath: string, fromFile: string): string | null {
    let basePath: string;

    // Handle relative imports
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      basePath = path.resolve(path.dirname(fromFile), importPath);
    } else {
      // Handle alias imports
      let resolved = false;
      for (const [alias, target] of this.aliases) {
        if (importPath.startsWith(alias)) {
          basePath = importPath.replace(alias, target);
          resolved = true;
          break;
        }
      }

      if (!resolved) {
        // Not a local or alias import
        return null;
      }
    }

    // Try to resolve with extensions
    return this.resolveWithExtensions(basePath);
  }

  /**
   * Try different extensions to find the actual file
   */
  private resolveWithExtensions(basePath: string): string | null {
    for (const ext of PathResolver.EXTENSIONS) {
      const fullPath = basePath + ext;
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }
    return null;
  }

  /**
   * Get the workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}
