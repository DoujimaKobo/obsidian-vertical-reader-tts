/**
 * 句読点処理ユーティリティ
 * VOICEVOXの休止時間を調整するためにテキストを加工
 */
export class PunctuationProcessor {
  /**
   * 句読点の後に休止時間を挿入
   * VOICEVOXが認識可能な形式に変換
   *
   * @param text - 処理するテキスト
   * @param commaPause - 読点（、）の休止時間（秒）
   * @param periodPause - 句点（。）の休止時間（秒）
   * @param exclamationPause - 感嘆符（！）の休止時間（秒）
   * @param questionPause - 疑問符（？）の休止時間（秒）
   * @returns 処理済みテキスト
   */
  static insertPauses(
    text: string,
    commaPause: number,
    periodPause: number,
    exclamationPause: number = 0,
    questionPause: number = 0
  ): string {
    let result = text;

    // 句点（。）の処理
    if (periodPause > 0) {
      const periodPauseMarker = this.generatePauseMarker(periodPause);
      result = result.replace(/。/g, `。${periodPauseMarker}`);
    }

    // 読点（、）の処理
    if (commaPause > 0) {
      const commaPauseMarker = this.generatePauseMarker(commaPause);
      result = result.replace(/、/g, `、${commaPauseMarker}`);
    }

    // 感嘆符（！）の処理
    if (exclamationPause > 0) {
      const exclamationPauseMarker = this.generatePauseMarker(exclamationPause);
      result = result.replace(/！/g, `！${exclamationPauseMarker}`);
    }

    // 疑問符（？）の処理
    if (questionPause > 0) {
      const questionPauseMarker = this.generatePauseMarker(questionPause);
      result = result.replace(/？/g, `？${questionPauseMarker}`);
    }

    return result;
  }

  /**
   * 休止時間に対応する記号を生成
   * VOICEVOXが認識する形式（空白文字）を返す
   *
   * @param pauseSeconds - 休止時間（秒）
   * @returns 休止記号
   */
  private static generatePauseMarker(pauseSeconds: number): string {
    // VOICEVOXは全角スペースを短い休止として認識する
    // 0.1秒 ≈ 1つの全角スペース程度
    const spaceCount = Math.max(1, Math.round(pauseSeconds / 0.15));
    return '　'.repeat(spaceCount);
  }

  /**
   * 句読点処理を適用すべきかチェック
   */
  static shouldApplyPunctuation(
    commaPause: number,
    periodPause: number,
    exclamationPause: number = 0,
    questionPause: number = 0
  ): boolean {
    return commaPause > 0 || periodPause > 0 || exclamationPause > 0 || questionPause > 0;
  }
}
