export interface ImportInfo {
  /** The raw import path as written in the source */
  rawPath: string;
  /** The resolved absolute file path (or null if not found) */
  resolvedPath: string | null;
  /** Whether this is a local import (starts with . or @/) */
  isLocal: boolean;
}

export interface FileImports {
  /** The file that was parsed */
  filePath: string;
  /** List of imports found in the file */
  imports: ImportInfo[];
}

export interface DependencyIndex {
  /** Forward dependencies: file -> files it imports */
  forward: Map<string, Set<string>>;
  /** Reverse dependencies: file -> files that import it */
  reverse: Map<string, Set<string>>;
}

export interface PathAliases {
  /** Map of alias prefix to resolved path (e.g., "@/" -> "/home/user/project/src/") */
  aliases: Map<string, string>;
  /** The base URL from tsconfig */
  baseUrl: string;
}

/** Severity level for circular dependencies */
export type CycleSeverity = "critical" | "moderate" | "low";

/** Information about a circular dependency cycle */
export interface CycleInfo {
  /** Files involved in the cycle */
  files: string[];
  /** Severity level based on cycle length and impact */
  severity: CycleSeverity;
  /** Numeric score for sorting (higher = more critical) */
  score: number;
  /** Number of files that depend on files in this cycle */
  dependentCount: number;
}
