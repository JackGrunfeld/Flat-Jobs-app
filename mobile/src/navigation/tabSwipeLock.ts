// A horizontal scroller inside a tab screen and the tab-swipe gesture want the
// same drag, and the responder system can't separate them reliably: the tab
// wrapper is an ancestor with a JS PanResponder, while a horizontal FlatList
// scrolls natively, so which one wins comes down to timing.
//
// So the scroller says so instead. It takes the lock the moment a finger lands
// on it — on touch start, which is always before the first move, and therefore
// before the tab wrapper is asked whether it wants the gesture — and drops it
// when the touch ends.
//
// A counter rather than a flag: two scrollers can be touched in sequence with
// overlapping touch lifecycles, and the first one to finish must not unlock
// while the second is still being dragged.
let held = 0;

export const lockTabSwipe = () => {
  held += 1;
};

export const unlockTabSwipe = () => {
  held = Math.max(0, held - 1);
};

export const isTabSwipeLocked = () => held > 0;
