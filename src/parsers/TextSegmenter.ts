/**
 * Utility for text segmentation and position mapping
 */
export class TextSegmenter {
  /**
   * Calculate cumulative positions for text segments
   */
  static calculatePositions(segments: Array<{ content: string }>): Map<number, number> {
    const positions = new Map<number, number>();
    let position = 0;

    segments.forEach((segment, index) => {
      positions.set(index, position);
      position += segment.content.length;
    });

    return positions;
  }

  /**
   * Find segment index at given character position
   */
  static findSegmentAtPosition(
    positions: Map<number, number>,
    segments: Array<{ content: string }>,
    charPosition: number
  ): number {
    let cumulativeLength = 0;

    for (let i = 0; i < segments.length; i++) {
      const segmentLength = segments[i].content.length;

      if (charPosition >= cumulativeLength && charPosition < cumulativeLength + segmentLength) {
        return i;
      }

      cumulativeLength += segmentLength;
    }

    return -1;
  }
}
