// Phones held upright: the game is turned sideways in software (html.rot rotates the whole page a
// quarter turn), so it always plays horizontally, whatever the browser lets a page do. Turn the
// phone sideways (with auto-rotate on) and it's a normal landscape page again.
// Everything that measures the screen uses vp.w / vp.h (the game's own width and height, i.e.
// swapped while rotated), and vp.local(e) turns a touch's screen position into the game's.

const phone = matchMedia('(pointer: coarse)').matches;
const standalone = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;

export const vp = {
  rotated: false,
  get w() { return this.rotated ? innerHeight : innerWidth; },
  get h() { return this.rotated ? innerWidth : innerHeight; },
  // a pointer event's position in the game's own (unrotated) coordinates
  local(e) { return this.rotated ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY }; },
  update() {
    const rot = phone && !standalone && innerHeight > innerWidth;
    this.rotated = rot;
    const html = document.documentElement;
    html.classList.toggle('rot', rot);
    html.style.setProperty('--sw', `${innerWidth}px`);
    html.style.setProperty('--sh', `${innerHeight}px`);
    return rot;
  },
};
vp.update();
