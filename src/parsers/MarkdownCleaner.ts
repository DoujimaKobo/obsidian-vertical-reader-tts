import { RubyParser } from './RubyParser';

/**
 * Cleans markdown text by removing all formatting for TTS playback
 * Keeps only the readable text content
 *
 * Supports multiple ruby annotation formats:
 * - [base]{annotation} - Standard format
 * - ｜base《annotation》 - Aozora Bunko explicit format
 * - kanji《annotation》 - Aozora Bunko auto format
 */
export class MarkdownCleaner {
  /**
   * Remove YAML frontmatter from markdown
   */
  static stripFrontmatter(markdown: string): string {
    // Match YAML frontmatter: starts with ---, ends with ---
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  }

  /**
   * Clean markdown text for TTS by removing all syntax
   */
  static clean(markdown: string): string {
    let text = markdown;

    // Strip YAML frontmatter first
    text = this.stripFrontmatter(text);

    // Strip ruby annotations (keep base text only)
    text = RubyParser.stripRubyForTTS(text);

    // Remove code blocks first (to avoid processing code as markdown)
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`([^`]+)`/g, '$1');

    // Remove headers
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Remove bold/italic
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');

    // Remove strikethrough
    text = text.replace(/~~(.*?)~~/g, '$1');

    // Remove highlight ==text== → text
    text = text.replace(/==(.*?)==/g, '$1');

    // Remove Obsidian comments %%...%% entirely
    text = text.replace(/%%[\s\S]*?%%/g, '');

    // Remove Obsidian embeds ![[file]] entirely (nothing to read aloud)
    text = text.replace(/!\[\[[^\]]+\]\]/g, '');

    // Wikilinks with alias [[target|alias]] → alias (before the plain rule)
    text = text.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');

    // Remove links [text](url) → text
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // Remove reference-style links [text][ref]
    text = text.replace(/\[([^\]]+)\]\[[^\]]+\]/g, '$1');

    // Remove images
    text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

    // Remove blockquotes
    text = text.replace(/^>\s+/gm, '');

    // Remove list markers
    text = text.replace(/^[\*\-\+]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');

    // Remove task list markers
    text = text.replace(/^- \[[ xX]\]\s+/gm, '');

    // Remove horizontal rules
    text = text.replace(/^[\*\-_]{3,}$/gm, '');

    // Remove HTML tags (basic cleanup)
    text = text.replace(/<[^>]+>/g, '');

    // Remove Obsidian wikilinks [[link]] → link
    text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');

    // Remove Obsidian tags #tag
    text = text.replace(/#[^\s#]+/g, '');

    // Normalize whitespace (but preserve full-width spaces 　)
    text = text.replace(/\n{3,}/g, '\n\n');
    // Only collapse multiple half-width spaces/tabs, not full-width spaces
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text.trim();

    return text;
  }
}
