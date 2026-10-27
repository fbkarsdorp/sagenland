// The weather and the dark: a night that falls over the sheet with lamplight left in it, things seen at night
// at the places tales are tied to, an ink splash when something is written down, and rain, leaves and mist
// drifting over the screen in a scene of their own (so they do not zoom with the map).
import Phaser from 'phaser';
import { G } from './game';
import { APPARITION, darkness, type Field } from './field';
import { feest } from './feest';
import { RES, SH, SW, px, type Features } from './sheet';
import { SPIRIT_BOX, SPIRIT_FRAMES, drawSpirit, type SpiritKind } from './spirits';
import { Rng } from './rng';

/** Small textures for the effects, drawn once. */
export function makeAtmosphereTextures(scene: Phaser.Scene) {
  const tex = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h)!;
    draw(t.getContext());
    t.refresh();
  };
  tex('glow', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  tex('drop', 6, 30, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, 'rgba(50,70,95,0)');
    g.addColorStop(1, 'rgba(50,70,95,1)');
    c.strokeStyle = g;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(5, 0);
    c.lineTo(1, 30);
    c.stroke();
  });
  tex('flake', 12, 12, (c) => {
    const g = c.createRadialGradient(6, 6, 0, 6, 6, 6);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(250,252,255,0.95)');
    g.addColorStop(0.8, 'rgba(120,135,160,0.55)');
    g.addColorStop(1, 'rgba(120,135,160,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 12, 12);
  });
  tex('petal', 10, 8, (c) => {
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(150,90,100,0.55)';
    c.lineWidth = 0.7;
    c.beginPath();
    c.ellipse(5, 4, 4.2, 2.8, 0.3, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  });
  tex('leaf', 18, 12, (c) => {
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(40,30,20,0.6)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(1, 6);
    c.quadraticCurveTo(9, -2, 17, 6);
    c.quadraticCurveTo(9, 14, 1, 6);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(1, 6);
    c.lineTo(15, 6);
    c.stroke();
  });
}

/** Frame strips for the things seen at night, drawn once at the sheet's resolution. */
function makeSpiritTextures(scene: Phaser.Scene) {
  const B = Math.round(SPIRIT_BOX * RES);
  for (const kind of ['dwaallicht', 'wief', 'spook', 'hond', 'nikker', 'duivel', 'heks'] as SpiritKind[]) {
    const key = `sp-${kind}`;
    if (scene.textures.exists(key)) continue;
    const t = scene.textures.createCanvas(key, B * SPIRIT_FRAMES, B)!;
    const ctx = t.getContext();
    for (let i = 0; i < SPIRIT_FRAMES; i++) {
      ctx.save();
      ctx.translate(i * B, 0);
      ctx.scale(RES, RES);
      drawSpirit(ctx, kind, i);
      ctx.restore();
      t.add(String(i), 0, i * B, 0, B, B);
    }
    t.refresh();
  }
}

// ------------------------------------------------------------------ the night

/** Darkness over the sheet in the evening, with light left where people are, and where you are. */
export class Night {
  private rt: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image;
  private windows: Phaser.GameObjects.Image[] = [];
  private shade: Phaser.GameObjects.Rectangle;
  private dark = 0;
  private target = 0;
  private tint = 0x141a30;

  constructor(private scene: Phaser.Scene, features: Features) {
    this.rt = scene.add.renderTexture(0, 0, SW, SH).setOrigin(0).setDepth(4).setAlpha(1);
    this.base = scene.make.renderTexture({ x: 0, y: 0, width: SW, height: SH }, false).setOrigin(0);
    this.stamp = scene.make.image({ key: 'glow', add: false });
    this.shade = scene.add.rectangle(0, 0, SW, SH, 0x6a7280, 0).setOrigin(0).setDepth(3.9);
    const r = new Rng(17);
    for (const [x, y] of features.windows) {
      const w = scene.add.image(x + r.range(-2, 2), y, 'glow').setTint(0xffc45a).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.2).setAlpha(0).setDepth(4.2);
      this.windows.push(w);
      // a lamp now and then trimmed, a fire stirred
      scene.tweens.add({ targets: w, scale: { from: 0.18, to: 0.24 }, duration: 600 + r.int(900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: r.int(1000) });
    }
  }

  /** How dark it should be, and the colour of the day's sky. */
  /** Set the light for a time of day: the field's own, or the one passing by on the road. */
  set(f: Field, at: { day: number; part: number; slot?: number } = { day: f.day, part: f.part, slot: f.slot }) {
    const weather = f.weathers[at.day] ?? f.weather;
    const misty = weather === 'mist' && at.part === 0;
    // how long the light lasts depends on the season: see darkness()
    this.target = darkness(f.season, weather, at.part, at.slot ?? 0);
    const grey = weather === 'regen' ? 0.14 : weather === 'sneeuw' ? 0.1 : weather === 'bewolkt' ? 0.05 : misty ? 0.12 : 0;
    this.shade.setFillStyle(misty ? 0xf4f2ea : 0x6a7280, 1);
    this.scene.tweens.add({ targets: this.shade, alpha: grey, duration: 1500 });
    this.tint = weather === 'regen' ? 0x10141f : weather === 'sneeuw' || f.season === 'winter' ? 0x1a2238 : f.season === 'zomer' ? 0x1c1a34 : 0x141a30;
  }

  /**
   * Fade towards the target darkness, and draw it with the lights left in it. The dark with the windows cut out
   * is kept in a second texture and only redrawn when the darkness changes; each frame only the moving lights
   * (you, your lamp, the evening's gathering, things seen) are cut out of a copy of it.
   */
  update(dt: number, lights: { x: number; y: number; r: number }[]) {
    this.dark += (this.target - this.dark) * Math.min(1, dt * 0.8);
    if (this.dark < 0.01) {
      if (this.drawn !== 0) this.clear();
      return;
    }
    if (Math.abs(this.dark - this.drawn) > 0.008) {
      this.drawn = this.dark;
      const base = this.base;
      base.clear();
      base.fill(this.tint, this.dark);
      const k = Math.min(1, this.dark / 0.62);
      for (const w of this.windows) {
        w.setAlpha(k * 0.85);
        this.stamp.setScale(26 / 24);
        base.erase(this.stamp, w.x, w.y + 6);
      }
    }
    const key = lights.map((l) => `${Math.round(l.x / 3)},${Math.round(l.y / 3)},${Math.round(l.r)}`).join('|') + this.drawn.toFixed(3);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const rt = this.rt;
    rt.clear();
    rt.draw(this.base, 0, 0);
    for (const l of lights) this.erase(l.x, l.y, l.r);
  }

  private base!: Phaser.GameObjects.RenderTexture;
  private drawn = 0;
  private lastKey = '';

  private clear() {
    this.drawn = 0;
    this.lastKey = '';
    this.rt.clear();
    this.base.clear();
    for (const w of this.windows) w.setAlpha(0);
  }

  private erase(x: number, y: number, r: number) {
    this.stamp.setScale(r / 24);
    this.rt.erase(this.stamp, x, y);
  }

  get isDark() {
    return this.dark > 0.1;
  }
}

// ------------------------------------------------------------------ what is seen at night

interface Spirit {
  site: number;
  c: Phaser.GameObjects.Container;
  showing: boolean;
  next: number;
}

/** Things seen at night or in the mist at the places tales are tied to. Tap one to look closer. */
export class Spirits {
  private all: Spirit[] = [];
  private figures: { o: Phaser.GameObjects.Image; kind: SpiritKind; off: number; speed: number }[] = [];
  constructor(private scene: Phaser.Scene, f: Field, onLook: (site: number) => void) {
    const r = new Rng(f.sim.seed + 61);
    makeSpiritTextures(scene);
    for (const s of f.land.sites) {
      const a = APPARITION[s.kind];
      if (!a) continue;
      const x = px(s.x), y = px(s.y) - 6;
      const c = scene.add.container(x, y).setDepth(4.8).setAlpha(0);
      const parts: Phaser.GameObjects.GameObject[] = [];
      // one drawn figure, with its frames played at its own pace
      const fig = (kind: SpiritKind, x: number, y: number, scale: number, alpha = 1) => {
        const o = scene.add.image(x, y, `sp-${kind}`, '0').setOrigin(0.5, 58 / SPIRIT_BOX).setScale(scale / RES).setAlpha(alpha);
        this.figures.push({ o, kind, off: r.int(SPIRIT_FRAMES), speed: kind === 'dwaallicht' ? 9 : kind === 'heks' ? 8 : 5 });
        parts.push(o);
        return o;
      };
      if (s.kind === 'veen') for (let k = 0; k < 4; k++) {
        const o = fig('dwaallicht', r.range(-30, 30), r.range(-2, 18), r.range(0.5, 0.66));
        scene.tweens.add({ targets: o, x: o.x + r.range(-22, 22), y: o.y + r.range(-12, 8), duration: 1800 + r.int(1600), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: o, alpha: { from: 1, to: 0.35 }, duration: 500 + r.int(700), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (s.kind === 'heide') {
        // three white women, drifting slowly apart and together
        for (let k = 0; k < 3; k++) {
          const o = fig('wief', -22 + k * 22, 4 - (k % 2) * 7, 0.62 - (k % 2) * 0.06, 0.92);
          o.setFlipX(k === 2);
          scene.tweens.add({ targets: o, y: o.y - 4, x: o.x + (k - 1) * 4, duration: 2400 + k * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
      } else if (s.kind === 'galg') {
        const o = fig('spook', 6, 2, 0.62, 0.95);
        scene.tweens.add({ targets: o, y: o.y - 6, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (s.kind === 'bos') {
        const o = fig('hond', -4, 10, 0.66);
        o.setFlipX(r.chance(0.5));
      } else if (s.kind === 'water') {
        const o = fig('nikker', 0, 12, 0.6, 0.95);
        scene.tweens.add({ targets: o, y: o.y - 2, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (s.kind === 'kruisweg') {
        fig('duivel', 10, 12, 0.7);
      } else if (s.kind === 'linde') {
        // witches dancing in a ring round a little fire under the tree
        const fire = scene.add.image(0, 8, 'glow').setTint(0xff9a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5);
        scene.tweens.add({ targets: fire, scale: 0.62, alpha: 0.7, duration: 220, yoyo: true, repeat: -1 });
        parts.push(fire);
        const ring: Phaser.GameObjects.Image[] = [];
        for (let k = 0; k < 4; k++) ring.push(fig('heks', 0, 0, 0.56));
        scene.tweens.addCounter({ from: 0, to: Math.PI * 2, duration: 7000, repeat: -1, onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          ring.forEach((o, k) => {
            const a0 = (k / 4) * Math.PI * 2 + t;
            o.setPosition(Math.cos(a0) * 30, 10 + Math.sin(a0) * 10);
            // going round: facing the way she dances, and smaller at the back
            o.setFlipX(Math.sin(a0) < 0);
            o.setScale((0.5 + 0.1 * (Math.sin(a0) + 1) / 2) / RES);
          });
          c.sort('y');
        } });
      }
      c.add(parts);
      c.setSize(70, 60);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerup', () => {
        if (c.alpha > 0.2) onLook(s.id);
      });
      this.all.push({ site: s.id, c, showing: false, next: r.range(500, 4000) });
    }
  }

  /** `at`: the time of day as seen on the road, if travelling */
  update(f: Field, now: number, at?: { day: number; part: number }) {
    // play the frames of whatever is showing
    for (const fg of this.figures) {
      if (!fg.o.parentContainer || fg.o.parentContainer.alpha <= 0.01) continue;
      fg.o.setFrame(String((fg.off + Math.floor((now / 1000) * fg.speed)) % SPIRIT_FRAMES));
    }
    for (const sp of this.all) {
      const can = f.canSee(sp.site, at);
      if (!can) {
        if (sp.showing || sp.c.alpha > 0) {
          sp.showing = false;
          this.scene.tweens.add({ targets: sp.c, alpha: 0, duration: 800 });
        }
        continue;
      }
      // on the first evening, what she brought you out to see stays until you have looked
      const shown = f.prologue?.step === 'kijken' && f.prologue.site === sp.site;
      if (now < sp.next || (shown && sp.showing)) continue;
      sp.showing = shown || !sp.showing;
      this.scene.tweens.add({ targets: sp.c, alpha: sp.showing ? 0.95 : 0, duration: 1200 });
      // on All Hallows' Eve they linger, and come back sooner
      const hallows = feest() === 'halloween';
      sp.next = now + (sp.showing ? (hallows ? 9000 : 3500) + Math.random() * 2500 : (hallows ? 800 : 2500) + Math.random() * (hallows ? 1500 : 5000));
    }
  }

  /** Light from the visible ones, for the night layer. */
  lights(): { x: number; y: number; r: number }[] {
    return this.all.filter((s) => s.c.alpha > 0.1).map((s) => ({ x: s.c.x, y: s.c.y, r: 28 * s.c.alpha }));
  }

  /** Distance in tiles from the collector, to tell whether something is close enough to see. */
  static near(f: Field, site: number, tiles = 12): boolean {
    const s = f.land.sites[site];
    const [x, y] = f.tileOf(f.at);
    return Math.hypot(s.x - x, s.y - y) <= tiles;
  }
}

// ------------------------------------------------------------------ ink

/** A splash of red ink where something was written down; a finer, golden one for a find. */
export function splash(scene: Phaser.Scene, x: number, y: number, find: boolean) {
  const e = scene.add.particles(x, y, 'glow', {
    speed: { min: 40, max: find ? 130 : 90 }, scale: { start: 0.13, end: 0 }, tint: find ? [0xa8321f, 0xd9a441] : 0xa8321f,
    lifespan: find ? 900 : 600, quantity: find ? 18 : 9, emitting: false,
  }).setDepth(8);
  e.explode(find ? 18 : 9);
  const ring = scene.add.circle(x, y, 6).setStrokeStyle(2, find ? 0xd9a441 : 0xa8321f, 0.9).setDepth(8);
  scene.tweens.add({ targets: ring, radius: find ? 46 : 26, alpha: 0, duration: find ? 1100 : 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  if (find) {
    const g = scene.add.image(x, y, 'glow').setTint(0xffd36a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setDepth(7.9);
    scene.tweens.add({ targets: g, scale: 2.6, alpha: 0, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }
  scene.time.delayedCall(1500, () => e.destroy());
}

// ------------------------------------------------------------------ the weather, over everything

/** Rain, falling leaves and drifting mist, in screen space over the map. */
export class WeatherScene extends Phaser.Scene {
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private mist!: Phaser.GameObjects.Particles.ParticleEmitter;
  private snow!: Phaser.GameObjects.Particles.ParticleEmitter;
  private petals!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'weather', active: true });
  }

  create() {
    makeAtmosphereTextures(this);
    const W = () => this.scale.width, H = () => this.scale.height;
    this.rain = this.add.particles(0, 0, 'drop', {
      x: { onEmit: () => Phaser.Math.Between(-60, W() + 120) }, y: -24,
      speedY: { min: 620, max: 820 }, speedX: { min: -150, max: -110 }, lifespan: { onEmit: () => (H() + 40) / 700 * 1000 },
      alpha: { start: 0.75, end: 0.5 }, scale: { min: 0.8, max: 1.25 }, quantity: 4, frequency: 16, emitting: false,
    });
    this.leaves = this.add.particles(0, 0, 'leaf', {
      x: { onEmit: () => Phaser.Math.Between(-20, W()) }, y: -16,
      speedY: { min: 22, max: 50 }, speedX: { min: 8, max: 55 }, lifespan: { onEmit: () => (H() + 40) / 30 * 1000 },
      rotate: { start: 0, end: 540 }, scale: { min: 0.55, max: 0.95 }, alpha: 0.9,
      tint: [0xb5652a, 0xd09a3a, 0x8a5a2a, 0xc0802a, 0x9a6a3a], frequency: 900, quantity: 1,
    });
    // snow drifts down slowly, swaying
    this.snow = this.add.particles(0, 0, 'flake', {
      x: { onEmit: () => Phaser.Math.Between(-60, W() + 60) }, y: -12,
      speedY: { min: 36, max: 80 }, speedX: { min: -24, max: 12 }, lifespan: { onEmit: () => (H() + 30) / 50 * 1000 },
      scale: { min: 0.35, max: 1 }, alpha: { min: 0.75, max: 1 }, frequency: 40, quantity: 1, emitting: false,
    });
    // blossom in spring, thistledown in summer
    this.petals = this.add.particles(0, 0, 'petal', {
      x: { onEmit: () => Phaser.Math.Between(-20, W()) }, y: -10,
      speedY: { min: 16, max: 36 }, speedX: { min: 10, max: 45 }, lifespan: { onEmit: () => (H() + 40) / 22 * 1000 },
      rotate: { start: 0, end: 360 }, scale: { min: 0.6, max: 1.1 }, alpha: 0.95,
      tint: { onEmit: () => (G.field?.season === 'zomer' ? 0xfaf6ea : Phaser.Utils.Array.GetRandom([0xffffff, 0xf6dde2, 0xf0c8d2, 0xfff4f4])) },
      frequency: 700, quantity: 1, emitting: false,
    });
    this.mist = this.add.particles(0, 0, 'glow', {
      x: { onEmit: () => Phaser.Math.Between(-200, W()) }, y: { onEmit: () => Phaser.Math.Between(0, H()) },
      speedX: { min: 6, max: 18 }, lifespan: 12000, scale: { min: 5, max: 8 }, alpha: { start: 0.16, end: 0 },
      tint: 0xf4f2ea, frequency: 380, emitting: false,
    });
    const sync = () => this.sync();
    G.on('changed', sync);
    G.on('arrived', sync);
    this.sync();
  }

  private sync() {
    const f = G.field;
    if (!f) return;
    const wet = f.weather === 'regen';
    const on = (e: Phaser.GameObjects.Particles.ParticleEmitter, yes: boolean) => {
      if (yes && !e.emitting) e.start();
      if (!yes && e.emitting) e.stop();
    };
    on(this.rain, wet);
    // falling snow on a snowy day, a few flakes on a grey winter one
    // at Christmas there is always a little snow in the air
    const christmas = feest() === 'kerst';
    on(this.snow, f.weather === 'sneeuw' || (f.season === 'winter' && f.weather === 'bewolkt') || (christmas && !wet));
    this.snow.frequency = f.weather === 'sneeuw' ? 40 : christmas ? 160 : 420;
    // leaves in autumn, blossom in spring, thistledown on a summer day
    on(this.leaves, f.season === 'herfst');
    on(this.petals, (f.season === 'lente' || f.season === 'zomer') && !wet);
    this.petals.frequency = f.season === 'lente' ? 700 : 1800;
    // more leaves on a windy grey day, few in the rain
    this.leaves.frequency = wet ? 2200 : f.weather === 'helder' ? 1100 : 650;
    if (f.misty && !this.mist.emitting) this.mist.start();
    if (!f.misty && this.mist.emitting) this.mist.stop();
  }
}

