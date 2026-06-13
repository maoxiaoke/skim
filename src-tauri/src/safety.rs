use crate::error::{Result, SkimError};
use std::path::{Component, Path};

const ALLOWED_SEGMENTS: [&str; 4] = [".claude", ".codex", ".agents", ".skim"];

/// 所有 command 入参路径必须包含 .claude/.codex/.agents/.skim 之一作为路径组件。
/// 自定义 command 不受 Tauri capabilities 约束，这里是等价的自有防线：
/// 即使 WebView 被注入，也无法将破坏性操作指向这些目录之外。
pub fn assert_allowed(path: &Path) -> Result<()> {
    let ok = path.components().any(|c| match c {
        Component::Normal(seg) => ALLOWED_SEGMENTS.iter().any(|a| seg == *a),
        _ => false,
    });
    if ok {
        Ok(())
    } else {
        Err(SkimError::Forbidden(path.display().to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn allows_agent_dirs() {
        for p in [
            "/Users/x/.claude/skills/foo",
            "/Users/x/.codex/config.toml",
            "/Users/x/proj/.agents/skills/bar",
            "/Users/x/.skim/archive/a",
        ] {
            assert!(assert_allowed(&PathBuf::from(p)).is_ok(), "{p}");
        }
    }

    #[test]
    fn rejects_everything_else() {
        for p in ["/Users/x/Documents/foo", "/etc/passwd", "/Users/x/claude/skills"] {
            assert!(assert_allowed(&PathBuf::from(p)).is_err(), "{p}");
        }
    }
}
