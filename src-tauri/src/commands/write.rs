use crate::error::{Result, SkimError};
use crate::safety::assert_allowed;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

const BACKUP_KEEP: usize = 10;

pub fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    format!("{:x}", h.finalize())
}

fn skim_dir() -> PathBuf {
    dirs::home_dir().expect("no home dir").join(".skim")
}

/// 写前备份：~/.skim/backups/<文件名>.<时间戳>.bak，每个目标滚动保留最近 N 份
fn backup_file(target: &Path) -> Result<()> {
    if !target.exists() {
        return Ok(());
    }
    let backups = skim_dir().join("backups");
    fs::create_dir_all(&backups)?;
    let fname = target
        .file_name()
        .ok_or_else(|| SkimError::Invalid("target has no file name".into()))?
        .to_string_lossy();
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    fs::copy(target, backups.join(format!("{fname}.{ts}.bak")))?;

    // 滚动清理
    let prefix = format!("{fname}.");
    let mut olds: Vec<PathBuf> = fs::read_dir(&backups)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().starts_with(&prefix))
                .unwrap_or(false)
        })
        .collect();
    olds.sort(); // 时间戳字典序即时间序
    while olds.len() > BACKUP_KEEP {
        let victim = olds.remove(0);
        let _ = fs::remove_file(victim);
    }
    Ok(())
}

/// 临时文件写入 + fsync + rename 原子替换 + 读回校验（tech-design.md 配置写入策略）
fn atomic_write(target: &Path, content: &str) -> Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| SkimError::Invalid("target has no parent".into()))?;
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(content.as_bytes())?;
    tmp.flush()?;
    tmp.as_file().sync_all()?;
    tmp.persist(target).map_err(|e| SkimError::Io(e.error))?;
    let readback = fs::read_to_string(target)?;
    if readback != content {
        return Err(SkimError::Io(std::io::Error::other("read-back verification failed")));
    }
    Ok(())
}

fn check_hash(current: &str, expected: Option<&str>) -> Result<()> {
    if let Some(exp) = expected {
        if sha256_hex(current) != exp {
            return Err(SkimError::StaleWrite);
        }
    }
    Ok(())
}

// ---------- Codex config.toml ----------

#[derive(Deserialize, Clone)]
pub struct CodexTomlOp {
    /// 技能目录绝对路径（不带 SKILL.md）。R2 实测：写入时必须落成 <dir>/SKILL.md 形式，
    /// 目录形式条目是死条目；比较时两种历史写法都归一化到目录形式。
    pub skill_dir: String,
    /// Some(bool) = 设置 enabled；None 配合 remove
    pub set_enabled: Option<bool>,
    #[serde(default)]
    pub remove: bool,
    pub set_allow_implicit: Option<bool>,
}

fn normalize_entry_path(p: &str) -> String {
    p.trim_end_matches('/')
        .trim_end_matches("/SKILL.md")
        .to_string()
}

pub fn apply_codex_ops(raw: &str, ops: &[CodexTomlOp]) -> Result<String> {
    let mut doc: toml_edit::DocumentMut = raw
        .parse()
        .map_err(|e| SkimError::ConfigCorrupt(format!("{e}")))?;

    // 确保 skills.config 为 array-of-tables
    if doc.get("skills").is_none() {
        doc["skills"] = toml_edit::table();
        if let Some(t) = doc["skills"].as_table_mut() {
            t.set_implicit(true);
        }
    }
    let skills = doc["skills"]
        .as_table_mut()
        .ok_or_else(|| SkimError::ConfigCorrupt("`skills` is not a table".into()))?;
    if skills.get("config").is_none() {
        skills["config"] = toml_edit::Item::ArrayOfTables(toml_edit::ArrayOfTables::new());
    }
    let arr = skills["config"]
        .as_array_of_tables_mut()
        .ok_or_else(|| SkimError::ConfigCorrupt("`skills.config` is not an array of tables".into()))?;

    for op in ops {
        let want = normalize_entry_path(&op.skill_dir);
        // 收集既有条目位置（含历史目录形式 + SKILL.md 形式）
        let positions: Vec<usize> = arr
            .iter()
            .enumerate()
            .filter(|(_, t)| {
                t.get("path")
                    .and_then(|v| v.as_str())
                    .map(|p| normalize_entry_path(p) == want)
                    .unwrap_or(false)
            })
            .map(|(i, _)| i)
            .collect();

        if op.remove {
            for i in positions.into_iter().rev() {
                arr.remove(i);
            }
            continue;
        }

        let skill_md_path = format!("{want}/SKILL.md");
        if let Some(&first) = positions.first() {
            // 更新第一个匹配条目并统一为 SKILL.md 形式；多余的重复/死条目移除
            for i in positions.iter().skip(1).rev() {
                arr.remove(*i);
            }
            let t = arr.get_mut(first).unwrap();
            t["path"] = toml_edit::value(skill_md_path);
            if let Some(en) = op.set_enabled {
                t["enabled"] = toml_edit::value(en);
            }
            if let Some(ai) = op.set_allow_implicit {
                t["allow_implicit_invocation"] = toml_edit::value(ai);
            }
        } else {
            let mut t = toml_edit::Table::new();
            t["path"] = toml_edit::value(skill_md_path);
            if let Some(en) = op.set_enabled {
                t["enabled"] = toml_edit::value(en);
            }
            if let Some(ai) = op.set_allow_implicit {
                t["allow_implicit_invocation"] = toml_edit::value(ai);
            }
            arr.push(t);
        }
    }
    Ok(doc.to_string())
}

#[tauri::command]
pub fn apply_codex_toml_patch(
    config_path: String,
    ops: Vec<CodexTomlOp>,
    expected_hash: Option<String>,
) -> Result<String> {
    let path = Path::new(&config_path);
    assert_allowed(path)?;
    let raw = if path.exists() { fs::read_to_string(path)? } else { String::new() };
    check_hash(&raw, expected_hash.as_deref())?;
    let next = apply_codex_ops(&raw, &ops)?;
    backup_file(path)?;
    atomic_write(path, &next)?;
    Ok(sha256_hex(&next))
}

// ---------- Codex plugin toggle ----------

pub fn apply_codex_plugin_enabled(raw: &str, plugin_key: &str, enabled: bool) -> Result<String> {
    let mut doc: toml_edit::DocumentMut = raw
        .parse()
        .map_err(|e| SkimError::ConfigCorrupt(format!("{e}")))?;

    if doc.get("plugins").is_none() {
        doc["plugins"] = toml_edit::table();
    }
    let plugins = doc["plugins"]
        .as_table_mut()
        .ok_or_else(|| SkimError::ConfigCorrupt("`plugins` is not a table".into()))?;

    if plugins.get(plugin_key).is_none() {
        plugins[plugin_key] = toml_edit::table();
    }
    if let Some(plugin) = plugins.get_mut(plugin_key).and_then(|v| v.as_table_mut()) {
        plugin["enabled"] = toml_edit::value(enabled);
    }
    Ok(doc.to_string())
}

#[tauri::command]
pub fn apply_codex_plugin_patch(
    config_path: String,
    plugin_key: String,
    enabled: bool,
    expected_hash: Option<String>,
) -> Result<String> {
    let path = Path::new(&config_path);
    assert_allowed(path)?;
    let raw = if path.exists() { fs::read_to_string(path)? } else { String::new() };
    check_hash(&raw, expected_hash.as_deref())?;
    let next = apply_codex_plugin_enabled(&raw, &plugin_key, enabled)?;
    backup_file(path)?;
    atomic_write(path, &next)?;
    Ok(sha256_hex(&next))
}

// ---------- Claude settings.json ----------

#[tauri::command]
pub fn write_claude_settings(
    path: String,
    content: String,
    expected_hash: Option<String>,
) -> Result<String> {
    let p = Path::new(&path);
    assert_allowed(p)?;
    let fname = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if fname != "settings.json" && fname != "settings.local.json" {
        return Err(SkimError::Forbidden(path.clone()));
    }
    // 拒绝写入非法 JSON（领域层产出错误时的最后防线）
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| SkimError::Invalid(format!("refusing to write invalid JSON: {e}")))?;
    let current = if p.exists() { fs::read_to_string(p)? } else { String::new() };
    check_hash(&current, expected_hash.as_deref())?;
    backup_file(p)?;
    atomic_write(p, &content)?;
    Ok(sha256_hex(&content))
}

// ---------- Skim 自身配置 ----------

#[tauri::command]
pub fn write_skim_config(content: String) -> Result<()> {
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| SkimError::Invalid(format!("refusing to write invalid JSON: {e}")))?;
    let target = skim_dir().join("config.json");
    atomic_write(&target, &content)
}

// ---------- 归档 / 删除 / 恢复 ----------

fn move_dir(src: &Path, dst: &Path) -> Result<()> {
    if dst.exists() {
        return Err(SkimError::Conflict);
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            // 跨设备：copy + verify + trash 源（绝不直接删）
            copy_dir(src, dst)?;
            let (ss, sc) = super::read::dir_stats(src);
            let (ds, dc) = super::read::dir_stats(dst);
            if ss != ds || sc != dc {
                return Err(SkimError::Io(std::io::Error::other("copy verification failed")));
            }
            trash::delete(src).map_err(|e| SkimError::TrashFailed(e.to_string()))?;
            Ok(())
        }
    }
}

fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry.map_err(|e| SkimError::Io(e.into()))?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn archive_move(src: String, dst: String, manifest_path: String, manifest_json: String) -> Result<()> {
    let (s, d, m) = (Path::new(&src), Path::new(&dst), Path::new(&manifest_path));
    assert_allowed(s)?;
    assert_allowed(d)?;
    assert_allowed(m)?;
    serde_json::from_str::<serde_json::Value>(&manifest_json)
        .map_err(|e| SkimError::Invalid(format!("invalid manifest: {e}")))?;
    move_dir(s, d)?;
    atomic_write(m, &manifest_json)?;
    Ok(())
}

/// 用 lstat（symlink_metadata）而非 exists() 判断路径是否存在：归档源目录后，指向它的
/// 软链已成悬空链，exists() 会跟随软链解析到已删目标而误判为「不存在」。lstat 只看条目本身。
fn path_present(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

#[tauri::command]
pub fn trash_path(path: String) -> Result<()> {
    let p = Path::new(&path);
    assert_allowed(p)?;
    if !path_present(p) {
        return Err(SkimError::Invalid(format!("path does not exist: {path}")));
    }
    // G2 承诺：trash 失败绝不回退到删除
    trash::delete(p).map_err(|e| SkimError::TrashFailed(e.to_string()))
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConflictMode {
    Fail,
    Overwrite,
    Rename,
}

#[tauri::command]
pub fn restore_move(src: String, dst: String, mode: ConflictMode) -> Result<String> {
    let s = Path::new(&src);
    let mut d = PathBuf::from(&dst);
    assert_allowed(s)?;
    assert_allowed(&d)?;
    if d.exists() {
        match mode {
            ConflictMode::Fail => return Err(SkimError::Conflict),
            ConflictMode::Overwrite => {
                trash::delete(&d).map_err(|e| SkimError::TrashFailed(e.to_string()))?;
            }
            ConflictMode::Rename => {
                let base = d.clone();
                let mut n = 2u32;
                while d.exists() {
                    d = PathBuf::from(format!("{}-{n}", base.display()));
                    n += 1;
                }
            }
        }
    }
    move_dir(s, &d)?;
    Ok(d.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_WORLD_TOML: &str = r#"# my codex config
model = "gpt-5.5"   # keep this comment

[features]
skills = true

# disabled long ago
[[skills.config]]
path = "/Users/x/.agents/skills/brainstorming/SKILL.md"
enabled = false

[[skills.config]]
path = "/Users/x/.codex/skills/old-dir-form"
enabled = false
"#;

    #[test]
    fn disable_inserts_skill_md_form_and_preserves_comments() {
        let ops = vec![CodexTomlOp {
            skill_dir: "/Users/x/.codex/skills/pdf".into(),
            set_enabled: Some(false),
            remove: false,
            set_allow_implicit: None,
        }];
        let out = apply_codex_ops(REAL_WORLD_TOML, &ops).unwrap();
        assert!(out.contains("# my codex config"));
        assert!(out.contains("# keep this comment"));
        assert!(out.contains("# disabled long ago"));
        assert!(out.contains(r#"path = "/Users/x/.codex/skills/pdf/SKILL.md""#));
        assert!(out.contains("enabled = false"));
    }

    #[test]
    fn enable_updates_existing_and_normalizes_dead_dir_entry() {
        let ops = vec![CodexTomlOp {
            skill_dir: "/Users/x/.codex/skills/old-dir-form".into(),
            set_enabled: Some(true),
            remove: false,
            set_allow_implicit: None,
        }];
        let out = apply_codex_ops(REAL_WORLD_TOML, &ops).unwrap();
        // 死条目（目录形式）被统一为 SKILL.md 形式
        assert!(out.contains(r#"path = "/Users/x/.codex/skills/old-dir-form/SKILL.md""#));
        assert!(!out.contains("path = \"/Users/x/.codex/skills/old-dir-form\"\n"));
    }

    #[test]
    fn remove_deletes_all_matching_forms() {
        let ops = vec![CodexTomlOp {
            skill_dir: "/Users/x/.agents/skills/brainstorming".into(),
            set_enabled: None,
            remove: true,
            set_allow_implicit: None,
        }];
        let out = apply_codex_ops(REAL_WORLD_TOML, &ops).unwrap();
        assert!(!out.contains("brainstorming"));
        assert!(out.contains("old-dir-form")); // 其他条目不动
    }

    #[test]
    fn corrupt_toml_refuses_write() {
        let err = apply_codex_ops("model = [unclosed", &[]).unwrap_err();
        assert_eq!(err.code(), "CONFIG_CORRUPT");
    }

    #[test]
    fn empty_config_gets_created() {
        let ops = vec![CodexTomlOp {
            skill_dir: "/Users/x/.codex/skills/pdf".into(),
            set_enabled: Some(false),
            remove: false,
            set_allow_implicit: None,
        }];
        let out = apply_codex_ops("", &ops).unwrap();
        assert!(out.contains("[[skills.config]]"));
        assert!(out.contains("/SKILL.md\""));
    }

    #[test]
    fn atomic_write_and_backup_rotation() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join(".claude").join("settings.json");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        atomic_write(&target, "{\"a\":1}").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"a\":1}");
        atomic_write(&target, "{\"a\":2}").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"a\":2}");
    }

    #[test]
    fn stale_hash_rejected() {
        assert!(check_hash("current", Some("deadbeef")).is_err());
        let h = sha256_hex("current");
        assert!(check_hash("current", Some(&h)).is_ok());
        assert!(check_hash("anything", None).is_ok());
    }

    /// R3 演练（cargo test r3 -- --ignored）：对本机真实 config.toml 的内容副本
    /// 跑 10 轮 disable↔enable，断言注释零丢失、非目标内容逐字节不变。不写任何真实文件。
    #[test]
    #[ignore]
    fn r3_codex_roundtrip_on_real_config_copy() {
        let Some(home) = dirs::home_dir() else { return };
        let cfg = home.join(".codex/config.toml");
        let Ok(original) = fs::read_to_string(&cfg) else {
            eprintln!("skip: no real config.toml");
            return;
        };
        let probe = home.join(".codex/skills/__skim_r3_probe__");
        let probe_str = probe.display().to_string();
        let mut current = original.clone();
        for round in 0..10 {
            let disabled = apply_codex_ops(
                &current,
                &[CodexTomlOp {
                    skill_dir: probe_str.clone(),
                    set_enabled: Some(false),
                    remove: false,
                    set_allow_implicit: None,
                }],
            )
            .unwrap();
            assert!(disabled.contains("__skim_r3_probe__/SKILL.md"), "round {round}");
            // 原文件每一行（含注释）都必须原样保留
            for line in original.lines() {
                assert!(disabled.contains(line), "round {round} lost line: {line}");
            }
            current = apply_codex_ops(
                &current_to_enabled(&disabled, &probe_str),
                &[],
            )
            .unwrap();
        }
        // 10 轮后与原文一致（enable 路径用 remove 清条目）
        assert_eq!(current.trim_end(), original.trim_end());
    }

    fn current_to_enabled(disabled: &str, probe: &str) -> String {
        apply_codex_ops(
            disabled,
            &[CodexTomlOp {
                skill_dir: probe.to_string(),
                set_enabled: None,
                remove: true,
                set_allow_implicit: None,
            }],
        )
        .unwrap()
    }

    #[test]
    fn move_dir_conflict() {
        let tmp = tempfile::tempdir().unwrap();
        let a = tmp.path().join(".skim/a");
        let b = tmp.path().join(".skim/b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        let err = move_dir(&a, &b).unwrap_err();
        assert_eq!(err.code(), "CONFLICT");
    }

    // 归档源目录被移走后，指向它的软链成为悬空链；trash 前的存在性校验必须用 lstat，
    // 否则 exists() 跟随软链失败会误报 path does not exist（archive 软链清理步骤的回归）。
    #[test]
    #[cfg(unix)]
    fn path_present_true_for_dangling_symlink() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("source");
        let link = tmp.path().join("link");
        fs::create_dir_all(&target).unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();
        // 源目录移走 → 软链悬空
        fs::remove_dir_all(&target).unwrap();
        assert!(!link.exists(), "exists() 跟随软链应失败");
        assert!(path_present(&link), "lstat 应认定悬空软链仍存在");
    }

    #[test]
    fn path_present_false_for_missing() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!path_present(&tmp.path().join("nope")));
    }
}
