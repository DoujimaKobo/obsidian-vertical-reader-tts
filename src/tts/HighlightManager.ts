import { ttsState } from './TTSState';
import { TextSegmenter } from '../parsers/TextSegmenter';
import type { RubySegment } from '../types';

/**
 * Manages highlighting synchronization between TTS playback and visual segments
 */
export class HighlightManager {
  private segments: RubySegment[] = [];
  private cleanedText: string = '';
  private segmentPositions: Map<number, number> = new Map();

  /**
   * Set segments and cleaned text for position mapping
   */
  setSegments(segments: RubySegment[], cleanedText: string) {
    this.segments = segments;
    this.cleanedText = cleanedText;
    this.calculatePositions();
  }

  /**
   * Calculate cumulative positions for each segment
   */
  private calculatePositions() {
    this.segmentPositions = TextSegmenter.calculatePositions(this.segments);
  }

  /**
   * Get the segment index at the given character position
   */
  getCurrentSegmentIndex(charIndex: number): number {
    return TextSegmenter.findSegmentAtPosition(
      this.segmentPositions,
      this.segments,
      charIndex
    );
  }

  /**
   * Handle TTS boundary event and update state
   */
  handleBoundary(charIndex: number, charLength: number) {
    const segmentIndex = this.getCurrentSegmentIndex(charIndex);
    ttsState.updatePosition(segmentIndex, charLength);
  }

  /**
   * Reset highlight state
   */
  reset() {
    ttsState.updatePosition(-1, 0);
  }
}
