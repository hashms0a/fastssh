//! Task 10.2: removing a plain library file once its encrypted twin exists.

use crate::error::AppError;
use std::fs;
use std::path::Path;

/// Zero-overwrite the file, then unlink it.
///
/// The zeroing is a hygiene measure, not secure deletion: on SSDs and
/// copy-on-write filesystems (btrfs) the old blocks can survive. The README
/// says so; do not describe this as "secure deletion".
pub fn scrub_and_remove(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    zero_overwrite(path);
    fs::remove_file(path).map_err(|e| AppError::io(path, e))
}

/// Best-effort: a file we cannot open or write is simply removed afterwards.
fn zero_overwrite(path: &Path) {
    use std::io::Write;
    let Ok(len) = path.metadata().map(|m| m.len()) else {
        return;
    };
    let Ok(mut f) = fs::OpenOptions::new().write(true).open(path) else {
        return;
    };
    let zeros = [0u8; 4096];
    let mut left = len;
    while left > 0 {
        let n = left.min(zeros.len() as u64) as usize;
        if f.write_all(&zeros[..n]).is_err() {
            break;
        }
        left -= n as u64;
    }
    let _ = f.sync_all();
}
