import { MarkdownCleaner } from '../parsers/MarkdownCleaner';
import { VOICEVOXEngine } from './VOICEVOXEngine';

/**
 * Unified TTS Engine that supports both Web Speech API and VOICEVOX
 * Handles text-to-speech playback with word boundary events
 */
export class TTSEngine {
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;
  private onBoundaryCallback?: (charIndex: number, charLength: number) => void;
  private onEndCallback?: () => void;
  private currentText: string = '';
  private selectedVoice: SpeechSynthesisVoice | null = null;

  // VOICEVOX support
  private voicevoxEngine: VOICEVOXEngine | null = null;
  private useVoicevox: boolean = false;
  private isProcessing: boolean = false; // 排他制御フラグ

  constructor(useVoicevox: boolean = false, voicevoxEngine?: VOICEVOXEngine) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('SpeechSynthesis API is not available');
    }
    this.synth = window.speechSynthesis;
    this.useVoicevox = useVoicevox;
    this.voicevoxEngine = voicevoxEngine || null;
  }

  /**
   * Speak the given text with specified playback rate
   * 排他制御により多重再生を完全に防止
   */
  async speak(text: string, rate: number = 1.0, lang: string = 'ja-JP') {
    // 排他制御: 既に処理中の場合は即座にリターン
    if (this.isProcessing) {
      console.warn('TTS: Already processing, ignoring new request');
      return;
    }

    try {
      // 処理開始フラグを立てる
      this.isProcessing = true;

      // 既存の音声を完全に停止
      await this.stop();

      // Use VOICEVOX if enabled and available
      if (this.useVoicevox && this.voicevoxEngine) {
        try {
          await this.voicevoxEngine.speak(text);
          return;
        } catch (error) {
          console.error('VOICEVOX speech failed:', error);
          // Don't fall back to Web Speech API when VOICEVOX is explicitly enabled
          // User wants VOICEVOX only mode
          throw error;
        }
      }

      // Use Web Speech API only if VOICEVOX is not enabled
      // Clean markdown syntax
      const cleanText = MarkdownCleaner.clean(text);
      this.currentText = cleanText;

      if (!cleanText.trim()) {
        return;
      }

      this.utterance = new SpeechSynthesisUtterance(cleanText);
      this.utterance.rate = rate;
      this.utterance.lang = lang;

      // Set selected voice if available
      if (this.selectedVoice) {
        this.utterance.voice = this.selectedVoice;
      }

      // Listen for word boundaries
      this.utterance.addEventListener('boundary', (event) => {
        if (event.name === 'word' && this.onBoundaryCallback) {
          this.onBoundaryCallback(event.charIndex, event.charLength || 0);
        }
      });

      // Listen for speech end
      this.utterance.addEventListener('end', () => {
        if (this.onEndCallback) {
          this.onEndCallback();
        }
      });

      // Listen for errors
      this.utterance.addEventListener('error', (event) => {
        console.error('Speech synthesis error:', event.error);
      });

      this.synth.speak(this.utterance);

    } finally {
      // 処理完了フラグを下ろす（Web Speech APIは非同期なのですぐに下ろす）
      this.isProcessing = false;
    }
  }

  /**
   * Pause speech playback
   */
  pause() {
    if (this.useVoicevox && this.voicevoxEngine) {
      this.voicevoxEngine.pause();
    } else if (this.synth.speaking) {
      this.synth.pause();
    }
  }

  /**
   * Resume speech playback
   */
  resume() {
    if (this.useVoicevox && this.voicevoxEngine) {
      this.voicevoxEngine.resume();
    } else if (this.synth.paused) {
      this.synth.resume();
    }
  }

  /**
   * Stop speech playback and cancel current utterance
   * すべてのリソースを解放
   */
  async stop() {
    // VOICEVOX停止
    if (this.useVoicevox && this.voicevoxEngine) {
      await this.voicevoxEngine.stop();
    }

    // Web Speech API停止
    this.synth.cancel();
    this.utterance = null;

    // 短い待機時間を入れて確実に停止されるようにする
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Set playback rate (0.5 - 3.0)
   */
  setRate(rate: number) {
    if (this.utterance) {
      this.utterance.rate = Math.max(0.5, Math.min(3.0, rate));
    }
  }

  /**
   * Register callback for word boundary events
   */
  onWordBoundary(callback: (charIndex: number, charLength: number) => void) {
    this.onBoundaryCallback = callback;
  }

  /**
   * Register callback for speech end event
   */
  onSpeechEnd(callback: () => void) {
    this.onEndCallback = callback;
  }

  /**
   * Check if speech is currently paused
   */
  isPaused(): boolean {
    if (this.useVoicevox && this.voicevoxEngine) {
      return this.voicevoxEngine.isPaused();
    }
    return this.synth.paused;
  }

  /**
   * Check if speech is currently speaking
   */
  isSpeaking(): boolean {
    if (this.useVoicevox && this.voicevoxEngine) {
      return this.voicevoxEngine.isSpeaking();
    }
    return this.synth.speaking;
  }

  /**
   * Set whether to use VOICEVOX engine
   */
  setUseVoicevox(use: boolean) {
    this.useVoicevox = use;
  }

  /**
   * Set VOICEVOX engine instance
   */
  setVoicevoxEngine(engine: VOICEVOXEngine | null) {
    this.voicevoxEngine = engine;
  }

  /**
   * Get VOICEVOX engine instance
   */
  getVoicevoxEngine(): VOICEVOXEngine | null {
    return this.voicevoxEngine;
  }

  /**
   * Get available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synth.getVoices();
  }

  /**
   * Set the voice to use for speech
   */
  setVoice(voice: SpeechSynthesisVoice | null) {
    this.selectedVoice = voice;
  }

  /**
   * Get current cleaned text
   */
  getCurrentText(): string {
    return this.currentText;
  }
}
