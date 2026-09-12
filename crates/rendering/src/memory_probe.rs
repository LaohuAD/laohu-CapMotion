// Usage: cargo run -p cap-rendering --example decoder_memory -- video.mp4 [frames]
// Isolates source decoding from rendering/encoding when investigating GPU growth.
#[tokio::test]
#[ignore = "requires CAP_MEMORY_PROBE_VIDEO on a real GPU"]
async fn decoder_memory_probe() {
    let mut args = [
        std::env::var("CAP_MEMORY_PROBE_VIDEO").expect("CAP_MEMORY_PROBE_VIDEO"),
        "4000".to_string(),
        std::env::var("CAP_MEMORY_PROBE_MODE").unwrap_or_default(),
    ]
    .into_iter();
    let path = args.next().expect("source video path").into();
    let frames: u32 = args.next().unwrap_or("2000".into()).parse().unwrap();
    let mode = args.next().unwrap_or_default();
    let render = mode.contains("gpu");
    let seek = mode.contains("seek");
    let gpu = if render {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions::default())
            .await
            .unwrap();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .unwrap();
        let converter = crate::yuv_converter::YuvToRgbaConverter::new(&device);
        Some((device, queue, converter))
    } else {
        None
    };
    let mut gpu = gpu;
    let decoder = crate::decoder::spawn_decoder("memory-check", path, 30, 0.0, false)
        .await
        .unwrap();
    println!("pid={}", std::process::id());
    for frame in 0..frames {
        let decoded = decoder
            .get_frame(if seek {
                ((frame / 30) * 7 % 180) as f32 + (frame % 30) as f32 / 30.0
            } else {
                frame as f32 / 30.0
            })
            .await
            .expect("decoded frame");
        std::hint::black_box(decoded.width());
        #[cfg(target_os = "macos")]
        if let Some((device, queue, converter)) = gpu.as_mut() {
            let _pool = cidre::objc::AutoreleasePoolPage::push();
            let mut encoder = device.create_command_encoder(&Default::default());
            decoded
                .with_image_buf(|buf| {
                    converter
                        .convert_nv12_from_iosurface_to_encoder(device, &mut encoder, buf)
                        .unwrap();
                })
                .unwrap();
            queue.submit([encoder.finish()]);
            let completed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            let flag = completed.clone();
            queue.on_submitted_work_done(move || {
                flag.store(true, std::sync::atomic::Ordering::Release)
            });
            while !completed.load(std::sync::atomic::Ordering::Acquire) {
                device.poll(wgpu::PollType::Poll).unwrap();
                std::thread::sleep(std::time::Duration::from_micros(100));
            }
        }
        drop(decoded);
        if frame % 500 == 0 {
            println!("frame={frame}");
            #[cfg(target_os = "macos")]
            if let Ok(output) = std::process::Command::new("vmmap")
                .args(["-summary", &std::process::id().to_string()])
                .output()
            {
                for line in String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter(|l| l.starts_with("IOSurface ") || l.starts_with("Physical footprint:"))
                {
                    println!("{line}");
                }
            }
        }
    }
    println!("idle-start");
    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("vmmap")
            .args(["-summary", &std::process::id().to_string()])
            .output()
            .unwrap();
        for line in String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|l| l.starts_with("IOSurface ") || l.starts_with("Physical footprint:"))
        {
            println!("idle {line}");
        }
    }
    assert!(
        decoder.get_frame(1.0).await.is_some(),
        "reader must resume after idle eviction"
    );
}
