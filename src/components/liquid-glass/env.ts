/**
 * Browser checks. Nothing here runs at import time, so the component can be
 * imported on a server.
 */

let filterLens: boolean | undefined;

/**
 * Only Chromium draws an SVG filter inside backdrop-filter. Firefox parses it and
 * draws nothing, so CSS.supports alone is not enough: the engine is checked too.
 */
export function supportsFilterLens(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  if (filterLens === undefined) {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
    const chromium = brands ? brands.some((b) => b.brand === 'Chromium') : /Chrom(e|ium)\//.test(navigator.userAgent);
    filterLens = chromium && CSS.supports('backdrop-filter', 'url(#a)');
  }
  return filterLens;
}

let coarse: boolean | undefined;

/** Phones and tablets. They get the lens without the colour split: one bend pass instead of three. */
export function coarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  if (coarse === undefined) coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse;
}
