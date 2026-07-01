# Obsidian Vertical Reader with TTS

An Obsidian plugin that provides a vertical reading view with Ruby text support and integrated text-to-speech functionality.

## Features

- **Vertical Reading View**: Display text vertically (right-to-left) using CSS `writing-mode: vertical-rl`
- **Ruby Text Support**: Parse and render Ruby annotations using `[base]{annotation}` syntax
- **Selectable TTS engine**: Choose between the **OS-native voice** (Windows / Android defaults, via the Web Speech API) and **VOICEVOX** (high-quality Japanese synthesis). The OS-native engine is the default and works out of the box.
- **VOICEVOX integration**: Point the plugin at a running VOICEVOX server, or (on desktop) set the install path and let the plugin launch the engine for you.
- **Synchronized highlighting & auto-scroll**: Follow the reading position while playing.
- **Real-time Sync**: Automatically syncs with the standard Markdown editor
- **Playback Controls**: Play, pause, resume, stop, and adjust playback speed

## TTS Engines / 読み上げエンジン

This plugin can read text with two different engines. Pick one in
**Settings → Vertical Reader with TTS → 読み上げエンジン**.

### OS-native (default) — Windows / Android

Uses the browser-native Web Speech API, which is backed by the operating
system's own voices:

- **Windows (desktop)**: SAPI / Windows voices
- **Android (Obsidian mobile)**: the device's Android TTS voices

No setup required — this is the default engine.

### VOICEVOX

[VOICEVOX](https://voicevox.hiroshiba.jp/) is a free, high-quality Japanese
speech synthesizer that runs as a local HTTP server (default
`http://127.0.0.1:50021`).

There are two ways to use it:

1. **Auto-launch (desktop only)** — Enable "VOICEVOXを自動起動する", set the path
   to the VOICEVOX executable (`run.exe` on Windows, `run` on macOS/Linux),
   and the plugin will start the engine automatically and wait for it to become
   ready. It also stops the engine it started when the plugin unloads.
2. **Manual server URL (desktop & Android)** — Start VOICEVOX yourself and point
   the plugin at its URL. Use the "Test connection" and "Load Speakers" buttons
   to verify the connection and pick a speaker.

> On Android, auto-launch is not available (there is no local process to spawn),
> so use the manual server URL option with a VOICEVOX server reachable from the
> device.

## Ruby Text Syntax

This plugin supports multiple ruby annotation formats:

### Standard Format: `[base]{annotation}`

**Simple annotation:**
```
[漢字]{かんじ}
```

**Distributed annotation (with separators):**
```
[東京都]{とう・きょう・と}
[可愛い犬]{か わい い いぬ}
```

**Supported separators:** `.`, `．`, `。`, `・`, `|`, `｜`, `/`, `／`, space

### Aozora Bunko Format (青空文庫形式)

**Automatic kanji detection:**
```
漢字《かんじ》
人間《にんげん》
```

**Explicit marker with ｜:**
```
｜東京《とうきょう》
｜ひらがな《annotation》
```

All formats are converted internally and displayed identically in the vertical reader view.

## Repository Structure

This repository is ready for GitHub publication with the following structure:

```
vertical-reader-tts/
├── .gitignore              # Git ignore patterns
├── README.md               # This file
├── LICENSE                 # License file (create as needed)
├── manifest.json           # Plugin manifest
├── styles.css              # Plugin styles
├── versions.json           # Version compatibility
├── package.json            # NPM dependencies
├── package-lock.json       # NPM lock file
├── tsconfig.json           # TypeScript config
├── esbuild.config.mjs      # Build configuration
└── src/                    # Source code (see Architecture)
```

**Note**: The following folders are excluded from Git (see `.gitignore`):
- `node_modules/` - NPM dependencies
- `obsidian-sample-plugin-master/` - Reference code
- `rollup-plugin-svelte-master/` - Reference code
- `reference/` - Development references
- `main.js`, `*.map` - Build outputs

## Installation

### Development Setup

1. Install dependencies:
```bash
npm install
```

2. Build the plugin:
```bash
npm run dev
```

3. Copy the built files to your Obsidian vault:
```bash
# Copy to: <vault>/.obsidian/plugins/vertical-reader-tts/
# Required files: main.js, manifest.json, styles.css
```

4. Enable the plugin in Obsidian Settings → Community Plugins

### Production Build

```bash
npm run build
```

## Usage

1. Open any Markdown file in Obsidian
2. Click the book icon in the ribbon or run "Open Vertical Reader" command
3. The vertical reader view will open in the right sidebar
4. Content will sync automatically as you edit
5. Use TTS controls to read the text aloud with synchronized highlighting

### Settings

Configure settings in Settings → Vertical Reader with TTS:

- **読み上げエンジン (TTS engine)**: `OS標準` or `VOICEVOX`
- **VOICEVOX**: auto-launch toggle, executable path, server URL, connection test,
  speaker selection, speed, ruby-priority reading, and per-punctuation pause times
- **OS標準 (Web Speech API)**: default voice (Japanese voices prioritized),
  default playback speed (0.5x - 3.0x), and default language
- **表示設定**: font and scroll sensitivity for the vertical view

### TTS Controls

- **Play**: Start reading from cursor position or beginning
- **Pause**: Pause the current playback
- **Resume**: Resume paused playback
- **Stop**: Stop playback and reset position
- **Speed slider**: Adjust playback rate (0.5x - 3.0x)
- **Voice selector**: Choose from available system voices
- **Auto-scroll**: Enable/disable automatic scrolling to reading position
- **Jump to position**: Manually jump to current reading position

## Architecture

```
src/
├── main.ts                   # Plugin entry point
├── settings.ts               # Plugin settings and tab
├── types.ts                  # TypeScript interfaces
├── views/
│   └── VerticalReaderView.ts # Obsidian ItemView
├── components/
│   ├── VerticalReader.svelte # Main Svelte component
│   ├── TTSControls.svelte    # Playback controls
│   ├── RubyText.svelte       # Ruby text renderer
│   └── EditorTools.svelte    # Batch editing tools
├── parsers/
│   ├── RubyParser.ts         # Parse [base]{annotation}
│   ├── MarkdownCleaner.ts    # Strip MD for TTS
│   └── TextSegmenter.ts      # Text utilities
├── tts/
│   ├── TTSEngine.ts          # Unified engine (routes OS ⇄ VOICEVOX)
│   ├── VOICEVOXEngine.ts     # VOICEVOX HTTP client + seamless playback
│   ├── VoicevoxLauncher.ts   # Desktop-only: spawn the VOICEVOX process
│   ├── TTSState.ts           # Svelte stores
│   └── HighlightManager.ts   # Sync highlighting
└── utils/
    ├── EditorSync.ts         # Editor sync manager
    ├── PunctuationProcessor.ts # Insert pauses at punctuation (VOICEVOX)
    ├── FontDetector.ts       # System font detection
    ├── TextFormatter.ts      # Text formatting utilities
    └── Constants.ts          # Plugin constants
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a maintenance-oriented deep dive
(日本語).

## Technologies

- **TypeScript**: Type-safe development
- **Svelte**: Reactive UI components
- **esbuild**: Fast bundling with Svelte support
- **Web Speech API**: Browser-native text-to-speech
- **Obsidian API**: Plugin integration

## Browser Compatibility

The Web Speech API is supported in:
- Chrome/Edge: Full support
- Safari: Full support
- Firefox: Partial support (may have limited voices)

## Development

### Watch mode
```bash
npm run dev
```

### Type checking
```bash
npx tsc --noEmit
```

## License

MIT

## Contributing

Issues and pull requests are welcome!
