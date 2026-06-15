import { check } from '@tauri-apps/plugin-updater';

export interface UpdateInfo {
  version: string;
  body: string | null;
}

/** Returns update info if a newer version is available, null otherwise. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update?.available) return null;
    return { version: update.version, body: update.body ?? null };
  } catch {
    return null;
  }
}

/** Downloads and installs the pending update, then requests a relaunch. */
export async function downloadAndInstall(
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  const update = await check();
  if (!update?.available) return;

  await update.downloadAndInstall((event) => {
    if (event.event === 'Progress') {
      onProgress(event.data.chunkLength, null);
    }
  });
}
