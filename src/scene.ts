// The field map in Phaser: the composed sheet, the layer of names and pencil, the collector on the road,
// the life of the land (mills, smoke, birds, cattle, a dog), the light of the day, and the camera.
import Phaser from 'phaser';
import { G } from './game';
import { durationText, type Where } from './field';
import {
  RES, SH, SW, addKnown, compose, composeRect, knownAt, knownMask, px, renderNotes, renderSheet, sheets, type Features,
} from './sheet';
import { ANIMALS, BOX, IDLE_FRAMES, RIDE_FRAMES, drawAnimal, drawOldCollector, drawRider, drawVehicle, drawWalker, type AnimalKind } from './rider';
import { Night, Spirits, WeatherScene, makeAtmosphereTextures, splash } from './atmosphere';
import { TILE, W, idx, placeRoadTile, roadPath } from './world';
import { Rng } from './rng';
import { SINT_FRAMES, drawBat, drawPumpkin, drawSint, drawStar, feest } from './feest';
import { sfx } from './sound';
import { L } from './i18n';

/** How fast each kind of traveller goes, in sheet pixels per second, and how far one frame of the cycle carries. */
const PACE: Record<string, { speed: number; step: number; scale: number }> = {
  fiets: { speed: 105, step: 3.6, scale: 0.78 },
  voet: { speed: 52, step: 2.4, scale: 0.78 },
  auto: { speed: 165, step: 3.2, scale: 0.85 },
  rijtuig: { speed: 85, step: 3.3, scale: 0.85 },
};

interface Journey {
  pts: [number, number][];     // smoothed path
  len: number[];               // arc length at each point
  dist: number;                // travelled so far
  speed: number;
  fast: boolean;
  reveal: { at: number; k: number }[];  // arc length at which each new known point shows
  trailFrom: number;           // index in the field trail where this journey starts
  dogs: { at: number; done: boolean }[];
  lastPuff: number;
  facing: number;
  /** a meeting on the road: where, and until when the traveller stands still */
  meetAt: number | null;
  pauseUntil: number;
  /** where the road begins and ends along the path: off it, the collector goes on foot */
  roadFrom: number;
  roadTo: number;
  /** walked all the way, on the first evening: at the pace of the ride, so it takes no longer to watch */
  walked: boolean;
}

interface Beast {
  img: Phaser.GameObjects.Image;
  kind: AnimalKind;
  home: [number, number];
  moving: boolean;
}

export class MapScene extends Phaser.Scene {
  private sheetTex!: Phaser.Textures.CanvasTexture;
  private notesTex!: Phaser.Textures.CanvasTexture;
  private sepia!: HTMLCanvasElement;
  private colour!: HTMLCanvasElement;
  private mask!: HTMLCanvasElement;
  private tmp = document.createElement('canvas');
  private knownShown = 0;
  private features: Features = { chimneys: [], mills: [], windows: [] };
  private rider!: Phaser.GameObjects.Image;
  private pace = PACE.fiets;
  private journey: Journey | null = null;
  private trailG!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Arc;
  private ring!: Phaser.GameObjects.Graphics;
  private sails: Phaser.GameObjects.Image[] = [];
  private beasts: Beast[] = [];
  private idleT = 0;
  private dragging: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  private pinch: { d: number; mx: number; my: number } | null = null;
  private minZoom = 0.4;
  private overviewZoom = 0.5;
  private camTween: Phaser.Tweens.Tween | null = null;
  private rng = new Rng(77);
  /** the zoom the wheel is easing towards, and the screen point it zooms about */
  private wheelZoom: number | null = null;
  private wheelAt: [number, number] = [0, 0];
  private night!: Night;
  /** the vehicle left at the end of the road while the collector is on foot */
  private parked: Phaser.GameObjects.Image | null = null;
  private dawnCall: Phaser.Time.TimerEvent | null = null;
  /** feast days: lights by the doors and over the churches, and the saint on his horse */
  private feastLights: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; r: number }[] = [];
  private sint: Phaser.GameObjects.Image | null = null;
  private onFoot = false;
  private spirits!: Spirits;
  private lamp!: Phaser.GameObjects.Image;
  private rival: Phaser.GameObjects.Image | null = null;
  private rivalLabel: Phaser.GameObjects.Text | null = null;
  private rivalAt = -1;
  private rivalTween: Phaser.Tweens.Tween | null = null;
  /** the old collector at your side on the first evening, and how far she has walked */
  private mentor: Phaser.GameObjects.Image | null = null;
  private mentorWalked = 0;

  constructor() {
    super('map');
  }

  create() {
    const f = G.field;
    const title = { region: f.sim.corpus.meta.regions[f.region].name, year: f.year, season: f.season };
    this.sepia = renderSheet(f.land, f.sim.seed, 0, title);
    this.colour = renderSheet(f.land, f.sim.seed, 1, title, this.features);
    sheets.sepia = this.sepia;
    sheets.colour = this.colour;
    this.mask = document.createElement('canvas');
    this.sheetTex = this.textures.createCanvas('sheet', this.sepia.width, this.sepia.height)!;
    this.add.image(0, 0, 'sheet').setOrigin(0).setScale(1 / RES);
    this.notesTex = this.textures.createCanvas('notes', this.sepia.width, this.sepia.height)!;
    this.add.image(0, 0, 'notes').setOrigin(0).setScale(1 / RES).setDepth(5);
    this.trailG = this.add.graphics().setDepth(5.5);

    this.glow = this.add.circle(0, 0, 70, 0xf2c45a, 0).setDepth(4.5).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: this.glow, scale: 1.12, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.ring = this.add.graphics().setDepth(6);

    this.pace = PACE[f.persona.travel] ?? PACE.fiets;
    this.makeTextures(f.persona.travel);
    makeAtmosphereTextures(this);
    this.night = new Night(this, this.features);
    this.spirits = new Spirits(this, f, (site) => {
      if (Spirits.near(G.field, site)) G.emit('apparition', site);
      else G.emit('hover', { text: L('Te ver weg om te zien wat het is.', 'Too far away to see what it is.'), x: innerWidth / 2 - 100, y: 80 });
    });
    this.lamp = this.add.image(0, 0, 'glow').setTint(0xffe08a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0).setDepth(6.9);
    this.rider = this.add.image(0, 0, 'rider', 'i0').setOrigin(0.47, 58 / BOX).setScale(this.pace.scale / RES).setDepth(7);
    this.placeRider();
    if (f.practising) this.mentor = this.add.image(this.rider.x - 17, this.rider.y + 2, 'mentor', 'i0').setOrigin(0.47, 58 / BOX)
      .setScale(PACE.voet.scale / RES).setDepth(7.05);
    this.makeLife();

    this.knownShown = f.known.length;
    knownMask(f.known, this.mask);
    compose(this.sheetTex.getContext(), this.sepia, this.colour, this.mask, this.tmp);
    this.sheetTex.refresh();
    this.redraw();
    G.on('changed', () => this.redraw());
    G.on('walk', (tiles) => this.walk(tiles));
    G.on('teleport', () => {
      this.journey = null;
      this.parked?.destroy();
      this.parked = null;
      this.onFoot = false;
      this.rider.setTexture('rider', 'i0').setScale(this.pace.scale / RES);
      this.placeRider();
      this.revealUpTo(G.field.known.length);
      this.goToCollector(600);
    });
    G.on('focus', ({ x, y }) => this.lookAt(px(x), px(y), Math.max(this.cameras.main.zoom, 1), 700));
    G.on('overview', (on) => (on ? this.lookAt(SW / 2, SH / 2, this.overviewZoom, 700) : this.goToCollector(700)));
    G.on('inked', (list) => list.forEach((d, i) => this.time.delayedCall(250 + i * 350, () => {
      const o = d.site !== null ? f.land.sites[d.site] : f.land.places[d.place];
      splash(this, px(o.x), px(o.y) + (d.site !== null ? -34 : -78), d.find);
    })));
    G.on('dawn', () => {
      const cam = this.cameras.main;
      // in step with the veil over the page: dark for a while, then the morning comes slowly back
      cam.fadeOut(1200, 18, 16, 24);
      cam.once('camerafadeoutcomplete', () => {
        this.dawnCall = this.time.delayedCall(1800, () => cam.fadeIn(2800, 18, 16, 24));
      });
    });
    G.on('dawnskip', () => {
      const cam = this.cameras.main;
      cam.off('camerafadeoutcomplete');
      this.dawnCall?.remove();
      this.dawnCall = null;
      cam.resetFX();
      cam.fadeIn(600, 18, 16, 24);
    });
    G.on('hurry', () => {
      if (this.journey) this.journey.fast = true;
    });

    const cam = this.cameras.main;
    cam.setBackgroundColor('#3b3026');
    this.fitZoom();
    this.lookAt(SW / 2, SH / 2, this.overviewZoom, 0);
    this.time.delayedCall(700, () => this.goToCollector(1600));
    this.scale.on('resize', () => this.fitZoom());
    this.setupInput();
  }

  // ------------------------------------------------------------------ textures

  private makeTextures(travel: string) {
    const n = RIDE_FRAMES + IDLE_FRAMES;
    const B = Math.round(BOX * RES);
    const tex = this.textures.createCanvas('rider', B * n, B)!;
    const ctx = tex.getContext();
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(i * B, 0);
      ctx.scale(RES, RES);
      if (i < RIDE_FRAMES) drawRider(ctx, travel, i, null);
      else drawRider(ctx, travel, 0, i - RIDE_FRAMES);
      ctx.restore();
      tex.add(i < RIDE_FRAMES ? `r${i}` : `i${i - RIDE_FRAMES}`, 0, i * B, 0, B, B);
    }
    tex.refresh();

    // the collector on foot, as dressed, and the vehicle left behind (the student has none)
    if (travel !== 'voet') {
      const wk = this.textures.createCanvas('walk', B * n, B)!;
      const wc = wk.getContext();
      for (let i = 0; i < n; i++) {
        wc.save();
        wc.translate(i * B, 0);
        wc.scale(RES, RES);
        if (i < RIDE_FRAMES) drawWalker(wc, travel, i, null);
        else drawWalker(wc, travel, 0, i - RIDE_FRAMES);
        wc.restore();
        wk.add(i < RIDE_FRAMES ? `r${i}` : `i${i - RIDE_FRAMES}`, 0, i * B, 0, B, B);
      }
      wk.refresh();
      const vt = this.textures.createCanvas('vehicle', B * IDLE_FRAMES, B)!;
      const vc = vt.getContext();
      for (let i = 0; i < IDLE_FRAMES; i++) {
        vc.save();
        vc.translate(i * B, 0);
        vc.scale(RES, RES);
        drawVehicle(vc, travel, i);
        vc.restore();
        vt.add(`v${i}`, 0, i * B, 0, B, B);
      }
      vt.refresh();
    }

    for (const kind of ANIMALS) {
      const AW = Math.round(22 * RES), AH = Math.round(15 * RES);
      const t = this.textures.createCanvas(`a-${kind}`, AW * 2, AH)!;
      const c = t.getContext();
      for (let fr = 0; fr < 2; fr++) {
        c.save();
        c.translate(fr * AW, 0);
        c.scale(RES, RES);
        drawAnimal(c, kind, fr);
        c.restore();
        t.add(`${fr}`, 0, fr * AW, 0, AW, AH);
      }
      t.refresh();
    }

    // the old collector of the first evening
    const mt = this.textures.createCanvas('mentor', B * n, B)!;
    const mc = mt.getContext();
    for (let i = 0; i < n; i++) {
      mc.save();
      mc.translate(i * B, 0);
      mc.scale(RES, RES);
      if (i < RIDE_FRAMES) drawOldCollector(mc, i, null);
      else drawOldCollector(mc, 0, i - RIDE_FRAMES);
      mc.restore();
      mt.add(i < RIDE_FRAMES ? `r${i}` : `i${i - RIDE_FRAMES}`, 0, i * B, 0, B, B);
    }
    mt.refresh();

    // the other collector, and a passer-by on the road
    const mk = (key: string, mode: string) => {
      const t = this.textures.createCanvas(key, B * (RIDE_FRAMES + 1), B)!;
      const c = t.getContext();
      for (let i = 0; i <= RIDE_FRAMES; i++) {
        c.save();
        c.translate(i * B, 0);
        c.scale(RES, RES);
        if (i < RIDE_FRAMES) drawRider(c, mode, i, null);
        else drawRider(c, mode, 0, 0);
        c.restore();
        t.add(i < RIDE_FRAMES ? `r${i}` : 'i0', 0, i * B, 0, B, B);
      }
      t.refresh();
    };
    const rivalMode = travel === 'auto' ? 'fiets' : G.field.year >= 1950 ? 'auto' : 'fiets';
    mk('rival', rivalMode);
    mk('passer', 'voet');

    // four sails on a cross, for the mills
    const SS = Math.round(56 * RES);
    const st = this.textures.createCanvas('sails', SS, SS)!;
    const sc = st.getContext();
    sc.scale(RES, RES);
    sc.translate(28, 28);
    sc.strokeStyle = '#2f2419';
    sc.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      sc.rotate(Math.PI / 2);
      sc.fillStyle = '#f1e7cf';
      sc.fillRect(2, -3.2, 23, 6.4);
      sc.strokeRect(2, -3.2, 23, 6.4);
      sc.beginPath();
      for (let k = 6; k < 25; k += 4) { sc.moveTo(k, -3.2); sc.lineTo(k, 3.2); }
      sc.moveTo(0, 0);
      sc.lineTo(26, 0);
      sc.stroke();
    }
    sc.fillStyle = '#2f2419';
    sc.beginPath();
    sc.arc(0, 0, 2, 0, Math.PI * 2);
    sc.fill();
    st.refresh();

    // a soft puff, for smoke and dust
    const pt = this.textures.createCanvas('puff', 32, 32)!;
    const pc = pt.getContext();
    const g = pc.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    pc.fillStyle = g;
    pc.fillRect(0, 0, 32, 32);
    pt.refresh();
  }

  // ------------------------------------------------------------------ the life of the land

  private makeLife() {
    const f = G.field;
    const r = new Rng(f.sim.seed + 31);
    for (const [x, y] of this.features.mills) this.sails.push(this.add.image(x, y, 'sails').setScale(0.9 / RES).setDepth(3));
    // smoke from the chimneys, one puff at a time
    this.time.addEvent({ delay: 260, loop: true, callback: () => this.smoke() });
    // cattle in the meadows near the villages, sheep on the heath
    const land = f.land;
    const rows = land.tiles.length / W;
    for (const p of land.places) {
      for (let k = 0; k < 3; k++) {
        for (let tries = 0; tries < 30; tries++) {
          const x = p.x + Math.round(r.range(-6, 6)), y = p.y + Math.round(r.range(-5, 5));
          if (x < 1 || y < 1 || x >= W - 1 || y >= rows - 1) continue;
          const t = land.tiles[idx(x, y)];
          if (t.t !== 'wei' || t.road || t.b >= 0 || Math.abs(x - p.x) + Math.abs(y - p.y) < 3) continue;
          // the region's own cattle, and now and then a horse or two in the meadow
          const breed = this.breed(r);
          const herd = 1 + r.int(3);
          if (r.chance(0.3)) for (let h = 0; h < 1 + r.int(2); h++) this.beast('paard', px(x) + r.range(-10, 10), px(y) + r.range(-6, 8));
          else for (let h = 0; h < herd; h++) this.beast(breed, px(x) + r.range(-10, 10), px(y) + r.range(-6, 8));
          break;
        }
      }
    }
    // the farmyard: hens and geese by the farms, a pig in its run; a goat by the poor houses and the huts
    for (const b of land.buildings) {
      // in front of the building, where the sheet draws it
      const p = land.places[b.place];
      const spread = b.kind === 'hut' ? 0 : 0.25;
      const bx = px(b.x) + (px(b.x) - px(p.x)) * spread, by = px(b.y) + (px(b.y) - px(p.y)) * spread + 6;
      if (b.kind === 'boerderij') {
        const yard = r.pick<AnimalKind>(['kip', 'kip', 'gans', 'varken']);
        const n = yard === 'varken' ? 1 + r.int(2) : 2 + r.int(3);
        for (let h = 0; h < n; h++) this.beast(yard, bx + r.range(-22, 22), by + r.range(5, 13));
      } else if ((b.kind === 'huis' || b.kind === 'hut') && r.chance(0.12)) {
        this.beast(r.chance(0.6) ? 'geit' : 'kip', bx + r.range(8, 18) * (r.chance(0.5) ? 1 : -1), by + r.range(5, 11));
      }
    }
    // ducks on the water near the villages
    for (const p of land.places) {
      for (let tries = 0; tries < 20; tries++) {
        const x = p.x + Math.round(r.range(-7, 7)), y = p.y + Math.round(r.range(-6, 6));
        if (x < 0 || y < 0 || x >= W || y >= rows || land.tiles[idx(x, y)].t !== 'water') continue;
        for (let h = 0; h < 2 + r.int(3); h++) this.beast('eend', px(x) + r.range(-6, 6), px(y) + r.range(-4, 4));
        break;
      }
    }
    for (const s of land.sites) {
      if (s.kind !== 'heide') continue;
      for (let h = 0; h < 7; h++) this.beast('schaap', px(s.x) + r.range(-40, 40), px(s.y) + r.range(-10, 30));
    }
    for (let i = 0; i < 18; i++) {
      const tIdx = r.int(land.tiles.length);
      if (land.tiles[tIdx].t === 'heide' && !land.tiles[tIdx].road && r.chance(0.5))
        for (let h = 0; h < 3; h++) this.beast('schaap', px(tIdx % W) + r.range(-12, 12), px(Math.floor(tIdx / W)) + r.range(-8, 8));
    }
    this.time.addEvent({ delay: 900, loop: true, callback: () => this.graze() });
    // now and then a flock of birds goes over
    this.time.addEvent({ delay: 9000, loop: true, callback: () => this.rng.chance(0.6) && this.birds() });
    this.time.delayedCall(2500, () => this.birds());
    this.makeFeast();
  }

  // ------------------------------------------------------------------ feast days

  private makeFeast() {
    const day = feest();
    if (!day) return;
    const f = G.field, r = new Rng(f.sim.seed + 1031);
    const tex = (key: string, w: number, h: number, n: number, draw: (c: CanvasRenderingContext2D, i: number) => void) => {
      if (this.textures.exists(key)) return;
      const W2 = Math.round(w * RES), H2 = Math.round(h * RES);
      const t = this.textures.createCanvas(key, W2 * n, H2)!;
      const c = t.getContext();
      for (let i = 0; i < n; i++) {
        c.save();
        c.translate(i * W2, 0);
        c.scale(RES, RES);
        draw(c, i);
        c.restore();
        t.add(String(i), 0, i * W2, 0, W2, H2);
      }
      t.refresh();
    };
    if (day === 'halloween') {
      // a carved pumpkin by many a door, lit after dark
      tex('pompoen', 20, 18, 2, (c, i) => drawPumpkin(c, i === 1));
      tex('vleermuis', 18, 10, 2, (c, i) => drawBat(c, i));
      for (const [x, y] of this.features.windows) {
        if (!r.chance(0.35)) continue;
        const img = this.add.image(x + r.range(9, 15) * (r.chance(0.5) ? 1 : -1), y + 9, 'pompoen', '0').setOrigin(0.5, 1).setScale(0.75 / RES).setDepth(4.3);
        const glow = this.add.image(img.x, img.y - 6, 'glow').setTint(0xff9a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.32).setAlpha(0).setDepth(4.25);
        this.feastLights.push({ img, glow, r: 16 });
      }
      // bats at dusk
      this.time.addEvent({ delay: 6000, loop: true, callback: () => G.field.isDark(G.clock ?? undefined) && this.rng.chance(0.7) && this.bats() });
    } else if (day === 'kerst') {
      // a star over every church
      tex('ster', 16, 16, 1, (c) => drawStar(c));
      for (const b of f.land.buildings) {
        if (b.kind !== 'kerk') continue;
        const p = f.land.places[b.place];
        const x = px(b.x) + (px(b.x) - px(p.x)) * 0.25 + 8 * 1.6, y = px(b.y) + (px(b.y) - px(p.y)) * 0.25 + 6 - 48 * 1.6;
        const img = this.add.image(x, y, 'ster', '0').setScale(1.1 / RES).setDepth(4.3);
        this.tweens.add({ targets: img, scale: 1.25 / RES, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const glow = this.add.image(x, y, 'glow').setTint(0xffe6a0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0).setDepth(4.25);
        this.feastLights.push({ img, glow, r: 40 });
      }
    } else if (day === 'sinterklaas') {
      tex('sint', 64, 64, SINT_FRAMES, (c, i) => drawSint(c, i));
      // now and then, at night, the saint rides over the roofs
      this.time.addEvent({ delay: 4000, loop: true, callback: () => {
        if (!this.sint && G.field.isNight(G.clock ?? undefined) && this.rng.chance(0.3)) this.rideSint();
      } });
    }
  }

  private bats() {
    const view = this.cameras.main.worldView;
    const n = 3 + this.rng.int(4);
    const from = this.rng.chance(0.5) ? -1 : 1;
    const y0 = view.y + this.rng.range(0.15, 0.5) * view.height;
    const x0 = from < 0 ? view.x - 30 : view.right + 30, x1 = from < 0 ? view.right + 40 : view.x - 40;
    for (let i = 0; i < n; i++) {
      const b = this.add.image(x0 - from * i * 14, y0 + this.rng.range(-20, 20), 'vleermuis', '0').setScale(0.9 / RES).setDepth(9);
      let fr = 0;
      const flap = this.time.addEvent({ delay: 110 + this.rng.int(40), loop: true, callback: () => b.setFrame(String(fr++ % 2)) });
      // bats flit: an uneven, swooping line
      this.tweens.add({ targets: b, x: x1 - from * i * 14, duration: 6000 + this.rng.int(2000), ease: 'Linear', onComplete: () => {
        flap.remove();
        b.destroy();
      } });
      this.tweens.add({ targets: b, y: b.y + this.rng.range(-30, 30), duration: 500 + this.rng.int(500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private rideSint() {
    const view = this.cameras.main.worldView;
    const from = this.rng.chance(0.5) ? -1 : 1;
    const y = view.y + this.rng.range(0.18, 0.4) * view.height;
    const x0 = from < 0 ? view.x - 60 : view.right + 60, x1 = from < 0 ? view.right + 60 : view.x - 60;
    const s = this.add.image(x0, y, 'sint', '0').setScale(1.5 / RES).setDepth(9).setFlipX(from > 0);
    const glow = this.add.image(x0, y, 'glow').setTint(0xfff0c0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.5).setDepth(8.9);
    this.sint = s;
    let fr = 0;
    const gallop = this.time.addEvent({ delay: 90, loop: true, callback: () => {
      s.setFrame(String(fr++ % SINT_FRAMES));
      // a trail of sparks behind the horse
      if (fr % 2) {
        const p = this.add.image(s.x + from * 22, s.y + 8, 'glow').setTint(0xffd77a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.08).setDepth(8.9);
        this.tweens.add({ targets: p, y: p.y + 14, alpha: 0, scale: 0.02, duration: 900, onComplete: () => p.destroy() });
      }
    } });
    this.tweens.add({ targets: [s, glow], x: x1, duration: 9000, ease: 'Linear', onComplete: () => {
      gallop.remove();
      s.destroy();
      glow.destroy();
      this.sint = null;
    } });
    this.tweens.add({ targets: [s, glow], y: y - 10, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** The cattle of the region: black and white in Friesland, red and white in the east and south, blaarkoppen among them in Brabant and Flanders. */
  private breed(r: Rng): AnimalKind {
    const region = G.field.region;
    if (region === 'friesland') return 'koe';
    if (region === 'brabant' || region === 'oostvl' || region === 'westvl') return r.pick<AnimalKind>(['roodbont', 'blaarkop', 'koe']);
    return r.chance(0.75) ? 'roodbont' : 'koe';
  }

  private beast(kind: AnimalKind, x: number, y: number) {
    // in winter the cattle and the pigs are in the stable, the ducks gone from the frozen water; a few sheep and hens stay out
    const stabled = kind === 'koe' || kind === 'roodbont' || kind === 'blaarkop' || kind === 'paard' || kind === 'varken' || kind === 'eend' || kind === 'geit';
    if (G.field.season === 'winter' && (stabled || this.rng.chance(0.6))) return;
    const scale = { paard: 0.85, koe: 0.75, roodbont: 0.75, blaarkop: 0.75, kip: 0.8, gans: 0.85, eend: 0.8 }[kind as string] ?? 0.7;
    const img = this.add.image(x, y, `a-${kind}`, '0').setOrigin(0.5, 0.9).setScale(scale / RES).setDepth(3);
    img.setFlipX(this.rng.chance(0.5));
    this.beasts.push({ img, kind, home: [x, y], moving: false });
  }

  private graze() {
    for (const b of this.beasts) {
      const small = b.kind === 'kip' || b.kind === 'gans' || b.kind === 'eend';
      if (b.moving) continue;
      // hens peck: head down, head up
      if (b.kind === 'kip' && this.rng.chance(0.3)) b.img.setFrame(b.img.frame.name === '0' ? '1' : '0');
      if (!this.rng.chance(small ? 0.12 : 0.08)) continue;
      const reach = small ? 8 : 14;
      const tx = b.home[0] + this.rng.range(-reach, reach), ty = b.home[1] + this.rng.range(-reach * 0.6, reach * 0.6);
      const d = Math.hypot(tx - b.img.x, ty - b.img.y);
      b.moving = true;
      b.img.setFlipX(tx < b.img.x);
      let fr = 0;
      const step = this.time.addEvent({ delay: 260, loop: true, callback: () => b.img.setFrame(`${fr++ % 2}`) });
      this.tweens.add({
        targets: b.img, x: tx, y: ty, duration: d * 160, ease: 'Linear',
        onComplete: () => {
          step.remove();
          b.img.setFrame('0');
          b.moving = false;
        },
      });
    }
  }

  private smoke() {
    const view = this.cameras.main.worldView;
    const f = G.field;
    for (const [x, y] of this.features.chimneys) {
      if (!view.contains(x, y) || !this.rng.chance(0.09)) continue;
      const k = knownAt(f.known, (x - px(0)) / TILE, (y - px(0)) / TILE);
      const p = this.add.image(x, y, 'puff').setTint(0x6b6258).setAlpha(0).setScale(0.12).setDepth(3.5);
      this.tweens.add({
        targets: p, y: y - 22, x: x + this.rng.range(3, 9), scale: 0.45, duration: 2800, ease: 'Sine.easeOut',
        onUpdate: (tw) => p.setAlpha((0.22 + 0.2 * k) * Math.sin(Math.PI * tw.progress)),
        onComplete: () => p.destroy(),
      });
    }
  }

  private birds() {
    const view = this.cameras.main.worldView;
    const n = 4 + this.rng.int(5);
    const from = this.rng.chance(0.5) ? -1 : 1;
    const y0 = view.y + this.rng.range(0.15, 0.6) * view.height;
    const x0 = from < 0 ? view.x - 40 : view.right + 40;
    const x1 = from < 0 ? view.right + 60 : view.x - 60;
    const y1 = y0 + this.rng.range(-0.25, 0.25) * view.height;
    const dur = Math.max(9000, Math.abs(x1 - x0) * 22);
    for (let i = 0; i < n; i++) {
      const g = this.add.graphics().setDepth(9);
      const dx = -from * (i * 9 + this.rng.range(-3, 3)), dy = (i % 2 ? 1 : -1) * i * 4;
      g.lineStyle(1.2, 0x2f2419, 0.8);
      g.beginPath();
      g.moveTo(-4, -1.5);
      g.lineTo(0, 0.8);
      g.lineTo(4, -1.5);
      g.strokePath();
      g.setPosition(x0 + dx, y0 + dy);
      this.tweens.add({ targets: g, scaleY: 0.3, duration: 180 + this.rng.int(80), yoyo: true, repeat: -1 });
      this.tweens.add({ targets: g, x: x1 + dx, y: y1 + dy, duration: dur, ease: 'Linear', onComplete: () => g.destroy() });
    }
  }

  // ------------------------------------------------------------------ drawing

  private redraw() {
    const f = G.field;
    // while on the road the colour comes in as the road is travelled
    if (!this.journey && !G.walking && f.known.length !== this.knownShown) this.revealUpTo(f.known.length);
    renderNotes(this.notesTex.getContext(), f, this.journey ? this.journey.trailFrom + 1 : Infinity);
    this.notesTex.refresh();
    // the dark comes with the evening; the night layer does the rest
    this.night.set(f, G.clock ?? undefined);
    const ev = f.evening;
    const lit = !ev.attended && f.day === ev.day && !f.over;
    const p = f.land.places[ev.place];
    this.glow.setPosition(px(p.x), px(p.y) - 6);
    this.tweens.add({ targets: this.glow, fillAlpha: lit ? (f.part === 2 ? 0.32 : 0.14) : 0, duration: 900 });
    for (const b of this.beasts) b.img.setAlpha(0.6 + 0.4 * knownAt(f.known, (b.home[0] - px(0)) / TILE, (b.home[1] - px(0)) / TILE));
    this.syncRival();
    // the neighbours' evening, once known, glows like the inn's
    const bu = f.occasions.find((o) => o.kind === 'buurten' && o.known && !o.attended && o.day === f.day);
    if (bu && !lit) {
      const q = f.land.places[bu.place];
      this.glow.setPosition(px(q.x), px(q.y) - 6);
      this.tweens.add({ targets: this.glow, fillAlpha: f.part === 2 ? 0.28 : 0.12, duration: 900 });
    }
  }

  private revealUpTo(n: number) {
    const f = G.field;
    const ctx = this.sheetTex.getContext();
    for (; this.knownShown < n; this.knownShown++) {
      const rect = addKnown(this.mask, f.known[this.knownShown]);
      composeRect(ctx, this.sepia, this.colour, this.mask, this.tmp, rect);
    }
    this.sheetTex.refresh();
  }

  private placeRider() {
    const f = G.field;
    const [x, y] = f.tileOf(f.at);
    this.rider.setPosition(px(x) + 20, px(y) + 12);
  }

  // ------------------------------------------------------------------ the journey

  /** Set out along the tiles: smooth the staircase of tiles into the curve of the road, then ride it. */
  private walk(tiles: number[]) {
    const f = G.field;
    G.walking = true;
    const raw: [number, number][] = [[this.rider.x, this.rider.y], ...tiles.map((i) => [px(i % W), px(Math.floor(i / W))] as [number, number])];
    const [ex, ey] = f.tileOf(f.at);
    raw.push([px(ex) + 20, px(ey) + 12]);
    let pts = raw;
    for (let k = 0; k < 3; k++) {
      const out: [number, number][] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = len[len.length - 1];
    // where along the way each raw tile lies, to time the colour and the dogs
    const rawLen = [0];
    for (let i = 1; i < raw.length; i++) rawLen.push(rawLen[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const scaleL = total / Math.max(1, rawLen[rawLen.length - 1]);
    const added = Math.ceil(tiles.length / 3) + 1;
    const k0 = f.known.length - added;
    const reveal = Array.from({ length: added }, (_, j) => ({
      at: j < added - 1 ? rawLen[Math.min(rawLen.length - 1, j * 3 + 1)] * scaleL : total * 0.9,
      k: k0 + j,
    }));
    // a dog runs out at every village on the way, except where you set out and where you arrive
    const dogs: Journey['dogs'] = [];
    for (const p of f.land.places) {
      let best = -1, bd = Infinity;
      tiles.forEach((t, i) => {
        const d = Math.hypot((t % W) - p.x, Math.floor(t / W) - p.y);
        if (d < bd) { bd = d; best = i; }
      });
      if (bd < 2.5 && best > 3 && best < tiles.length - 4) dogs.push({ at: rawLen[best + 1] * scaleL, done: false });
    }
    // long journeys go a little quicker, so no ride lasts much over ten seconds
    const speed = Math.max(f.departed?.walked ? PACE.voet.speed * 1.4 : this.pace.speed, total / 10);
    const meetAt = f.encounter ? rawLen[Math.min(rawLen.length - 1, f.encounter.at + 1)] * scaleL : null;
    // the stretch on the road: before it and after it, the collector walks (the vehicle waits at the road's end)
    const d = f.departed;
    const footStart = f.persona.travel === 'voet' ? 0 : d?.footStart ?? 0;
    const footEnd = f.persona.travel === 'voet' ? 0 : d?.footEnd ?? 0;
    // on the first evening the whole way is walked, and the vehicle stays at the lodgings
    const roadFrom = d?.walked ? total + 1 : footStart > 0 ? rawLen[Math.min(rawLen.length - 1, footStart + 1)] * scaleL : -1;
    const roadTo = footEnd > 0 ? rawLen[Math.max(0, tiles.length - footEnd)] * scaleL : total + 1;
    this.journey = { pts, len, dist: 0, speed, fast: false, reveal, trailFrom: f.trail.length - tiles.length, dogs, lastPuff: 0, facing: 1, meetAt, pauseUntil: 0, roadFrom, roadTo, walked: !!d?.walked };
    this.redraw();
    if (this.cameras.main.zoom < 1.3) this.zoomTo(1.5, 900);
    sfx('click');
  }

  private zoomTo(z: number, duration: number) {
    const from = this.cameras.main.zoom;
    this.tweens.addCounter({ from: 0, to: 1, duration, ease: 'Sine.easeInOut', onUpdate: (tw) => this.cameras.main.setZoom(from + (z - from) * (tw.getValue() ?? 1)) });
  }

  /** The time of day on the road: it moves on as the distance is covered, a part of the day at a time. */
  private setClock(c: { day: number; part: number; slot?: number } | null) {
    const was = G.clock;
    if (was === c || (was && c && was.day === c.day && was.part === c.part && was.slot === c.slot)) return;
    G.clock = c;
    this.night.set(G.field, c ?? undefined);
    G.emit('clock', c);
  }

  private roadClock(j: Journey) {
    const d = G.field.departed;
    if (!d) return;
    // in stretches of two hours, six to a day
    const done = Math.min(d.parts, Math.floor((j.dist / Math.max(1, j.len[j.len.length - 1])) * d.parts + 0.15));
    const abs = (d.day * 3 + d.part) * 2 + d.slot + done;
    this.setClock({ day: Math.floor(abs / 6), part: Math.floor(abs / 2) % 3, slot: abs % 2 });
  }

  private travelStep(dt: number) {
    const j = this.journey!;
    this.roadClock(j);
    // standing still to talk with someone met on the road
    if (this.time.now < j.pauseUntil) return;
    if (j.meetAt !== null && j.dist >= j.meetAt) {
      j.meetAt = null;
      this.meet();
      return;
    }
    // on foot or on the road: leave the vehicle at the end of the road, or take it up again
    const walking = j.dist < j.roadFrom || j.dist > j.roadTo;
    if (walking !== this.onFoot) this.setOnFoot(walking, j.facing);
    const v = (walking && !j.walked ? Math.min(j.speed, PACE.voet.speed * 1.4) : j.speed) * (j.fast ? 4 : 1);
    const end = j.len[j.len.length - 1];
    j.dist = Math.min(end, j.dist + v * dt);
    // position along the smoothed path
    let i = 1;
    while (i < j.len.length - 1 && j.len[i] < j.dist) i++;
    const a = j.pts[i - 1], b = j.pts[i];
    const t = (j.dist - j.len[i - 1]) / Math.max(0.001, j.len[i] - j.len[i - 1]);
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dx) > 0.4) j.facing = dx < 0 ? -1 : 1;
    this.rider.setPosition(x, y);
    this.rider.setFlipX(j.facing < 0);
    // wheels and legs turn with the ground covered
    this.rider.setFrame(`r${Math.floor(j.dist / (this.onFoot ? PACE.voet.step : this.pace.step)) % RIDE_FRAMES}`);
    // a little tilt on the slopes of the road
    this.rider.setRotation(Phaser.Math.Clamp(Math.atan2(dy, Math.abs(dx) + 0.001) * 0.12 * j.facing, -0.12, 0.12));
    this.drawTrail(i, x, y);
    // colour comes in as you pass
    const due = j.reveal.filter((r) => r.at <= j.dist && r.k >= this.knownShown);
    if (due.length) this.revealUpTo(Math.max(...due.map((r) => r.k)) + 1);
    // dust behind the wheels, exhaust from the car
    const now = this.time.now;
    if (!this.onFoot && now - j.lastPuff > (G.field.persona.travel === 'voet' ? 420 : 110)) {
      j.lastPuff = now;
      this.puff(x - j.facing * 14 * this.pace.scale, y - 1, G.field.persona.travel);
    }
    for (const d of j.dogs) if (!d.done && j.dist >= d.at) {
      d.done = true;
      this.dog(x, y, j.facing);
    }
    // the camera keeps the traveller in view, gently
    if (!this.dragging && !this.camTween) {
      const cam = this.cameras.main;
      const c = this.freeCentre();
      const mid = cam.getWorldPoint(c.x, c.y);
      const k = Math.min(1, dt * 2.5);
      this.centreOn(mid.x + (x - mid.x) * k, mid.y + (y - mid.y) * k, cam.zoom);
    }
    if (j.dist >= end) this.arrive();
  }

  /** The road taken so far, in red dashes measured along the path. */
  private drawTrail(upto: number, x: number, y: number) {
    const j = this.journey!;
    const g = this.trailG;
    g.clear();
    g.lineStyle(1.8, 0xa8321f, 0.85);
    let on = true, left = 2;
    for (let i = 1; i <= upto; i++) {
      let [ax, ay] = j.pts[i - 1];
      const [bx, by] = i === upto ? [x, y] : j.pts[i];
      let seg = Math.hypot(bx - ax, by - ay);
      while (seg > 0.01) {
        const s = Math.min(seg, left);
        const nx = ax + ((bx - ax) * s) / seg, ny = ay + ((by - ay) * s) / seg;
        if (on) g.lineBetween(ax, ay, nx, ny);
        ax = nx;
        ay = ny;
        seg -= s;
        left -= s;
        if (left <= 0.01) {
          on = !on;
          left = on ? 2 : 4;
        }
      }
    }
  }

  private puff(x: number, y: number, travel: string) {
    const exhaust = travel === 'auto';
    const p = this.add.image(x, y, 'puff').setTint(exhaust ? 0x8a8a8a : 0xc9b48a).setAlpha(0.5).setScale(exhaust ? 0.18 : 0.12).setDepth(6.8);
    this.tweens.add({
      targets: p, alpha: 0, scale: exhaust ? 0.5 : 0.32, y: y - (exhaust ? 8 : 4), x: x + this.rng.range(-3, 3), duration: exhaust ? 900 : 600,
      onComplete: () => p.destroy(),
    });
  }

  /** Someone on the road: they walk up, the two stop to talk for a moment, and go their ways. */
  private meet() {
    const j = this.journey!;
    const x = this.rider.x, y = this.rider.y;
    j.pauseUntil = this.time.now + (j.fast ? 700 : 2400);
    this.rider.setFrame('r0');
    const p = this.add.image(x + j.facing * 30, y + 2, 'passer', 'i0').setOrigin(0.47, 58 / BOX).setScale(0.74 / RES).setDepth(6.95)
      .setFlipX(j.facing > 0).setTint(0xb08a6a).setAlpha(0);
    this.tweens.add({ targets: p, alpha: 1, x: x + j.facing * 22, duration: 400 });
    const talk = this.add.text(x + j.facing * 11, y - 46, '…', {
      fontFamily: '"IM Fell English", serif', fontStyle: 'italic', fontSize: '15px', color: '#3e3e48', resolution: 3,
    }).setOrigin(0.5).setDepth(9).setAlpha(0);
    this.tweens.add({ targets: talk, alpha: 1, y: y - 50, duration: 500, delay: 300, yoyo: true, hold: 900 });
    this.time.delayedCall(j.fast ? 700 : 2400, () => {
      this.tweens.add({ targets: p, alpha: 0, x: p.x - j.facing * 30, duration: 900, onComplete: () => p.destroy() });
      talk.destroy();
    });
  }

  /** The other collector, going about the region in a grey coat. */
  private syncRival() {
    const f = G.field;
    const rv = f.rival;
    if (!rv) return;
    const pos = (id: number) => [px(f.land.places[id].x) - 26, px(f.land.places[id].y) + 16] as [number, number];
    if (!this.rival) {
      const [x, y] = pos(rv.at);
      this.rival = this.add.image(x, y, 'rival', 'i0').setOrigin(0.47, 58 / BOX).setScale(0.72 / RES).setDepth(6.9).setTint(0x8a96a8).setAlpha(0);
      this.tweens.add({ targets: this.rival, alpha: 0.95, duration: 1200 });
      this.rivalLabel = this.add.text(x, y - 44, L('de ander', 'the other collector'), {
        fontFamily: '"IM Fell English", serif', fontStyle: 'italic', fontSize: '13px', color: '#4a5a78', resolution: 3,
        stroke: 'rgba(239,229,203,0.9)', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(9).setAlpha(0);
      this.tweens.add({ targets: this.rivalLabel, alpha: 1, duration: 1200 });
      this.rivalAt = rv.at;
      return;
    }
    if (rv.at === this.rivalAt) return;
    const from = this.rivalAt;
    this.rivalAt = rv.at;
    // along the roads, at an unhurried pace
    const land = f.land;
    const a = placeRoadTile(land, land.places[from]), b = placeRoadTile(land, land.places[rv.at]);
    const path = a !== null && b !== null ? roadPath(land, a, b) : null;
    const pts: [number, number][] = [pos(from), ...(path ?? []).map((i) => [px(i % W), px(Math.floor(i / W))] as [number, number]), pos(rv.at)];
    const img = this.rival;
    this.rivalTween?.stop();
    let fr = 0;
    this.rivalTween = this.tweens.addCounter({
      from: 0, to: pts.length - 1, duration: Math.min(9000, pts.length * 160), ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        const i = Math.floor(v), t = v - i;
        const p0 = pts[i], p1 = pts[Math.min(pts.length - 1, i + 1)];
        img.setPosition(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t);
        if (Math.abs(p1[0] - p0[0]) > 0.5) img.setFlipX(p1[0] < p0[0]);
        img.setFrame(`r${Math.floor(fr++ / 3) % RIDE_FRAMES}`);
      },
      onComplete: () => {
        img.setFrame('i0');
        img.setFlipX(false);
      },
    });
  }

  /** A farm dog comes out barking, runs along for a bit, and sits down satisfied. */
  private dog(x: number, y: number, facing: number) {
    const d = this.add.image(x - facing * 26, y + 6, 'a-hond', '1').setOrigin(0.5, 0.9).setScale(0.8 / RES).setDepth(6.9).setFlipX(facing < 0);
    const bark = this.add.text(x - facing * 26, y - 8, L('waf!', 'woof!'), {
      fontFamily: '"IM Fell English", serif', fontStyle: 'italic', fontSize: '11px', color: '#3e3e48', resolution: 3,
    }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: bark, y: y - 18, alpha: 0, duration: 900, delay: 300, onComplete: () => bark.destroy() });
    let fr = 0;
    const run = this.time.addEvent({ delay: 110, loop: true, callback: () => d.setFrame(`${++fr % 2}`) });
    const follow = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      const tx = this.rider.x - facing * 18, ty = this.rider.y + 5;
      d.x += (tx - d.x) * 0.09;
      d.y += (ty - d.y) * 0.09;
    } });
    this.time.delayedCall(1700, () => {
      follow.remove();
      run.remove();
      d.setFrame('0');
      this.tweens.add({ targets: d, alpha: 0, delay: 1800, duration: 700, onComplete: () => d.destroy() });
    });
  }

  /** Get off and walk, leaving the vehicle where it stands; or come back to it and get on. */
  private setOnFoot(on: boolean, facing: number) {
    this.onFoot = on;
    const travel = G.field.persona.travel;
    if (travel === 'voet') return;
    if (on) {
      this.parked?.destroy();
      this.parked = this.add.image(this.rider.x, this.rider.y, 'vehicle', 'v0').setOrigin(0.47, 58 / BOX).setScale(this.pace.scale / RES)
        .setDepth(6.95).setFlipX(facing < 0);
      this.rider.setTexture('walk', 'r0').setScale(PACE.voet.scale / RES);
    } else {
      this.parked?.destroy();
      this.parked = null;
      this.rider.setTexture('rider', 'r0').setScale(this.pace.scale / RES);
    }
    this.rider.setRotation(0);
  }

  private arrive() {
    const f = G.field;
    this.journey = null;
    this.setClock(null);
    this.trailG.clear();
    this.rider.setRotation(0);
    this.revealUpTo(f.known.length);
    this.placeRider();
    // home from the first evening's walk: back to the bicycle, car or gig
    if (this.onFoot && f.departed?.walked && !f.practising) this.setOnFoot(false, 1);
    G.walking = false;
    this.redraw();
    sfx('collector');
    // a little hop on arrival
    this.tweens.add({ targets: this.rider, y: this.rider.y - 3, duration: 120, yoyo: true, ease: 'Sine.easeOut' });
    G.emit('arrived', undefined);
  }

  update(_t: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    // ease towards the zoom the wheel asked for, keeping the point under the cursor in place
    if (this.wheelZoom !== null) {
      const cam = this.cameras.main;
      const k = 1 - Math.exp(-dt * 16);
      const z = cam.zoom + (this.wheelZoom - cam.zoom) * k;
      this.zoomAt(this.wheelAt[0], this.wheelAt[1], Math.abs(z - this.wheelZoom) < 0.0015 ? this.wheelZoom : z);
      if (cam.zoom === this.wheelZoom || Math.abs(cam.zoom - this.wheelZoom) < 0.0015) this.wheelZoom = null;
    }
    if (this.journey) this.travelStep(dt);
    else {
      // at rest: writing in the notebook
      this.idleT += dt;
      this.rider.setFrame(`i${Math.floor(this.idleT * 3) % IDLE_FRAMES}`);
      this.rider.setFlipX(false);
      this.parked?.setFrame(`v${Math.floor(this.idleT * 2) % IDLE_FRAMES}`);
    }
    for (const s of this.sails) s.rotation += dt * 0.5;
    // the night, with what light there is in it: you and your lamp, the evening's gathering, things seen
    const f = G.field;
    const lights: { x: number; y: number; r: number }[] = [{ x: this.rider.x, y: this.rider.y - 10, r: 46 }];
    const facing = this.rider.flipX ? -1 : 1;
    if (this.journey) lights.push({ x: this.rider.x + facing * 30, y: this.rider.y - 6, r: 40 });
    for (const o of f.occasions) if (o.known && !o.attended && o.day === f.day) {
      const p = f.land.places[o.place];
      lights.push({ x: px(p.x), y: px(p.y) - 6, r: 120 });
    }
    lights.push(...this.spirits.lights());
    this.followMentor(dt, lights);
    // the feast's lights: pumpkins by the doors, stars over the churches, the saint going over
    const dark = this.night.isDark;
    for (const l of this.feastLights) {
      l.glow.setAlpha(dark ? 0.55 + Math.sin(this.time.now / 180 + l.img.x) * 0.1 : 0);
      if (l.img.texture.key === 'pompoen') l.img.setFrame(dark ? '1' : '0');
      if (dark) lights.push({ x: l.img.x, y: l.img.y - 6, r: l.r });
    }
    if (this.sint) lights.push({ x: this.sint.x, y: this.sint.y, r: 50 });
    this.night.update(dt, lights);
    this.spirits.update(f, this.time.now, G.clock ?? undefined);
    this.lamp.setPosition(this.rider.x + facing * 14, this.rider.y - 16).setAlpha(this.night.isDark && f.persona.travel !== 'voet' && !this.onFoot ? 0.75 : 0);
    if (this.rival && this.rivalLabel) this.rivalLabel.setPosition(this.rival.x, this.rival.y - 44);
    if (!this.camTween && !this.journey) this.clampCamera();
  }

  /** The old collector keeps at your side, a step behind on the road, with her lantern lit after dark. */
  private followMentor(dt: number, lights: { x: number; y: number; r: number }[]) {
    const m = this.mentor;
    if (!m) return;
    if (!G.field.practising && !this.journey) {
      this.mentor = null;
      this.tweens.add({ targets: m, alpha: 0, duration: 1200, onComplete: () => m.destroy() });
      return;
    }
    const facing = this.journey ? this.journey.facing : 1;
    // on the road a step behind; standing still, clear of the bicycle, car or gig, a little in front of it
    const clear = this.onFoot || G.field.persona.travel === 'voet' ? 17 : 32;
    const tx = this.rider.x - facing * (this.journey ? 15 : clear), ty = this.rider.y + (this.journey ? 2 : 4);
    const k = Math.min(1, dt * (this.journey ? 7 : 4));
    const dx = (tx - m.x) * k, dy = (ty - m.y) * k;
    m.setPosition(m.x + dx, m.y + dy);
    const moved = Math.hypot(dx, dy);
    if (moved > 0.15) {
      this.mentorWalked += moved;
      m.setFrame(`r${Math.floor(this.mentorWalked / PACE.voet.step) % RIDE_FRAMES}`);
      if (Math.abs(dx) > 0.05) m.setFlipX(dx < 0);
    } else {
      m.setFrame(`i${Math.floor(this.idleT * 2) % IDLE_FRAMES}`);
      m.setFlipX(false);
    }
    if (this.night.isDark) lights.push({ x: m.x + (m.flipX ? 4 : -4), y: m.y - 14, r: 36 });
  }

  // ------------------------------------------------------------------ camera

  /** Keep the sheet on screen: centred in the free band when it fits, otherwise no further than its edges. */
  private clampCamera() {
    const cam = this.cameras.main;
    const [x, y] = this.clampScroll(cam.scrollX, cam.scrollY, cam.zoom);
    cam.scrollX = x;
    cam.scrollY = y;
  }

  /** Where the camera may be at this zoom: the scroll position nearest to the one asked for. */
  private clampScroll(sx: number, sy: number, z: number): [number, number] {
    const cam = this.cameras.main;
    const ins = this.insets();
    const small = cam.width < 900 || cam.height < 560;
    const out: [number, number] = [sx, sy];
    for (const axis of ['x', 'y'] as const) {
      const view = axis === 'x' ? cam.width : cam.height;
      const world = axis === 'x' ? SW : SH;
      const lo = axis === 'x' ? ins.l : ins.t, hi = view - (axis === 'x' ? ins.r : ins.b);
      const scroll = axis === 'x' ? sx : sy;
      const edge = (s: number) => (0 - s - view / 2) * z + view / 2;
      const size = world * z;
      let s = scroll;
      if (size <= hi - lo) s = -((lo + (hi - lo - size) / 2 - view / 2) / z) - view / 2;
      else {
        const slack = 60;
        if (edge(s) > lo + slack) s = -((lo + slack - view / 2) / z) - view / 2;
        if (edge(s) + size < hi - slack) s = -((hi - slack - size - view / 2) / z) - view / 2;
        // on a big screen the sheet always fills it; on a small one the panels take so much room
        // that a village at the edge of the sheet must be allowed out from behind them
        if (!small) {
          if (edge(s) > 0) s = -((0 - view / 2) / z) - view / 2;
          if (edge(s) + size < view) s = -((view - size - view / 2) / z) - view / 2;
        }
      }
      out[axis === 'x' ? 0 : 1] = s;
    }
    return out;
  }

  /** Screen space taken by the HTML panels. */
  private insets() {
    const ins = { l: 0, t: 0, r: 0, b: 0 };
    const vw = this.scale.width, vh = this.scale.height;
    const top = document.querySelector('#topbar')?.getBoundingClientRect();
    if (top) ins.t = top.bottom;
    // a folded panel on a big screen is only a tab at the edge: the map has the whole width
    const side = document.querySelector('#here:not(.hidden):not(.min)')?.getBoundingClientRect()
      ?? (vw < 700 || vh < 520 ? document.querySelector('#here:not(.hidden)')?.getBoundingClientRect() : undefined);
    if (side && side.width && side.width < vw * 0.6) ins.r = vw - side.left;
    else if (side && side.height && side.top > vh * 0.3) ins.b = vh - side.top;
    const leads = document.querySelector('#leads')?.getBoundingClientRect();
    if (leads && leads.width && leads.width < vw * 0.4 && leads.top < vh * 0.5) ins.l = leads.right;
    return ins;
  }

  private freeCentre() {
    const cam = this.cameras.main;
    const ins = this.insets();
    return { x: ins.l + (cam.width - ins.l - ins.r) / 2, y: ins.t + (cam.height - ins.t - ins.b) / 2 };
  }

  private fitZoom() {
    const cam = this.cameras.main;
    const ins = this.insets();
    const fw = cam.width - ins.l - ins.r - 16, fh = cam.height - ins.t - ins.b - 16;
    this.overviewZoom = Math.max(0.15, Math.min(fw / SW, fh / SH));
    this.minZoom = this.overviewZoom * 0.9;
    if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
  }

  private centreOn(wx: number, wy: number, z: number) {
    const cam = this.cameras.main;
    const { x: sx, y: sy } = this.freeCentre();
    cam.setScroll(wx - cam.width / 2 - (sx - cam.width / 2) / z, wy - cam.height / 2 - (sy - cam.height / 2) / z);
  }

  private lookAt(wx: number, wy: number, zoom: number, duration: number) {
    const cam = this.cameras.main;
    this.wheelZoom = null;
    this.camTween?.stop();
    if (!duration) {
      cam.setZoom(zoom);
      this.centreOn(wx, wy, zoom);
      return;
    }
    const { x: sx, y: sy } = this.freeCentre();
    const z0 = cam.zoom;
    const c0x = cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / z0;
    const c0y = cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / z0;
    // aim for where the camera may end up, so that it does not snap back from the edge of the sheet afterwards
    const [ex, ey] = this.clampScroll(wx - cam.width / 2 - (sx - cam.width / 2) / zoom, wy - cam.height / 2 - (sy - cam.height / 2) / zoom, zoom);
    wx = ex + cam.width / 2 + (sx - cam.width / 2) / zoom;
    wy = ey + cam.height / 2 + (sy - cam.height / 2) / zoom;
    this.camTween = this.tweens.addCounter({
      from: 0, to: 1, duration, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        const z = z0 * Math.pow(zoom / z0, k);
        cam.setZoom(z);
        this.centreOn(c0x + (wx - c0x) * k, c0y + (wy - c0y) * k, z);
      },
      onComplete: () => (this.camTween = null),
    });
  }

  private goToCollector(duration: number) {
    const f = G.field;
    const [x, y] = f.tileOf(f.at);
    this.lookAt(px(x), px(y), Math.min(1.5, Math.max(this.overviewZoom * 2, 1.05)), duration);
  }

  // ------------------------------------------------------------------ input

  /** The place or site under a sheet point, if any. */
  private hit(wx: number, wy: number): Where | null {
    const f = G.field;
    let best: Where | null = null, bd = Infinity;
    for (const p of f.land.places) {
      const d = Math.hypot(wx - px(p.x), wy - (px(p.y) - 10)) / TILE;
      if (d < 3 && d < bd) { bd = d; best = { kind: 'place', id: p.id }; }
    }
    for (const s of f.land.sites) {
      const d = Math.hypot(wx - px(s.x), wy - (px(s.y) - 6)) / TILE;
      if (d < 1.8 && d < bd) { bd = d; best = { kind: 'site', id: s.id }; }
    }
    return best;
  }

  private drawRing(w: Where | null) {
    const g = this.ring;
    g.clear();
    if (!w) return;
    const [x, y] = G.field.tileOf(w);
    const r = w.kind === 'place' ? 62 : 34;
    g.lineStyle(1.4, 0xa8321f, 0.8);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
      g.beginPath();
      g.arc(px(x), px(y) - 8, r, a, a + Math.PI / 40);
      g.strokePath();
    }
  }

  /**
   * Zoom so that the sheet point that was under screen point `from` ends up under screen point `to`.
   * Worked out by hand: the camera's own conversion only catches up with a new zoom on the next frame.
   */
  private zoomAt(toX: number, toY: number, zoom: number, fromX = toX, fromY = toY) {
    const cam = this.cameras.main;
    const z0 = cam.zoom;
    const z1 = Phaser.Math.Clamp(zoom, this.minZoom, 3);
    const cx = cam.width * cam.originX, cy = cam.height * cam.originY;
    const wx = cam.scrollX + cx + (fromX - cx) / z0;
    const wy = cam.scrollY + cy + (fromY - cy) / z0;
    cam.setZoom(z1);
    cam.scrollX = wx - cx - (toX - cx) / z1;
    cam.scrollY = wy - cy - (toY - cy) / z1;
  }

  private setupInput() {
    const cam = this.cameras.main;
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(1);
    const screen = (ptr: Phaser.Input.Pointer) => {
      const r = this.game.canvas.getBoundingClientRect();
      return { x: r.left + ptr.x, y: r.top + ptr.y };
    };

    this.input.on('wheel', (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.camTween?.stop();
      this.camTween = null;
      // zoom by how far the wheel or the fingers moved, not by the number of events: a trackpad sends many small
      // ones, a mouse wheel a few large ones. A pinch on a trackpad comes as a wheel event with ctrl held.
      const ev = ptr.event as WheelEvent;
      const lines = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
      const d = Phaser.Math.Clamp(dy * lines, -120, 120);
      const k = ev.ctrlKey ? 0.012 : 0.0022;
      const base = this.wheelZoom ?? cam.zoom;
      this.wheelZoom = Phaser.Math.Clamp(base * Math.exp(-d * k), this.minZoom, 3);
      this.wheelAt = [ptr.x, ptr.y];
    });
    // keep the browser from zooming the whole page on a trackpad pinch
    this.game.canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.wheelZoom = null;
      this.camTween?.stop();
      this.camTween = null;
      this.dragging = { x: ptr.x, y: ptr.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
      // the second finger down: the pinch starts here, so its first movement counts too
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        this.pinch = { d: Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y), mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
        this.dragging.moved = true;
      }
    });

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        if (!this.pinch) {
          this.camTween?.stop();
          this.camTween = null;
          this.pinch = { d, mx, my };
        } else {
          // what was under the fingers stays under the fingers, and moves along with them
          this.zoomAt(mx, my, cam.zoom * (d / Math.max(1, this.pinch.d)), this.pinch.mx, this.pinch.my);
          this.pinch = { d, mx, my };
        }
        if (this.dragging) this.dragging.moved = true;
        return;
      }
      if (this.pinch) {
        // one finger lifted: carry on panning from here, without a jump
        this.pinch = null;
        this.dragging = { x: ptr.x, y: ptr.y, sx: cam.scrollX, sy: cam.scrollY, moved: true };
        return;
      }
      if (this.dragging && ptr.isDown) {
        const dx = ptr.x - this.dragging.x, dy = ptr.y - this.dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.dragging.moved = true;
        if (this.dragging.moved) {
          cam.scrollX = this.dragging.sx - dx / cam.zoom;
          cam.scrollY = this.dragging.sy - dy / cam.zoom;
        }
        return;
      }
      if (this.journey) return;
      const w = this.hit(ptr.worldX, ptr.worldY);
      this.drawRing(w);
      this.input.setDefaultCursor(w ? 'pointer' : 'default');
      const f = G.field;
      if (!w) return G.emit('hover', null);
      const here = f.same(w, f.at);
      const r = here ? null : f.route(w);
      const how = here ? L('u bent hier', 'you are here') : r ? `${durationText(r.parts)} ${r.foot > 3 && f.persona.travel !== 'voet' ? `${f.persona.verb} ${L('en lopen', 'and on foot')}` : f.persona.verb}` : L('onbereikbaar', 'out of reach');
      G.emit('hover', { text: `${f.whereName(w)} · ${how}`, ...screen(ptr) });
    });

    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null;
      const d = this.dragging;
      setTimeout(() => (this.dragging = null), 0);
      if (!d || d.moved) return;
      // a click while on the road: hurry up
      if (this.journey) {
        this.journey.fast = true;
        return;
      }
      const w = this.hit(ptr.worldX, ptr.worldY);
      if (w) G.emit('pick', w);
    });
  }
}

export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#3b3026',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: true, roundPixels: false },
    scene: [MapScene, WeatherScene],
  });
}
