# Changelog

All notable changes to the "File Dependencies Viewer" extension will be documented in this file.

## [0.1.0] - 2025-12-07

### Added
- Initial release
- **Imports view**: Display files imported by the current file
- **Used by view**: Display files that import the current file
- **Circular dependencies view**: Detect and display circular import chains
- Support for TypeScript path aliases (`@/`, `~/`, etc.)
- Support for `import type` statements
- Tree view grouped by folders
- Click to open any dependency file
- Refresh command to re-index workspace
- Auto-refresh on file save
