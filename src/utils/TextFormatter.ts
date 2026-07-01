/**
 * Text formatting utilities for Japanese text
 */

export class TextFormatter {
  /**
   * Extract frontmatter from text
   * Returns [frontmatter, remainingText]
   */
  private static extractFrontmatter(text: string): [string, string] {
    const frontmatterMatch = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const content = text.slice(frontmatter.length);
      console.log('Frontmatter detected:', frontmatter.length, 'chars');
      console.log('Content after frontmatter:', content.length, 'chars');
      return [frontmatter, content];
    }
    console.log('No frontmatter detected');
    return ['', text];
  }

  /**
   * Add full-width space (　) at the beginning of non-dialogue sentences
   * Detects existing spaces to avoid duplicates
   * Preserves YAML frontmatter without modification
   */
  static addSentenceIndentation(text: string): string {
    console.log('=== addSentenceIndentation START ===');
    console.log('Input text length:', text.length);

    // Extract frontmatter
    const [frontmatter, content] = this.extractFrontmatter(text);
    console.log('Frontmatter length:', frontmatter.length);
    console.log('Content to process length:', content.length);

    const lines = content.split('\n');
    const result: string[] = [];
    let modifiedLines = 0;

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) {
        result.push(line);
        continue;
      }

      // Check if line starts with dialogue markers (「」『』など)
      const isDialogue = /^[\s　]*[「『【『]/.test(line);

      // Check if line already has full-width space at the beginning
      const hasIndentation = /^　/.test(line.trim());

      // Add indentation if:
      // 1. Not dialogue
      // 2. Doesn't already have indentation
      // 3. Not a continuation line (doesn't start with certain characters)
      const isContinuation = /^[\s　]*[」』】）)、。，．？！…―]/.test(line);

      if (!isDialogue && !hasIndentation && !isContinuation) {
        // Remove any leading whitespace and add full-width space
        const trimmedLine = line.trimStart();
        result.push('　' + trimmedLine);
        modifiedLines++;
      } else {
        result.push(line);
      }
    }

    console.log('Modified lines count:', modifiedLines);

    // Restore frontmatter
    const finalResult = frontmatter + result.join('\n');
    console.log('Final result length:', finalResult.length);
    console.log('=== addSentenceIndentation END ===');

    return finalResult;
  }

  /**
   * Add full-width space (　) after ？ and ！
   * Detects existing spaces and removes half-width spaces
   * Preserves YAML frontmatter without modification
   * Prevents spacing between consecutive punctuation marks
   */
  static addPunctuationSpacing(text: string): string {
    // Extract frontmatter
    const [frontmatter, content] = this.extractFrontmatter(text);

    let result = content;

    // Replace ？ or ！ followed by half-width space with full-width space
    result = result.replace(/([？！])\s+/g, '$1　');

    // Add full-width space after ？ or ！ if not already present
    // Don't add if followed by:
    // - dialogue end markers (」』】）)
    // - other punctuation (、。，．…―？！)
    // - newline
    // - already has full-width space
    result = result.replace(/([？！])(?!　)(?![」』】）)、。，．…―？！\n])/g, '$1　');

    // Clean up multiple consecutive spaces
    result = result.replace(/　{2,}/g, '　');

    // Restore frontmatter
    return frontmatter + result;
  }

  /**
   * Apply all formatting rules at once
   */
  static formatAll(text: string): string {
    let result = text;
    result = this.addSentenceIndentation(result);
    result = this.addPunctuationSpacing(result);
    return result;
  }
}
