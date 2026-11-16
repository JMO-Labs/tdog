import SearchWorker from "./search.worker?worker";

/** Factory kept separate so tests can mock Worker creation. */
export const createSearchWorker = (): Worker => new SearchWorker();
