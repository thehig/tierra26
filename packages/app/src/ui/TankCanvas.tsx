// The exhibit. Paints one worker frame to a 64x64 offscreen buffer (genotype- or founder-colored,
// with a diffFrames birth bloom), then blits a pan/zoom viewport window onto the visible canvas.
// Drag to pan, wheel to zoom; click routes through the viewport to a soup address to inspect.
import { useEffect, useRef, useState } from 'react';
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import { tankFrameFromObservation, toPixelBuffer, makePixelBuffer, cellToAddress, diffFrames, type PixelBuffer, type TankFrameView } from '@tierra26/ui/tank-view.ts';
import { cellColor, founderCellColor, type CellClass, type BrightTier } from '../design/palette.ts';
import { usePrefs } from '../store/prefs.tsx';

const N = 64;                       // grid dimension
const MAX_ZOOM = 8;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface Viewport { zoom: number; ox: number; oy: number } // ox/oy in cells

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
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const pbRef = useRef<PixelBuffer>(makePixelBuffer(N, N));
  const prevTf = useRef<TankFrameView | null>(null);
  const bloom = useRef<Uint8Array | null>(null);
  const frameRef = useRef<ObservationFrame | null>(frame);
  frameRef.current = frame;

  const [vp, setVp] = useState<Viewport>({ zoom: 1, ox: 0, oy: 0 });
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  // Blit the current offscreen buffer through the viewport onto the visible canvas.
  function blit() {
    const cv = canvasRef.current, off = offscreenRef.current;
    if (!cv || !off) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { zoom, ox, oy } = vpRef.current;
    const win = N / zoom;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, N, N);
    ctx.drawImage(off, ox, oy, win, win, 0, 0, N, N);
  }

  // Repaint the offscreen buffer when a new frame arrives, then blit.
  useEffect(() => {
    if (!frame) return;
    let off = offscreenRef.current;
    if (!off) { off = document.createElement('canvas'); off.width = N; off.height = N; offscreenRef.current = off; }
    const octx = off.getContext('2d');
    if (!octx) return;
    const tf = tankFrameFromObservation(frame);
    const pb = toPixelBuffer(tf, pbRef.current);
    pbRef.current = pb;
    const n = pb.width * pb.height;

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

    const founderOf = frame.tank.founderOf;
    const img = octx.createImageData(pb.width, pb.height);
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
    octx.putImageData(img, 0, 0);
    blit();
  }, [frame, dark, colorBy, reducedMotion]);

  // Re-blit on viewport change (no frame recompute).
  useEffect(() => { blit(); }, [vp]);

  function screenToCell(clientX: number, clientY: number): { x: number; y: number } {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const { zoom, ox, oy } = vpRef.current;
    const win = N / zoom;
    const x = clamp(Math.floor(ox + ((clientX - rect.left) / rect.width) * win), 0, N - 1);
    const y = clamp(Math.floor(oy + ((clientY - rect.top) / rect.height) * win), 0, N - 1);
    return { x, y };
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const { x, y } = screenToCell(e.clientX, e.clientY);
    setVp((v) => {
      const zoom = clamp(e.deltaY < 0 ? v.zoom + 1 : v.zoom - 1, 1, MAX_ZOOM);
      const win = N / zoom;
      // keep the cell under the cursor roughly fixed
      const ox = clamp(x - win / 2, 0, N - win);
      const oy = clamp(y - win / 2, 0, N - win);
      return zoom === 1 ? { zoom: 1, ox: 0, oy: 0 } : { zoom, ox, oy };
    });
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: vp.ox, oy: vp.oy, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const win = N / vpRef.current.zoom;
    const dx = ((e.clientX - d.x) / rect.width) * win;
    const dy = ((e.clientY - d.y) / rect.height) * win;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    setVp((v) => ({ ...v, ox: clamp(d.ox - dx, 0, N - win), oy: clamp(d.oy - dy, 0, N - win) }));
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return; // a real drag — not a click
    const f = frameRef.current;
    if (!f || !onPick) return;
    const { x, y } = screenToCell(e.clientX, e.clientY);
    onPick(cellToAddress(x, y, tankFrameFromObservation(f)));
  }

  return (
    <div className="tankview">
      <canvas
        ref={canvasRef}
        width={N}
        height={N}
        className="tank"
        aria-label="the living soup — drag to pan, scroll to zoom, click a creature to inspect it"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {vp.zoom > 1 && (
        <button className="tank-reset" onClick={() => setVp({ zoom: 1, ox: 0, oy: 0 })} title="reset view">⤢ {vp.zoom}×</button>
      )}
    </div>
  );
}
