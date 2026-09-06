/**
 * Tests for the UiText font-size floor contract.
 *
 * FEAT-002 introduced a global UI_MIN_FONT_SIZE floor in textStyle() so no
 * ordinary body/label text renders below ~18 logical px on a large desktop
 * window, with an `allowSmall` opt-out for the dense meta-scene captions that
 * must stay compact. These tests pin that contract: a sub-floor size is raised
 * unless `allowSmall:true` is passed, at-or-above-floor sizes are untouched,
 * and the `allowSmall` hint never leaks into the returned Phaser style object.
 */

import { describe, it, expect } from 'vitest';
import { textStyle, UI_MIN_FONT_SIZE } from './UiText';

describe('textStyle font-size floor', () => {
  it('raises a sub-floor size to UI_MIN_FONT_SIZE', () => {
    const style = textStyle(12);
    expect(style.fontSize).toBe(`${UI_MIN_FONT_SIZE}px`);
  });

  it('leaves a size at the floor unchanged', () => {
    const style = textStyle(UI_MIN_FONT_SIZE);
    expect(style.fontSize).toBe(`${UI_MIN_FONT_SIZE}px`);
  });

  it('leaves an above-floor size unchanged', () => {
    const style = textStyle(32);
    expect(style.fontSize).toBe('32px');
  });

  it('preserves a sub-floor size when allowSmall is set (meta-scene opt-out)', () => {
    const style = textStyle(11, { allowSmall: true });
    expect(style.fontSize).toBe('11px');
  });

  it('never forwards the allowSmall hint into the Phaser style object', () => {
    const style = textStyle(14, { allowSmall: true }) as Record<string, unknown>;
    expect('allowSmall' in style).toBe(false);
  });

  it('lets overrides win but still strips allowSmall', () => {
    const style = textStyle(11, { allowSmall: true, color: '#ff0000' }) as Record<string, unknown>;
    expect(style.fontSize).toBe('11px');
    expect(style.color).toBe('#ff0000');
    expect('allowSmall' in style).toBe(false);
  });
});
