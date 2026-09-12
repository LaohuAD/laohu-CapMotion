use cap_audio::AudioData;

fn play_audio(bytes: &'static [u8]) {
    use rodio::{Decoder, OutputStream, Sink};
    use std::io::Cursor;

    std::thread::spawn(move || {
        if let Ok((_, stream)) = OutputStream::try_default() {
            let file = Cursor::new(bytes);
            let source = Decoder::new(file).unwrap();
            let sink = Sink::try_new(&stream).unwrap();
            sink.append(source);
            sink.sleep_until_end();
        }
    });
}

#[allow(dead_code)]
pub enum AppSounds {
    StartRecording,
    StopRecording,
    Screenshot,
    Notification,
}

impl AppSounds {
    pub fn play(&self) {
        let bytes = self.get_sound_bytes();
        play_audio(bytes);
    }

    fn get_sound_bytes(&self) -> &'static [u8] {
        match self {
            AppSounds::StartRecording => include_bytes!("../sounds/start-recording.ogg"),
            AppSounds::StopRecording => include_bytes!("../sounds/stop-recording.ogg"),
            AppSounds::Screenshot => include_bytes!("../sounds/screenshot.ogg"),
            AppSounds::Notification => include_bytes!("../sounds/action.ogg"),
        }
    }
}

/// Waveforms use the video/source clock, exactly as playback does. Positive
/// offsets skip early audio; negative offsets insert leading silence.
pub fn get_waveform(audio: &AudioData, offset_secs: f32) -> Vec<f32> {
    waveform_samples(audio.samples(), audio.channels() as usize, offset_secs)
}

fn waveform_samples(samples: &[f32], channels: usize, offset_secs: f32) -> Vec<f32> {
    const RATE: usize = cap_audio::AudioData::SAMPLE_RATE as usize;
    const CHUNK: usize = RATE / 10;
    if channels == 0 || samples.is_empty() || !offset_secs.is_finite() {
        return Vec::new();
    }
    let offset = (offset_secs * RATE as f32).round() as isize;
    let frames = samples.len() / channels;
    let output_frames = (frames as isize - offset).max(0) as usize;
    let mut waveform = Vec::new();
    for start in (0..output_frames).step_by(CHUNK) {
        let end = (start + CHUNK).min(output_frames);
        let mut sum = 0.0f32;
        for frame in start..end {
            let source = frame as isize + offset;
            if source >= 0 && source < frames as isize {
                for c in 0..channels {
                    sum += samples[source as usize * channels + c].abs();
                }
            }
        }
        let avg = sum / ((end - start) * channels) as f32;
        waveform.push(if avg > 0.0 { 20.0 * avg.log10() } else { -60.0 });
    }
    waveform
}

#[cfg(test)]
mod waveform_tests {
    use super::*;
    #[test]
    fn waveform_matches_positive_and_negative_playback_offsets() {
        let mut samples = vec![0.0; 4800];
        samples.extend(vec![1.0; 4800]);
        assert_eq!(waveform_samples(&samples, 1, 0.0), vec![-60.0, 0.0]);
        assert_eq!(waveform_samples(&samples, 1, 0.1), vec![0.0]);
        assert_eq!(waveform_samples(&samples, 1, -0.1), vec![-60.0, -60.0, 0.0]);
        assert!(waveform_samples(&samples, 1, 1.0).is_empty());
    }
    #[test]
    fn waveform_offsets_count_frames_not_stereo_samples() {
        let mut samples = vec![0.0; 9600];
        samples.extend(vec![0.5; 9600]);
        let v = waveform_samples(&samples, 2, 0.1);
        assert_eq!(v.len(), 1);
        assert!((v[0] + 6.0206).abs() < 0.001);
    }
}
