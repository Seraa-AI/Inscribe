# @scrivr/core

## 1.0.1

### Patch Changes

- 4b0e9c0: Add README.md to all packages with installation instructions, API overview, and usage examples. Fix root README to reference the correct hook name (`useScrivrEditor`) and renderer (`TileManager`).

## 1.0.0

### Minor Changes

- 7ba7cb5: Add ClearFormatting extension — `Mod-\` removes all inline marks, converts headings/code blocks to paragraphs, resets alignment and font family, and flattens lists back to plain paragraphs. Matches Google Docs behaviour. Exposed as `editor.commands.clearFormatting()` and registered in StarterKit.
