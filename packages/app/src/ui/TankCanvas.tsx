// The exhibit. Paints one worker frame to a 64x64 canvas via ImageData, CSS-scaled up.
// Pure projection of the frame through the tank view-model + the palette — no engine calls.
import { useEffect, useRef } from 'react';
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import { tankFrameFromObservation, toPixelBuffer, makePixelBuffer, type PixelBuffer } from '@tierra26/ui/tank-view.ts';
import { cellColor, type CellClass, type BrightTier } from '../design/palette.ts';

export function TankCanvas({ frame, dark }: { frame: ObservationFrame | null; dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pbRef = useRef<PixelBuffer>(makePixelBuffer(64, 64));

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !frame) return;
    const tf = tankFrameFromObservation(frame);
    const pb = toPixelBuffer(tf, pbRef.current);
    pbRef.current = pb;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    if (cv.width !== pb.width || cv.height !== pb.height) { cv.width = pb.width; cv.height = pb.height; }
    const img = ctx.createImageData(pb.width, pb.height);
    const n = pb.width * pb.height;
    for (let i = 0; i < n; i++) {
      const [r, g, b, a] = cellColor(pb.color[i]!, pb.klass[i] as CellClass, pb.bright[i] as BrightTier, dark);
      const o = i * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }, [frame, dark]);

  return <canvas ref={canvasRef} width={64} height={64} className="tank" aria-label="the living soup" />;
}
