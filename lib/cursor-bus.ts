/**
 * A tiny shared store between the 3D scene and the cursor. The scene never
 * touches the cursor's DOM; it only publishes meaning:
 *  - digital: 0 → 1 as the camera crosses into the laptop (and back out)
 *  - kind:    what the 3D object under the pointer *is* (explore / project)
 *  - hint:    its short label
 * The cursor never measures elements: it reacts to these kinds only.
 */
export type CursorKind = "object" | "project";

export type CursorState = {
  digital: number;
  kind: CursorKind | null;
  hint: string | null;
};

export const cursorState: CursorState = { digital: 0, kind: null, hint: null };

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
