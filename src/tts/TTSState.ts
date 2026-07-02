import { writable } from 'svelte/store';
import type { TTSStateData } from '../types';

/**
 * Create a Svelte store for TTS state management
 */
function createTTSState() {
  const { subscribe, update } = writable<TTSStateData>({
    isPlaying: false,
    isPaused: false,
    playbackRate: 1.0,
    currentCharIndex: -1,
    currentCharLength: 0,
    autoScroll: false
  });

  return {
    subscribe,
    play: () => update(s => ({ ...s, isPlaying: true, isPaused: false })),
    pause: () => update(s => ({ ...s, isPaused: true })),
    resume: () => update(s => ({ ...s, isPaused: false })),
    // Reset playback state but PRESERVE user preferences (rate, autoScroll) —
    // stopping should not silently flip the user's toggles back to defaults.
    stop: () => update(s => ({
      ...s,
      isPlaying: false,
      isPaused: false,
      currentCharIndex: -1,
      currentCharLength: 0
    })),
    setRate: (rate: number) => update(s => ({ ...s, playbackRate: rate })),
    setAutoScroll: (on: boolean) => update(s => ({ ...s, autoScroll: on })),
    updatePosition: (charIndex: number, charLength: number) =>
      update(s => ({ ...s, currentCharIndex: charIndex, currentCharLength: charLength }))
  };
}

export const ttsState = createTTSState();
