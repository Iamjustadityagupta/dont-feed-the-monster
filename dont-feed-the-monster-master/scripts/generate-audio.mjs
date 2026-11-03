import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join('public', 'Audio');
mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE_RATE = 22050;

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT_DIR, filename), buffer);
  console.log(`Generated ${filename}`);
}

function makeBuffer(seconds, fn) {
  const len = Math.floor(SAMPLE_RATE * seconds);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = fn(i / SAMPLE_RATE, i, len);
  }
  return out;
}

// 1. Room tone / creepy ambience loop
writeWav('amb_room_tone.wav', makeBuffer(6.0, (t) => {
  const env = Math.min(1, t / 0.4) * Math.min(1, (6.0 - t) / 0.4);
  const sub = Math.sin(2 * Math.PI * 46 * t) * 0.28 + Math.sin(2 * Math.PI * 69.5 * t) * 0.16;
  const eerie = Math.sin(2 * Math.PI * (112 + Math.sin(t * 0.8) * 3) * t) * 0.08;
  return (sub + eerie + (Math.random() * 2 - 1) * 0.025) * env;
}));

// 2. Vent loop
writeWav('amb_vent_loop.wav', makeBuffer(4.0, (t) => {
  const env = Math.min(1, t / 0.3) * Math.min(1, (4.0 - t) / 0.3);
  return (Math.sin(2 * Math.PI * 82 * t) * 0.15 + (Math.random() * 2 - 1) * 0.07) * env;
}));

// 3. Electrical hum
writeWav('amb_electrical_hum.wav', makeBuffer(3.0, (t) => {
  const env = Math.min(1, t / 0.2) * Math.min(1, (3.0 - t) / 0.2);
  const hum = Math.sin(2 * Math.PI * 60 * t) * 0.2 + Math.sin(2 * Math.PI * 120 * t) * 0.12 + Math.sin(2 * Math.PI * 180 * t) * 0.06;
  return hum * env;
}));

// 4. Player heartbeat
writeWav('player_heartbeat.wav', makeBuffer(1.2, (t) => {
  const beat1 = t < 0.18 ? Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t * 18) * 0.85 : 0;
  const t2 = t - 0.28;
  const beat2 = t2 >= 0 && t2 < 0.18 ? Math.sin(2 * Math.PI * 46 * t2) * Math.exp(-t2 * 20) * 0.65 : 0;
  return beat1 + beat2;
}));

// 5. Monster scratch
writeWav('monster_scratch.wav', makeBuffer(2.0, (t) => {
  const burst = (Math.sin(t * 14) > 0.2 ? 1 : 0.1);
  return (Math.random() * 2 - 1) * 0.22 * burst * Math.min(1, (2.0 - t) / 0.2);
}));

// 6. Monster sniff
writeWav('monster_sniff.wav', makeBuffer(1.6, (t) => {
  const cycle = t % 0.8;
  const env = cycle < 0.25 ? Math.sin((cycle / 0.25) * Math.PI) : 0;
  return (Math.random() * 2 - 1) * 0.25 * env;
}));

// 7. Whisper close
writeWav('monster_whisper_close.wav', makeBuffer(3.0, (t) => {
  const env = Math.sin((t / 3.0) * Math.PI);
  const mod = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.2 * t);
  return ((Math.random() * 2 - 1) * 0.14 * mod + Math.sin(2 * Math.PI * 290 * t) * 0.04) * env;
}));

// 8. Metal creak
writeWav('sfx_metal_creak_01.wav', makeBuffer(1.8, (t) => {
  const env = Math.exp(-t * 1.8) * Math.min(1, t / 0.05);
  const f = 310 + Math.sin(t * 5) * 45;
  return (Math.sin(2 * Math.PI * f * t) * 0.3 + Math.sin(2 * Math.PI * f * 1.41 * t) * 0.2) * env;
}));

// 9. Distant impact
writeWav('sfx_distant_impact_01.wav', makeBuffer(1.6, (t) => {
  const env = Math.exp(-t * 3.2);
  return (Math.sin(2 * Math.PI * 48 * t) * 0.6 + (Math.random() * 2 - 1) * 0.25 * Math.exp(-t * 9)) * env;
}));

// 10. Door slam / unlock
writeWav('sfx_door_slam_01.wav', makeBuffer(1.1, (t) => {
  const env = Math.exp(-t * 5.0);
  return (Math.sin(2 * Math.PI * 62 * t) * 0.7 + (Math.random() * 2 - 1) * 0.35 * Math.exp(-t * 12)) * env;
}));

// 11. Sting detect
writeWav('sting_detect_01.wav', makeBuffer(1.1, (t) => {
  const env = Math.exp(-t * 2.8);
  return (Math.sin(2 * Math.PI * (240 - t * 90) * t) * 0.45 + Math.sin(2 * Math.PI * 337 * t) * 0.35 + (Math.random() * 2 - 1) * 0.18) * env;
}));

// 12. Sting lost
writeWav('sting_lost_01.wav', makeBuffer(1.4, (t) => {
  const env = Math.exp(-t * 2.0);
  return Math.sin(2 * Math.PI * (130 - t * 35) * t) * 0.4 * env;
}));

// 13. Sting caught
writeWav('sting_caught_01.wav', makeBuffer(1.6, (t) => {
  const env = Math.exp(-t * 1.9);
  return (Math.sin(2 * Math.PI * (195 - t * 70) * t) * 0.5 + Math.sin(2 * Math.PI * 92 * t) * 0.4 + (Math.random() * 2 - 1) * 0.3) * env;
}));

// 14. Intense chase music loop
writeWav('chase_music_loop.wav', makeBuffer(3.2, (t) => {
  const beat = t % 0.4;
  const kick = beat < 0.14 ? Math.sin(2 * Math.PI * (84 - beat * 260) * beat) * Math.exp(-beat * 16) * 0.65 : 0;
  const bass = Math.sin(2 * Math.PI * (t < 1.6 ? 55 : 58.27) * t) * 0.25;
  const dissonance = Math.sin(2 * Math.PI * 233.08 * t) * 0.08 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2.5 * t));
  return kick + bass + dissonance;
}));

// 15. Item pickup sound
writeWav('sfx_item_pickup.wav', makeBuffer(0.38, (t) => {
  const env = Math.exp(-t * 9.5);
  return (Math.sin(2 * Math.PI * 420 * t) * 0.35 + Math.sin(2 * Math.PI * 640 * t) * 0.22 + (Math.random() * 2 - 1) * 0.12) * env;
}));

// 16. Keypad beep / error / unlock
writeWav('sfx_keypad_beep.wav', makeBuffer(0.14, (t) => Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 20) * 0.35));
writeWav('sfx_keypad_error.wav', makeBuffer(0.45, (t) => (Math.sin(2 * Math.PI * 150 * t) * 0.45 + Math.sin(2 * Math.PI * 162 * t) * 0.35) * Math.exp(-t * 4.5)));
writeWav('sfx_locker_unlock.wav', makeBuffer(0.75, (t) => {
  const click = t < 0.15 ? Math.sin(2 * Math.PI * 520 * t) * Math.exp(-t * 25) * 0.5 : 0;
  const clunk = t >= 0.15 ? Math.sin(2 * Math.PI * 140 * (t - 0.15)) * Math.exp(-(t - 0.15) * 8) * 0.6 : 0;
  return click + clunk;
}));

// 17. Gate mechanical activation
writeWav('sfx_gate_open.wav', makeBuffer(2.4, (t) => {
  const env = Math.min(1, t / 0.15) * Math.min(1, (2.4 - t) / 0.3);
  const motor = Math.sin(2 * Math.PI * 74 * t) * 0.38 + Math.sin(2 * Math.PI * 111 * t) * 0.22;
  const rattle = (Math.random() * 2 - 1) * 0.14;
  return (motor + rattle) * env;
}));