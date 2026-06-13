use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum SkimError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("config corrupt: {0}")]
    ConfigCorrupt(String),
    #[error("file changed on disk since it was read")]
    StaleWrite,
    #[error("destination already exists")]
    Conflict,
    #[error("path not allowed: {0}")]
    Forbidden(String),
    #[error("trash failed: {0}")]
    TrashFailed(String),
    #[error("{0}")]
    Invalid(String),
}

impl SkimError {
    pub fn code(&self) -> &'static str {
        match self {
            SkimError::Io(_) => "IO",
            SkimError::ConfigCorrupt(_) => "CONFIG_CORRUPT",
            SkimError::StaleWrite => "STALE_WRITE",
            SkimError::Conflict => "CONFLICT",
            SkimError::Forbidden(_) => "FORBIDDEN",
            SkimError::TrashFailed(_) => "TRASH_FAILED",
            SkimError::Invalid(_) => "INVALID",
        }
    }
}

// 前端契约：{ code, message }（tech-design.md「接口设计」）
impl Serialize for SkimError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("SkimError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type Result<T> = std::result::Result<T, SkimError>;
