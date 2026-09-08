import { describe, it, expect, beforeEach } from 'vitest';
import { audio } from './audio';

/**
 * These tests run under jsdom, where `AudioContext` is undefined. They verify
 * the engine degrades to no-ops (never throws) in a headless environment and
 * that the persisted settings API behaves correctly - the same guarantees the
 * production build and CI rely on.
 */
describe('audio engine (headless-safe)', () => {
  beforeEach(() => {
    audio.setMuted(false);
    audio.setVolume(0.6);
    audio.setAmbient(false);
    localStorage.clear();
  });

  it('does not throw when playing effects without an AudioContext', () => {
    expect(() => {
      audio.play('cast');
      audio.play('hit');
      audio.play('ability');
      audio.play('death');
      audio.play('victory');
      audio.play('defeat');
      audio.play('ui');
      audio.play('hit', { pan: -0.5, distance: 4 });
      audio.playChampionCue('embermage', 'P');
      audio.playChampionCue('embermage', 'Q');
      audio.playChampionCue('embermage', 'W');
      audio.playChampionCue('embermage', 'E');
      audio.playChampionCue('embermage', 'R');
      audio.playChampionCue('ashborne', 'Q');
      audio.resume();
    }).not.toThrow();
  });

  it('exposes and mutates settings without throwing', () => {
    expect(() => {
      audio.setMuted(true);
      audio.setVolume(0.3);
      audio.setAmbient(true);
      audio.toggleMuted();
      audio.toggleAmbient();
    }).not.toThrow();

    const settings = audio.getSettings();
    expect(settings.volume).toBeCloseTo(0.3);
    expect(typeof settings.muted).toBe('boolean');
    expect(typeof settings.ambient).toBe('boolean');
  });

  it('clamps volume into the 0..1 range and rejects non-finite input', () => {
    audio.setVolume(5);
    expect(audio.getSettings().volume).toBe(1);
    audio.setVolume(-2);
    expect(audio.getSettings().volume).toBe(0);
    audio.setVolume(Number.NaN);
    expect(audio.getSettings().volume).toBe(0);
  });

  it('keeps the settings snapshot stable when no value changes', () => {
    const snapshot = audio.getSettings();
    audio.setMuted(snapshot.muted);
    audio.setVolume(snapshot.volume);
    audio.setAmbient(snapshot.ambient);
    expect(audio.getSettings()).toBe(snapshot);
  });

  it('reports the bounded voice/buffer and five-bus contract', () => {
    expect(audio.getDiagnostics()).toMatchObject({
      buses: ['master', 'music', 'ambience', 'sfx', 'ui'],
      activeVoices: 0,
      maxVoices: 24,
      cachedBuffers: 0,
    });
  });

  it('notifies subscribers on change', () => {
    let received = 0;
    const unsub = audio.subscribe(() => {
      received += 1;
    });
    audio.setMuted(true);
    audio.setVolume(0.5);
    unsub();
    audio.setMuted(false);
    expect(received).toBe(2);
  });
});
