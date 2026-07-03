<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Notice } from 'obsidian';
  import { ttsState } from '../tts/TTSState';
  import type { TTSEngine } from '../tts/TTSEngine';
  import type { VOICEVOXSpeaker } from '../types';

  export let ttsEngine: TTSEngine;
  export let settings: any;
  export let plugin: any;
  export let content: string;
  export let getTextFromCursor: () => string;
  export let scrollToReading: () => void;

  let currentEngine: 'os' | 'voicevox' | 'voicevox_nemo' = settings?.ttsEngine ?? 'os';

  async function handleEngineChange() {
    // Stop any playback before switching, then hand off to the plugin, which
    // re-mounts this view (so the component reloads with the new engine).
    ttsEngine.stop();
    ttsState.stop();
    if (plugin?.switchEngine) {
      await plugin.switchEngine(currentEngine);
    }
  }

  let playbackRate = settings?.defaultRate || 1.0;
  let voices: SpeechSynthesisVoice[] = [];
  let selectedVoiceIndex: number = -1;
  let timeoutIds: number[] = [];

  // Guard against rapid Play presses: true from the moment a start is
  // requested until speak() has actually been kicked off.
  let isStarting = false;

  // VOICEVOX support (covers both VOICEVOX and VOICEVOX Nemo)
  const isNemo = settings?.ttsEngine === 'voicevox_nemo';
  let voicevoxSpeakers: Array<{id: number, name: string}> = [];
  let selectedVoicevoxSpeakerId: number =
    (isNemo ? settings?.voicevoxNemoSpeakerId : settings?.voicevoxSpeakerId) || 0;
  let isVoicevoxMode: boolean = settings?.ttsEngine !== 'os';

  onMount(async () => {
    // Check if a VOICEVOX-family engine is enabled
    isVoicevoxMode = settings?.ttsEngine !== 'os';

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

      // Set selected speaker from settings (per active engine)
      selectedVoicevoxSpeakerId =
        (isNemo ? settings?.voicevoxNemoSpeakerId : settings?.voicevoxSpeakerId) || 0;
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
    // Rapid-press guard: while a start is pending (the 100ms window below),
    // additional presses are ignored. Combined with the Play button being
    // disabled as soon as isPlaying flips, N rapid clicks collapse to exactly
    // one playback. Without this, each click scheduled its own stop+speak and
    // the racing stop() calls cancelled ALL of them (silence, UI stuck).
    if (isStarting) return;
    isStarting = true;

    try {
      // Stop any existing speech first
      ttsEngine.stop();

      // Flip UI to playing immediately so the Play button disables now,
      // not 100ms from now.
      ttsState.play();

      // Small delay to ensure clean stop before starting new speech
      const timeoutId = window.setTimeout(() => {
        // Remove this timeout from tracking array
        timeoutIds = timeoutIds.filter(id => id !== timeoutId);
        isStarting = false;

        // Get text from cursor position in vertical reader
        let textToSpeak = getTextFromCursor();

        // If no text from cursor (cursor not in vertical reader), use full content
        if (!textToSpeak || !textToSpeak.trim()) {
          textToSpeak = content;
        }

        if (!textToSpeak || !textToSpeak.trim()) {
          new Notice('読み上げるテキストがありません');
          ttsState.stop();
          return;
        }

        ttsEngine.speak(textToSpeak, playbackRate, settings?.defaultLang || 'ja-JP');
      }, 100);
      timeoutIds.push(timeoutId);
    } catch (error) {
      console.error('Failed to start TTS:', error);
      new Notice('音声の再生に失敗しました');
      isStarting = false;
      ttsState.stop();
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

  // Fired continuously while dragging the slider: update the value/label and
  // the engine rate, but do NOT restart playback (restarting on every tick is
  // what made speed changes feel chaotic).
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
      }
    }
  }

  // Fired once when the slider is released: apply the new rate to the current
  // playback with a single restart (Web Speech / VOICEVOX can't change rate of
  // an in-flight utterance, so a restart is unavoidable — but only one).
  function handleRateCommit() {
    // handlePlay() stops cleanly before restarting, so one call is enough.
    if ($ttsState.isPlaying && !$ttsState.isPaused) {
      handlePlay();
    }
  }

  function handleVoiceChange() {
    // selectedVoiceIndex / selectedVoicevoxSpeakerId are kept in sync via
    // bind:value, so we just apply them here.
    if (isVoicevoxMode) {
      const voicevoxEngine = ttsEngine.getVoicevoxEngine();
      if (voicevoxEngine) {
        voicevoxEngine.setSpeaker(selectedVoicevoxSpeakerId);
      }
    } else if (selectedVoiceIndex >= 0 && selectedVoiceIndex < voices.length) {
      ttsEngine.setVoice(voices[selectedVoiceIndex]);
    }

    // If currently playing, restart once with the new voice/speaker.
    // handlePlay() already stops cleanly first, so no extra stop here.
    if ($ttsState.isPlaying) {
      handlePlay();
    }
  }

  function handleAutoScrollChange(event: Event) {
    const target = event.target as HTMLInputElement;
    // Store-backed so VerticalReader's scroll logic sees the same value.
    ttsState.setAutoScroll(target.checked);
  }

  function handleJumpToReading() {
    scrollToReading();
  }

  // NOTE: auto-scroll itself is handled centrally in VerticalReader.svelte
  // (gated on $ttsState.autoScroll / isPaused) — no duplicate scroll here.
</script>

<div class="tts-controls">
  <!-- Engine selector: switch OS / VOICEVOX without opening settings -->
  <div class="tts-row">
    <span class="tts-label">エンジン</span>
    <select
      class="tts-select"
      bind:value={currentEngine}
      on:change={handleEngineChange}
      aria-label="TTS engine"
    >
      <option value="os">OS標準（Windows / Android）</option>
      <option value="voicevox">VOICEVOX</option>
      <option value="voicevox_nemo">VOICEVOX Nemo</option>
    </select>
  </div>

  <!-- Transport row. ALL buttons are always rendered and merely enabled/
       disabled by state, so their on-screen positions never change. This makes
       rapid clicks land on the same physical button every time (the pressed
       button just disables), instead of a different control sliding under the
       cursor after the layout changes. -->
  <div class="tts-row tts-transport">
    <button
      class="tts-button mod-cta"
      on:click={handlePlay}
      disabled={$ttsState.isPlaying}
      aria-label="Play"
    >
      ▶ 再生
    </button>
    {#if $ttsState.isPaused}
      <button class="tts-button" on:click={handleResume} disabled={!$ttsState.isPlaying} aria-label="Resume">
        ▶ 再開
      </button>
    {:else}
      <button class="tts-button" on:click={handlePause} disabled={!$ttsState.isPlaying} aria-label="Pause">
        ⏸ 一時停止
      </button>
    {/if}
    <button class="tts-button" on:click={handleStop} disabled={!$ttsState.isPlaying} aria-label="Stop">
      ⏹ 停止
    </button>
    <button class="tts-button" on:click={handleJumpToReading} disabled={!$ttsState.isPlaying} aria-label="Jump to reading position">
      📍 位置
    </button>
  </div>

  <!-- Speed row -->
  <div class="tts-row">
    <span class="tts-label">速度</span>
    <input
      class="tts-slider"
      type="range"
      min="0.5"
      max="3.0"
      step="0.1"
      value={playbackRate}
      on:input={handleRateChange}
      on:change={handleRateCommit}
      aria-label="Playback speed"
    />
    <span class="tts-value">{playbackRate.toFixed(1)}x</span>
  </div>

  <!-- Voice row: alone on its line, so its width never shoves other controls -->
  <div class="tts-row">
    <span class="tts-label">音声</span>
    {#if isVoicevoxMode}
      {#if voicevoxSpeakers.length > 0}
        <select
          class="tts-select"
          bind:value={selectedVoicevoxSpeakerId}
          on:change={handleVoiceChange}
          aria-label="VOICEVOX Speaker selection"
        >
          {#each voicevoxSpeakers as speaker}
            <option value={speaker.id}>{speaker.name}</option>
          {/each}
        </select>
      {:else}
        <button class="tts-button" on:click={loadVoicevoxSpeakers}>🔄 話者を読み込む</button>
      {/if}
    {:else if voices.length > 0}
      <select
        class="tts-select"
        bind:value={selectedVoiceIndex}
        on:change={handleVoiceChange}
        aria-label="Voice selection"
      >
        {#each voices as voice, i}
          <option value={i}>{voice.name} ({voice.lang})</option>
        {/each}
      </select>
    {:else}
      <span class="tts-value">利用可能な音声がありません</span>
    {/if}
  </div>

  <!-- Options row -->
  <div class="tts-row">
    <label class="tts-auto-scroll">
      <input
        type="checkbox"
        checked={$ttsState.autoScroll}
        on:change={handleAutoScrollChange}
        aria-label="Auto-scroll"
      />
      <span>自動スクロール</span>
    </label>
  </div>
</div>

<style>
  .tts-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    background-color: var(--background-secondary);
  }

  .tts-row {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 30px;
  }

  .tts-transport {
    gap: 6px;
    /* Keep controls left-aligned so the 再生 button stays at a fixed spot
       whether stopped or playing. Prevents rapid clicks from landing on a
       different button after the layout changes. */
    justify-content: flex-start;
  }

  /* Reserve a stable width for the Play button so siblings appearing to its
     right never shift it. */
  .tts-transport .tts-button {
    flex: 0 0 auto;
  }

  .tts-label {
    flex: 0 0 2.5em;
    font-size: 12px;
    color: var(--text-muted);
  }

  .tts-value {
    font-size: 12px;
    color: var(--text-muted);
    min-width: 2.5em;
  }

  .tts-button {
    padding: 5px 12px;
    cursor: pointer;
    border: 1px solid var(--background-modifier-border);
    background-color: var(--interactive-normal);
    color: var(--text-normal);
    border-radius: 6px;
    font-size: 13px;
    white-space: nowrap;
  }

  .tts-button:hover:not(:disabled) {
    background-color: var(--interactive-hover);
  }

  .tts-button.mod-cta {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .tts-button.mod-cta:hover:not(:disabled) {
    background-color: var(--interactive-accent-hover);
  }

  .tts-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Disabled Play should not keep the bright accent look */
  .tts-button.mod-cta:disabled {
    background-color: var(--interactive-normal);
    color: var(--text-muted);
    border-color: var(--background-modifier-border);
  }

  .tts-slider {
    flex: 1 1 auto;
    min-width: 80px;
  }

  .tts-select {
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    background-color: var(--background-primary);
    color: var(--text-normal);
    border-radius: 6px;
    cursor: pointer;
  }

  .tts-select:hover {
    background-color: var(--background-modifier-hover);
  }

  /* Keep the native dropdown list readable in dark themes */
  .tts-select option {
    background-color: var(--background-primary);
    color: var(--text-normal);
  }

  .tts-auto-scroll {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }

  .tts-auto-scroll input[type="checkbox"] {
    cursor: pointer;
  }
</style>
