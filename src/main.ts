import { Plugin, WorkspaceLeaf } from 'obsidian';
import { VerticalReaderView, VIEW_TYPE_VERTICAL_READER } from './views/VerticalReaderView';
import { TTSEngine } from './tts/TTSEngine';
import { VOICEVOXEngine } from './tts/VOICEVOXEngine';
import { VoicevoxLauncher } from './tts/VoicevoxLauncher';
import { HighlightManager } from './tts/HighlightManager';
import { EditorSync } from './utils/EditorSync';
import { ttsState } from './tts/TTSState';
import { VerticalReaderSettings, DEFAULT_SETTINGS, VerticalReaderSettingTab } from './settings';

/**
 * Obsidian Plugin for vertical reading with TTS support
 */
export default class VerticalReaderPlugin extends Plugin {
  settings!: VerticalReaderSettings;
  ttsEngine: TTSEngine | null = null;
  voicevoxEngine: VOICEVOXEngine | null = null;
  voicevoxLauncher: VoicevoxLauncher = new VoicevoxLauncher();
  highlightManager!: HighlightManager;
  editorSync: EditorSync | null = null;

  /** True when the VOICEVOX engine is the active TTS engine. */
  private get useVoicevox(): boolean {
    return this.settings.ttsEngine === 'voicevox';
  }

  async onload() {
    console.log('Loading Vertical Reader Plugin');

    // Load settings
    await this.loadSettings();

    // Auto-launch VOICEVOX Engine when configured (desktop only)
    if (this.useVoicevox && this.settings.voicevoxAutoLaunch && VoicevoxLauncher.canLaunch) {
      // Fire and forget: don't block plugin load on engine boot.
      this.launchVoicevox().catch(err => console.error('VOICEVOX auto-launch failed:', err));
    }

    // Initialize TTS engines
    try {
      // Initialize VOICEVOX Engine if enabled
      if (this.useVoicevox) {
        this.voicevoxEngine = new VOICEVOXEngine(
          this.settings.voicevoxServerUrl,
          this.settings.voicevoxSpeakerId,
          this.settings.voicevoxSpeedScale,
          this.settings.useRubyForVoicevox,
          this.settings.voicevoxCommaPause,
          this.settings.voicevoxPeriodPause,
          this.settings.voicevoxExclamationPause,
          this.settings.voicevoxQuestionPause
        );

        // Setup VOICEVOX end callback
        this.voicevoxEngine.onSpeechEnd(() => {
          ttsState.stop();
          this.highlightManager.reset();
        });
      }

      // Initialize unified TTS engine
      this.ttsEngine = new TTSEngine(this.useVoicevox, this.voicevoxEngine || undefined);
      this.highlightManager = new HighlightManager();

      // Wait for voices to load and apply settings
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
          this.applyTTSSettings();
        }, { once: true });
      } else {
        this.applyTTSSettings();
      }

      // Setup TTS boundary callback (Note: VOICEVOX doesn't support word boundaries yet)
      this.ttsEngine.onWordBoundary((charIndex, charLength) => {
        this.highlightManager.handleBoundary(charIndex, charLength);
      });

      // Setup TTS end callback
      this.ttsEngine.onSpeechEnd(() => {
        ttsState.stop();
        this.highlightManager.reset();
      });
    } catch (error) {
      console.error('Failed to initialize TTS engine:', error);
    }

    // Add settings tab
    this.addSettingTab(new VerticalReaderSettingTab(this.app, this));

    // Register view type
    this.registerView(
      VIEW_TYPE_VERTICAL_READER,
      (leaf) => new VerticalReaderView(leaf, this.ttsEngine!, this.highlightManager, this.settings)
    );

    // Add ribbon icon
    this.addRibbonIcon('book-open', 'Open Vertical Reader', () => {
      this.activateView();
    });

    // Add command
    this.addCommand({
      id: 'open-vertical-reader',
      name: 'Open Vertical Reader',
      callback: () => {
        this.activateView();
      }
    });

    // Setup editor sync when view is opened
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VERTICAL_READER);

        if (leaves.length > 0 && !this.editorSync) {
          const view = leaves[0].view as VerticalReaderView;
          this.editorSync = new EditorSync(this.app, view);
          this.editorSync.start();
        } else if (leaves.length === 0 && this.editorSync) {
          // View closed, cleanup sync
          this.editorSync.stop();
          this.editorSync = null;
        }
      })
    );
  }

  onunload() {
    console.log('Unloading Vertical Reader Plugin');

    // Stop TTS
    if (this.ttsEngine) {
      this.ttsEngine.stop();
    }

    // Cleanup VOICEVOX Engine
    if (this.voicevoxEngine) {
      this.voicevoxEngine.dispose();
    }

    // Stop the VOICEVOX process if we launched it
    this.voicevoxLauncher.stop();

    // Stop editor sync
    if (this.editorSync) {
      this.editorSync.stop();
    }
  }

  /**
   * Load plugin settings
   */
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

    // Migrate legacy `useVoicevox` boolean to the new `ttsEngine` selector.
    if (data && typeof (data as { useVoicevox?: boolean }).useVoicevox === 'boolean'
        && (!data || (data as { ttsEngine?: string }).ttsEngine === undefined)) {
      this.settings.ttsEngine = (data as { useVoicevox: boolean }).useVoicevox ? 'voicevox' : 'os';
    }
  }

  /**
   * Launch the VOICEVOX Engine from the configured install path (desktop only).
   * @returns true when the engine became reachable.
   */
  async launchVoicevox(): Promise<boolean> {
    return this.voicevoxLauncher.launch(
      this.settings.voicevoxEnginePath,
      this.settings.voicevoxServerUrl
    );
  }

  /**
   * Save plugin settings
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Apply current settings to TTS engine
   */
  private applyTTSSettings() {
    if (!this.ttsEngine) return;

    // Update VOICEVOX usage
    this.ttsEngine.setUseVoicevox(this.useVoicevox);

    // Update VOICEVOX settings if engine exists
    if (this.voicevoxEngine) {
      this.voicevoxEngine.setServerUrl(this.settings.voicevoxServerUrl);
      this.voicevoxEngine.setSpeaker(this.settings.voicevoxSpeakerId);
      this.voicevoxEngine.setSpeed(this.settings.voicevoxSpeedScale);
      this.voicevoxEngine.setUseRubyReading(this.settings.useRubyForVoicevox);
      this.voicevoxEngine.setPunctuationPauses(
        this.settings.voicevoxCommaPause,
        this.settings.voicevoxPeriodPause,
        this.settings.voicevoxExclamationPause,
        this.settings.voicevoxQuestionPause
      );
    }

    // Set Web Speech API voice
    if (this.settings.defaultVoice) {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.name === this.settings.defaultVoice);
      if (selectedVoice) {
        this.ttsEngine.setVoice(selectedVoice);
      }
    }

    // Set default rate in state
    ttsState.setRate(this.settings.defaultRate);
  }

  /**
   * Reinitialize VOICEVOX Engine with current settings
   */
  async reinitializeVoicevox() {
    // Dispose old engine
    if (this.voicevoxEngine) {
      this.voicevoxEngine.dispose();
    }

    // Create new engine
    if (this.useVoicevox) {
      this.voicevoxEngine = new VOICEVOXEngine(
        this.settings.voicevoxServerUrl,
        this.settings.voicevoxSpeakerId,
        this.settings.voicevoxSpeedScale,
        this.settings.useRubyForVoicevox,
        this.settings.voicevoxCommaPause,
        this.settings.voicevoxPeriodPause,
        this.settings.voicevoxExclamationPause,
        this.settings.voicevoxQuestionPause
      );

      // Setup end callback
      this.voicevoxEngine.onSpeechEnd(() => {
        ttsState.stop();
        this.highlightManager.reset();
      });

      // Update TTS engine
      if (this.ttsEngine) {
        this.ttsEngine.setVoicevoxEngine(this.voicevoxEngine);
        this.ttsEngine.setUseVoicevox(true);
      }
    } else {
      this.voicevoxEngine = null;
      if (this.ttsEngine) {
        this.ttsEngine.setVoicevoxEngine(null);
        this.ttsEngine.setUseVoicevox(false);
      }
    }
  }

  /**
   * Re-mount any open vertical reader views so they reflect the current
   * settings (called after switching TTS engine, etc.).
   */
  refreshViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VERTICAL_READER);
    for (const leaf of leaves) {
      const view = leaf.view as VerticalReaderView;
      view.refresh?.();
    }
  }

  /**
   * Activate the vertical reader view
   */
  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_VERTICAL_READER)[0];

    if (!leaf) {
      // Create new leaf in right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_VERTICAL_READER,
          active: true
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
