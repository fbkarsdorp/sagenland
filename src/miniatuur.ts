// The miniature look: the map sharp in a band across the middle of the free screen, blurring towards the top and
// bottom, a little more saturated, as in a photograph of a model landscape. A cheap post-effect: 16 samples a pixel,
// and none at all inside the sharp band.
import Phaser from 'phaser';

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uFocus;
uniform float uBand;
uniform float uBlur;
varying vec2 outTexCoord;

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  float d = max(0.0, abs(outTexCoord.y - uFocus) - uBand) / max(0.001, 1.0 - uBand);
  float r = uBlur * smoothstep(0.0, 1.0, d * 2.2);
  vec4 col = base;
  if (r > 0.4) {
    vec4 acc = base;
    // sixteen samples spiralling out over a disc (the golden angle), the old WebGL way without arrays
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 16.0);
      acc += texture2D(uMainSampler, outTexCoord + o * r / uResolution);
    }
    col = acc / 17.0;
  }
  // the bright, saturated colours of a painted model
  float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(vec3(l), col.rgb, 1.18);
  gl_FragColor = col;
}`;

export class Miniatuur extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  /** where the sharp band lies, as a fraction of the screen height from the top */
  focus = 0.5;
  band = 0.1;
  blur = 9;

  constructor(game: Phaser.Game) {
    super({ game, name: 'Miniatuur', fragShader: FRAG });
  }

  onPreRender() {
    const r = this.renderer;
    this.set2f('uResolution', r.width, r.height);
    // texture coordinates run from the bottom
    this.set1f('uFocus', 1 - this.focus);
    this.set1f('uBand', this.band);
    this.set1f('uBlur', this.blur * (r.width > 1400 ? 1.4 : 1));
  }
}
