# Harfi

> **Beta** — APIs may change between releases. Pin to an exact version and review the changelog before upgrading.

Harfi is an open-source, canvas-rendered document editor framework. Unlike traditional DOM-based rich-text editors, Harfi renders its content directly onto `<canvas>` elements — giving you pixel-perfect, paginated layouts without fighting the browser's layout engine.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Model** | ProseMirror | Immutable document tree, schema validation, rich-text history |
| **Layout** | Custom engine | Pagination, line-breaking, and text measurement independent of the DOM |
| **Renderer** | HTML5 Canvas | Paints the document directly onto `<canvas>` for pixel-perfect visual fidelity |
| **Input** | Hidden `<textarea>` | Bridges browser keyboard and IME events to ProseMirror transactions |

## Packages

| Package | Description |
|---------|-------------|
| [`@harfi/core`](./packages/core) | Headless engine — `Editor`, layout engine, canvas `ViewManager`, and all built-in extensions |
| [`@harfi/react`](./packages/react) | React bindings — `useCanvasEditor`, `<Harfi />`, and menu components |
| [`@harfi/plugins`](./packages/plugins) | Optional extensions — real-time collaboration (Yjs), AI Toolkit, and Track Changes |
| [`@harfi/export`](./packages/export) | Export utilities — paginated PDF (`exportToPdf`) and Markdown (`exportToMarkdown`) |

## Quick Start

```bash
pnpm add @harfi/core @harfi/react
```

```tsx
import { useCanvasEditor, Harfi, StarterKit } from '@harfi/react';

export function MyEditor() {
  const editor = useCanvasEditor({
    extensions: [StarterKit],
  });

  return <Harfi editor={editor} style={{ height: '100vh' }} />;
}
```

## Monorepo Structure

```
apps/
  demo/     # Vite + React demo application
  docs/     # Fumadocs documentation site
  server/   # Hocuspocus collaboration server
packages/
  core/     # @harfi/core
  react/    # @harfi/react
  plugins/  # @harfi/plugins
  export/   # @harfi/export
```

## Development

**Prerequisites:** Node.js ≥ 18, pnpm

```bash
# Install dependencies
pnpm install

# Run the demo app
pnpm dev

# Run the docs site
pnpm dev:docs

# Run all tests
pnpm test

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck
```

## Documentation

Run the docs site locally:

```bash
pnpm dev:docs
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contribution guide, branch naming conventions, and pull request process.

## License

Apache-2.0 — see [`LICENSE`](./LICENSE) for details.
