<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Notice } from 'obsidian';
  import { ttsState } from '../tts/TTSState';
  import type { TTSEngine } from '../tts/TTSEngine';
  import type { VOICEVOXSpeaker } from '../types';

  export let ttsEngine: TTSEngine;
  export let settings: any;
  export let content: string;
  export let getTextFromCursor: () => string;
  export let scrollToReading: () => void;

  let playbackRate = settings?.defaultRate || 1.0;
  let voices: SpeechSynthesisVoice[] = [];
  let selectedVoiceIndex: number = -1;
  let autoScroll = false;
  let timeoutIds: number[] = [];

  // VOICEVOX support
  let voicevoxSpeakers: Array<{id: number, name: string}> = [];
  let selectedVoicevoxSpeakerId: number = settings?.voicevoxSpeakerId || 0;
  let isVoicevoxMode: boolean = settings?.ttsEngine === 'voicevox';

  onMount(async () => {
    // Check if VOICEVOX is enabled
    isVoicevoxMode = settings?.ttsEngine === 'voicevox';

    if (isVoicevoxMode) {
      // Load VOICEVOX speakers
      await loadVoicevoxSpeakers();

      // Sync playback rate with VOICEVOX speed
      const voicevoxEngine = ttsEngine.getVoicevoxEngine();
      if (voicevoxEngine) {
        playbackRate = settings?.voicevoxSpeedScale || 1.0;
        console.log('Initial VOICEVOX speed:', playbackRate);
      }
    } else {
      // Load Web Speech API voices
      loadVoices();

      // Voices might load asynchronously
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  });

  onDestroy(() => {
    // Clear all pending timeouts
    timeoutIds.forEach(id => clearTimeout(id));
    timeoutIds = [];
  });

  async function loadVoicevoxSpeakers() {
    const voicevoxEngine = ttsEngine.getVoicevoxEngine();
    if (!voicevoxEngine) {
      console.warn('VOICEVOX Engine not available');
      return;
    }

    try {
      const speakers: VOICEVOXSpeaker[] = await voicevoxEngine.getSpeakers();
      voicevoxSpeakers = [];

      speakers.forEach(speaker => {
        speaker.styles.forEach(style => {
          voicevoxSpeakers.push({
            id: style.id,
            name: `${speaker.name} - ${style.name}`
          });
        });
      });

      // Set selected speaker from settings
      selectedVoicevoxSpeakerId = settings?.voicevoxSpeakerId || 0;
    } catch (error) {
      console.error('Failed to load VOICEVOX speakers:', error);
      new Notice('VOICEVOX スピーカーの読み込みに失敗しました');
    }
  }

  function loadVoices() {
    voices = ttsEngine.getVoices();

    // Try to use saved voice from settings
    if (settings?.defaultVoice) {
      const savedVoiceIndex = voices.findIndex(v => v.name === settings.defaultVoice);
      if (savedVoiceIndex !== -1) {
        selectedVoiceIndex = savedVoiceIndex;
        ttsEngine.setVoice(voices[savedVoiceIndex]);
        return;
      }
    }

    // Fallback: Try to select a Japanese voice by default
    const jaVoiceIndex = voices.findIndex(v => v.lang.startsWith('ja'));
    if (jaVoiceIndex !== -1) {
      selectedVoiceIndex = jaVoiceIndex;
      ttsEngine.setVoice(voices[jaVoiceIndex]);
    } else if (voices.length > 0) {
      selectedVoiceIndex = 0;
      ttsEngine.setVoice(voices[0]);
    }
  }

  function handlePlay() {
    try {
      // Stop any existing speech first
      ttsEngine.stop();

      // Small delay to ensure clean stop before starting new speech
      const timeoutId = window.setTimeout(() => {
        // Remove this timeout from tracking array
        timeoutIds = timeoutIds.filter(id => id !== timeoutId);

        // Get text from cursor position in vertical reader
        let textToSpeak = getTextFromCursor();

        // If no text from cursor (cursor not in vertical reader), use full content
        if (!textToSpeak || !textToSpeak.trim()) {
          textToSpeak = content;
        }

        if (!textToSpeak || !textToSpeak.trim()) {
          new Notice('読み上げるテキストがありません');
          return;
        }

        ttsEngine.speak(textToSpeak, playbackRate, settings?.defaultLang || 'ja-JP');
        ttsState.play();
      }, 100);
      timeoutIds.push(timeoutId);
    } catch (error) {
      console.error('Failed to start TTS:', error);
      new Notice('音声の再生に失敗しました');
    }
  }

  function handlePause() {
    ttsEngine.pause();
    ttsState.pause();
  }

  function handleResume() {
    ttsEngine.resume();
    ttsState.resume();
  }

  function handleStop() {
    ttsEngine.stop();
    ttsState.stop();
  }

  function handleRateChange(event: Event) {
    const target = event.target as HTMLInputElement;
    playbackRate = parseFloat(target.value);
    ttsEngine.setRate(playbackRate);
    ttsState.setRate(playbackRate);

    // Update VOICEVOX speed as well
    if (isVoicevoxMode) {
      const voicevoxEngine = ttsEngine.getVoicevoxEngine();
      if (voicevoxEngine) {
        voicevoxEngine.setSpeed(playbackRate);
        console.log('VOICEVOX speed updated to:', playbackRate);
      }
    }

    // If currently playing, restart with new rate
    if ($ttsState.isPlaying && !$ttsState.isPaused) {
      // Stop current speech and wait before restarting
      ttsEngine.stop();
      const timeoutId = window.setTimeout(() => {
        timeoutIds = timeoutIds.filter(id => id !== timeoutId);
        handlePlay();
      }, 150);
      timeoutIds.push(timeoutId);
    }
  }

  function handleVoiceChange(event: Event) {
    const target = event.target as HTMLSelectElement;

    if (isVoicevoxMode) {
      // VOICEVOX speaker change
      selectedVoicevoxSpeakerId = parseInt(target.value);
      const voicevoxEngine = ttsEngine.getVoicevoxEngine();
      if (voicevoxEngine) {
        voicevoxEngine.setSpeaker(selectedVoicevoxSpeakerId);
      }
    } else {
      // Web Speech API voice change
      selectedVoiceIndex = parseInt(target.value);
      if (selectedVoiceIndex >= 0 && selectedVoiceIndex < voices.length) {
        ttsEngine.setVoice(voices[selectedVoiceIndex]);
      }
    }

    // If currently playing, restart with new voice/speaker
    if ($ttsState.isPlaying) {
      ttsEngine.stop();
      const timeoutId = window.setTimeout(() => {
        timeoutIds = timeoutIds.filter(id => id !== timeoutId);
        handlePlay();
      }, 150);
      timeoutIds.push(timeoutId);
    }
  }

  function handleAutoScrollChange(event: Event) {
    const target = event.target as HTMLInputElement;
    autoScroll = target.checked;
  }

  function handleJumpToReading() {
    scrollToReading();
  }

  // Watch for reading position changes and auto-scroll if enabled
  $: if (autoScroll && $ttsState.isPlaying && $ttsState.currentCharIndex >= 0) {
    scrollToReading();
  }
</script>

<div class="tts-controls">
  <button
    class="tts-button"
    on:click={handlePlay}
    disabled={$ttsState.isPlaying}
    aria-label="Play"
  >
    ▶ Play
  </button>

  {#if $ttsState.isPlaying}
    {#if $ttsState.isPaused}
      <button class="tts-button" on:click={handleResume} aria-label="Resume">
        ▶ Resume
      </button>
    {:else}
      <button class="tts-button" on:click={handlePause} aria-label="Pause">
        ⏸ Pause
      </button>
    {/if}
    <button class="tts-button" on:click={handleStop} aria-label="Stop">
      ⏹ Stop
    </button>
  {/if}

  <label class="tts-rate-control">
    <span>Speed: {playbackRate.toFixed(1)}x</span>
    <input
      type="range"
      min="0.5"
      max="3.0"
      step="0.1"
      value={playbackRate}
      on:input={handleRateChange}
      aria-label="Playback speed"
    />
  </label>

  {#if isVoicevoxMode}
    {#if voicevoxSpeakers.length > 0}
      <label class="tts-voice-control">
        <span>Voice (VOICEVOX):</span>
        <select
          class="tts-voice-select"
          value={selectedVoicevoxSpeakerId}
          on:change={handleVoiceChange}
          aria-label="VOICEVOX Speaker selection"
        >
          {#each voicevoxSpeakers as speaker}
            <option value={speaker.id}>
              {speaker.name}
            </option>
          {/each}
        </select>
      </label>
    {:else}
      <button class="tts-button" on:click={loadVoicevoxSpeakers}>
        🔄 Load VOICEVOX Speakers
      </button>
    {/if}
  {:else if voices.length > 0}
    <label class="tts-voice-control">
      <span>Voice:</span>
      <select
        class="tts-voice-select"
        value={selectedVoiceIndex}
        on:change={handleVoiceChange}
        aria-label="Voice selection"
      >
        {#each voices as voice, i}
          <option value={i}>
            {voice.name} ({voice.lang})
          </option>
        {/each}
      </select>
    </label>
  {/if}

  <label class="tts-auto-scroll">
    <input
      type="checkbox"
      checked={autoScroll}
      on:change={handleAutoScrollChange}
      aria-label="Auto-scroll"
    />
    <span>自動スクロール</span>
  </label>

  {#if $ttsState.isPlaying}
    <button
      class="tts-button"
      on:click={handleJumpToReading}
      aria-label="Jump to reading position"
    >
      📍 位置へ移動
    </button>
  {/if}
</div>

<style>
  .tts-controls {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid var(--background-modifier-border);
    background-color: var(--background-primary);
    flex-wrap: wrap;
  }

  .tts-button {
    padding: 6px 12px;
    cursor: pointer;
    border: 1px solid var(--background-modifier-border);
    background-color: var(--interactive-normal);
    color: var(--text-normal);
    border-radius: 4px;
    font-size: 14px;
  }

  .tts-button:hover:not(:disabled) {
    background-color: var(--interactive-hover);
  }

  .tts-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tts-rate-control {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
  }

  .tts-rate-control input[type="range"] {
    width: 100px;
  }

  .tts-voice-control {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
  }

  .tts-voice-select {
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    background-color: var(--background-primary);
    color: var(--text-normal);
    border-radius: 4px;
    cursor: pointer;
    max-width: 200px;
  }

  .tts-voice-select:hover {
    background-color: var(--background-secondary);
  }

  .tts-auto-scroll {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 14px;
    cursor: pointer;
    user-select: none;
  }

  .tts-auto-scroll input[type="checkbox"] {
    cursor: pointer;
  }
</style>
