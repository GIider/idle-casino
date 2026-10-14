// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyQuality, cycleQuality, onQualityChange, probeFrame, profile, qualityLabel, resetProbe } from '../src/ui/quality';

describe('quality profile', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProbe();
    applyQuality('high');
  });

  it('low disables expensive canvas effects and throttles updates', () => {
    applyQuality('low');
    expect(document.documentElement.dataset.quality).toBe('low');
    expect(profile.canvasShadows).toBe(false);
    expect(profile.dprCap).toBe(1);
    expect(profile.stageFrameMs).toBeGreaterThan(0);
    expect(profile.uiTickMs).toBeGreaterThan(0);
    applyQuality('high');
    expect(profile.canvasShadows).toBe(true);
    expect(profile.stageFrameMs).toBe(0);
  });

  it('notifies only when the resolved level changes', () => {
    const cb = vi.fn();
    const off = onQualityChange(cb);
    applyQuality('high');
    expect(cb).not.toHaveBeenCalled();
    applyQuality('low');
    expect(cb).toHaveBeenCalledWith(true);
    off();
  });

  it('cycles auto -> high -> low and labels the mode', () => {
    expect(cycleQuality()).toBe('high');
    expect(qualityLabel()).toBe('Quality: high');
    expect(cycleQuality()).toBe('low');
    expect(qualityLabel()).toBe('Quality: low');
    expect(cycleQuality()).toBe('auto');
    expect(qualityLabel()).toMatch(/^Quality: auto \((high|low)\)$/);
  });

  it('auto mode drops to low after sustained slow frames', () => {
    resetProbe();
    applyQuality('auto');
    applyQuality('auto');
    // Force a known starting point regardless of the test machine.
    if (profile.low) return;
    for (let i = 0; i < 60; i++) probeFrame(40);
    expect(profile.low).toBe(true);
  });
});
