//! Validate a chosen media root without silently substituting another disk.
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub fn prepare_media_root(custom: Option<&Path>, default: &Path) -> io::Result<PathBuf> {
    let root = custom.unwrap_or(default);
    if !root.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Choose an absolute storage folder",
        ));
    }
    if custom.is_none() {
        fs::create_dir_all(root)?;
    }
    // Never recreate a missing custom path: its external volume may be offline.
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!(
                "Storage folder unavailable: {}. Reconnect the drive or choose a folder in Settings.",
                root.display()
            ),
        ));
    }
    let probe = root.join(format!(".capmotion-write-check-{}", uuid::Uuid::new_v4()));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|e| {
            io::Error::new(
                e.kind(),
                format!("Storage folder is not writable: {}: {e}", root.display()),
            )
        })?;
    drop(file);
    fs::remove_file(probe)?;
    Ok(root.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn offline_custom_disk_never_creates_a_folder_or_uses_default() {
        let temp = tempfile::tempdir().unwrap();
        let custom = temp.path().join("disconnected drive/media");
        let default = temp.path().join("system disk/default");
        assert!(prepare_media_root(Some(&custom), &default).is_err());
        assert!(!custom.exists());
        assert!(!default.exists());
    }
    #[test]
    fn chosen_unicode_folder_and_explicit_default_work_without_probe_residue() {
        let temp = tempfile::tempdir().unwrap();
        let custom = temp.path().join("外置 媒体");
        fs::create_dir(&custom).unwrap();
        let default = temp.path().join("default");
        assert_eq!(prepare_media_root(Some(&custom), &default).unwrap(), custom);
        assert_eq!(fs::read_dir(&custom).unwrap().count(), 0);
        assert!(!default.exists());
        assert_eq!(prepare_media_root(None, &default).unwrap(), default);
        assert!(default.is_dir());
    }
    #[test]
    fn relative_or_file_locations_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("file");
        fs::write(&file, "data").unwrap();
        assert!(prepare_media_root(Some(&file), temp.path()).is_err());
        assert!(prepare_media_root(Some(Path::new("relative")), temp.path()).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "data");
    }
}
