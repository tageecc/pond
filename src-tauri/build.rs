use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;

fn main() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let icon_paths = [
        "icons/icon.icns",
        "icons/icon.png",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.ico",
        "icons/logo-source.png",
    ];
    let mut hasher = DefaultHasher::new();
    for rel in icon_paths {
        let p = manifest_dir.join(rel);
        println!("cargo:rerun-if-changed={}", p.display());
        if let Ok(bytes) = fs::read(&p) {
            bytes.hash(&mut hasher);
        }
    }
    println!("cargo:rustc-env=TAURI_ICON_STAMP={}", hasher.finish());
    tauri_build::build();
}
