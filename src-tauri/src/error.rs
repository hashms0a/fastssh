use serde::Serialize;

/// Serializable error returned by every Tauri command. `message` is
/// user-facing: it names the file and the OS error where relevant.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    /// Wrap an IO error with the file it concerns, e.g.
    /// `"hosts.json: Permission denied (os error 13)"`.
    pub fn io(path: &std::path::Path, e: std::io::Error) -> Self {
        Self {
            code: "io".to_string(),
            message: format!("{}: {}", path.display(), e),
        }
    }

    pub fn json(path: &std::path::Path, e: serde_json::Error) -> Self {
        Self {
            code: "json".to_string(),
            message: format!("{}: {}", path.display(), e),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self {
            code: "io".to_string(),
            message: e.to_string(),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self {
            code: "json".to_string(),
            message: e.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_names_the_file() {
        let e = AppError::io(
            std::path::Path::new("/x/hosts.json"),
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "Permission denied"),
        );
        assert_eq!(e.code, "io");
        assert_eq!(e.message, "/x/hosts.json: Permission denied");
    }

    #[test]
    fn serializes_as_camel_case() {
        let e = AppError::new("json", "bad");
        let v = serde_json::to_string(&e).unwrap();
        assert_eq!(v, r#"{"code":"json","message":"bad"}"#);
    }
}
