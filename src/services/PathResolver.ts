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
   * Load path aliases from tsconfig.json (with extends support)
   */
  async loadAliases(): Promise<PathAliases> {
    const tsconfig = this.loadTsConfig(this.workspaceRoot);

    if (!tsconfig) {
      return { aliases: new Map(), baseUrl: "." };
    }

    const paths = tsconfig.compilerOptions?.paths || {};
    const baseUrl = tsconfig.compilerOptions?.baseUrl || ".";

    this.aliases.clear();

    for (const [alias, targets] of Object.entries(paths)) {
      if (Array.isArray(targets) && targets.length > 0) {
        let target = targets[0] as string;

        // Normalize target path (remove leading ./)
        if (target.startsWith("./")) {
          target = target.slice(2);
        }

        // Handle both "@/*" -> ["src/*"] and "@container" -> ["src/container"]
        let cleanAlias: string;
        let cleanTarget: string;

        if (alias.endsWith("/*")) {
          // "@/*" -> "@/"
          cleanAlias = alias.slice(0, -1); // Remove trailing *
          cleanTarget = target.endsWith("/*") ? target.slice(0, -1) : target.replace(/\*$/, "");
        } else if (alias.endsWith("*")) {
          // "@*" -> "@"
          cleanAlias = alias.slice(0, -1);
          cleanTarget = target.endsWith("*") ? target.slice(0, -1) : target;
        } else {
          // "@container" -> "@container"
          cleanAlias = alias;
          cleanTarget = target;
        }

        // Normalize baseUrl (remove leading ./)
        let normalizedBaseUrl = baseUrl;
        if (normalizedBaseUrl.startsWith("./")) {
          normalizedBaseUrl = normalizedBaseUrl.slice(2);
        }
        if (normalizedBaseUrl === ".") {
          normalizedBaseUrl = "";
        }

        const resolvedTarget = path.join(this.workspaceRoot, normalizedBaseUrl, cleanTarget);
        this.aliases.set(cleanAlias, resolvedTarget);
      }
    }

    return { aliases: this.aliases, baseUrl };
  }

  /**
   * Search for tsconfig.json in immediate subfolders (depth 1)
   * Excludes node_modules, .git, and hidden folders
   */
  private findTsConfigInSubfolders(rootDir: string): string | null {
    const excludedFolders = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });

      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !excludedFolders.has(entry.name)
        ) {
          const tsconfigPath = path.join(rootDir, entry.name, "tsconfig.json");
          if (fs.existsSync(tsconfigPath)) {
            return tsconfigPath;
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to search subfolders in ${rootDir}:`, error);
    }

    return null;
  }

  /**
   * Load tsconfig.json with extends support
   * Searches in root, common subdirectories, and immediate subfolders
   */
  private loadTsConfig(rootDir: string): Record<string, unknown> | null {
    // 1. Priority: common locations (performance)
    const commonPaths = [
      path.join(rootDir, "tsconfig.json"),
      path.join(rootDir, "frontend", "tsconfig.json"),
      path.join(rootDir, "src", "tsconfig.json"),
      path.join(rootDir, "app", "tsconfig.json"),
      path.join(rootDir, "client", "tsconfig.json"),
    ];

    let tsconfigPath: string | null = null;

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        tsconfigPath = p;
        break;
      }
    }

    // 2. If not found, search in immediate subfolders
    if (!tsconfigPath) {
      tsconfigPath = this.findTsConfigInSubfolders(rootDir);
    }

    if (!tsconfigPath) {
      return null;
    }

    // Update workspace root to tsconfig's directory
    this.workspaceRoot = path.dirname(tsconfigPath);

    try {
      const content = fs.readFileSync(tsconfigPath, "utf-8");
      // Remove comments (single-line and trailing)
      const cleanContent = content
        .replace(/\/\/.*$/gm, "")
        .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas

      const tsconfig = JSON.parse(cleanContent);

      // Handle extends
      if (tsconfig.extends) {
        const extendsPath = path.resolve(rootDir, tsconfig.extends);
        const baseDir = path.dirname(extendsPath);
        const baseName = path.basename(extendsPath);
        const baseConfigPath = baseName.endsWith(".json")
          ? extendsPath
          : extendsPath + ".json";

        if (fs.existsSync(baseConfigPath)) {
          const baseContent = fs.readFileSync(baseConfigPath, "utf-8");
          const cleanBaseContent = baseContent
            .replace(/\/\/.*$/gm, "")
            .replace(/,\s*([}\]])/g, "$1");
          const baseConfig = JSON.parse(cleanBaseContent);

          // Merge configs (tsconfig overrides base)
          return {
            ...baseConfig,
            ...tsconfig,
            compilerOptions: {
              ...baseConfig.compilerOptions,
              ...tsconfig.compilerOptions,
              paths: {
                ...baseConfig.compilerOptions?.paths,
                ...tsconfig.compilerOptions?.paths,
              },
            },
          };
        }
      }

      return tsconfig;
    } catch (e) {
      console.error("Error loading tsconfig:", e);
      return null;
    }
  }

  /**
   * Get alias patterns for ImportParser
   */
  getAliasPatterns(): string[] {
    const patterns: string[] = [];
    for (const alias of this.aliases.keys()) {
      // Add the alias as-is for matching
      patterns.push(alias);
      // Also add without trailing slash if it has one
      if (alias.endsWith("/")) {
        patterns.push(alias.slice(0, -1));
      }
    }
    return patterns;
  }

  /**
   * Resolve an import path to an absolute file path
   */
  resolve(importPath: string, fromFile: string): string | null {
    let basePath: string | undefined;

    // Handle relative imports
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      basePath = path.resolve(path.dirname(fromFile), importPath);
    } else {
      // Handle alias imports - find the best matching alias
      let bestMatch = "";
      let bestTarget = "";

      for (const [alias, target] of this.aliases) {
        // Check if import starts with this alias
        if (importPath === alias || importPath.startsWith(alias)) {
          // Use the longest matching alias
          if (alias.length > bestMatch.length) {
            bestMatch = alias;
            bestTarget = target;
          }
        }
      }

      if (bestMatch) {
        // Replace alias with target path
        basePath = importPath.replace(bestMatch, bestTarget);
      }
    }

    if (!basePath) {
      return null;
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
