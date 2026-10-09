/**
 * A tiny shared store between the 3D scene and the cursor. The scene never
 * touches the cursor's DOM; it only publishes what the cursor should know:
 *  - digital: 0 → 1 as the camera crosses into the laptop (and back out)
 *  - hint:    a short label for an interactive 3D object under the pointer
 *  - rect:    that object's screen-space bounds, so the cursor can align to it
 */
export type CursorRect = { x: number; y: number; w: number; h: number; r: number };

export type CursorState = {
  digital: number;
  hint: string | null;
  rect: CursorRect | null;
};

export const cursorState: CursorState = { digital: 0, hint: null, rect: null };

const listeners = new Set<() => void>();

export function setCursor(patch: Partial<CursorState>) {
  Object.assign(cursorState, patch);
  listeners.forEach((fn) => fn());
}

export function onCursor(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
