import type { RubySegment, InlineStyles } from '../types';

type LineMarkdown = { type: 'heading' | 'list-item' | 'quote' | 'hr' | 'normal', level?: number };

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
  private static detectMarkdownType(line: string): LineMarkdown {
    // Check for headings (##, ###, etc.)
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      return { type: 'heading', level: headingMatch[1].length };
    }

    // Horizontal rule (---, ***, ___) — check BEFORE list items, since
    // "***" would otherwise match the list pattern
    if (/^([\-\*_])\1{2,}\s*$/.test(line.trim()) && line.trim().length > 0) {
      return { type: 'hr' };
    }

    // Check for list items (-, *, +)
    if (/^[\*\-\+]\s+/.test(line)) {
      return { type: 'list-item' };
    }

    // Check for numbered lists
    if (/^\d+\.\s+/.test(line)) {
      return { type: 'list-item' };
    }

    // Blockquote (>)
    if (/^>\s?/.test(line)) {
      return { type: 'quote' };
    }

    return { type: 'normal' };
  }

  /**
   * Inline-markdown tokenizer. Splits a line into runs of (text, styles)
   * so the reader can show 太字 as bold instead of printing "**太字**".
   * Alternatives are ordered: earlier ones win (e.g. *** before ** before *).
   */
  private static readonly INLINE_PATTERN = new RegExp(
    [
      '(?<comment>%%.*?%%)',                        // %%コメント%% → 非表示
      '(?<code>`[^`]+`)',                           // `code`
      '(?<bolditalic>\\*\\*\\*[^*]+\\*\\*\\*)',     // ***太字斜体***
      '(?<bold>\\*\\*[^*]+\\*\\*|__[^_]+__)',       // **太字** / __太字__
      '(?<italic>\\*[^*\\s][^*]*\\*|_[^_\\s][^_]*_)', // *斜体* / _斜体_
      '(?<strike>~~[^~]+~~)',                       // ~~打消し~~
      '(?<hl>==[^=]+==)',                           // ==ハイライト==
      '(?<embed>!\\[\\[[^\\]]+\\]\\])',             // ![[埋め込み]]
      '(?<wikilink>\\[\\[[^\\]]+\\]\\])',           // [[リンク]] / [[リンク|表示名]]
      '(?<mdlink>\\[[^\\]]+\\]\\([^)]+\\))',        // [表示名](url)
    ].join('|'),
    'g'
  );

  /**
   * Split a line into styled runs. Plain stretches get no styles.
   */
  private static tokenizeInline(line: string): Array<{ text: string; styles?: InlineStyles }> {
    const runs: Array<{ text: string; styles?: InlineStyles }> = [];
    let last = 0;

    for (const m of line.matchAll(this.INLINE_PATTERN)) {
      if (m.index! > last) {
        runs.push({ text: line.slice(last, m.index) });
      }
      const g = m.groups!;
      if (g.comment) {
        // drop comments entirely
      } else if (g.code) {
        runs.push({ text: g.code.slice(1, -1), styles: { code: true } });
      } else if (g.bolditalic) {
        runs.push({ text: g.bolditalic.slice(3, -3), styles: { bold: true, italic: true } });
      } else if (g.bold) {
        runs.push({ text: g.bold.slice(2, -2), styles: { bold: true } });
      } else if (g.italic) {
        runs.push({ text: g.italic.slice(1, -1), styles: { italic: true } });
      } else if (g.strike) {
        runs.push({ text: g.strike.slice(2, -2), styles: { strike: true } });
      } else if (g.hl) {
        runs.push({ text: g.hl.slice(2, -2), styles: { highlight: true } });
      } else if (g.embed) {
        // ![[file]] → ファイル名のみをリンク風に表示
        const inner = g.embed.slice(3, -2);
        const alias = inner.split('|')[1] ?? inner.split('|')[0];
        runs.push({ text: alias, styles: { link: true } });
      } else if (g.wikilink) {
        // [[target|alias]] → alias（無ければ target）
        const inner = g.wikilink.slice(2, -2);
        const parts = inner.split('|');
        runs.push({ text: parts[1] ?? parts[0], styles: { link: true } });
      } else if (g.mdlink) {
        // [text](url) → text
        const text = g.mdlink.slice(1, g.mdlink.indexOf(']'));
        runs.push({ text, styles: { link: true } });
      }
      last = m.index! + m[0].length;
    }

    if (last < line.length) {
      runs.push({ text: line.slice(last) });
    }

    return runs;
  }

  /**
   * Parse a single line: inline-markdown runs first, then ruby annotations
   * inside each run (so ruby works inside 太字 etc.).
   */
  private static parseLine(line: string, markdownInfo: LineMarkdown): RubySegment[] {
    const segments: RubySegment[] = [];

    for (const run of this.tokenizeInline(line)) {
      segments.push(...this.parseRubyRun(run.text, markdownInfo, run.styles));
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
   * Parse ruby annotations within a styled run of text.
   */
  private static parseRubyRun(text: string, markdownInfo: LineMarkdown, styles?: InlineStyles): RubySegment[] {
    const segments: RubySegment[] = [];
    let lastIndex = 0;

    const matches = text.matchAll(this.RUBY_PATTERN);

    for (const match of matches) {
      // Add plain text before ruby
      if (match.index! > lastIndex) {
        const plainText = text.slice(lastIndex, match.index);
        if (plainText) {
          segments.push({
            type: 'text',
            content: plainText,
            markdown: markdownInfo,
            styles
          });
        }
      }

      // Add ruby segment(s)
      const base = match[1];
      const annotation = match[2];

      const distributed = this.distributeAnnotation(base, annotation);
      distributed.forEach(seg => {
        seg.markdown = markdownInfo;
        seg.styles = styles;
      });
      segments.push(...distributed);

      lastIndex = match.index! + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText) {
        segments.push({
          type: 'text',
          content: remainingText,
          markdown: markdownInfo,
          styles
        });
      }
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
