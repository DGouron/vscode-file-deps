# Contributing to File Dependencies Viewer

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vscode-file-deps.git
   cd vscode-file-deps
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the extension:
   ```bash
   npm run build
   ```

## Development

### Running the Extension
1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Make changes and reload (`Ctrl+R`) to test

### Building
```bash
npm run build      # Build once
npm run watch      # Build on file changes
```

### Packaging
```bash
npm run package    # Create .vsix file
```

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit:
   ```bash
   git commit -m "feat: Add your feature"
   ```

3. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a Pull Request against `main`

## Commit Messages

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `chore:` Maintenance
- `refactor:` Code refactoring

## Code Style

- Use TypeScript
- Follow existing code patterns
- Keep functions small and focused

## Questions?

Open an issue if you have questions!
