import { writable } from 'svelte/store';
import type { TTSStateData } from '../types';

/**
 * Create a Svelte store for TTS state management
 */
function createTTSState() {
  const { subscribe, set, update } = writable<TTSStateData>({
    isPlaying: false,
    isPaused: false,
    playbackRate: 1.0,
    currentCharIndex: -1,
    currentCharLength: 0
  });

  return {
    subscribe,
    play: () => update(s => ({ ...s, isPlaying: true, isPaused: false })),
    pause: () => update(s => ({ ...s, isPaused: true })),
    resume: () => update(s => ({ ...s, isPaused: false })),
    stop: () => set({
      isPlaying: false,
      isPaused: false,
      playbackRate: 1.0,
      currentCharIndex: -1,
      currentCharLength: 0
    }),
    setRate: (rate: number) => update(s => ({ ...s, playbackRate: rate })),
    updatePosition: (charIndex: number, charLength: number) =>
      update(s => ({ ...s, currentCharIndex: charIndex, currentCharLength: charLength }))
  };
}

export const ttsState = createTTSState();
