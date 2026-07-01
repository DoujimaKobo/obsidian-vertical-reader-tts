<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ttsState } from '../tts/TTSState';
  import { RubyParser } from '../parsers/RubyParser';
  import { MarkdownCleaner } from '../parsers/MarkdownCleaner';
  import { FontDetector, type FontInfo } from '../utils/FontDetector';
  import { MarkdownView } from 'obsidian';
  import type { App } from 'obsidian';
  import type { TTSEngine } from '../tts/TTSEngine';
  import type { HighlightManager } from '../tts/HighlightManager';
  import type { RubySegment } from '../types';
  import TTSControls from './TTSControls.svelte';
  import RubyText from './RubyText.svelte';
  import EditorTools from './EditorTools.svelte';

  export let content: string;
  export let ttsEngine: TTSEngine;
  export let highlightManager: HighlightManager;
  export let settings: any;
  export let app: App;

  let segments: RubySegment[] = [];
  let currentHighlightIndex = -1;
  let selectedFont = settings.defaultFont || 'serif';
  let containerElement: HTMLElement;
  let scrollSensitivity = settings.scrollSensitivity || 2.0;
  let verticalTextElement: HTMLElement;
  let isEditing = false;
  let voicevoxScrollInterval: number | null = null;


  // Handle horizontal scrolling with mouse wheel
  function handleWheel(event: WheelEvent) {
    if (containerElement) {
      event.preventDefault();
      // Convert vertical scroll to horizontal scroll (reversed and with sensitivity)
      containerElement.scrollLeft -= event.deltaY * scrollSensitivity;
    }
  }

  // Handle text editing
  function handleInput(event: Event) {
    if (verticalTextElement) {
      const newText = verticalTextElement.innerText;
      syncToEditor(newText);
    }
  }

  // Sync edited text back to editor
  function syncToEditor(newText: string) {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.editor) {
      activeView.editor.setValue(newText);
    }
  }

  // Handle content changes from EditorTools
  function handleContentChange(newContent: string) {
    content = newContent;
  }

  // Get text from cursor position to end
  export function getTextFromCursor(): string {
    if (!verticalTextElement) {
      return content;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return content;
    }

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(verticalTextElement);
    preCaretRange.setEnd(range.startContainer, range.startOffset);

    const textBeforeCursor = preCaretRange.toString();
    const fullText = verticalTextElement.innerText;

    // Get text from cursor to end
    return fullText.slice(textBeforeCursor.length);
  }

  // Scroll to current reading position
  function scrollToReading() {
    if (!containerElement || !verticalTextElement) {
      return;
    }

    const currentIndex = $ttsState.currentCharIndex;

    if (currentIndex < 0 || currentIndex >= segments.length) {
      return;
    }

    // Find the segment element by data attribute
    const targetElement = verticalTextElement.querySelector(`[data-segment-index="${currentIndex}"]`) as HTMLElement;

    if (targetElement) {
      scrollToElement(targetElement);
    }
  }

  // Scroll to a specific character offset
  export function scrollToCharOffset(charOffset: number) {
    if (!containerElement || !verticalTextElement) {
      return;
    }

    // Adjust charOffset to account for frontmatter removal
    const frontmatterMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    let adjustedOffset = charOffset;

    if (frontmatterMatch) {
      const frontmatterLength = frontmatterMatch[0].length;
      if (charOffset < frontmatterLength) {
        // Cursor is in frontmatter, scroll to beginning
        adjustedOffset = 0;
      } else {
        // Subtract frontmatter length from offset
        adjustedOffset = charOffset - frontmatterLength;
      }
    }

    // Calculate which segment contains this character offset
    let cumulativeLength = 0;
    let targetSegmentIndex = -1;

    for (let i = 0; i < segments.length; i++) {
      const segmentLength = segments[i].content.length;
      if (cumulativeLength + segmentLength >= adjustedOffset) {
        targetSegmentIndex = i;
        break;
      }
      cumulativeLength += segmentLength;
    }

    if (targetSegmentIndex >= 0) {
      const targetElement = verticalTextElement.querySelector(`[data-segment-index="${targetSegmentIndex}"]`) as HTMLElement;
      if (targetElement) {
        scrollToElement(targetElement, false); // No smooth scroll for cursor following
      }
    }
  }

  // Common scroll function
  // 縦書きは右→左なので、要素を右端（読み始め位置）に配置
  function scrollToElement(element: HTMLElement, smooth: boolean = true) {
    if (!containerElement) return;

    // For vertical text (vertical-rl), text flows right to left
    // Position element at the right edge (with small margin for readability)
    const targetLeft = (element as HTMLElement).offsetLeft;
    const containerWidth = containerElement.clientWidth;
    const margin = 100; // 右端から少し余白を持たせる
    const scrollPosition = targetLeft - containerWidth + margin;

    containerElement.scrollTo({
      left: scrollPosition,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  // Auto-scroll during TTS playback
  let lastScrolledIndex = -1;
  let lastScrolledChunkIndex = -1;

  // Scroll check function for VOICEVOX - 要素を直接指定
  function checkVoicevoxScroll() {
    if (!$ttsState.isPlaying || settings.ttsEngine !== 'voicevox' || !verticalTextElement) {
      return;
    }

    try {
      const voicevoxEngine = ttsEngine.getVoicevoxEngine?.();
      if (!voicevoxEngine) {
        return;
      }

      const position = voicevoxEngine.getCurrentPlaybackPosition();
      if (position.totalChunks === 0) {
        return;
      }

      // 比例計算をやめて、チャンク開始位置のセグメントを直接特定
      const cleanedText = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const totalLength = cleanedText.length;

      // チャンク開始位置の文字オフセットを計算
      const averageChunkLength = totalLength / position.totalChunks;
      const chunkStartOffset = Math.floor(position.chunkIndex * averageChunkLength);

      // サブチャンク進捗を加算
      const currentOffset = chunkStartOffset + Math.floor(position.subChunkProgress * position.chunkLength);

      // このオフセットが含まれるセグメントを特定
      let cumulativeLength = 0;
      let targetSegmentIndex = -1;

      for (let i = 0; i < segments.length; i++) {
        const segmentLength = segments[i].content.length;
        if (currentOffset >= cumulativeLength && currentOffset < cumulativeLength + segmentLength) {
          targetSegmentIndex = i;
          break;
        }
        cumulativeLength += segmentLength;
      }

      // セグメント要素を直接取得してスクロール
      if (targetSegmentIndex >= 0) {
        const targetElement = verticalTextElement.querySelector(
          `[data-segment-index="${targetSegmentIndex}"]`
        ) as HTMLElement;

        if (targetElement) {
          console.log(`[Direct Scroll] Chunk ${position.chunkIndex} → Segment ${targetSegmentIndex}`);
          scrollToElement(targetElement, true);
        }
      }
    } catch (error) {
      console.error('[VOICEVOX Scroll] Error:', error);
    }
  }

  // Web Speech API scroll (character-based)
  $: {
    if ($ttsState.isPlaying && settings.ttsEngine !== 'voicevox' && $ttsState.currentCharIndex !== lastScrolledIndex) {
      lastScrolledIndex = $ttsState.currentCharIndex;
      scrollToReading();
    }
  }

  onMount(() => {
    if (containerElement) {
      containerElement.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Load settings
    selectedFont = settings.defaultFont || 'serif';
    scrollSensitivity = settings.scrollSensitivity || 2.0;

    // Register VOICEVOX position change callback for immediate scroll
    if (settings.ttsEngine === 'voicevox') {
      const voicevoxEngine = ttsEngine.getVoicevoxEngine?.();
      if (voicevoxEngine) {
        voicevoxEngine.onPositionChange((chunkIndex: number, totalChunks: number) => {
          // 再生開始の瞬間に即座にスクロール - 今再生しているその番号を正確に渡す
          console.log(`[Immediate Scroll] NOW PLAYING Chunk ${chunkIndex}/${totalChunks}`);
          // ズレ防止: そのまま使う（-1しない）
          lastScrolledChunkIndex = -1; // リセットして強制更新
          checkVoicevoxScroll(); // Trigger immediate scroll
        });
      }
    }

    // Start VOICEVOX scroll polling for smooth sub-chunk scrolling
    voicevoxScrollInterval = window.setInterval(() => {
      checkVoicevoxScroll();
    }, 50); // 50msでより滑らかに
  });

  // Reactive statement: re-parse when content changes
  $: {
    segments = RubyParser.parse(content);
    const cleanedText = MarkdownCleaner.clean(content);
    highlightManager.setSegments(segments, cleanedText);
  }

  // Reactive statement: update highlight based on TTS state
  $: {
    currentHighlightIndex = $ttsState.currentCharIndex;
  }

  // Cleanup on component destroy
  onDestroy(() => {
    ttsEngine.stop();
    ttsState.stop();

    if (containerElement) {
      containerElement.removeEventListener('wheel', handleWheel);
    }

    // Clear VOICEVOX scroll interval
    if (voicevoxScrollInterval) {
      clearInterval(voicevoxScrollInterval);
      voicevoxScrollInterval = null;
    }
  });
</script>

<div class="vertical-reader">
  <div class="controls-header">
    <!-- TTS Section -->
    <div class="control-section">
      <div class="section-header">
        <span class="section-icon">🔊</span>
        <h3 class="section-title">読み上げ</h3>
      </div>
      <TTSControls {ttsEngine} {settings} {content} getTextFromCursor={getTextFromCursor} scrollToReading={scrollToReading} />
    </div>

    <!-- Editor Tools Section -->
    <div class="control-section">
      <div class="section-header">
        <span class="section-icon">⚙️</span>
        <h3 class="section-title">一括修正</h3>
      </div>

      <EditorTools {app} onContentChange={handleContentChange} />
    </div>
  </div>

  <div class="vertical-text-container" bind:this={containerElement}>
    <div
      class="vertical-text"
      style="font-family: {selectedFont};"
      contenteditable="true"
      bind:this={verticalTextElement}
      on:input={handleInput}
      spellcheck="false"
    >
      {#each segments as segment, i}
        <RubyText {segment} index={i} />
      {/each}
    </div>
  </div>
</div>

<style>
  .vertical-reader {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  .controls-header {
    border-bottom: 1px solid var(--background-modifier-border);
    max-height: 50vh;
    overflow-y: auto;
  }

  .control-section {
    background-color: var(--background-primary);
  }

  .control-section:not(:last-child) {
    border-bottom: 2px solid var(--background-modifier-border);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background-color: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .section-icon {
    font-size: 16px;
  }

  .section-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal);
  }


  .vertical-text-container {
    flex: 1;
    overflow: auto;
    background-color: var(--background-primary);
  }

  .vertical-text {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    height: 100%;
    padding: 20px;
    line-height: 2.5em;
    font-size: 18px;
    color: var(--text-normal);
    outline: none; /* Remove focus outline for contenteditable */
  }

  .vertical-text:focus {
    background-color: var(--background-primary-alt);
  }

  /* Smooth scrolling */
  .vertical-text-container {
    scroll-behavior: smooth;
  }
</style>
