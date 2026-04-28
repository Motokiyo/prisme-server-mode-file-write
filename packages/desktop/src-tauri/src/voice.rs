use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{command, AppHandle, Manager, Wry};

#[derive(Default)]
pub struct VoiceState {
    stop: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Serialize, Clone, specta::Type)]
pub struct VoiceStartResponse {
    pub sample_rate: u32,
    pub channels: u16,
}

fn samples_to_le_bytes_f32(data: &[f32], channels: u16) -> Vec<u8> {
    if channels <= 1 {
        let mut out = Vec::with_capacity(data.len() * 2);
        for &s in data {
            let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            out.extend_from_slice(&v.to_le_bytes());
        }
        return out;
    }
    let frames = data.len() / channels as usize;
    let mut out = Vec::with_capacity(frames * 2);
    for frame in data.chunks_exact(channels as usize) {
        let mono = frame.iter().sum::<f32>() / channels as f32;
        let v = (mono.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

fn samples_to_le_bytes_i16(data: &[i16], channels: u16) -> Vec<u8> {
    if channels <= 1 {
        let mut out = Vec::with_capacity(data.len() * 2);
        for &v in data {
            out.extend_from_slice(&v.to_le_bytes());
        }
        return out;
    }
    let frames = data.len() / channels as usize;
    let mut out = Vec::with_capacity(frames * 2);
    for frame in data.chunks_exact(channels as usize) {
        let mono = frame.iter().map(|s| *s as i32).sum::<i32>() / channels as i32;
        let mono = mono.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
        out.extend_from_slice(&mono.to_le_bytes());
    }
    out
}

#[command]
#[specta::specta]
pub async fn voice_start(
    app: AppHandle<Wry>,
    on_chunk: Channel<Vec<u8>>,
) -> Result<VoiceStartResponse, String> {
    let state = app.state::<VoiceState>();

    if let Some(existing) = state.stop.lock().unwrap().take() {
        existing.store(true, Ordering::Relaxed);
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No default input device available".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("default_input_config: {}", e))?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let sample_format = supported.sample_format();
    let stream_config: cpal::StreamConfig = supported.into();

    let stop_flag = Arc::new(AtomicBool::new(false));
    state.stop.lock().unwrap().replace(stop_flag.clone());

    std::thread::spawn(move || {
        let chunk_sender = on_chunk.clone();
        let send = move |bytes: Vec<u8>| {
            let _ = chunk_sender.send(bytes);
        };
        let err_fn = |err| eprintln!("[voice] stream error: {}", err);

        let stream_result = match sample_format {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| send(samples_to_le_bytes_f32(data, channels)),
                err_fn,
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| send(samples_to_le_bytes_i16(data, channels)),
                err_fn,
                None,
            ),
            other => {
                eprintln!("[voice] unsupported sample format: {:?}", other);
                return;
            }
        };

        let stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[voice] build_input_stream: {}", e);
                return;
            }
        };
        if let Err(e) = stream.play() {
            eprintln!("[voice] stream.play: {}", e);
            return;
        }

        while !stop_flag.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        drop(stream);
    });

    Ok(VoiceStartResponse {
        sample_rate,
        channels,
    })
}

#[command]
#[specta::specta]
pub async fn voice_stop(app: AppHandle<Wry>) -> Result<(), String> {
    let state = app.state::<VoiceState>();
    if let Some(flag) = state.stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
