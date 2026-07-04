import { App, MarkdownView, debounce, EventRef, TFile, TAbstractFile, Editor } from 'obsidian';
import { get } from 'svelte/store';
import type { VerticalReaderView } from '../views/VerticalReaderView';
import { EDITOR_SYNC_DEBOUNCE_MS } from './Constants';
import { ttsState } from '../tts/TTSState';

// カーソル位置のポーリング間隔（ms）。
// Obsidianには「カーソルが動いた」イベントが無い（editor-changeは内容編集時のみ）
// ため、クリックや矢印キーでの移動を拾うにはポーリングが必要。
const CURSOR_POLL_MS = 250;

/**
 * Manages synchronization between the standard editor and vertical reader view
 */
export class EditorSync {
  private app: App;
  private view: VerticalReaderView;
  private activeFile: string | null = null;
  private debouncedUpdate: (content: string) => void;
  private debouncedCursorSync: (charOffset: number) => void;
  private isDestroyed: boolean = false;
  private eventRefs: EventRef[] = [];
  private cursorPollId: number | null = null;
  private lastCursorOffset: number = -1;

  constructor(app: App, view: VerticalReaderView) {
    this.app = app;
    this.view = view;

    // Debounce updates to avoid excessive re-renders during typing
    this.debouncedUpdate = debounce(
      (content: string) => {
        if (!this.isDestroyed) {
          this.view.updateContent(content);
        }
      },
      EDITOR_SYNC_DEBOUNCE_MS,
      true // leading edge = false
    );

    // Debounce cursor sync to avoid excessive scrolling
    this.debouncedCursorSync = debounce(
      (charOffset: number) => {
        if (!this.isDestroyed) {
          this.view.scrollToCharOffset(charOffset);
        }
      },
      100, // Shorter delay for more responsive cursor sync
      true
    );
  }

  /**
   * Start listening to editor changes
   */
  start() {
    // Listen to active leaf changes
    this.eventRefs.push(
      this.app.workspace.on('active-leaf-change', this.handleLeafChange.bind(this))
    );

    // Listen to file opens (fires when a different note is opened in the same
    // pane, which active-leaf-change may not catch)
    this.eventRefs.push(
      this.app.workspace.on('file-open', this.handleLeafChange.bind(this))
    );

    // Listen to editor changes (also handles cursor position)
    this.eventRefs.push(
      this.app.workspace.on('editor-change', this.handleEditorChange.bind(this))
    );

    // Listen to file modifications
    this.eventRefs.push(
      this.app.vault.on('modify', this.handleFileModify.bind(this))
    );

    // Poll the caret position so clicks / arrow keys in the editor are
    // reflected in the reader EVERY time (editor-change only fires on content
    // edits, which is why cursor sync used to work "only once").
    this.cursorPollId = window.setInterval(() => this.pollCursor(), CURSOR_POLL_MS);

    // Initial sync
    this.syncFromActiveEditor();
  }

  /**
   * カーソル位置を監視し、変化していればリーダーを追従スクロールさせる。
   * TTSが再生中（かつ一時停止でない）の間は、読み上げ追従スクロールと
   * 取り合いにならないようスキップする。
   */
  private pollCursor() {
    if (this.isDestroyed) return;

    const tts = get(ttsState);
    if (tts.isPlaying && !tts.isPaused) return;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView?.editor) return;

    const offset = activeView.editor.posToOffset(activeView.editor.getCursor());
    if (offset !== this.lastCursorOffset) {
      this.lastCursorOffset = offset;
      this.view.scrollToCharOffset(offset);
    }
  }

  /**
   * Stop listening to editor changes
   */
  stop() {
    this.isDestroyed = true;

    if (this.cursorPollId !== null) {
      window.clearInterval(this.cursorPollId);
      this.cursorPollId = null;
    }

    // Clean up event listeners
    this.eventRefs.forEach(ref => this.app.workspace.offref(ref));
    this.eventRefs = [];
  }

  /**
   * Handle active leaf change
   */
  private handleLeafChange() {
    if (!this.isDestroyed) {
      this.syncFromActiveEditor();
    }
  }

  /**
   * Handle editor content change and cursor position
   */
  private handleEditorChange(editor: Editor) {
    if (!this.isDestroyed) {
      // Update content
      const content = editor.getValue();
      this.debouncedUpdate(content);

      // Sync cursor position
      const cursor = editor.getCursor();
      const charOffset = editor.posToOffset(cursor);
      this.lastCursorOffset = charOffset;
      this.debouncedCursorSync(charOffset);
    }
  }

  /**
   * Handle file modification
   */
  private handleFileModify(file: TAbstractFile) {
    if (!this.isDestroyed && file instanceof TFile && this.activeFile === file.path) {
      this.syncFromActiveEditor();
    }
  }

  /**
   * Sync content from the currently active editor
   */
  private syncFromActiveEditor() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeView && activeView.file) {
      const content = activeView.editor.getValue();
      this.activeFile = activeView.file.path;
      this.view.updateContent(content);

      // Sync cursor position as well
      const cursor = activeView.editor.getCursor();
      const charOffset = activeView.editor.posToOffset(cursor);
      this.lastCursorOffset = charOffset;
      this.view.scrollToCharOffset(charOffset);
    }
  }
}
