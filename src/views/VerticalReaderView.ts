import { ItemView, WorkspaceLeaf, MarkdownView } from 'obsidian';
import VerticalReader from '../components/VerticalReader.svelte';
import type { TTSEngine } from '../tts/TTSEngine';
import type { HighlightManager } from '../tts/HighlightManager';
import type { VerticalReaderSettings } from '../settings';
import type VerticalReaderPlugin from '../main';

export const VIEW_TYPE_VERTICAL_READER = 'vertical-reader-view';

/**
 * Obsidian ItemView that displays vertical reading with TTS support
 */
export class VerticalReaderView extends ItemView {
  private component: VerticalReader | null = null;
  private ttsEngine: TTSEngine;
  private highlightManager: HighlightManager;
  private settings: VerticalReaderSettings;
  private plugin: VerticalReaderPlugin;
  private currentContent: string = '';

  constructor(
    leaf: WorkspaceLeaf,
    ttsEngine: TTSEngine,
    highlightManager: HighlightManager,
    settings: VerticalReaderSettings,
    plugin: VerticalReaderPlugin
  ) {
    super(leaf);
    this.ttsEngine = ttsEngine;
    this.highlightManager = highlightManager;
    this.settings = settings;
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_VERTICAL_READER;
  }

  getDisplayText(): string {
    return 'Vertical Reader';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen() {
    // Pull the currently active note's content immediately so the reader shows
    // something the moment it opens, instead of waiting for the first sync event.
    if (!this.currentContent) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView?.editor) {
        this.currentContent = activeView.editor.getValue();
      }
    }
    this.mountComponent();
  }

  /**
   * Mount (or re-mount) the Svelte component into the view container.
   */
  private mountComponent() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('vertical-reader-container');

    // Mount Svelte component
    this.component = new VerticalReader({
      target: container,
      props: {
        content: this.currentContent,
        ttsEngine: this.ttsEngine,
        highlightManager: this.highlightManager,
        settings: this.settings,
        plugin: this.plugin,
        app: this.app
      }
    });
  }

  /**
   * Rebuild the view so it picks up changed settings (e.g. a TTS engine
   * switch). The component reads engine-dependent state at mount time, so a
   * fresh mount is the simplest reliable way to reflect a settings change
   * without requiring the user to close and reopen the view.
   */
  refresh() {
    if (this.component) {
      this.component.$destroy();
      this.component = null;
    }
    this.mountComponent();
  }

  async onClose() {
    // Cleanup Svelte component
    if (this.component) {
      this.component.$destroy();
      this.component = null;
    }
  }

  /**
   * Update the content displayed in the vertical reader
   */
  updateContent(content: string) {
    this.currentContent = content;

    if (this.component) {
      this.component.$set({ content });
    }
  }

  /**
   * Get the current content
   */
  getContent(): string {
    return this.currentContent;
  }

  /**
   * Scroll to a specific character offset
   */
  scrollToCharOffset(charOffset: number) {
    if (this.component && this.component.scrollToCharOffset) {
      this.component.scrollToCharOffset(charOffset);
    }
  }
}
