// The exhibit. Paints one worker frame to a 64x64 canvas via ImageData, CSS-scaled up.
// A click maps the pixel → grid cell → soup address and asks the worker to inspect it.
import { useEffect, useRef } from 'react';
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import { tankFrameFromObservation, toPixelBuffer, makePixelBuffer, cellToAddress, type PixelBuffer } from '@tierra26/ui/tank-view.ts';
import { cellColor, type CellClass, type BrightTier } from '../design/palette.ts';

export function TankCanvas({
  frame, dark, onPick,
}: {
  frame: ObservationFrame | null;
  dark: boolean;
  onPick?: (address: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pbRef = useRef<PixelBuffer>(makePixelBuffer(64, 64));
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
