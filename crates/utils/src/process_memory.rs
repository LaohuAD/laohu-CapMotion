//! Process accounting. RSS excludes compressed/swapped pages and must not be
//! presented as total application memory. Graphics/helper processes can carry
//! additional allocations even when the main process footprint is stable.
#[derive(Debug, serde::Serialize)]
pub struct ProcessMemory {
    pub pid: u32,
    pub resident_bytes: u64,
    pub footprint_bytes: Option<u64>,
    pub private_bytes: Option<u64>,
}

#[cfg(target_os = "macos")]
pub fn snapshot(pid: u32) -> Option<ProcessMemory> {
    // ABI: sys/resource.h rusage_info_v0, RUSAGE_INFO_V0 = 0.
    #[repr(C)]
    #[derive(Default)]
    struct Usage {
        uuid: [u8; 16],
        user: u64,
        system: u64,
        idle: u64,
        interrupts: u64,
        pageins: u64,
        wired: u64,
        resident: u64,
        footprint: u64,
        start: u64,
        exit: u64,
    }
    unsafe extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut std::ffi::c_void) -> i32;
    }
    let mut usage = Usage::default();
    if pid > i32::MAX as u32
        || unsafe { proc_pid_rusage(pid as i32, 0, (&mut usage as *mut Usage).cast()) } != 0
    {
        return None;
    }
    Some(ProcessMemory {
        pid,
        resident_bytes: usage.resident,
        footprint_bytes: Some(usage.footprint),
        private_bytes: None,
    })
}

#[cfg(target_os = "windows")]
pub fn snapshot(pid: u32) -> Option<ProcessMemory> {
    use windows::Win32::{
        Foundation::CloseHandle,
        System::{
            ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX},
            Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
        },
    };
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
        let mut counters = PROCESS_MEMORY_COUNTERS_EX::default();
        counters.cb = std::mem::size_of_val(&counters) as u32;
        let result = GetProcessMemoryInfo(
            handle,
            (&mut counters as *mut PROCESS_MEMORY_COUNTERS_EX).cast(),
            counters.cb,
        );
        let _ = CloseHandle(handle);
        result.ok()?;
        Some(ProcessMemory {
            pid,
            resident_bytes: counters.WorkingSetSize as u64,
            footprint_bytes: None,
            private_bytes: Some(counters.PrivateUsage as u64),
        })
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn snapshot(_pid: u32) -> Option<ProcessMemory> {
    None
}

pub fn log_snapshot(pid: u32, stage: &str) {
    if let Some(memory) = snapshot(pid) {
        tracing::info!(
            stage,
            ?memory,
            "Process memory accounting (not application group total)"
        );
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "windows")))]
mod tests {
    #[test]
    fn current_process_accounting_and_missing_process() {
        let memory = super::snapshot(std::process::id()).unwrap();
        assert!(memory.resident_bytes > 0);
        assert!(memory.footprint_bytes.or(memory.private_bytes).unwrap() > 0);
        assert!(super::snapshot(u32::MAX).is_none());
    }
}
