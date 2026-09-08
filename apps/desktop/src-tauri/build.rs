fn main() {
    println!("cargo:rustc-check-cfg=cfg(cap_laohu_local_build)");
    println!("cargo:rerun-if-env-changed=CAP_LAOHU_LOCAL_BUILD");
    println!("cargo:rerun-if-env-changed=CAPMOTION_RELEASE_VERSION");
    if std::env::var_os("CAP_LAOHU_LOCAL_BUILD").is_some() {
        println!("cargo:rustc-cfg=cap_laohu_local_build");
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Export preview command dispatch can exhaust the default 1 MiB UI stack before reaching a Tokio worker.
        println!("cargo:rustc-link-arg-bin=cap-desktop=/STACK:16777216");
        if std::env::var_os("CAP_LAOHU_LOCAL_BUILD").is_some()
            && let Ok(version) = std::env::var("CAPMOTION_RELEASE_VERSION")
        {
            // tauri-build 2.4.1 updates numeric PE versions from its config,
            // but tauri-winres initializes the displayed version strings from
            // CARGO_PKG_VERSION. The release script derives this from the same
            // tauri.local.conf.json authority, without rewriting Cargo.toml.
            assert!(
                version.split('.').count() == 3
                    && version.split('.').all(|part| part.parse::<u16>().is_ok()),
                "CAPMOTION_RELEASE_VERSION must be a three-part release version"
            );
            // SAFETY: this build-script process is still single-threaded, before
            // tauri_build starts resource tools. No application env is changed.
            unsafe { std::env::set_var("CARGO_PKG_VERSION", version) };
        }
    }
    tauri_build::build();
}
