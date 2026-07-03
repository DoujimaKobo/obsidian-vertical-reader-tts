import { App, PluginSettingTab, Setting, Notice, Platform } from 'obsidian';
import type VerticalReaderPlugin from './main';
import type { VOICEVOXSpeaker } from './types';

/**
 * Plugin settings interface
 */
/**
 * TTS engine selection.
 * - 'os'            : OS-native voices via the Web Speech API
 *                     (Windows SAPI voices on desktop, Android TTS on mobile).
 * - 'voicevox'      : VOICEVOX Engine (default port 50021).
 * - 'voicevox_nemo' : VOICEVOX Nemo Engine — same HTTP API, default port 50121.
 */
export type TTSEngineType = 'os' | 'voicevox' | 'voicevox_nemo';

export interface VerticalReaderSettings {
  // Which TTS engine to use. Default is the OS-native engine.
  ttsEngine: TTSEngineType;

  // Web Speech API settings (OS-native engine)
  defaultVoice: string;
  defaultRate: number;
  defaultLang: string;

  // VOICEVOX settings
  voicevoxAutoLaunch: boolean; // Desktop only: launch the engine automatically
  voicevoxEnginePath: string; // Path to the VOICEVOX executable (run.exe / run)
  voicevoxServerUrl: string;
  voicevoxSpeakerId: number;

  // VOICEVOX Nemo settings (same API as VOICEVOX, different port/speakers/exe)
  voicevoxNemoEnginePath: string;
  voicevoxNemoServerUrl: string;
  voicevoxNemoSpeakerId: number;

  // Shared VOICEVOX/Nemo tuning
  voicevoxSpeedScale: number;
  useRubyForVoicevox: boolean;
  voicevoxCommaPause: number; // 読点（、）の休止時間（秒）
  voicevoxPeriodPause: number; // 句点（。）の休止時間（秒）
  voicevoxExclamationPause: number; // 感嘆符（！）の休止時間（秒）
  voicevoxQuestionPause: number; // 疑問符（？）の休止時間（秒）

  // Display settings
  defaultFont: string;
  scrollSensitivity: number;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: VerticalReaderSettings = {
  // Default to the OS-native engine so the plugin works out of the box.
  ttsEngine: 'os',

  // Web Speech API defaults
  defaultVoice: '',
  defaultRate: 1.0,
  defaultLang: 'ja-JP',

  // VOICEVOX defaults
  voicevoxAutoLaunch: false,
  voicevoxEnginePath: '',
  voicevoxServerUrl: 'http://127.0.0.1:50021',
  voicevoxSpeakerId: 0,

  // VOICEVOX Nemo defaults (default port 50121)
  voicevoxNemoEnginePath: '',
  voicevoxNemoServerUrl: 'http://127.0.0.1:50121',
  voicevoxNemoSpeakerId: 0,

  voicevoxSpeedScale: 1.0,
  useRubyForVoicevox: true,
  voicevoxCommaPause: 0.3, // 読点の休止時間（秒）
  voicevoxPeriodPause: 0.5, // 句点の休止時間（秒）
  voicevoxExclamationPause: 0.5, // 感嘆符の休止時間（秒）
  voicevoxQuestionPause: 0.5, // 疑問符の休止時間（秒）

  // Display defaults
  defaultFont: 'serif',
  scrollSensitivity: 2.0
};

/**
 * Settings tab for configuring the plugin
 */
export class VerticalReaderSettingTab extends PluginSettingTab {
  plugin: VerticalReaderPlugin;

  constructor(app: App, plugin: VerticalReaderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Vertical Reader TTS Settings' });

    // ===== Engine selection =====
    containerEl.createEl('h3', { text: '読み上げエンジン' });

    new Setting(containerEl)
      .setName('TTSエンジン')
      .setDesc('OS標準（Windows / Android のデフォルト音声）、VOICEVOX、または VOICEVOX Nemo を選択します。')
      .addDropdown(dropdown => dropdown
        .addOption('os', 'OS標準（Windows / Android）')
        .addOption('voicevox', 'VOICEVOX')
        .addOption('voicevox_nemo', 'VOICEVOX Nemo')
        .setValue(this.plugin.settings.ttsEngine)
        .onChange(async (value) => {
          this.plugin.settings.ttsEngine = value as TTSEngineType;
          await this.plugin.saveSettings();

          // Reinitialize VOICEVOX Engine to match the new selection
          await this.plugin.reinitializeVoicevox();

          // Re-mount open reader views so the switch takes effect immediately
          this.plugin.refreshViews();

          // Refresh display to show/hide VOICEVOX settings
          this.display();
        }));

    if (this.plugin.settings.ttsEngine !== 'os') {
      // VOICEVOX and VOICEVOX Nemo share this settings block; only the URL,
      // executable path, and speaker are stored per-engine.
      const isNemo = this.plugin.settings.ttsEngine === 'voicevox_nemo';
      const engineLabel = isNemo ? 'VOICEVOX Nemo' : 'VOICEVOX';
      const defaultUrl = isNemo ? 'http://127.0.0.1:50121' : 'http://127.0.0.1:50021';
      const s = this.plugin.settings;
      const getUrl = () => isNemo ? s.voicevoxNemoServerUrl : s.voicevoxServerUrl;
      const setUrl = (v: string) => { if (isNemo) s.voicevoxNemoServerUrl = v; else s.voicevoxServerUrl = v; };
      const getPath = () => isNemo ? s.voicevoxNemoEnginePath : s.voicevoxEnginePath;
      const setPath = (v: string) => { if (isNemo) s.voicevoxNemoEnginePath = v; else s.voicevoxEnginePath = v; };
      const getSpeaker = () => isNemo ? s.voicevoxNemoSpeakerId : s.voicevoxSpeakerId;
      const setSpeaker = (v: number) => { if (isNemo) s.voicevoxNemoSpeakerId = v; else s.voicevoxSpeakerId = v; };

      containerEl.createEl('h3', { text: `${engineLabel} 設定` });

      // Auto-launch toggle (desktop only)
      if (Platform.isDesktopApp) {
        new Setting(containerEl)
          .setName(`${engineLabel}を自動起動する`)
          .setDesc(`下で指定したインストール場所から${engineLabel} Engineを自動的に起動します（デスクトップ版のみ）。`)
          .addToggle(toggle => toggle
            .setValue(this.plugin.settings.voicevoxAutoLaunch)
            .onChange(async (value) => {
              this.plugin.settings.voicevoxAutoLaunch = value;
              await this.plugin.saveSettings();
              this.display();
            }));

        if (this.plugin.settings.voicevoxAutoLaunch) {
          // Engine install path
          new Setting(containerEl)
            .setName(`${engineLabel}の実行ファイルのパス`)
            .setDesc(`${engineLabel}の実行ファイル（Windowsは run.exe、macOS/Linuxは run）へのフルパスを指定します。`)
            .addText(text => text
              .setPlaceholder(isNemo
                ? 'C:\\Program Files\\VOICEVOX Nemo\\vv-engine\\run.exe'
                : 'C:\\Program Files\\VOICEVOX\\vv-engine\\run.exe')
              .setValue(getPath())
              .onChange(async (value) => {
                setPath(value.trim());
                await this.plugin.saveSettings();
              }));

          // Launch button
          new Setting(containerEl)
            .setName('今すぐ起動')
            .setDesc(`指定したパスから${engineLabel} Engineを起動し、接続できるまで待機します。`)
            .addButton(button => button
              .setButtonText('起動')
              .onClick(async () => {
                button.setDisabled(true);
                button.setButtonText('起動中...');
                try {
                  const ok = await this.plugin.launchVoicevox();
                  new Notice(ok
                    ? `${engineLabel} Engineを起動しました。`
                    : `${engineLabel} Engineの起動に失敗しました。パスを確認してください。`);
                } catch (error) {
                  new Notice('起動エラー: ' + (error instanceof Error ? error.message : String(error)));
                  console.error(error);
                } finally {
                  button.setDisabled(false);
                  button.setButtonText('起動');
                }
              }));
        }
      } else {
        containerEl.createEl('p', {
          text: `モバイル版では自動起動は使えません。別途${engineLabel} Engineを起動し、下のサーバーURLを指定してください。`,
          cls: 'setting-item-description'
        });
      }

      // Server URL
      new Setting(containerEl)
        .setName(`${engineLabel}サーバーURL`)
        .setDesc(`${engineLabel} EngineサーバーのURL（既定: ${defaultUrl}）`)
        .addText(text => text
          .setPlaceholder(defaultUrl)
          .setValue(getUrl())
          .onChange(async (value) => {
            setUrl(value || defaultUrl);
            await this.plugin.saveSettings();

            // Reinitialize VOICEVOX Engine with new URL
            if (this.plugin.voicevoxEngine) {
              this.plugin.voicevoxEngine.setServerUrl(getUrl());
            }
          }));

      // Test connection button
      new Setting(containerEl)
        .setName('接続テスト')
        .setDesc('VOICEVOX Engineが起動していて接続できるか確認します')
        .addButton(button => button
          .setButtonText('テスト')
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('テスト中...');
            try {
              // Ensure VOICEVOX engine is initialized
              if (!this.plugin.voicevoxEngine) {
                await this.plugin.reinitializeVoicevox();
              }

              if (this.plugin.voicevoxEngine) {
                const isConnected = await this.plugin.voicevoxEngine.checkConnection();
                if (isConnected) {
                  new Notice('VOICEVOX Engine connection successful!');
                } else {
                  new Notice('Failed to connect to VOICEVOX Engine. Please make sure it is running.');
                }
              } else {
                new Notice('VOICEVOX Engineの初期化に失敗しました');
              }
            } catch (error) {
              new Notice('Error testing connection. Check console for details.');
              console.error(error);
            } finally {
              button.setDisabled(false);
              button.setButtonText('テスト');
            }
          }));

      // Speaker selection
      const speakerSetting = new Setting(containerEl)
        .setName('話者')
        .setDesc(`${engineLabel}の話者を選択します（「話者を読み込む」でサーバーから取得）`);

      speakerSetting.addButton(button => button
        .setButtonText('話者を読み込む')
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText('読み込み中...');
          try {
            // Ensure VOICEVOX engine is initialized
            if (!this.plugin.voicevoxEngine) {
              await this.plugin.reinitializeVoicevox();
            }

            if (this.plugin.voicevoxEngine) {
              const speakers = await this.plugin.voicevoxEngine.getSpeakers();
              this.displaySpeakerDropdown(speakerSetting, speakers, setSpeaker, getSpeaker());
              new Notice(`${speakers.length}件の話者を読み込みました`);
            } else {
              new Notice('VOICEVOX Engineの初期化に失敗しました');
            }
          } catch (error) {
            new Notice('Failed to load speakers. Make sure VOICEVOX Engine is running.');
            console.error(error);
          } finally {
            button.setDisabled(false);
            button.setButtonText('話者を読み込む');
          }
        }));

      speakerSetting.addText(text => text
        .setPlaceholder('話者ID')
        .setValue(String(getSpeaker()))
        .onChange(async (value) => {
          const id = parseInt(value);
          if (!isNaN(id)) {
            setSpeaker(id);
            await this.plugin.saveSettings();
            if (this.plugin.voicevoxEngine) {
              this.plugin.voicevoxEngine.setSpeaker(id);
            }
          }
        }));

      // Speed scale
      new Setting(containerEl)
        .setName('再生速度')
        .setDesc('VOICEVOXの読み上げ速度を調整します（0.5〜2.0）')
        .addSlider(slider => slider
          .setLimits(0.5, 2.0, 0.1)
          .setValue(this.plugin.settings.voicevoxSpeedScale)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.voicevoxSpeedScale = value;
            await this.plugin.saveSettings();
            if (this.plugin.voicevoxEngine) {
              this.plugin.voicevoxEngine.setSpeed(value);
            }
          }));

      // Ruby reading option
      new Setting(containerEl)
        .setName('ルビ（読み）を優先')
        .setDesc('有効にすると、VOICEVOXが漢字ではなくルビ（ふりがな）を読み上げます。正確な読みのために推奨。')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.useRubyForVoicevox)
          .onChange(async (value) => {
            this.plugin.settings.useRubyForVoicevox = value;
            await this.plugin.saveSettings();
            if (this.plugin.voicevoxEngine) {
              this.plugin.voicevoxEngine.setUseRubyReading(value);
            }
          }));

      // Comma pause
      new Setting(containerEl)
        .setName('読点（、）の休止時間')
        .setDesc('読点の後の休止時間を秒単位で設定（0.0 - 2.0秒）')
        .addSlider(slider => slider
          .setLimits(0.0, 2.0, 0.1)
          .setValue(this.plugin.settings.voicevoxCommaPause)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.voicevoxCommaPause = value;
            await this.plugin.saveSettings();
          }));

      // Period pause
      new Setting(containerEl)
        .setName('句点（。）の休止時間')
        .setDesc('句点の後の休止時間を秒単位で設定（0.0 - 2.0秒）')
        .addSlider(slider => slider
          .setLimits(0.0, 2.0, 0.1)
          .setValue(this.plugin.settings.voicevoxPeriodPause)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.voicevoxPeriodPause = value;
            await this.plugin.saveSettings();
          }));

      // Exclamation pause
      new Setting(containerEl)
        .setName('感嘆符（！）の休止時間')
        .setDesc('感嘆符の後の休止時間を秒単位で設定（0.0 - 2.0秒）')
        .addSlider(slider => slider
          .setLimits(0.0, 2.0, 0.1)
          .setValue(this.plugin.settings.voicevoxExclamationPause)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.voicevoxExclamationPause = value;
            await this.plugin.saveSettings();
          }));

      // Question pause
      new Setting(containerEl)
        .setName('疑問符（？）の休止時間')
        .setDesc('疑問符の後の休止時間を秒単位で設定（0.0 - 2.0秒）')
        .addSlider(slider => slider
          .setLimits(0.0, 2.0, 0.1)
          .setValue(this.plugin.settings.voicevoxQuestionPause)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.voicevoxQuestionPause = value;
            await this.plugin.saveSettings();
          }));

      containerEl.createEl('p', {
        text: '※ VOICEVOX Engineは別途起動が必要です。voicevox.hiroshiba.jp からダウンロードできます。',
        cls: 'setting-item-description'
      });
    }

    // ===== Display Settings =====
    containerEl.createEl('h3', { text: '表示設定' });

    // Font selection
    new Setting(containerEl)
      .setName('デフォルトフォント')
      .setDesc('縦書きビューで使用するフォント')
      .addDropdown(dropdown => {
        dropdown
          .addOption('serif', '明朝体 (Serif)')
          .addOption('sans-serif', 'ゴシック体 (Sans-serif)')
          .addOption('monospace', '等幅 (Monospace)')
          .addOption('var(--font-text)', 'Obsidianテキストフォント')
          .addOption('var(--font-ui)', 'Obsidian UIフォント')
          .setValue(this.plugin.settings.defaultFont)
          .onChange(async (value) => {
            this.plugin.settings.defaultFont = value;
            await this.plugin.saveSettings();
          });
      });

    // Scroll sensitivity
    new Setting(containerEl)
      .setName('スクロール速度')
      .setDesc('マウスホイールでのスクロール速度（0.5 - 5.0）')
      .addSlider(slider => slider
        .setLimits(0.5, 5.0, 0.5)
        .setValue(this.plugin.settings.scrollSensitivity)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.scrollSensitivity = value;
          await this.plugin.saveSettings();
        }));

    // ===== OS-native (Web Speech API) Settings =====
    containerEl.createEl('h3', { text: 'OS標準の読み上げ（Web Speech API）' });

    // Voice selection
    new Setting(containerEl)
      .setName('デフォルト音声')
      .setDesc('読み上げに使うデフォルトの音声を選択します')
      .addDropdown(dropdown => {
        // Add empty option
        dropdown.addOption('', 'システム標準');

        // Get available voices
        const voices = window.speechSynthesis.getVoices();

        // Add Japanese voices first
        voices
          .filter(voice => voice.lang.startsWith('ja'))
          .forEach(voice => {
            dropdown.addOption(voice.name, `${voice.name} (${voice.lang})`);
          });

        // Add separator
        if (voices.some(v => v.lang.startsWith('ja')) && voices.some(v => !v.lang.startsWith('ja'))) {
          dropdown.addOption('---', '---');
        }

        // Add other voices
        voices
          .filter(voice => !voice.lang.startsWith('ja'))
          .forEach(voice => {
            dropdown.addOption(voice.name, `${voice.name} (${voice.lang})`);
          });

        dropdown
          .setValue(this.plugin.settings.defaultVoice)
          .onChange(async (value) => {
            if (value === '---') {
              dropdown.setValue(this.plugin.settings.defaultVoice);
              return;
            }
            this.plugin.settings.defaultVoice = value;
            await this.plugin.saveSettings();

            // Update TTS engine voice
            if (this.plugin.ttsEngine) {
              const voices = window.speechSynthesis.getVoices();
              const selectedVoice = voices.find(v => v.name === value) || null;
              this.plugin.ttsEngine.setVoice(selectedVoice);
            }
          });
      });

    // Playback rate
    new Setting(containerEl)
      .setName('デフォルト再生速度')
      .setDesc('読み上げの初期速度を設定します（0.5〜3.0）')
      .addSlider(slider => slider
        .setLimits(0.5, 3.0, 0.1)
        .setValue(this.plugin.settings.defaultRate)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.defaultRate = value;
          await this.plugin.saveSettings();
        }));

    // Language
    new Setting(containerEl)
      .setName('デフォルト言語')
      .setDesc('読み上げの言語を設定します')
      .addDropdown(dropdown => dropdown
        .addOption('ja-JP', '日本語')
        .addOption('en-US', '英語（米国）')
        .addOption('en-GB', '英語（英国）')
        .addOption('zh-CN', '中国語（簡体）')
        .addOption('zh-TW', '中国語（繁体）')
        .addOption('ko-KR', '韓国語')
        .setValue(this.plugin.settings.defaultLang)
        .onChange(async (value) => {
          this.plugin.settings.defaultLang = value;
          await this.plugin.saveSettings();
        }));

    // Info section
    containerEl.createEl('h3', { text: 'このプラグインについて' });
    containerEl.createEl('p', {
      text: '縦書きの読書ビュー、ルビ表示、そして読み上げ（OS標準 / VOICEVOX / VOICEVOX Nemo）機能を提供します。'
    });
  }

  /**
   * Refresh voice list (call this when voices are loaded)
   */
  refreshVoices(): void {
    this.display();
  }

  /**
   * Display speaker dropdown dynamically
   */
  private displaySpeakerDropdown(
    setting: Setting,
    speakers: VOICEVOXSpeaker[],
    setSpeaker: (id: number) => void,
    currentSpeakerId: number
  ) {
    // Remove existing dropdown if any
    setting.controlEl.querySelectorAll('select').forEach(el => el.remove());

    setting.addDropdown(dropdown => {
      speakers.forEach(speaker => {
        speaker.styles.forEach(style => {
          dropdown.addOption(
            String(style.id),
            `${speaker.name} - ${style.name}`
          );
        });
      });

      dropdown
        .setValue(String(currentSpeakerId))
        .onChange(async (value) => {
          const id = parseInt(value);
          if (!isNaN(id)) {
            setSpeaker(id);
            await this.plugin.saveSettings();
            if (this.plugin.voicevoxEngine) {
              this.plugin.voicevoxEngine.setSpeaker(id);
            }
          }
        });
    });

    // Remove the text input after adding dropdown
    setting.controlEl.querySelectorAll('input[type="text"]').forEach(el => el.remove());
  }
}
