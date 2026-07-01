<script lang="ts">
  import type { RubySegment } from '../types';

  export let segment: RubySegment;
  export let index: number = -1;

  // Preserve line breaks by converting to <br> tags
  function preserveLineBreaks(text: string): string {
    return text.split('\n').join('<br>');
  }

  // Get CSS class based on markdown type
  function getMarkdownClass(segment: RubySegment): string {
    if (!segment.markdown) return '';

    const classes: string[] = [];

    if (segment.markdown.type === 'heading') {
      classes.push('markdown-heading');
      if (segment.markdown.level) {
        classes.push(`markdown-h${segment.markdown.level}`);
      }
    } else if (segment.markdown.type === 'list-item') {
      classes.push('markdown-list-item');
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
</style>
