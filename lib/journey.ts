/**
 * The timing of the scroll journey that other parts of the site need without
 * importing the 3D engine: where each project's environment settles.
 */
export const K = 0.75; // the desk acts are scaled into the first part of the scroll
export const D_CROSS = 0.358; // desk → machine swap, in desk-domain progress
export const P_CROSS = D_CROSS * K;
export const STAGES_N = 6; // five projects, then the terminal backdrop
export const STAGE_SPAN = 0.62 / STAGES_N;
export const stageStart = (i: number) => P_CROSS + i * STAGE_SPAN;
