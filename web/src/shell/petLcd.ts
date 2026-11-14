import type { Cell } from "./petSprites";
import { LCD_H, LCD_W } from "./petFrame";

export const SEG = 4; // 4px per segment: 3px lit, 1px gap
const INK = "#26301f";
const UNLIT = "rgb(38 48 31 / .07)";

function plot(
  ctx: CanvasRenderingContext2D,
  cells: Cell[],
  s: number,
  gap: number,
) {
  for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s - gap, s - gap);
}

/** Draw the 32x24 LCD: unlit segment grid first, then lit cells. Cells off-screen are skipped by the canvas. */
export function drawLcd(ctx: CanvasRenderingContext2D, cells: Cell[]) {
  ctx.clearRect(0, 0, LCD_W * SEG, LCD_H * SEG);
  ctx.fillStyle = UNLIT;
  for (let y = 0; y < LCD_H; y++)
    for (let x = 0; x < LCD_W; x++)
      ctx.fillRect(x * SEG, y * SEG, SEG - 1, SEG - 1);
  ctx.fillStyle = INK;
  plot(ctx, cells, SEG, 1);
}

/** Mini egg LCD: 14x13 at 2x, solid segments. */
export function drawMini(ctx: CanvasRenderingContext2D, cells: Cell[]) {
  ctx.clearRect(0, 0, 28, 26);
  ctx.fillStyle = INK;
  plot(ctx, cells, 2, 0);
}
