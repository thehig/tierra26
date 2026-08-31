// The exhibit. Paints one worker frame to a 64x64 canvas via ImageData, CSS-scaled up.
// Color-by genotype (default) or founder (Versus). A birth bloom — driven by diffFrames —
// briefly brightens newly-born cells, honoring reduced-motion. Click → inspect.
import { useEffect, useRef } from 'react';
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import { tankFrameFromObservation, toPixelBuffer, makePixelBuffer, cellToAddress, diffFrames, type PixelBuffer, type TankFrameView } from '@tierra26/ui/tank-view.ts';
import { cellColor, founderCellColor, type CellClass, type BrightTier } from '../design/palette.ts';
import { usePrefs } from '../store/prefs.tsx';

export function TankCanvas({
  frame, dark, onPick, colorBy = 'genotype',
}: {
  frame: ObservationFrame | null;
  dark: boolean;
  onPick?: (address: number) => void;
  colorBy?: 'genotype' | 'founder';
}) {
  const { reducedMotion } = usePrefs();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pbRef = useRef<PixelBuffer>(makePixelBuffer(64, 64));
  const prevTf = useRef<TankFrameView | null>(null);
  const bloom = useRef<Uint8Array | null>(null);
  const frameRef = useRef<ObservationFrame | null>(frame);
  frameRef.current = frame;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !frame) return;
    const tf = tankFrameFromObservation(frame);
    const pb = toPixelBuffer(tf, pbRef.current);
    pbRef.current = pb;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const n = pb.width * pb.height;
    if (cv.width !== pb.width || cv.height !== pb.height) { cv.width = pb.width; cv.height = pb.height; }

    // birth bloom: decay, then light up cells that gained occupancy this frame (diffFrames).
    if (!bloom.current || bloom.current.length !== n) bloom.current = new Uint8Array(n);
    const glow = bloom.current;
    if (!reducedMotion) {
      for (let i = 0; i < n; i++) if (glow[i] > 0) glow[i] = Math.max(0, glow[i] - 30);
      const prev = prevTf.current;
      if (prev && prev.width === tf.width && prev.height === tf.height) {
        for (const idx of diffFrames(prev, tf).born) glow[idx] = 255;
      }
    }
    prevTf.current = tf;

    const founderOf = frame.tank.founderOf; // per grid cell (engine STAT); undefined on old frames
    const img = ctx.createImageData(pb.width, pb.height);
    for (let i = 0; i < n; i++) {
      const klass = pb.klass[i] as CellClass;
      const bright = pb.bright[i] as BrightTier;
      let [r, g, b] = colorBy === 'founder' && founderOf
        ? founderCellColor(founderOf[i]!, klass, bright, dark)
        : cellColor(pb.color[i]!, klass, bright, dark);
      const t = reducedMotion ? 0 : (glow[i]! / 255) * 0.55;
      if (t > 0) { r = r + (255 - r) * t; g = g + (255 - g) * t; b = b + (255 - b) * t; }
      const o = i * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [frame, dark, colorBy, reducedMotion]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const f = frameRef.current;
    const cv = canvasRef.current;
    if (!f || !cv || !onPick) return;
    const rect = cv.getBoundingClientRect();
    const tf = tankFrameFromObservation(f);
    const x = Math.min(tf.width - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * tf.width)));
    const y = Math.min(tf.height - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * tf.height)));
    onPick(cellToAddress(x, y, tf));
  }

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      className="tank"
      aria-label="the living soup — click a creature to inspect it"
      onClick={handleClick}
    />
  );
}
