import { ItemView, WorkspaceLeaf } from 'obsidian';
import VerticalReader from '../components/VerticalReader.svelte';
import type { TTSEngine } from '../tts/TTSEngine';
import type { HighlightManager } from '../tts/HighlightManager';
import type { VerticalReaderSettings } from '../settings';

export const VIEW_TYPE_VERTICAL_READER = 'vertical-reader-view';

/**
 * Obsidian ItemView that displays vertical reading with TTS support
 */
export class VerticalReaderView extends ItemView {
  private component: VerticalReader | null = null;
  private ttsEngine: TTSEngine;
  private highlightManager: HighlightManager;
  private settings: VerticalReaderSettings;
  private currentContent: string = '';

  constructor(
    leaf: WorkspaceLeaf,
    ttsEngine: TTSEngine,
    highlightManager: HighlightManager,
    settings: VerticalReaderSettings
  ) {
    super(leaf);
    this.ttsEngine = ttsEngine;
    this.highlightManager = highlightManager;
    this.settings = settings;
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
        app: this.app
      }
    });
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
