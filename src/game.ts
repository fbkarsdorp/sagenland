// Shared state between the Phaser scene and the HTML layer.
import type { Field, Where } from './field';

type Events = {
  /** the field changed: redraw what depends on it */
  changed: void;
  /** a place or site was clicked on the map */
  pick: Where;
  /** the collector sets out along these tiles */
  walk: number[];
  /** and has arrived */
  arrived: void;
  /** go faster: the player is impatient */
  hurry: void;
  /** something seen at night at a site */
  apparition: number;
  /** tales just written down: a splash of ink where */
  inked: { place: number; site: number | null; find: boolean }[];
  /** a new day begins */
  dawn: void;
  /** the passing of the night was tapped away */
  dawnskip: void;
  /** the side panel was folded away or opened */
  panel: void;
  /** the miniature look switched on or off */
  diorama: '0' | '1' | 'phaser';
  /** the time of day as seen on the road (it passes as the journey goes) */
  clock: { day: number; part: number; slot?: number } | null;
  /** the collector put down somewhere else, from the admin panel */
  teleport: void;
  hover: { text: string; x: number; y: number } | null;
  focus: { x: number; y: number };
  /** true: show the whole sheet; false: back to where the collector is */
  overview: boolean;
  end: void;
};

class Game {
  field!: Field;
  /** while the collector is on the road, nothing else can be done */
  walking = false;
  /** the time shown while on the road; null when it is simply the field's own time */
  clock: { day: number; part: number; slot?: number } | null = null;
  private target = new EventTarget();

  on<K extends keyof Events>(type: K, fn: (detail: Events[K]) => void) {
    const h = (e: Event) => fn((e as CustomEvent).detail);
    this.target.addEventListener(type, h);
    return () => this.target.removeEventListener(type, h);
  }
  emit<K extends keyof Events>(type: K, detail: Events[K]) {
    this.target.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export const G = new Game();
