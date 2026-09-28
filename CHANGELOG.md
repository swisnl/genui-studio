# Changelog

All notable changes to `genui-studio` will be documented in this file.

## 1.4.0

### Added
- Embed mode (`?embed=1`): host pages can load, edit and read back widgets over `postMessage`
- `@swis/genui-studio/embed` host client
- Configurable LLM providers (`baseURL`, `apiKey`, `headers`) and model list
- English and Dutch interface, with a language switch in the top bar. The agent replies in the interface language
- Embed options: `locale`, `colorScheme` (host-controlled light/dark mode, which hides the studio's toggle) and `themeCard`

### Changed
- The build uses relative paths, so `dist/` can be served from any path
- The CLI serves the studio at `/`. `/genui-studio/` still works
