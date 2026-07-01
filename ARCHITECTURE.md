# アーキテクチャ解説（保守ガイド）

このドキュメントは、プラグインを後から改修・保守するための日本語解説です。
「どこに何があるか」「なぜそうなっているか」を中心にまとめています。

---

## 1. 全体像

Obsidian プラグイン（TypeScript + Svelte 4）です。Markdown を **縦書き** で表示し、
**ルビ（ふりがな）** を描画し、**2種類の読み上げエンジン** で音声再生します。

```
Obsidian (ホストアプリ)
  └─ VerticalReaderPlugin (src/main.ts)   ← プラグインのライフサイクル
       ├─ VerticalReaderView (ItemView)    ← Obsidian のビュー
       │    └─ VerticalReader.svelte       ← Svelte コンポーネントの根
       │         ├─ TTSControls.svelte
       │         └─ RubyText.svelte
       ├─ TTSEngine                         ← 読み上げの統一窓口
       │    ├─ Web Speech API (OS標準)
       │    └─ VOICEVOXEngine (HTTPクライアント)
       ├─ VoicevoxLauncher                  ← VOICEVOXの自動起動(デスクトップ)
       ├─ HighlightManager                  ← 再生位置のハイライト
       └─ EditorSync                        ← エディタ→ビューの同期
```

ビルドは **esbuild**（`esbuild.config.mjs`）。出力は単一の CommonJS `main.js`。
`obsidian` / `electron` / CodeMirror / Node組み込みモジュールは external 指定で、
ホスト（Electron）側から供給されます。

---

## 2. 読み上げエンジンの選択（今回の設計の中心）

### 設定モデル

`src/settings.ts` の `VerticalReaderSettings.ttsEngine` が `'os' | 'voicevox'`。
**デフォルトは `'os'`**（＝ OS標準の音声で、追加設定なしで動く）。

- `'os'`     … Web Speech API。Windows では SAPI 音声、Android（モバイル版）では
  Android の TTS 音声が自動的に使われる。
- `'voicevox'` … ローカル/リモートの VOICEVOX Engine（HTTP API）。

> **後方互換**: 旧バージョンは `useVoicevox: boolean` を保存していました。
> `main.ts` の `loadSettings()` で、`ttsEngine` が未設定かつ `useVoicevox` が
> 存在する場合に自動で移行します。ここは旧データを持つユーザーが居る限り
> 消さないでください。

### 実行時の分岐

`main.ts` の getter `useVoicevox` が `settings.ttsEngine === 'voicevox'` を返し、
これを唯一の真実として各所へ渡します（`TTSEngine.setUseVoicevox()` 等）。
エンジンを切り替える UI 操作は `reinitializeVoicevox()` を呼び、VOICEVOX
インスタンスの生成/破棄を行います。

`TTSEngine`（`src/tts/TTSEngine.ts`）は「統一窓口」で、`useVoicevox` フラグに
応じて Web Speech API か `VOICEVOXEngine` に委譲します。同時に1エンジンのみ
動作するよう `isProcessing` フラグで排他制御しています。

---

## 3. VOICEVOX の自動起動（デスクトップ限定）

`src/tts/VoicevoxLauncher.ts` が担当。ユーザーが設定した実行ファイルのパス
（`settings.voicevoxEnginePath`）から VOICEVOX を `child_process.spawn` で起動し、
`/version` エンドポイントが応答するまでポーリング（最大30秒）します。

重要な注意点:

- **デスクトップ限定**。`Platform.isDesktopApp`（obsidian API）で判定し、モバイル
  では何もしません。モバイルは「サーバーURL手動指定」に誘導します。
- Node 組み込みモジュール（`child_process` / `path` 等）は **静的 import せず**、
  `require()` を実行時に呼びます。さらに `esbuild.config.mjs` の `external` に
  列挙してバンドルへ取り込まないようにしています。これによりモバイル版バンドルが
  Node モジュールを参照して壊れることを防ぎます。**この2点はセットで維持** して
  ください（片方だけ変えると mobile で壊れます）。
- 自分で起動したプロセスは `stop()` で終了させ、`main.ts` の `onunload()` から
  呼んでいます（孤児プロセス防止）。既に起動済みのサーバーには関与しません。

起動フロー:

1. `main.ts onload()` … `ttsEngine==='voicevox'` かつ `voicevoxAutoLaunch` かつ
   デスクトップなら `launchVoicevox()` を fire-and-forget で呼ぶ（ロードをブロック
   しない）。
2. 設定画面の「起動」ボタンからも `plugin.launchVoicevox()` を呼べる。

---

## 4. ルビのパイプライン

3つの入力形式を `src/parsers/RubyParser.ts` が `RubySegment[]` に正規化します。

- `[base]{annotation}` … プラグイン独自形式
- `｜base《annotation》` … 青空文庫（明示）
- `kanji《annotation》` … 青空文庫（漢字自動判定）

描画は `src/components/RubyText.svelte`（`<ruby>/<rt>`）。分散ルビは
`.` `・` `|` `/` 空白 で分割されます。

読み上げ時は、VOICEVOX で「ルビ優先」が有効なら base ではなく annotation（読み）を
喋ります（`RubyParser.extractRubyForTTS` / `stripRubyForTTS`）。

---

## 5. VOICEVOX 再生の仕組み（シームレス再生）

`VOICEVOXEngine` はテキストを ≤500 文字のチャンクに分割し、
「現在再生中 + 次を裏でプリフェッチ」の二段バッファで途切れなく再生します。
停止時は `AbortController` で進行中の全 fetch を中断し、再生ノードも破棄します。

句読点ごとの休止は `src/utils/PunctuationProcessor.ts` が挿入します
（読点/句点/感嘆符/疑問符それぞれの秒数を設定可能）。

再生位置は `getCurrentPlaybackPosition()` が時刻ベースで進捗率を返し、
`VerticalReader.svelte` の自動スクロールに使われます。Web Speech API 側は
word boundary イベント（文字インデックス）でスクロールします。この2系統は
`settings.ttsEngine` で切り替わります。

---

## 6. エディタ同期・ビュー

- `src/utils/EditorSync.ts` … アクティブなエディタの内容を 300ms デバウンスで
  ビューへ push。`vault.on('modify', ...)` は `TAbstractFile` を渡すため、
  ハンドラ内で `instanceof TFile` により絞り込んでいます。
- `src/views/VerticalReaderView.ts` … Obsidian の `ItemView`。`onOpen()` で
  Svelte 根コンポーネントをマウントし、TTS エンジン・設定・app を props で渡します。

---

## 7. ビルドと開発

```bash
npm run dev        # watch + inline source map
npm run build      # tsc --noEmit で型検査 → 本番ビルド(minify)
npm run typecheck  # 型検査のみ
```

ビルド後は `main.js` / `manifest.json` / `styles.css` を
`<vault>/.obsidian/plugins/vertical-reader-tts/` にコピーしてリロード。

> `tsconfig.json` は `noEmit: true`（実出力は esbuild が担当）。以前は
> `outDir: "./"` でプロジェクト全体が自己 exclude され `tsc` が動かなかったため
> 変更済み。戻さないでください。

---

## 8. リリース手順

`.github/workflows/release.yml` がタグ push で自動ビルド＆ドラフトリリースを作成
（`main.js` / `manifest.json` / `styles.css` を添付）。

```bash
npm version patch   # package.json + manifest.json + versions.json を更新
git push && git push --tags
```

`version-bump.mjs` が `manifest.json` と `versions.json` を同期します。

---

## 9. よくある改修ポイント

- **音声エンジンを追加したい** → `settings.ttsEngine` の union を拡張し、
  `TTSEngine` に分岐を追加、設定 UI（`settings.ts`）にオプションを足す。
- **VOICEVOX の話者/速度の既定を変えたい** → `DEFAULT_SETTINGS`。
- **モバイルで壊れた** → まず Node 組み込みモジュールの静的 import が混入して
  いないか（第3章）を疑う。
- **設定が保存されない** → `saveSettings()` の呼び忘れ、または `loadSettings()`
  のマージ漏れ。
