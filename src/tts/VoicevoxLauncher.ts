import { Notice, Platform, requestUrl } from 'obsidian';

/**
 * VoicevoxLauncher
 *
 * Launches a local VOICEVOX Engine process from a user-provided install path
 * and waits until its HTTP API is reachable.
 *
 * This is a DESKTOP-ONLY feature: it relies on Node's `child_process`, which is
 * only available inside Obsidian's Electron runtime. On mobile, every method
 * short-circuits and the user is expected to point the plugin at a running
 * server URL instead.
 *
 * Node built-ins are pulled in via `require` (guarded by `Platform.isDesktopApp`)
 * rather than a static `import`, so the mobile bundle never references them.
 * These modules are marked as esbuild externals in `esbuild.config.mjs`.
 */
export class VoicevoxLauncher {
  // Typed loosely (any) because Node's ChildProcess types are only meaningful
  // on desktop and we load `child_process` dynamically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private childProcess: any = null;

  /**
   * Whether launching is even possible in the current runtime.
   */
  static get canLaunch(): boolean {
    return Platform.isDesktopApp;
  }

  /**
   * Launch the VOICEVOX Engine and wait until the server responds.
   *
   * @param enginePath Absolute path to the VOICEVOX executable (run.exe / run).
   * @param serverUrl  The URL the engine is expected to serve (used for the readiness check).
   * @returns true when the server became reachable, false otherwise.
   */
  async launch(enginePath: string, serverUrl: string): Promise<boolean> {
    if (!VoicevoxLauncher.canLaunch) {
      new Notice('VOICEVOXの自動起動はデスクトップ版でのみ利用できます。');
      return false;
    }

    if (!enginePath) {
      new Notice('VOICEVOXの実行ファイルのパスが設定されていません。');
      return false;
    }

    // If it is already up (launched by us or by the user), do nothing.
    if (await this.isServerReachable(serverUrl)) {
      return true;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const childProcess = require('child_process');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');

      const cwd = path.dirname(enginePath);

      // `detached` + unref lets the engine keep running independently; we still
      // keep a handle so we can stop it on plugin unload if we started it.
      this.childProcess = childProcess.spawn(enginePath, [], {
        cwd,
        detached: false,
        stdio: 'ignore',
        windowsHide: true,
      });

      this.childProcess?.on?.('error', (err: Error) => {
        console.error('[VoicevoxLauncher] Failed to spawn engine:', err);
      });
    } catch (error) {
      console.error('[VoicevoxLauncher] spawn error:', error);
      new Notice('VOICEVOXの起動に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
      return false;
    }

    // Poll for readiness (VOICEVOX takes a few seconds to boot).
    return this.waitForServer(serverUrl);
  }

  /**
   * Poll the server until it responds or a timeout is reached.
   */
  private async waitForServer(serverUrl: string, timeoutMs = 30000, intervalMs = 1000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isServerReachable(serverUrl)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  /**
   * A single readiness probe against the VOICEVOX `/version` endpoint.
   */
  private async isServerReachable(serverUrl: string): Promise<boolean> {
    try {
      const response = await requestUrl({ url: `${serverUrl}/version`, method: 'GET' });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Stop the engine process if this launcher started it.
   * Called on plugin unload so we don't leave an orphaned process behind.
   */
  stop(): void {
    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch (error) {
        console.error('[VoicevoxLauncher] Failed to kill engine:', error);
      }
      this.childProcess = null;
    }
  }
}
