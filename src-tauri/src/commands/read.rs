use crate::error::Result;
use crate::safety::assert_allowed;
use serde::Serialize;
use std::fs;
use std::path::Path;

/// SKILL.md 头部读取上限：frontmatter + 描述足够（tech-design.md 数据模型）
const SKILL_MD_HEAD: usize = 8 * 1024;
/// read_text_files 单文件上限，防 WebView 内存被异常大文件打爆
const MAX_TEXT_FILE: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
pub struct FileReadResult {
    pub path: String,
    pub content: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct DirEntrySnapshot {
    pub dir_path: String,
    /// canonicalize 后的真实路径 —— 软链安装与总仓实体的同一性判定依据
    pub real_path: String,
    /// 该条目本身是否软链（symlink_metadata，不受父目录链接影响）
    pub is_symlink: bool,
    pub dir_name: String,
    pub skill_md_head: Option<String>, // None = 目录无 SKILL.md
    pub size_bytes: u64,
    pub file_count: u64,
}

#[derive(Serialize)]
pub struct StrayFileSnapshot {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

#[derive(Serialize)]
pub struct RootSnapshot {
    pub root: String,
    pub exists: bool,
    pub skills: Vec<DirEntrySnapshot>,
    pub stray_files: Vec<StrayFileSnapshot>,
}

fn read_capped(path: &Path, cap: u64) -> std::io::Result<String> {
    let meta = fs::metadata(path)?;
    if meta.len() > cap {
        use std::io::Read;
        let mut buf = vec![0u8; cap as usize];
        let mut f = fs::File::open(path)?;
        let n = f.read(&mut buf)?;
        buf.truncate(n);
        return Ok(String::from_utf8_lossy(&buf).into_owned());
    }
    fs::read_to_string(path)
}

pub fn dir_stats(dir: &Path) -> (u64, u64) {
    let mut size = 0u64;
    let mut count = 0u64;
    for entry in walkdir::WalkDir::new(dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            count += 1;
            size += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    (size, count)
}

pub fn scan_one_root(root: &Path) -> RootSnapshot {
    let mut snap = RootSnapshot {
        root: root.display().to_string(),
        exists: root.is_dir(),
        skills: Vec::new(),
        stray_files: Vec::new(),
    };
    if !snap.exists {
        return snap;
    }
    let Ok(entries) = fs::read_dir(root) else {
        snap.exists = false;
        return snap;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        // 隐藏项跳过：.system 等 bundled 根由前端作为独立 root 显式传入
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            let skill_md = path.join("SKILL.md");
            let head = skill_md
                .is_file()
                .then(|| read_capped(&skill_md, SKILL_MD_HEAD as u64).ok())
                .flatten();
            let (size_bytes, file_count) = dir_stats(&path);
            let real_path = fs::canonicalize(&path)
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| path.display().to_string());
            let is_symlink = fs::symlink_metadata(&path)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            snap.skills.push(DirEntrySnapshot {
                dir_path: path.display().to_string(),
                real_path,
                is_symlink,
                dir_name: name,
                skill_md_head: head,
                size_bytes,
                file_count,
            });
        } else if path.is_file() {
            snap.stray_files.push(StrayFileSnapshot {
                path: path.display().to_string(),
                name,
                size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
            });
        }
    }
    snap.skills.sort_by(|a, b| a.dir_name.cmp(&b.dir_name));
    snap.stray_files.sort_by(|a, b| a.name.cmp(&b.name));
    snap
}

#[tauri::command]
pub fn read_text_files(paths: Vec<String>) -> Vec<FileReadResult> {
    paths
        .into_iter()
        .map(|p| {
            let path = Path::new(&p);
            if let Err(e) = assert_allowed(path) {
                return FileReadResult { path: p, content: None, error: Some(e.to_string()) };
            }
            match read_capped(path, MAX_TEXT_FILE) {
                Ok(c) => FileReadResult { path: p, content: Some(c), error: None },
                Err(e) => FileReadResult { path: p, content: None, error: Some(e.to_string()) },
            }
        })
        .collect()
}

#[tauri::command]
pub fn scan_skill_dirs(roots: Vec<String>) -> Result<Vec<RootSnapshot>> {
    let mut out = Vec::with_capacity(roots.len());
    for r in roots {
        let path = Path::new(&r);
        assert_allowed(path)?;
        out.push(scan_one_root(path));
    }
    Ok(out)
}

/// 项目发现用：列出目录下的条目名（~/.claude/projects 的编码目录名等）
#[tauri::command]
pub fn list_dir_names(dir: String) -> Result<Vec<String>> {
    let path = Path::new(&dir);
    assert_allowed(path)?;
    if !path.is_dir() {
        return Ok(Vec::new());
    }
    let mut names: Vec<String> = fs::read_dir(path)?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    Ok(names)
}

// ---------- Codex config 解析（toml_edit 与写路径同源，读写一致） ----------

#[derive(Serialize)]
pub struct CodexEntryOut {
    pub raw_path: String,
    pub enabled: Option<bool>,
    pub allow_implicit_invocation: Option<bool>,
}

#[derive(Serialize)]
pub struct CodexConfigOut {
    pub path: String,
    pub raw: String,
    pub hash: String,
    /// None = 解析失败（前端降级只读）
    pub entries: Option<Vec<CodexEntryOut>>,
}

pub fn parse_codex_entries(raw: &str) -> Option<Vec<CodexEntryOut>> {
    let doc: toml_edit::DocumentMut = raw.parse().ok()?;
    let mut out = Vec::new();
    if let Some(arr) = doc
        .get("skills")
        .and_then(|s| s.get("config"))
        .and_then(|c| c.as_array_of_tables())
    {
        for t in arr.iter() {
            let Some(p) = t.get("path").and_then(|v| v.as_str()) else { continue };
            out.push(CodexEntryOut {
                raw_path: p.to_string(),
                enabled: t.get("enabled").and_then(|v| v.as_bool()),
                allow_implicit_invocation: t
                    .get("allow_implicit_invocation")
                    .and_then(|v| v.as_bool()),
            });
        }
    }
    Some(out)
}

#[tauri::command]
pub fn read_codex_config(path: String) -> Result<CodexConfigOut> {
    let p = Path::new(&path);
    assert_allowed(p)?;
    let raw = if p.exists() { fs::read_to_string(p)? } else { String::new() };
    let entries = parse_codex_entries(&raw);
    let hash = crate::commands::write::sha256_hex(&raw);
    Ok(CodexConfigOut { path, raw, hash, entries })
}

// ---------- 项目发现 ----------

/// ~/.claude/projects 目录名解码（"/"→"-" 编码，DFS + 存在性消歧）
pub fn decode_one(encoded: &str, exists: &dyn Fn(&str) -> bool) -> Option<String> {
    let stripped = encoded.strip_prefix('-')?;
    let segments: Vec<&str> = stripped.split('-').collect();
    fn dfs(prefix: &str, segs: &[&str], exists: &dyn Fn(&str) -> bool) -> Option<String> {
        if segs.is_empty() {
            return exists(prefix).then(|| prefix.to_string());
        }
        let as_dir = format!("{prefix}/{}", segs[0]);
        if let Some(hit) = dfs(&as_dir, &segs[1..], exists) {
            return Some(hit);
        }
        if !prefix.is_empty() {
            let merged = format!("{prefix}-{}", segs[0]);
            return dfs(&merged, &segs[1..], exists);
        }
        None
    }
    dfs("", &segments, exists)
}

#[derive(Serialize)]
pub struct DecodedProject {
    pub encoded: String,
    pub decoded: Option<String>,
}

#[tauri::command]
pub fn decode_project_dirs(names: Vec<String>) -> Vec<DecodedProject> {
    let is_dir = |p: &str| Path::new(p).is_dir();
    names
        .into_iter()
        .map(|encoded| DecodedProject {
            decoded: decode_one(&encoded, &is_dir),
            encoded,
        })
        .collect()
}

/// 项目路径存在性批量校验（只读 metadata，不受路径白名单限制）
#[tauri::command]
pub fn dirs_exist(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_dir()).collect()
}

// ---------- 归档清单 ----------

#[derive(Serialize)]
pub struct ArchiveEntryOut {
    pub manifest_path: String,
    pub manifest_raw: String,
    pub archive_dir: String,
    pub present: bool,
}

#[tauri::command]
pub fn list_archive(archive_root: String) -> Result<Vec<ArchiveEntryOut>> {
    let root = Path::new(&archive_root);
    assert_allowed(root)?;
    let mut out = Vec::new();
    if !root.is_dir() {
        return Ok(out);
    }
    for entry in walkdir::WalkDir::new(root).max_depth(4).into_iter().flatten() {
        let p = entry.path();
        if entry.file_type().is_file()
            && p.file_name()
                .map(|n| n.to_string_lossy().ends_with(".manifest.json"))
                .unwrap_or(false)
        {
            let raw = fs::read_to_string(p).unwrap_or_default();
            let dir = p
                .to_string_lossy()
                .trim_end_matches(".manifest.json")
                .to_string();
            out.push(ArchiveEntryOut {
                manifest_path: p.display().to_string(),
                manifest_raw: raw,
                present: Path::new(&dir).is_dir(),
                archive_dir: dir,
            });
        }
    }
    out.sort_by(|a, b| a.manifest_path.cmp(&b.manifest_path));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture_root() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join(".claude/skills");
        fs::create_dir_all(root.join("alpha")).unwrap();
        fs::write(
            root.join("alpha/SKILL.md"),
            "---\nname: alpha\ndescription: A test skill\n---\n# Alpha\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("no-manifest")).unwrap();
        fs::write(root.join("no-manifest/notes.txt"), "x").unwrap();
        fs::write(root.join("rams.md"), "stray").unwrap();
        fs::create_dir_all(root.join(".disabled")).unwrap(); // 隐藏目录应被跳过
        tmp
    }

    #[test]
    fn scans_skills_strays_and_skips_hidden() {
        let tmp = fixture_root();
        let snap = scan_one_root(&tmp.path().join(".claude/skills"));
        assert!(snap.exists);
        assert_eq!(snap.skills.len(), 2);
        let alpha = &snap.skills[0];
        assert_eq!(alpha.dir_name, "alpha");
        assert!(alpha.skill_md_head.as_deref().unwrap().contains("A test skill"));
        assert!(alpha.file_count >= 1);
        assert!(snap.skills[1].skill_md_head.is_none());
        assert_eq!(snap.stray_files.len(), 1);
        assert_eq!(snap.stray_files[0].name, "rams.md");
    }

    #[test]
    fn missing_root_reports_not_exists() {
        let snap = scan_one_root(Path::new("/nonexistent/.claude/skills"));
        assert!(!snap.exists);
        assert!(snap.skills.is_empty());
    }

    #[test]
    fn parses_codex_entries_and_tolerates_corrupt() {
        let raw = "[features]\nskills = true\n\n[[skills.config]]\npath = \"/a/SKILL.md\"\nenabled = false\n\n[[skills.config]]\npath = \"/b\"\nallow_implicit_invocation = false\n";
        let entries = parse_codex_entries(raw).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].raw_path, "/a/SKILL.md");
        assert_eq!(entries[0].enabled, Some(false));
        assert_eq!(entries[1].allow_implicit_invocation, Some(false));
        assert!(parse_codex_entries("oops = [").is_none());
        assert_eq!(parse_codex_entries("").unwrap().len(), 0);
    }

    /// 基准（cargo test bench_scan -- --ignored）：200 技能目录全量扫描 < 1s
    #[test]
    #[ignore]
    fn bench_scan_200_skills_under_1s() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join(".claude/skills");
        for i in 0..200 {
            let d = root.join(format!("skill-{i}"));
            fs::create_dir_all(&d).unwrap();
            fs::write(
                d.join("SKILL.md"),
                format!("---\nname: skill-{i}\ndescription: bench skill {i}\n---\n# body\n"),
            )
            .unwrap();
            fs::write(d.join("extra.txt"), "x".repeat(2048)).unwrap();
        }
        let t0 = std::time::Instant::now();
        let snap = scan_one_root(&root);
        let elapsed = t0.elapsed();
        assert_eq!(snap.skills.len(), 200);
        assert!(elapsed.as_millis() < 1000, "scan took {elapsed:?}");
        eprintln!("scan 200 skills: {elapsed:?}");
    }

    #[test]
    fn decodes_project_dirs_with_hyphen_ambiguity() {
        let known = ["/Users/n/proj", "/Users/n/travel-maps"];
        let exists = |p: &str| known.contains(&p);
        assert_eq!(decode_one("-Users-n-proj", &exists).as_deref(), Some("/Users/n/proj"));
        assert_eq!(
            decode_one("-Users-n-travel-maps", &exists).as_deref(),
            Some("/Users/n/travel-maps")
        );
        assert_eq!(decode_one("-gone-away", &exists), None);
        assert_eq!(decode_one("no-leading-dash", &exists), None);
    }
}
