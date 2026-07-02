import { requestUrl, Notice } from 'obsidian';
import type { AudioQuery, VOICEVOXSpeaker } from '../types';
import { MarkdownCleaner } from '../parsers/MarkdownCleaner';
import { RubyParser } from '../parsers/RubyParser';
import { PunctuationProcessor } from '../utils/PunctuationProcessor';

// VOICEVOX設定
const MAX_TEXT_LENGTH = 500; // 1回のリクエストで送信する最大文字数
const SENTENCE_SPLIT_PATTERN = /[。！？\n]+/; // 文の区切りパターン

/**
 * VOICEVOX Engine wrapper for high-quality Japanese TTS
 * Uses VOICEVOX Engine API (http://127.0.0.1:50021 by default)
 */
/**
 * シームレス・プリフェッチ機能付きVOICEVOX Engine
 * 二段構えの音声バッファで途切れのない再生を実現
 */
export class VOICEVOXEngine {
  private serverUrl: string;
  private speakerId: number;
  private speedScale: number;
  private commaPause: number; // 読点の休止時間
  private periodPause: number; // 句点の休止時間
  private exclamationPause: number; // 感嘆符の休止時間
  private questionPause: number; // 疑問符の休止時間
  private audioContext: AudioContext | null = null;

  // 二段構え: 現在再生中と次に再生するバッファ
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private nextAudioBuffer: AudioBuffer | null = null;

  private onEndCallback?: () => void;
  private onPositionChangeCallback?: (chunkIndex: number, totalChunks: number) => void;
  private isPausedState: boolean = false;
  private isSpeakingState: boolean = false;
  private useRubyReading: boolean = false;

  // 排他制御フラグ
  private isProcessing: boolean = false;
  private isPrefetching: boolean = false;
  private shouldCancelPrefetch: boolean = false;

  // キャンセルコントローラー（すべてのfetchを一括キャンセル）
  private prefetchAbortController: AbortController | null = null;
  private mainAbortController: AbortController | null = null;

  // 現在の再生位置情報（同期スクロール用）
  private currentChunkIndex: number = 0;
  private totalChunks: number = 0;
  private currentChunks: string[] = []; // 一時停止からの再開用に全チャンクを保持
  private currentChunkText: string = '';
  private currentChunkStartTime: number = 0; // 現在のチャンク開始時刻（performance.now()）
  private currentChunkDuration: number = 0; // 現在のチャンクの長さ（秒）
  private currentChunkLength: number = 0; // 現在のチャンクの文字数

  private statusNotice: Notice | null = null;

  constructor(
    serverUrl: string = 'http://127.0.0.1:50021',
    speakerId: number = 0,
    speedScale: number = 1.0,
    useRubyReading: boolean = false,
    commaPause: number = 0.3,
    periodPause: number = 0.5,
    exclamationPause: number = 0.5,
    questionPause: number = 0.5
  ) {
    this.serverUrl = serverUrl;
    this.speakerId = speakerId;
    this.speedScale = speedScale;
    this.useRubyReading = useRubyReading;
    this.commaPause = commaPause;
    this.periodPause = periodPause;
    this.exclamationPause = exclamationPause;
    this.questionPause = questionPause;
  }

  /**
   * Initialize audio context
   */
  private initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
  }

  /**
   * Check if VOICEVOX Engine is available
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/version`,
        method: 'GET'
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available speakers from VOICEVOX Engine
   */
  async getSpeakers(): Promise<VOICEVOXSpeaker[]> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/speakers`,
        method: 'GET'
      });

      if (response.status === 200) {
        return response.json as VOICEVOXSpeaker[];
      }
      throw new Error(`Failed to get speakers: ${response.status}`);
    } catch (error) {
      console.error('Error fetching speakers:', error);
      new Notice('VOICEVOX Engineへの接続に失敗しました。サーバーが起動しているか確認してください。');
      throw error;
    }
  }

  /**
   * Speak the given text using VOICEVOX
   * シームレス・プリフェッチで途切れのない再生を実現
   * 排他制御により多重再生を完全に防止
   */
  async speak(text: string) {
    // 排他制御: 既に処理中の場合は即座にリターン
    if (this.isProcessing) {
      console.warn('VOICEVOX: Already processing, ignoring new request');
      return;
    }

    try {
      // 処理開始フラグを立てる
      this.isProcessing = true;

      // 既存の音声を完全に停止してリソースを解放（再生中＋プリフェッチ中すべて）
      await this.stop();

      // 新しいAbortControllerを作成（すべてのfetchを制御）
      this.mainAbortController = new AbortController();

      // Clean markdown syntax
      let cleanText = MarkdownCleaner.clean(text);

      // Apply ruby processing based on settings
      if (this.useRubyReading) {
        cleanText = RubyParser.extractRubyForTTS(cleanText);
      } else {
        cleanText = RubyParser.stripRubyForTTS(cleanText);
      }

      // Normalize pause symbols (…, ――) into commas so VOICEVOX pauses on them
      cleanText = PunctuationProcessor.normalizePauseSymbols(cleanText);

      // Apply punctuation pauses
      if (PunctuationProcessor.shouldApplyPunctuation(
        this.commaPause,
        this.periodPause,
        this.exclamationPause,
        this.questionPause
      )) {
        cleanText = PunctuationProcessor.insertPauses(
          cleanText,
          this.commaPause,
          this.periodPause,
          this.exclamationPause,
          this.questionPause
        );
        console.log('[Punctuation] Applied pauses - comma:', this.commaPause,
          'period:', this.periodPause,
          'exclamation:', this.exclamationPause,
          'question:', this.questionPause);
      }

      if (!cleanText.trim()) {
        this.isProcessing = false;
        return;
      }

      // テキストを分割
      const chunks = this.splitText(cleanText);
      console.log(`[Seamless Prefetch] Text split into ${chunks.length} chunks`);

      // 再生位置情報を初期化（resume用にチャンクを保持）
      this.currentChunks = chunks;
      this.totalChunks = chunks.length;
      this.currentChunkIndex = 0;

      if (chunks.length > 10) {
        new Notice(`⚠️ テキストが長いため、${chunks.length}回に分けて再生します（シームレス再生）`);
      }

      this.isSpeakingState = true;
      this.isPausedState = false;

      // シームレス・プリフェッチで順次再生
      await this.speakChunksSeamlessly(chunks);

      // 一時停止で抜けた場合は状態を保持して再開に備える
      if (this.isPausedState) {
        return;
      }

      // すべて完了: ステータス消去とフラグリセット、終了通知
      this.hideStatusNotice();
      this.isSpeakingState = false;
      this.isPausedState = false;
      if (this.onEndCallback) {
        this.onEndCallback();
      }

    } catch (error) {
      console.error('VOICEVOX speech error:', error);
      this.isSpeakingState = false;
      this.hideStatusNotice();

      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('connect')) {
          new Notice('❌ VOICEVOX Engineを起動してください');
        } else if (error.message.includes('500')) {
          new Notice('❌ VOICEVOX Engine内部エラー。テキストが長すぎる可能性があります。');
        } else if (error.message.includes('cancelled')) {
          console.log('Playback cancelled by user');
        } else {
          new Notice(`❌ 音声合成エラー: ${error.message}`);
        }
      }
      throw error;
    } finally {
      // 処理完了フラグを下ろす
      this.isProcessing = false;
    }
  }

  /**
   * シームレス・プリフェッチで複数チャンクを途切れなく再生
   * 二段構え: 現在再生中 + 次を裏で準備
   */
  private async speakChunksSeamlessly(chunks: string[], startIndex: number = 0): Promise<void> {
    if (chunks.length === 0) return;

    console.log(`[Seamless Prefetch] Starting seamless playback from chunk ${startIndex + 1}`);

    // キャンセルフラグをリセット
    this.shouldCancelPrefetch = false;

    try {
      // 最初のチャンク（開始位置）を生成
      this.showStatusNotice(`🎵 音声を生成中... (${startIndex + 1}/${chunks.length})`);
      const firstBuffer = await this.generateAudioBuffer(chunks[startIndex]);

      // キャンセル/一時停止チェック
      if (this.shouldCancelPrefetch || this.isPausedState) {
        console.log('[Seamless Prefetch] Halted before first playback');
        return;
      }

      // 最初のチャンクを再生開始
      this.currentChunkIndex = startIndex;
      this.currentChunkText = chunks[startIndex];
      this.currentChunkLength = chunks[startIndex].length;
      this.updateStatusNotice(`▶️ 再生中... (${startIndex + 1}/${chunks.length})`);
      this.playAudioBuffer(firstBuffer);

      // 2番目以降のチャンクをプリフェッチ＆再生
      for (let i = startIndex + 1; i < chunks.length; i++) {
        // キャンセル/一時停止チェック（ループの最初に必ずチェック）
        if (this.shouldCancelPrefetch || this.isPausedState) {
          console.log(`[Seamless Prefetch] Halted at chunk ${i}`);
          return;
        }

        // 次のチャンクをプリフェッチ開始（裏で並行実行）
        console.log(`[Seamless Prefetch] Prefetching chunk ${i + 1}/${chunks.length}`);
        const prefetchPromise = this.prefetchNextChunk(chunks[i], i + 1, chunks.length);

        // 現在のチャンクの再生完了を待つ（一時停止時もここで解決される）
        await this.waitForCurrentPlaybackToComplete();

        // キャンセル/一時停止チェック（再生完了後）
        if (this.shouldCancelPrefetch || this.isPausedState) {
          console.log(`[Seamless Prefetch] Halted after playback completion ${i}`);
          return;
        }

        // プリフェッチ完了を待つ
        let nextBuffer;
        try {
          nextBuffer = await prefetchPromise;
        } catch (error) {
          // プリフェッチがキャンセル/一時停止された場合
          if (this.shouldCancelPrefetch || this.isPausedState) {
            console.log(`[Seamless Prefetch] Prefetch halted ${i}`);
            return;
          }
          throw error;
        }

        // キャンセル/一時停止チェック（プリフェッチ完了後、再生前に必ずチェック）
        if (this.shouldCancelPrefetch || this.isPausedState) {
          console.log(`[Seamless Prefetch] Halted before playing chunk ${i + 1}`);
          return;
        }

        // 即座に次のチャンクを再生（シームレス）
        console.log(`[Seamless Prefetch] Playing chunk ${i + 1}/${chunks.length} seamlessly`);
        this.currentChunkIndex = i;
        this.currentChunkText = chunks[i];
        this.currentChunkLength = chunks[i].length;
        this.updateStatusNotice(`▶️ 再生中... (${i + 1}/${chunks.length})`);
        this.playAudioBuffer(nextBuffer);

        // 前のバッファをメモリから解放
        this.nextAudioBuffer = null;
      }

      // キャンセル/一時停止チェック（最後のチャンク再生前）
      if (this.shouldCancelPrefetch || this.isPausedState) {
        console.log('[Seamless Prefetch] Halted before waiting for last chunk');
        return;
      }

      // 最後のチャンクの再生完了を待つ
      await this.waitForCurrentPlaybackToComplete();

      // 完了時もキャンセルされていないかチェック
      if (!this.shouldCancelPrefetch) {
        console.log('[Seamless Prefetch] All chunks completed successfully');
      }

    } catch (error) {
      if (error instanceof Error && error.message === 'Playback cancelled') {
        console.log('[Seamless Prefetch] Playback was cancelled');
      } else {
        throw error;
      }
    }
  }

  /**
   * 次のチャンクを裏でプリフェッチ
   */
  private async prefetchNextChunk(text: string, index: number, total: number): Promise<AudioBuffer> {
    this.isPrefetching = true;
    this.prefetchAbortController = new AbortController();

    try {
      // キャンセルチェック（プリフェッチ開始前）
      if (this.shouldCancelPrefetch) {
        throw new Error('Prefetch cancelled before start');
      }

      console.log(`[Seamless Prefetch] Generating next chunk ${index}/${total} in background`);
      this.updateStatusNotice(`🔊 次の音声を準備中... (${index}/${total})`);

      const buffer = await this.generateAudioBuffer(text);

      // キャンセルチェック（生成完了後）
      if (this.shouldCancelPrefetch) {
        console.log(`[Seamless Prefetch] Prefetch cancelled after generation ${index}/${total}`);
        throw new Error('Prefetch cancelled');
      }

      // プリフェッチ完了: nextAudioBufferに格納
      this.nextAudioBuffer = buffer;
      console.log(`[Seamless Prefetch] Next chunk ${index}/${total} ready`);

      return buffer;

    } finally {
      this.isPrefetching = false;
      this.prefetchAbortController = null;
    }
  }

  /**
   * AudioBufferを生成（audio_query + synthesis）
   */
  private async generateAudioBuffer(text: string): Promise<AudioBuffer> {
    // Step 1: Create audio query
    const audioQuery = await this.createAudioQuery(text);

    // Apply speed scale
    audioQuery.speedScale = this.speedScale;

    // Step 2: Synthesize speech
    const audioData = await this.synthesize(audioQuery);

    // Step 3: Decode to AudioBuffer
    this.initAudioContext();
    const audioBuffer = await this.audioContext!.decodeAudioData(audioData);

    return audioBuffer;
  }

  /**
   * Split long text into smaller chunks
   * テキストを文単位で分割してVOICEVOXの負荷を軽減
   */
  private splitText(text: string): string[] {
    if (text.length <= MAX_TEXT_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.split(SENTENCE_SPLIT_PATTERN).filter(s => s.trim());

    let currentChunk = '';
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > MAX_TEXT_LENGTH) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // 1文が長すぎる場合は強制的に分割
        if (sentence.length > MAX_TEXT_LENGTH) {
          for (let i = 0; i < sentence.length; i += MAX_TEXT_LENGTH) {
            chunks.push(sentence.slice(i, i + MAX_TEXT_LENGTH));
          }
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 0);
  }


  /**
   * Show status notice
   */
  private showStatusNotice(message: string) {
    this.hideStatusNotice(); // 既存のNoticeを消去
    this.statusNotice = new Notice(message, 0); // 0 = 自動で消えない
  }

  /**
   * Update status notice
   */
  private updateStatusNotice(message: string) {
    if (this.statusNotice) {
      this.statusNotice.setMessage(message);
    } else {
      this.showStatusNotice(message);
    }
  }

  /**
   * Hide status notice
   */
  private hideStatusNotice() {
    if (this.statusNotice) {
      this.statusNotice.hide();
      this.statusNotice = null;
    }
  }

  /**
   * Create audio query from text
   */
  private async createAudioQuery(text: string): Promise<AudioQuery> {
    try {
      console.log(`Creating audio query for text (${text.length} chars):`, text.substring(0, 50));

      // AbortControllerでキャンセル可能にする
      if (this.mainAbortController?.signal.aborted) {
        throw new Error('Request cancelled');
      }

      const response = await requestUrl({
        url: `${this.serverUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${this.speakerId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // リクエスト後もキャンセルをチェック
      if (this.mainAbortController?.signal.aborted) {
        throw new Error('Request cancelled');
      }

      if (response.status === 200) {
        console.log('Audio query created successfully');
        return response.json as AudioQuery;
      }

      const errorMsg = `Audio query failed: ${response.status}`;
      console.error(errorMsg, response);
      throw new Error(errorMsg);
    } catch (error) {
      console.error('Error creating audio query:', error);
      if (error instanceof Error && error.message.includes('500')) {
        throw new Error('VOICEVOX Engine 500エラー。テキストに問題がある可能性があります。');
      }
      throw error;
    }
  }

  /**
   * Synthesize speech from audio query
   */
  private async synthesize(audioQuery: AudioQuery): Promise<ArrayBuffer> {
    try {
      console.log('Synthesizing speech with speedScale:', audioQuery.speedScale);

      // AbortControllerでキャンセル可能にする
      if (this.mainAbortController?.signal.aborted) {
        throw new Error('Request cancelled');
      }

      const response = await requestUrl({
        url: `${this.serverUrl}/synthesis?speaker=${this.speakerId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(audioQuery)
      });

      // リクエスト後もキャンセルをチェック
      if (this.mainAbortController?.signal.aborted) {
        throw new Error('Request cancelled');
      }

      if (response.status === 200) {
        console.log('Synthesis completed successfully, audio size:', response.arrayBuffer.byteLength);
        return response.arrayBuffer;
      }

      const errorMsg = `Synthesis failed: ${response.status}`;
      console.error(errorMsg, response);
      throw new Error(errorMsg);
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      if (error instanceof Error && error.message.includes('500')) {
        throw new Error('VOICEVOX Engine 500エラー。音声合成に失敗しました。');
      }
      throw error;
    }
  }

  /**
   * AudioBufferを再生（即座に開始）
   */
  private playAudioBuffer(audioBuffer: AudioBuffer): void {
    // キャンセルチェック - 停止後は絶対に再生しない
    if (this.shouldCancelPrefetch) {
      console.log('[Seamless Prefetch] Playback cancelled - shouldCancelPrefetch is true');
      return;
    }

    this.initAudioContext();

    if (!this.audioContext) {
      throw new Error('AudioContext is not available');
    }

    try {
      // 前のソースがあれば完全にクリーンアップ
      if (this.currentAudioSource) {
        try {
          this.currentAudioSource.stop();
          this.currentAudioSource.disconnect();
        } catch (e) {
          // Already stopped
        }
        this.currentAudioSource = null;
      }

      // 再度キャンセルチェック（AudioContextの初期化後）
      if (this.shouldCancelPrefetch) {
        console.log('[Seamless Prefetch] Playback cancelled after AudioContext init');
        return;
      }

      // 新しいソースを作成
      this.currentAudioSource = this.audioContext.createBufferSource();
      this.currentAudioSource.buffer = audioBuffer;
      this.currentAudioSource.connect(this.audioContext.destination);

      // 再生終了イベント
      this.currentAudioSource.onended = () => {
        console.log('[Seamless Prefetch] Current chunk playback ended');
        // currentAudioSourceはnullにしない（waitForCurrentPlaybackToCompleteで検知するため）
      };

      // 最終キャンセルチェック（再生直前）
      if (this.shouldCancelPrefetch) {
        console.log('[Seamless Prefetch] Playback cancelled before start()');
        this.currentAudioSource.disconnect();
        this.currentAudioSource = null;
        return;
      }

      // 再生タイミング情報を記録（スムーズスクロール用）
      this.currentChunkStartTime = performance.now();
      this.currentChunkDuration = audioBuffer.duration;

      // 即座に再生開始
      this.currentAudioSource.start(0);
      console.log('[Seamless Prefetch] Started playing audio buffer, duration:', audioBuffer.duration);

      // 再生開始を即座に通知（スクロールをトリガー）
      if (this.onPositionChangeCallback) {
        this.onPositionChangeCallback(this.currentChunkIndex, this.totalChunks);
      }

    } catch (error) {
      console.error('Error playing audio:', error);
      this.isSpeakingState = false;
      throw error;
    }
  }

  /**
   * 現在のチャンクの再生完了を待つ
   */
  private async waitForCurrentPlaybackToComplete(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.currentAudioSource) {
        resolve();
        return;
      }

      const source = this.currentAudioSource;

      // キャンセル状態を定期的にチェック
      const cancelCheckInterval = setInterval(() => {
        if (this.shouldCancelPrefetch) {
          console.log('[Seamless Prefetch] Cancel detected during playback wait');
          clearInterval(cancelCheckInterval);
          resolve();
        }
      }, 50); // 50msごとにチェック

      // onendedイベントで完了を検知（タイムアウトなし、イベントのみに依存）
      const originalOnEnded = source.onended;
      source.onended = (event) => {
        clearInterval(cancelCheckInterval);

        // 元のハンドラーを呼ぶ
        if (originalOnEnded) {
          originalOnEnded.call(source, event);
        }

        // Promiseを解決
        console.log('[Onended Event] Playback completed naturally, proceeding to next');
        resolve();
      };

      // タイムアウトは使わない - onendedとキャンセルチェックのみで制御
      // AudioBufferSourceNode.onendedは stop() や自然終了で確実に発火する
    });
  }

  /**
   * Pause playback.
   *
   * Web Audio can't truly pause a source, so we stop the current chunk and set
   * `isPausedState`. The seamless loop checks `isPausedState` right after the
   * (now-resolved) playback wait and returns WITHOUT advancing — remembering
   * `currentChunkIndex`. Resume re-synthesizes from that chunk.
   *
   * This is the fix for the old bug where pausing stopped the audio source,
   * which the loop mistook for a natural end and skipped ahead to keep playing.
   */
  pause() {
    if (!this.isSpeakingState) return;

    this.isPausedState = true;
    this.isSpeakingState = false;

    // Abandon the in-flight prefetch (its buffer will be discarded)
    if (this.prefetchAbortController) {
      this.prefetchAbortController.abort();
      this.prefetchAbortController = null;
    }

    // Stop the current chunk. onended resolves the playback wait; the loop then
    // sees isPausedState and halts at currentChunkIndex.
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.currentAudioSource.disconnect();
      } catch (e) {
        // already stopped
      }
      this.currentAudioSource = null;
    }

    this.updateStatusNotice('⏸ 一時停止中');
  }

  /**
   * Resume playback from the chunk where we paused.
   */
  async resume() {
    if (!this.isPausedState || this.currentChunks.length === 0) return;
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.isPausedState = false;
    this.isSpeakingState = true;

    try {
      this.mainAbortController = new AbortController();
      await this.speakChunksSeamlessly(this.currentChunks, this.currentChunkIndex);

      // Paused again mid-resume: keep state for the next resume
      if (this.isPausedState) return;

      this.hideStatusNotice();
      this.isSpeakingState = false;
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    } catch (error) {
      console.error('VOICEVOX resume error:', error);
      this.isSpeakingState = false;
      this.hideStatusNotice();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stop playback and release all resources
   * 再生中＋プリフェッチ中＋進行中のfetchすべてを即座に破棄
   * 完全にリソースを解放して多重再生を防止
   * 主（あるじ）が『黙れ』と言えば、一文字たりとも漏らさない
   */
  async stop() {
    console.log('[Absolute Stop] Stopping ALL: audio + prefetch + fetch requests');

    // 1. すべてのfetchリクエストを強制終了
    if (this.mainAbortController) {
      this.mainAbortController.abort();
      this.mainAbortController = null;
      console.log('[Absolute Stop] Main fetch requests aborted');
    }

    // 2. プリフェッチをキャンセル
    this.shouldCancelPrefetch = true;
    if (this.prefetchAbortController) {
      this.prefetchAbortController.abort();
      this.prefetchAbortController = null;
      console.log('[Absolute Stop] Prefetch requests aborted');
    }

    // 3. 現在再生中の音声ソースを停止
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.currentAudioSource.disconnect();
        console.log('[Absolute Stop] Current audio source stopped');
      } catch (error) {
        // Already stopped or disconnected
      }
      this.currentAudioSource = null;
    }

    // 4. プリフェッチ済みのバッファを破棄（メモリ解放）
    this.nextAudioBuffer = null;

    // 5. ステートフラグをリセット（shouldCancelPrefetchはtrueのまま維持）
    this.isSpeakingState = false;
    this.isPausedState = false;
    this.isPrefetching = false;
    // shouldCancelPrefetchはtrueのまま維持して、pending中の再生を完全に阻止

    console.log('[Absolute Stop] All audio stopped, all requests cancelled, all memory released');

    // 確実にリソース解放
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number) {
    this.speedScale = Math.max(0.5, Math.min(2.0, speed));
  }

  /**
   * Set speaker ID
   */
  setSpeaker(speakerId: number) {
    this.speakerId = speakerId;
  }

  /**
   * Set server URL
   */
  setServerUrl(url: string) {
    this.serverUrl = url;
  }

  /**
   * Set whether to use ruby reading
   */
  setUseRubyReading(use: boolean) {
    this.useRubyReading = use;
  }

  /**
   * Set punctuation pause times
   */
  setPunctuationPauses(
    commaPause: number,
    periodPause: number,
    exclamationPause: number = 0.5,
    questionPause: number = 0.5
  ) {
    this.commaPause = commaPause;
    this.periodPause = periodPause;
    this.exclamationPause = exclamationPause;
    this.questionPause = questionPause;
  }

  /**
   * Register callback for speech end event
   */
  onSpeechEnd(callback: () => void) {
    this.onEndCallback = callback;
  }

  /**
   * Register callback for position change event (fired when chunk playback starts)
   */
  onPositionChange(callback: (chunkIndex: number, totalChunks: number) => void) {
    this.onPositionChangeCallback = callback;
  }

  /**
   * Check if speech is currently paused
   */
  isPaused(): boolean {
    return this.isPausedState;
  }

  /**
   * Check if speech is currently speaking
   */
  isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  /**
   * Get current playback position (for sync scroll)
   * サブチャンク単位の進捗を時刻ベースで計算
   */
  getCurrentPlaybackPosition(): {
    chunkIndex: number;
    totalChunks: number;
    chunkText: string;
    subChunkProgress: number; // 0.0-1.0: 現在のチャンク内での進捗率
    chunkLength: number; // 現在のチャンクの文字数
  } {
    let subChunkProgress = 0;

    // 現在のチャンクの再生時刻から進捗率を計算
    if (this.currentChunkStartTime > 0 && this.currentChunkDuration > 0) {
      const elapsedTime = (performance.now() - this.currentChunkStartTime) / 1000; // ミリ秒→秒
      subChunkProgress = Math.min(1.0, elapsedTime / this.currentChunkDuration);
    }

    return {
      chunkIndex: this.currentChunkIndex,
      totalChunks: this.totalChunks,
      chunkText: this.currentChunkText,
      subChunkProgress: subChunkProgress,
      chunkLength: this.currentChunkLength
    };
  }

  /**
   * Cleanup resources
   * すべてのリソースを完全に解放
   * メモリ管理の最終処理
   */
  async dispose() {
    console.log('[Seamless Prefetch] Disposing engine');

    this.hideStatusNotice();
    await this.stop();

    // AudioContextをクローズ
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (error) {
        // Already closed
      }
      this.audioContext = null;
    }

    // すべてのフラグをリセット
    this.isProcessing = false;
    this.isPrefetching = false;
    this.shouldCancelPrefetch = false;

    console.log('[Seamless Prefetch] Engine disposed, all memory released');
  }
}
