// Tauri invoke 的类型化封装 — 与 src-tauri/src/commands/* 的 Serialize 输出一一对应
import { invoke } from '@tauri-apps/api/core';
import type { RootSnapshot } from '../domain/types';

export interface FileReadResult {
  path: string;
  content: string | null;
  error: string | null;
}

export interface CodexPluginEntryOut {
  plugin_key: string;
  enabled: boolean | null;
  version: string | null;
  install_path: string | null;
}

export interface CodexConfigOut {
  path: string;
  raw: string;
  hash: string;
  entries:
    | { raw_path: string; enabled: boolean | null; allow_implicit_invocation: boolean | null }[]
    | null;
  plugins: CodexPluginEntryOut[];
}

export interface InstalledPluginOut {
  key: string;
  version: string;
  install_path: string;
  scope: string;
  project_path: string | null;
}

export interface DecodedProject {
  encoded: string;
  decoded: string | null;
}

export interface ArchiveEntryOut {
  manifest_path: string;
  manifest_raw: string;
  archive_dir: string;
  present: boolean;
}

export interface SkimIpcError {
  code: string;
  message: string;
}

export const ipc = {
  readTextFiles: (paths: string[]) => invoke<FileReadResult[]>('read_text_files', { paths }),
  scanSkillDirs: (roots: string[]) => invoke<RootSnapshot[]>('scan_skill_dirs', { roots }),
  listDirNames: (dir: string) => invoke<string[]>('list_dir_names', { dir }),
  readCodexConfig: (path: string) => invoke<CodexConfigOut>('read_codex_config', { path }),
  decodeProjectDirs: (names: string[]) => invoke<DecodedProject[]>('decode_project_dirs', { names }),
  dirsExist: (paths: string[]) => invoke<boolean[]>('dirs_exist', { paths }),
  listArchive: (archiveRoot: string) => invoke<ArchiveEntryOut[]>('list_archive', { archiveRoot }),

  readClaudeInstalledPlugins: (home: string) =>
    invoke<InstalledPluginOut[]>('read_claude_installed_plugins', { home }),

  applyCodexPluginPatch: (
    configPath: string,
    pluginKey: string,
    enabled: boolean,
    expectedHash: string | null,
  ) => invoke<string>('apply_codex_plugin_patch', { configPath, pluginKey, enabled, expectedHash }),

  applyCodexTomlPatch: (
    configPath: string,
    ops: {
      skill_dir: string;
      set_enabled?: boolean;
      remove?: boolean;
      set_allow_implicit?: boolean;
    }[],
    expectedHash: string | null,
  ) => invoke<string>('apply_codex_toml_patch', { configPath, ops, expectedHash }),
  writeClaudeSettings: (path: string, content: string, expectedHash: string | null) =>
    invoke<string>('write_claude_settings', { path, content, expectedHash }),
  writeSkimConfig: (content: string) => invoke<void>('write_skim_config', { content }),
  archiveMove: (src: string, dst: string, manifestPath: string, manifestJson: string) =>
    invoke<void>('archive_move', { src, dst, manifestPath, manifestJson }),
  trashPath: (path: string) => invoke<void>('trash_path', { path }),
  restoreMove: (src: string, dst: string, mode: 'fail' | 'overwrite' | 'rename') =>
    invoke<string>('restore_move', { src, dst, mode }),
};

export async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ipcErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const err = e as SkimIpcError;
    return err.code ? `${err.code}: ${err.message}` : String(err.message);
  }
  return String(e);
}
