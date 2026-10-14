import { COLORS } from './canvas';

/**
 * Static casino-floor backdrop: blue spotlight, light beams and a vignette; each table's scene draws its own props.
 * Drawn once per size into a cached canvas (Stage.background), so it only uses cheap gradients and no shadows.
 */
export function drawBackdrop(x: CanvasRenderingContext2D, w: number, h: number, low: boolean): void {
  x.fillStyle = COLORS.bg;
  x.fillRect(0, 0, w, h);

  // Spotlight pool.
  const pool = x.createRadialGradient(w / 2, h * 0.4, 8, w / 2, h * 0.4, Math.max(w, h) * 0.65);
  pool.addColorStop(0, 'rgba(42,107,255,0.80)');
  pool.addColorStop(0.45, 'rgba(20,50,122,0.50)');
  pool.addColorStop(1, 'rgba(5,11,28,0)');
  x.fillStyle = pool;
  x.fillRect(0, 0, w, h);

  // Light beams from the top centre.
  const beam = (left: number, right: number, alpha: number): void => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(159,208,255,${alpha})`);
    g.addColorStop(1, 'rgba(159,208,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(w / 2 - w * 0.03, 0);
    x.lineTo(w / 2 + w * 0.03, 0);
    x.lineTo(right, h);
    x.lineTo(left, h);
    x.closePath();
    x.fill();
  };
  beam(w * 0.3, w * 0.7, 0.28);
  if (!low) {
    beam(w * 0.05, w * 0.4, 0.12);
    beam(w * 0.6, w * 0.95, 0.12);
  }

  // Vignette keeps the eye on the centre.
  const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = v;
  x.fillRect(0, 0, w, h);
}
