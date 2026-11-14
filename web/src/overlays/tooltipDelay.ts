export const OPEN_DELAY_MS = 400;
/** After a tooltip closes, a neighbour opens instantly within this window. */
export const SKIP_WINDOW_MS = 300;

/** Shared delay logic: 400 ms open delay, instant when hopping between neighbours. */
export function createTooltipController() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let skipUntil = 0;
  let openId: string | null = null;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    enter(id: string, open: () => void) {
      clear();
      if (openId !== null || Date.now() < skipUntil) {
        openId = id;
        open();
        return;
      }
      timer = setTimeout(() => {
        openId = id;
        open();
      }, OPEN_DELAY_MS);
    },
    leave(id: string, close: () => void) {
      clear();
      if (openId === id) {
        openId = null;
        skipUntil = Date.now() + SKIP_WINDOW_MS;
        close();
      }
    },
  };
}

export const tooltipController = createTooltipController();
