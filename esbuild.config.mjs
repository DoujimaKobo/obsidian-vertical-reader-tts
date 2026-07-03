import esbuild from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import sveltePreprocess from 'svelte-preprocess';

const production = process.argv[2] === 'production';

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    // Node built-ins used only on desktop (VOICEVOX auto-launch).
    // Kept external so the bundle never inlines them; guarded at runtime by
    // Platform.isDesktopApp so mobile never require()s them.
    'child_process',
    'fs',
    'path',
    'os',
    'util',
    'http',
    'https',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr'
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: production,
  plugins: [
    esbuildSvelte({
      compilerOptions: {
        css: 'injected'
      },
      preprocess: sveltePreprocess()
    })
  ]
}).catch(() => process.exit(1));
