<script lang="ts">
  import type { RubySegment } from '../types';

  export let segment: RubySegment;
  export let index: number = -1;

  // Preserve line breaks by converting to <br> tags
  function preserveLineBreaks(text: string): string {
    return text.split('\n').join('<br>');
  }

  // Get CSS class based on markdown type + inline styles
  function getMarkdownClass(segment: RubySegment): string {
    const classes: string[] = [];

    if (segment.markdown) {
      if (segment.markdown.type === 'heading') {
        classes.push('markdown-heading');
        if (segment.markdown.level) {
          classes.push(`markdown-h${segment.markdown.level}`);
        }
      } else if (segment.markdown.type === 'list-item') {
        classes.push('markdown-list-item');
      } else if (segment.markdown.type === 'quote') {
        classes.push('markdown-quote');
      } else if (segment.markdown.type === 'hr') {
        classes.push('markdown-hr');
      }
    }

    const s = segment.styles;
    if (s) {
      if (s.bold) classes.push('md-bold');
      if (s.italic) classes.push('md-italic');
      if (s.strike) classes.push('md-strike');
      if (s.highlight) classes.push('md-highlight');
      if (s.code) classes.push('md-code');
      if (s.link) classes.push('md-link');
    }

    return classes.join(' ');
  }

  // Clean markdown symbols from display (but keep the text)
  function cleanMarkdownSymbols(text: string, markdown: RubySegment['markdown']): string {
    if (!markdown) return text;

    let cleaned = text;

    // Remove heading markers (##)
    if (markdown.type === 'heading') {
      cleaned = cleaned.replace(/^#{1,6}\s+/, '');
    }

    // Remove list markers (-, *, +, 1.)
    if (markdown.type === 'list-item') {
      cleaned = cleaned.replace(/^[\*\-\+]\s+/, '');
      cleaned = cleaned.replace(/^\d+\.\s+/, '');
    }

    // Remove blockquote marker (>)
    if (markdown.type === 'quote') {
      cleaned = cleaned.replace(/^>\s?/, '');
    }

    return cleaned;
  }
</script>

{#if segment.type === 'ruby'}
  <ruby data-segment-index={index} class={getMarkdownClass(segment)}>
    <rb>{cleanMarkdownSymbols(segment.content, segment.markdown)}</rb>
    {#if segment.annotation}
      <rt>{segment.annotation}</rt>
    {/if}
  </ruby>
{:else if segment.markdown?.type === 'hr'}
  <!-- 水平線は小説の節区切り「＊」として表示 -->
  <span data-segment-index={index} class="markdown-hr">＊</span>
{:else}
  <span data-segment-index={index} class={getMarkdownClass(segment)}>{@html preserveLineBreaks(cleanMarkdownSymbols(segment.content, segment.markdown))}</span>
{/if}

<style>
  ruby {
    ruby-position: over;
  }

  rt {
    font-size: 0.6em;
    opacity: 0.8;
  }

  /* Highlighting disabled per user request */
  /* ruby.highlighted,
  span.highlighted {
    background-color: rgba(255, 255, 0, 0.4);
    font-weight: 600;
    transition: background-color 0.2s ease;
  } */

  /* Ensure proper spacing */
  ruby,
  span {
    line-height: inherit;
  }

  /* Markdown heading styles */
  .markdown-heading {
    font-weight: 700;
    display: inline-block;
  }

  .markdown-h1 {
    font-size: 1.8em;
    border-left: 4px solid var(--text-accent);
    padding-left: 8px;
  }

  .markdown-h2 {
    font-size: 1.6em;
    border-left: 3px solid var(--text-accent);
    padding-left: 6px;
  }

  .markdown-h3 {
    font-size: 1.4em;
    border-left: 2px solid var(--text-muted);
    padding-left: 6px;
  }

  .markdown-h4 {
    font-size: 1.2em;
    border-left: 2px solid var(--text-muted);
    padding-left: 4px;
  }

  .markdown-h5 {
    font-size: 1.1em;
    font-weight: 600;
  }

  .markdown-h6 {
    font-size: 1.05em;
    font-weight: 600;
    opacity: 0.9;
  }

  /* Markdown list item styles */
  .markdown-list-item::before {
    content: '・';
    color: var(--text-muted);
    margin-right: 4px;
  }

  /* Blockquote: muted with a rule on the reading-start side (top in vertical-rl) */
  .markdown-quote {
    color: var(--text-muted);
    border-top: 2px solid var(--background-modifier-border);
    padding-top: 6px;
  }

  /* Horizontal rule → scene-break marker */
  .markdown-hr {
    display: inline-block;
    color: var(--text-muted);
    letter-spacing: 0.5em;
    margin: 0 0.8em;
  }

  /* Inline markdown styles */
  .md-bold {
    font-weight: 700;
  }

  .md-italic {
    font-style: italic;
  }

  .md-strike {
    text-decoration: line-through;
  }

  .md-highlight {
    background-color: var(--text-highlight-bg, rgba(255, 208, 0, 0.4));
    border-radius: 2px;
  }

  .md-code {
    font-family: var(--font-monospace, monospace);
    background-color: var(--background-primary-alt);
    border-radius: 3px;
    padding: 1px 2px;
    font-size: 0.9em;
  }

  .md-link {
    color: var(--text-accent);
    text-decoration: underline;
    text-decoration-color: var(--text-accent);
    text-underline-offset: 2px;
  }
</style>
