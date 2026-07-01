/**
 * Utility to detect available fonts on the system
 */

export interface FontInfo {
  name: string;
  value: string;
  description: string;
  category: 'mincho' | 'gothic' | 'other';
}

export class FontDetector {
  private static testString = 'あいうえおABCDE12345';
  private static testSize = '72px';
  private static baseFonts = ['monospace', 'sans-serif', 'serif'];

  /**
   * Test if a font is available on the system
   */
  static isFontAvailable(fontName: string): boolean {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;

    // Test with base fonts
    const baseWidths: { [key: string]: number } = {};
    for (const baseFont of this.baseFonts) {
      context.font = `${this.testSize} ${baseFont}`;
      baseWidths[baseFont] = context.measureText(this.testString).width;
    }

    // Test with the target font
    let detected = false;
    for (const baseFont of this.baseFonts) {
      context.font = `${this.testSize} '${fontName}', ${baseFont}`;
      const width = context.measureText(this.testString).width;
      if (width !== baseWidths[baseFont]) {
        detected = true;
        break;
      }
    }

    return detected;
  }

  /**
   * Get list of common Japanese fonts to test
   */
  static getCommonJapaneseFonts(): FontInfo[] {
    const fonts: FontInfo[] = [
      // Mincho (Serif) fonts
      { name: '游明朝 (Yu Mincho)', value: '"Yu Mincho", "游明朝", YuMincho, serif', description: 'Windows/Mac標準の明朝体', category: 'mincho' },
      { name: 'ＭＳ 明朝 (MS Mincho)', value: '"MS Mincho", "ＭＳ 明朝", "MS PMincho", serif', description: 'Windows標準の明朝体', category: 'mincho' },
      { name: 'ヒラギノ明朝 (Hiragino Mincho)', value: '"Hiragino Mincho ProN", "Hiragino Mincho Pro", "ヒラギノ明朝 ProN", serif', description: 'Mac標準の明朝体', category: 'mincho' },
      { name: '游明朝体 (YuMincho)', value: 'YuMincho, "游明朝体", "游明朝", "Yu Mincho", serif', description: '游明朝の別名', category: 'mincho' },
      { name: 'UD デジタル 教科書体 NK-R', value: '"UD デジタル 教科書体 NK-R", "UDデジタル教科書体NK-R", serif', description: 'Windows 10/11の教科書体', category: 'mincho' },
      { name: 'HGS教科書体', value: '"HGS教科書体", "HG教科書体", serif', description: 'Microsoft Office付属の教科書体', category: 'mincho' },
      { name: 'Noto Serif JP', value: '"Noto Serif JP", "Noto Serif CJK JP", serif', description: 'Google製オープンソース明朝体', category: 'mincho' },
      { name: 'Source Han Serif', value: '"Source Han Serif JP", "Source Han Serif", "源ノ明朝", serif', description: 'Adobe製オープンソース明朝体', category: 'mincho' },

      // Gothic (Sans-serif) fonts
      { name: '游ゴシック (Yu Gothic)', value: '"Yu Gothic", "游ゴシック", YuGothic, "Yu Gothic UI", sans-serif', description: 'Windows/Mac標準のゴシック体', category: 'gothic' },
      { name: 'ＭＳ ゴシック (MS Gothic)', value: '"MS Gothic", "ＭＳ ゴシック", "MS PGothic", monospace', description: 'Windows標準の等幅ゴシック体', category: 'gothic' },
      { name: 'ヒラギノ角ゴ (Hiragino Sans)', value: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ ProN", sans-serif', description: 'Mac標準のゴシック体', category: 'gothic' },
      { name: 'メイリオ (Meiryo)', value: 'Meiryo, メイリオ, "Meiryo UI", sans-serif', description: 'Windows標準の読みやすいフォント', category: 'gothic' },
      { name: 'Noto Sans JP', value: '"Noto Sans JP", "Noto Sans CJK JP", sans-serif', description: 'Google製オープンソースゴシック体', category: 'gothic' },
      { name: 'Source Han Sans', value: '"Source Han Sans JP", "Source Han Sans", "源ノ角ゴシック", sans-serif', description: 'Adobe製オープンソースゴシック体', category: 'gothic' },
      { name: 'UD デジタル 教科書体 NK-B', value: '"UD デジタル 教科書体 NK-B", "UDデジタル教科書体NK-B", sans-serif', description: 'UD教科書体（太字）', category: 'gothic' },

      // Generic families
      { name: 'Serif（明朝体系）', value: 'serif', description: 'システムのデフォルト明朝体', category: 'mincho' },
      { name: 'Sans-serif（ゴシック体系）', value: 'sans-serif', description: 'システムのデフォルトゴシック体', category: 'gothic' },
      { name: 'Monospace（等幅）', value: 'monospace', description: 'システムのデフォルト等幅フォント', category: 'other' },
    ];

    return fonts;
  }

  /**
   * Filter fonts to only those available on the system
   */
  static getAvailableFonts(): FontInfo[] {
    const allFonts = this.getCommonJapaneseFonts();
    const availableFonts: FontInfo[] = [];

    // Always include generic families
    const genericFonts = allFonts.filter(f =>
      f.value === 'serif' || f.value === 'sans-serif' || f.value === 'monospace'
    );
    availableFonts.push(...genericFonts);

    // Test other fonts
    for (const font of allFonts) {
      if (font.value === 'serif' || font.value === 'sans-serif' || font.value === 'monospace') {
        continue; // Already added
      }

      // Extract first font name from the value
      const match = font.value.match(/["']([^"']+)["']/);
      if (match && this.isFontAvailable(match[1])) {
        availableFonts.push(font);
      }
    }

    return availableFonts;
  }

  /**
   * Get fonts organized by category
   */
  static getCategorizedFonts(): {
    mincho: FontInfo[];
    gothic: FontInfo[];
    other: FontInfo[];
  } {
    const fonts = this.getAvailableFonts();

    return {
      mincho: fonts.filter(f => f.category === 'mincho'),
      gothic: fonts.filter(f => f.category === 'gothic'),
      other: fonts.filter(f => f.category === 'other'),
    };
  }
}
