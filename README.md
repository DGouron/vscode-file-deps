# File Dependencies Viewer

VS Code extension that displays file dependencies in real-time as a Tree View.

## Features

- **Imports (This file uses)**: Shows all files imported by the current file
- **Used by (Reverse deps)**: Shows all files that import the current file
- **Circular Dependencies**: Detects and displays circular import chains

## Screenshots

### Tree View in Explorer
The extension adds three views in the Explorer sidebar:

```
IMPORTS (THIS FILE USES)
├── src/components
│   ├── Button.tsx
│   └── Modal.tsx
└── src/utils
    └── helpers.ts

USED BY (REVERSE DEPS)
├── src/pages
│   └── Home.tsx
└── src/App.tsx

⚠️ CIRCULAR DEPENDENCIES
└── ⚠ Cycle 1
    ├── → src/A.ts
    ├── → src/B.ts
    └── ↩️ src/A.ts
```

## Supported File Types

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)

## Features

- Real-time updates when switching files
- Support for TypeScript path aliases (`@/`, etc.)
- Grouped by folders for better visualization
- Click on any file to open it
- Refresh button to re-index the workspace

## Requirements

No additional requirements. Works out of the box with any TypeScript/JavaScript project.

## Extension Settings

This extension doesn't add any VS Code settings yet.

## Known Issues

- Large projects may take a moment to index on first load

## Release Notes

### 0.1.0

Initial release:
- Import tracking
- Reverse dependency tracking
- Circular dependency detection
- TypeScript path alias support

## License

MIT
