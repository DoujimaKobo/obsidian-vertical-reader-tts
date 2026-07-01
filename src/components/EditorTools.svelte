<script lang="ts">
  import { MarkdownView, Notice, TFile } from 'obsidian';
  import type { App } from 'obsidian';
  import { TextFormatter } from '../utils/TextFormatter';

  export let app: App;
  export let onContentChange: (newContent: string) => void;

  /**
   * Get the currently edited file
   * Works for both MarkdownView and VerticalReaderView
   */
  function getCurrentFile(): TFile | null {
    // Try to get from active MarkdownView
    const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
    if (markdownView && markdownView.file) {
      return markdownView.file;
    }

    // Fallback: Try to get from any MarkdownView leaf
    let foundFile: TFile | null = null;
    app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        foundFile = leaf.view.file;
        return true; // Stop iteration
      }
    });

    return foundFile;
  }

  async function applyIndentation() {
    const targetFile = getCurrentFile();
    if (!targetFile) {
      new Notice('❌ 編集対象のファイルが見つかりません');
      return;
    }

    // 現在のファイル内容を取得（最新の状態を確実に取得）
    const currentContent = await app.vault.read(targetFile);
    const formatted = TextFormatter.addSentenceIndentation(currentContent);

    // デバッグ: 変更前後の文字数を確認
    console.log('Before indentation:', currentContent.length, 'chars');
    console.log('After indentation:', formatted.length, 'chars');

    await updateContent(targetFile, formatted, '文頭字下げ');
  }

  async function applyPunctuationSpacing() {
    const targetFile = getCurrentFile();
    if (!targetFile) {
      new Notice('❌ 編集対象のファイルが見つかりません');
      return;
    }

    const currentContent = await app.vault.read(targetFile);
    const formatted = TextFormatter.addPunctuationSpacing(currentContent);

    console.log('Before punctuation spacing:', currentContent.length, 'chars');
    console.log('After punctuation spacing:', formatted.length, 'chars');

    await updateContent(targetFile, formatted, '記号後スペース');
  }

  async function applyAllFormatting() {
    const targetFile = getCurrentFile();
    if (!targetFile) {
      new Notice('❌ 編集対象のファイルが見つかりません');
      return;
    }

    const currentContent = await app.vault.read(targetFile);
    const formatted = TextFormatter.formatAll(currentContent);

    console.log('Before all formatting:', currentContent.length, 'chars');
    console.log('After all formatting:', formatted.length, 'chars');

    await updateContent(targetFile, formatted, 'すべての修正');
  }

  async function updateContent(targetFile: TFile, newContent: string, operationName: string = '修正') {
    const statusNotice = new Notice(`⏳ ${operationName}を保存中...`, 0);

    try {
      // ステップ1: ファイルに書き込み（確実にawait）
      console.log(`Saving file: ${targetFile.path}`);
      await app.vault.modify(targetFile, newContent);
      console.log('File saved successfully');

      // ステップ2: 短い待機（ファイルシステムの同期を確実にする）
      await new Promise(resolve => setTimeout(resolve, 100));

      // ステップ3: ファイルから再読み込みして検証
      const savedContent = await app.vault.read(targetFile);
      if (savedContent !== newContent) {
        console.error('Content mismatch after save!');
        console.error('Expected length:', newContent.length);
        console.error('Actual length:', savedContent.length);
        throw new Error('ファイルの保存内容が一致しません');
      }
      console.log('Content verification passed');

      // ステップ4: すべてのエディタビューを更新
      let updatedViewCount = 0;
      app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView) {
          const view = leaf.view as MarkdownView;
          if (view.file && view.file.path === targetFile.path) {
            // カーソル位置を保存
            const cursor = view.editor.getCursor();

            // エディタ内容を更新
            view.editor.setValue(newContent);

            // カーソル位置を復元
            try {
              view.editor.setCursor(cursor);
            } catch (e) {
              // カーソル位置が無効な場合は無視
            }

            updatedViewCount++;
            console.log(`Updated view ${updatedViewCount} for file ${targetFile.path}`);
          }
        }
      });

      // ステップ5: 親コンポーネントに通知
      onContentChange(newContent);

      // ステップ6: 成功通知
      statusNotice.hide();
      new Notice(`✅ ${operationName}を保存しました（${updatedViewCount}個のエディタに反映）`, 3000);
      console.log(`Operation complete: ${operationName}`);

    } catch (error) {
      console.error('Failed to save file:', error);
      statusNotice.hide();
      new Notice(`❌ ファイルの保存に失敗しました: ${error.message}`, 5000);
    }
  }
</script>

<div class="editor-tools">
  <div class="tool-section">
    <h3 class="section-title">一括修正</h3>
    <div class="tool-buttons">
      <button
        class="tool-button"
        on:click={applyIndentation}
        title="カギ括弧以外の文頭に全角スペースを追加"
      >
        📝 文頭字下げ
      </button>

      <button
        class="tool-button"
        on:click={applyPunctuationSpacing}
        title="？や！のあとに全角スペースを追加"
      >
        ❗ 記号後スペース
      </button>

      <button
        class="tool-button primary"
        on:click={applyAllFormatting}
        title="すべての修正を一括適用"
      >
        ✨ すべて適用
      </button>
    </div>
  </div>
</div>

<style>
  .editor-tools {
    padding: 8px 10px;
    background-color: var(--background-primary);
    border-top: 1px solid var(--background-modifier-border);
  }

  .tool-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tool-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tool-button {
    padding: 6px 12px;
    font-size: 13px;
    border: 1px solid var(--background-modifier-border);
    background-color: var(--interactive-normal);
    color: var(--text-normal);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .tool-button:hover {
    background-color: var(--interactive-hover);
    border-color: var(--interactive-accent);
  }

  .tool-button:active {
    transform: scale(0.98);
  }

  .tool-button.primary {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
    font-weight: 600;
  }

  .tool-button.primary:hover {
    opacity: 0.9;
  }
</style>
