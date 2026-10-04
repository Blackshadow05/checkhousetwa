import { flushSync } from "react-dom";

const NAME = "revision-detail";

function findCard(id: string) {
  const cards = document.querySelectorAll<HTMLElement>(
    `[data-revision-card="${CSS.escape(id)}"]`,
  );
  for (const card of cards) {
    if (typeof card.checkVisibility === "function" && !card.checkVisibility()) continue;
    const box = card.getBoundingClientRect();
    if (box.width && box.height && box.bottom > 0 && box.top < window.innerHeight) {
      return card;
    }
  }
  return null;
}

function cornerRadius(card: HTMLElement) {
  const radius = getComputedStyle(card).borderTopLeftRadius;
  return radius && radius !== "0px" ? radius : "16px";
}

export function runDetailTransition(id: string, opening: boolean, update: () => void) {
  const root = document.documentElement;
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    root.dataset.detailTransition
  ) {
    update();
    return;
  }
  const card = findCard(id);
  if (opening && !card) {
    update();
    return;
  }
  root.dataset.detailTransition = card ? (opening ? "open" : "close") : "exit";
  if (card) {
    root.style.setProperty("--detail-origin-radius", cornerRadius(card));
    if (opening) card.style.viewTransitionName = NAME;
  }
  try {
    const transition = document.startViewTransition(() => {
      if (card && opening) card.style.viewTransitionName = "";
      flushSync(update);
      if (card && !opening) card.style.viewTransitionName = NAME;
    });
    void transition.finished.finally(() => {
      if (card) card.style.viewTransitionName = "";
      delete root.dataset.detailTransition;
      root.style.removeProperty("--detail-origin-radius");
    });
  } catch {
    if (card) card.style.viewTransitionName = "";
    delete root.dataset.detailTransition;
    root.style.removeProperty("--detail-origin-radius");
    update();
  }
}
