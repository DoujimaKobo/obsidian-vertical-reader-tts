import type { RubySegment } from '../types';

/**
 * Parser for Ruby text annotations using multiple syntax formats
 *
 * Supported formats:
 * - [base]{annotation} → original format
 * - base《annotation》 → Aozora Bunko format (kanji only)
 * - ｜base《annotation》 → Aozora Bunko format (explicit marker)
 *
 * Examples:
 * - [漢字]{かんじ} → single annotation
 * - [東京都]{とう・きょう・と} → distributed with separators
 * - 漢字《かんじ》 → Aozora format (automatic kanji detection)
 * - ｜東京《とうきょう》 → Aozora format (explicit marker)
 */
export class RubyParser {
  // Regex pattern to match [base]{annotation}
  private static readonly RUBY_PATTERN = /\[([^\]]+)\]\{([^\}]+)\}/g;

  // Aozora Bunko format: ｜base《annotation》 (explicit marker)
  private static readonly AOZORA_EXPLICIT_PATTERN = /[｜|]([^｜|《]+)《([^》]+)》/g;

  // Aozora Bunko format: kanji《annotation》 (automatic detection)
  // Matches one or more kanji followed by 《annotation》
  private static readonly AOZORA_AUTO_PATTERN = /([\u4E00-\u9FFF\u3400-\u4DBF]+)《([^》]+)》/g;

  // Separators for distributed annotations
  private static readonly SEPARATOR_PATTERN = /[\.．。・|｜\/／\s]+/;

  /**
   * Strip YAML frontmatter from markdown
   */
  private static stripFrontmatter(markdown: string): string {
    // Match frontmatter at the start of the document
    // Pattern: starts with ---, any content, ends with ---
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  }

  /**
   * Parse markdown text containing ruby annotations into segments
   */
  static parse(markdown: string): RubySegment[] {
    // Strip frontmatter first
    markdown = this.stripFrontmatter(markdown);

    // Normalize markdown by converting Aozora formats to standard format
    markdown = this.normalizeRubyFormats(markdown);

    const segments: RubySegment[] = [];

    // Process line by line for better performance and markdown detection
    const lines = markdown.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect markdown type
      const markdownInfo = this.detectMarkdownType(line);

      // Parse line with ruby annotations
      const lineSegments = this.parseLine(line, markdownInfo);
      segments.push(...lineSegments);

      // Add newline if not the last line
      if (i < lines.length - 1) {
        segments.push({
          type: 'text',
          content: '\n',
          markdown: { type: 'normal' }
        });
      }
    }

    return segments;
  }

  /**
   * Detect markdown type from a line
   */
  private static detectMarkdownType(line: string): { type: 'heading' | 'list-item' | 'normal', level?: number } {
    // Check for headings (##, ###, etc.)
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      return { type: 'heading', level: headingMatch[1].length };
    }

    // Check for list items (-, *, +)
    if (/^[\*\-\+]\s+/.test(line)) {
      return { type: 'list-item' };
    }

    // Check for numbered lists
    if (/^\d+\.\s+/.test(line)) {
      return { type: 'list-item' };
    }

    return { type: 'normal' };
  }

  /**
   * Parse a single line with ruby annotations
   */
  private static parseLine(line: string, markdownInfo: { type: 'heading' | 'list-item' | 'normal', level?: number }): RubySegment[] {
    const segments: RubySegment[] = [];
    let lastIndex = 0;

    const matches = line.matchAll(this.RUBY_PATTERN);

    for (const match of matches) {
      // Add plain text before ruby
      if (match.index! > lastIndex) {
        const plainText = line.slice(lastIndex, match.index);
        if (plainText) {
          segments.push({
            type: 'text',
            content: plainText,
            markdown: markdownInfo
          });
        }
      }

      // Add ruby segment(s)
      const base = match[1];
      const annotation = match[2];

      const distributed = this.distributeAnnotation(base, annotation);
      // Add markdown info to ruby segments
      distributed.forEach(seg => seg.markdown = markdownInfo);
      segments.push(...distributed);

      lastIndex = match.index! + match[0].length;
    }

    // Add remaining text
    if (lastIndex < line.length) {
      const remainingText = line.slice(lastIndex);
      if (remainingText) {
        segments.push({
          type: 'text',
          content: remainingText,
          markdown: markdownInfo
        });
      }
    }

    // If line is empty but has markdown info (e.g., empty heading), add empty segment
    if (segments.length === 0 && line.trim()) {
      segments.push({
        type: 'text',
        content: '',
        markdown: markdownInfo
      });
    }

    return segments;
  }

  /**
   * Normalize different ruby formats to standard [base]{annotation} format
   */
  private static normalizeRubyFormats(text: string): string {
    // First, convert Aozora explicit format: ｜base《annotation》 → [base]{annotation}
    text = text.replace(this.AOZORA_EXPLICIT_PATTERN, '[$1]{$2}');

    // Then, convert Aozora auto format: kanji《annotation》 → [kanji]{annotation}
    text = text.replace(this.AOZORA_AUTO_PATTERN, '[$1]{$2}');

    return text;
  }

  /**
   * Distribute annotations across base text if separators are present
   */
  private static distributeAnnotation(
    base: string,
    annotation: string
  ): RubySegment[] {
    // Check if annotation contains separators
    if (!this.SEPARATOR_PATTERN.test(annotation)) {
      // Simple case: one annotation for entire base
      return [{
        type: 'ruby',
        content: base,
        annotation: annotation
      }];
    }

    // Distributed case: split annotation by separators
    const annotationParts = annotation.split(this.SEPARATOR_PATTERN).filter(p => p);

    if (annotationParts.length === 0) {
      // No valid annotations after splitting
      return [{
        type: 'ruby',
        content: base,
        annotation: ''
      }];
    }

    if (annotationParts.length === 1) {
      // Only one annotation part, use simple case
      return [{
        type: 'ruby',
        content: base,
        annotation: annotationParts[0]
      }];
    }

    // Split base text into roughly equal parts
    const baseParts = this.splitBaseByLength(base, annotationParts.length);

    return baseParts.map((basePart, i) => ({
      type: 'ruby',
      content: basePart,
      annotation: annotationParts[i] || ''
    }));
  }

  /**
   * Split base text into N parts of roughly equal length
   */
  private static splitBaseByLength(base: string, count: number): string[] {
    const length = Math.ceil(base.length / count);
    const parts: string[] = [];

    for (let i = 0; i < base.length; i += length) {
      parts.push(base.slice(i, i + length));
    }

    return parts;
  }

  /**
   * Strip ruby annotations and keep only base text for TTS
   */
  static stripRubyForTTS(markdown: string): string {
    // Strip Aozora explicit format
    markdown = markdown.replace(this.AOZORA_EXPLICIT_PATTERN, '$1');

    // Strip Aozora auto format
    markdown = markdown.replace(this.AOZORA_AUTO_PATTERN, '$1');

    // Strip standard format
    markdown = markdown.replace(this.RUBY_PATTERN, '$1');

    return markdown;
  }

  /**
   * Extract ruby annotations (readings) and use them instead of base text for TTS
   * This is useful for VOICEVOX to read kanji with correct pronunciation
   */
  static extractRubyForTTS(markdown: string): string {
    // Replace Aozora explicit format with annotation
    markdown = markdown.replace(this.AOZORA_EXPLICIT_PATTERN, '$2');

    // Replace Aozora auto format with annotation
    markdown = markdown.replace(this.AOZORA_AUTO_PATTERN, '$2');

    // Replace standard format with annotation
    markdown = markdown.replace(this.RUBY_PATTERN, '$2');

    return markdown;
  }
}
