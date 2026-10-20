// Svelte actions for the window's motion. Timing comes from state/motion.ts
// and the keyframes from app.css. Both do nothing with reduced motion.

import { cubicOut } from "svelte/easing";
import { MOTION, reducedMotion, staggerDelay } from "$lib/state/motion";

export interface StaggerOptions {
  /** What enters: panels by default. Only the outermost matches count. */
  selector?: string;
}

/**
 * Panels or rows in `node` enter one after another when it mounts: each
 * fades in rising a few pixels, `staggerDelay` apart. A nested match (a
 * chip inside a panel) enters with its parent.
 */
export function staggerIn(node: HTMLElement, options: StaggerOptions = {}) {
  if (reducedMotion()) return;
  const selector = options.selector ?? ".ah-glass, [data-enter]";
  const outermost = (el: HTMLElement) => {
    const above = el.parentElement?.closest(selector);
    return !above || !node.contains(above);
  };
  const items = [...node.querySelectorAll<HTMLElement>(selector)].filter(outermost);
  items.forEach((el, i) => {
    el.style.setProperty("--enter-delay", `${staggerDelay(i)}ms`);
    el.classList.add("enter");
    const done = (event: AnimationEvent) => {
      if (event.target !== el) return;
      el.classList.remove("enter");
      el.removeEventListener("animationend", done);
    };
    el.addEventListener("animationend", done);
  });
}

export interface IndicatorOptions {
  /** The selected item: `[aria-current="page"]` or `[aria-checked="true"]`. */
  selector: string;
}

/**
 * Draws the selected-item pill under `node`'s current item and slides it
 * there when the selection moves, instead of the pill jumping. The pill is
 * `node`'s ::before (see `.slider` in app.css), placed through CSS
 * variables; the first placement does not animate.
 */
export function slidingIndicator(node: HTMLElement, options: IndicatorOptions) {
  let selector = options.selector;
  let frame = 0;

  function place() {
    const active = node.querySelector<HTMLElement>(selector);
    if (!active) {
      node.removeAttribute("data-indicator");
      return;
    }
    node.style.setProperty("--indicator-x", `${active.offsetLeft}px`);
    node.style.setProperty("--indicator-y", `${active.offsetTop}px`);
    node.style.setProperty("--indicator-w", `${active.offsetWidth}px`);
    node.style.setProperty("--indicator-h", `${active.offsetHeight}px`);
    if (!node.hasAttribute("data-indicator")) {
      // First placement: show it where it is, then let later moves slide.
      node.setAttribute("data-indicator", "placed");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => node.setAttribute("data-indicator", "ready"));
    }
  }

  place();
  const mutations = new MutationObserver(place);
  mutations.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-current", "aria-checked", "class"],
  });
  const resize = new ResizeObserver(place);
  resize.observe(node);
  void document.fonts?.ready.then(place);

  return {
    update(next: IndicatorOptions) {
      selector = next.selector;
      place();
    },
    destroy() {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
    },
  };
}

/** Banners and notices slide in 8px as they appear. */
export function toastIn(_node: Element) {
  return {
    duration: reducedMotion() ? 0 : MOTION.base,
    easing: cubicOut,
    css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * -8}px)`,
  };
}

/** A floating control rises 8px into place and sinks away (`transition:`). */
export function slideUp(_node: Element) {
  return {
    duration: reducedMotion() ? 0 : MOTION.base,
    easing: cubicOut,
    css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 8}px)`,
  };
}
