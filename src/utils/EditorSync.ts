import { App, MarkdownView, debounce, EventRef, TFile, TAbstractFile, Editor } from 'obsidian';
import type { VerticalReaderView } from '../views/VerticalReaderView';
import { EDITOR_SYNC_DEBOUNCE_MS } from './Constants';

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

    // Listen to editor changes (also handles cursor position)
    this.eventRefs.push(
      this.app.workspace.on('editor-change', this.handleEditorChange.bind(this))
    );

    // Listen to file modifications
    this.eventRefs.push(
      this.app.vault.on('modify', this.handleFileModify.bind(this))
    );

    // Initial sync
    this.syncFromActiveEditor();
  }

  /**
   * Stop listening to editor changes
   */
  stop() {
    this.isDestroyed = true;

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
      this.view.scrollToCharOffset(charOffset);
    }
  }
}
