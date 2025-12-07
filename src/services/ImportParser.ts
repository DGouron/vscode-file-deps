/**
 * Parses imports from TypeScript/JavaScript file content.
 * Extracts local imports only (relative paths and alias paths).
 */
export class ImportParser {
  private static readonly IMPORT_PATTERNS = [
    // import X from 'path' or import { X } from 'path'
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
    // import type { X } from 'path' or import type X from 'path'
    /import\s+type\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
    // require('path')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // dynamic import('path')
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // export * from 'path' or export { X } from 'path'
    /export\s+(?:\*|{[^}]*})\s+from\s+['"]([^'"]+)['"]/g,
    // export type { X } from 'path'
    /export\s+type\s+{[^}]*}\s+from\s+['"]([^'"]+)['"]/g,
  ];

  private aliasPatterns: string[];

  constructor(aliasPatterns: string[] = ["@/"]) {
    this.aliasPatterns = aliasPatterns;
  }

  /**
   * Parse all imports from file content
   * @param content The file content to parse
   * @returns Array of import paths (raw, as written in source)
   */
  parseImports(content: string): string[] {
    const imports = new Set<string>();

    for (const pattern of ImportParser.IMPORT_PATTERNS) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath && this.isLocalImport(importPath)) {
          imports.add(importPath);
        }
      }
    }

    return Array.from(imports);
  }

  /**
   * Check if an import path is local (relative or alias)
   * @param importPath The import path to check
   */
  isLocalImport(importPath: string): boolean {
    // Relative imports
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      return true;
    }

    // Alias imports from tsconfig paths
    for (const alias of this.aliasPatterns) {
      if (importPath.startsWith(alias)) {
        return true;
      }
      // Also check exact match for aliases without trailing slash
      if (importPath === alias || importPath.startsWith(alias + "/")) {
        return true;
      }
    }

    // Check for @ imports that look like aliases (not scoped npm packages)
    // Scoped npm packages: @org/package (has slash after org name)
    // Aliases: @components, @/utils, @router (configured in tsconfig)
    if (importPath.startsWith("@")) {
      const afterAt = importPath.slice(1);
      // If no slash or slash is not after a "package-like" name, might be alias
      // Let the resolver try to resolve it
      const slashIndex = afterAt.indexOf("/");
      if (slashIndex === -1) {
        // @something without slash - likely an alias
        return true;
      }
    }

    return false;
  }

  /**
   * Update the alias patterns for local import detection
   */
  setAliasPatterns(patterns: string[]): void {
    this.aliasPatterns = patterns;
  }
}
