import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/** GitHub release tag page — where the full changelog lives. */
const RELEASE_TAG_BASE = 'https://github.com/maoxiaoke/skim/releases/tag';

export interface UpdateInfo {
  version: string;
  body: string | null;
  notesUrl: string;
}

/** Returns update info if a newer version is available, null otherwise. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update?.available) return null;
    return {
      version: update.version,
      body: update.body ?? null,
      notesUrl: `${RELEASE_TAG_BASE}/v${update.version}`,
    };
  } catch {
    return null;
  }
}

/** Downloads and installs the pending update, then requests a relaunch.
 *  Errors are re-thrown with a phase tag so the UI can show what actually failed
 *  (download/verify vs. install vs. relaunch) instead of swallowing them silently. */
export async function downloadAndInstall(
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let update;
  try {
    update = await check();
  } catch (e) {
    throw new Error(`check failed: ${errMsg(e)}`);
  }
  if (!update?.available) return;

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === 'Progress') {
        onProgress(event.data.chunkLength, null);
      }
    });
  } catch (e) {
    throw new Error(`download/install failed: ${errMsg(e)}`);
  }

  try {
    await relaunch();
  } catch (e) {
    // 安装已成功，仅重启失败：提示用户手动重启，而非把整次更新判定为失败。
    throw new Error(`installed, but relaunch failed — quit and reopen Skim manually: ${errMsg(e)}`);
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return JSON.stringify(e);
}
