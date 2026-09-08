fn main() {
    println!("cargo:rustc-check-cfg=cfg(cap_laohu_local_build)");
    println!("cargo:rerun-if-env-changed=CAP_LAOHU_LOCAL_BUILD");
    if std::env::var_os("CAP_LAOHU_LOCAL_BUILD").is_some() {
        println!("cargo:rustc-cfg=cap_laohu_local_build");
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Export preview command dispatch can exhaust the default 1 MiB UI stack before reaching a Tokio worker.
        println!("cargo:rustc-link-arg-bin=cap-desktop=/STACK:16777216");
    }
    tauri_build::build();
}
