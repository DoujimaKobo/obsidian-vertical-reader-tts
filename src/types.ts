/**
 * Type definitions for the Vertical Reader plugin
 */

export interface RubySegment {
  type: 'text' | 'ruby';
  content: string;
  annotation?: string;
  markdown?: {
    type: 'heading' | 'list-item' | 'normal';
    level?: number; // For headings (1-6)
  };
}

export interface TTSStateData {
  isPlaying: boolean;
  isPaused: boolean;
  playbackRate: number;
  currentCharIndex: number;
  currentCharLength: number;
}

/**
 * VOICEVOX Speaker information
 */
export interface VOICEVOXSpeaker {
  name: string;
  speaker_uuid: string;
  styles: VOICEVOXStyle[];
  version: string;
}

export interface VOICEVOXStyle {
  name: string;
  id: number;
}

/**
 * VOICEVOX Audio Query
 */
export interface AudioQuery {
  accent_phrases: AccentPhrase[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  outputStereo: boolean;
  kana?: string;
}

export interface AccentPhrase {
  moras: Mora[];
  accent: number;
  pause_mora?: Mora;
  is_interrogative?: boolean;
}

export interface Mora {
  text: string;
  consonant?: string;
  consonant_length?: number;
  vowel: string;
  vowel_length: number;
  pitch: number;
}
