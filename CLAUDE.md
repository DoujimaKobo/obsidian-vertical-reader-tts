# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # development build with watch mode + inline source maps
npm run build     # production build (minified, no source maps)
npx tsc --noEmit  # type checking only
```

After building, copy `main.js`, `manifest.json`, and `styles.css` to your Obsidian vault at `<vault>/.obsidian/plugins/vertical-reader-tts/`, then reload the plugin in Obsidian Settings.

There is no test suite or linter configured.

## Architecture

This is an Obsidian plugin (TypeScript + Svelte 4) that renders Markdown in a vertical reading view with ruby/furigana support and dual text-to-speech engines.

### Plugin entry and Obsidian lifecycle

`src/main.ts` exports the top-level `VerticalReaderPlugin` class. `onload()` initializes TTS engines, loads settings, registers the `"vertical-reader-view"` view type, and adds the ribbon icon/command. `onunload()` tears down TTS engines and editor sync. The plugin uses `src/settings.ts` for the settings interface and settings tab UI.

### View and Svelte mounting

`src/views/VerticalReaderView.ts` is an Obsidian `ItemView`. Its `onOpen()` mounts the Svelte root component (`src/components/VerticalReader.svelte`) into the view container, passing TTS engine, highlight manager, settings, and app as props. This is the bridge between Obsidian's view lifecycle and Svelte's component tree.

### Ruby text pipeline

Three input formats are all normalized to `RubySegment[]` by `src/parsers/RubyParser.ts`:
- `[base]{annotation}` — plugin-native format
- `｜base《annotation》` — Aozora Bunko explicit
- `kanji《annotation》` — Aozora Bunko auto kanji detection

Parsed segments are rendered as HTML `<ruby>/<rt>` elements by `src/components/RubyText.svelte`. Distributed annotations (multiple characters annotated individually) split on `.`, `・`, `|`, `/`, or space.

### TTS dual-engine design

`src/tts/TTSEngine.ts` is the unified abstraction. It routes to either:
- **Web Speech API** — browser-native, always available
- **VOICEVOX** (`src/tts/VOICEVOXEngine.ts`) — HTTP API to a local/remote VOICEVOX server (`http://127.0.0.1:50021` by default), preferred when enabled

Only one engine is active at a time. An `isProcessing` flag enforces exclusive control to prevent concurrent synthesis. VOICEVOX processes text in chunks of ≤500 characters with dual-buffer prefetch (current + next chunk). When ruby priority is enabled, VOICEVOX reads the annotation (reading) rather than the base kanji.

`src/tts/TTSState.ts` is a Svelte store holding `{ isPlaying, isPaused, playbackRate, currentCharIndex, currentCharLength }`. All components subscribe to this store rather than receiving TTS state as props.

`src/tts/HighlightManager.ts` listens to word boundary events from the active TTS engine and applies highlight CSS to the corresponding DOM element in `VerticalReader.svelte`.

### Editor synchronization

`src/utils/EditorSync.ts` listens to Obsidian events (active leaf changes, editor changes, file modifications) and pushes the active Markdown editor's content to the vertical reader view, debounced at 300ms.

### Build system

`esbuild.config.mjs` uses esbuild with the esbuild-svelte plugin. Output is a single CommonJS `main.js` (required by Obsidian). Obsidian, Electron, and CodeMirror modules are listed as externals since they are provided by the host app. TypeScript target is ES2018.
