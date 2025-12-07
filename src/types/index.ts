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
