# Publishing

This extension is packaged and published with `vsce`.

## One-time setup

1. Create a publisher on the VS Code Marketplace:
   - https://marketplace.visualstudio.com/manage
2. Create a Personal Access Token (PAT) in Azure DevOps with the `Marketplace (Publish)` scope.
3. Install the packaging tool:

```sh
npm install -g @vscode/vsce
```

## Pre-publish checklist

- Update `package.json`:
  - `publisher`: your Marketplace publisher ID.
  - `version`: bump using semver.
  - `license`: ensure it matches `LICENSE`.
  - `repository`, `homepage`, `bugs`: add if you have public links.
  - `icon`: add an icon file if you want a Marketplace logo.
- Update `CHANGELOG.md` with the new version and date.
- Run a production build:

```sh
npm install
npm run compile
```

## Package

```sh
vsce package
```

This creates a `.vsix` file you can share or upload.

## Publish

```sh
vsce login <publisher>
vsce publish
```

To publish a specific version:

```sh
vsce publish <version>
```

## Verify

- Install the `.vsix` locally: `code --install-extension <file>.vsix`.
- Check that the views, commands, and webviews load as expected.

## VS Code-based editors

### Cursor

1. Package the extension with `vsce package`.
2. In Cursor, open the Command Palette and run `Extensions: Install from VSIX...`.
3. Select the generated `.vsix` file and reload the window if prompted.

### IBM BOB (VS Code based)

1. Package the extension with `vsce package`.
2. In IBM BOB, open the Command Palette and run `Extensions: Install from VSIX...`.
3. Select the generated `.vsix` file and reload the window if prompted.
