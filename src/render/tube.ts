// The screen as an old tube, for real: a second canvas over the game's, on which a shader draws the
// picture as a cathode-ray tube showed it. The glass bulges; a scan line runs along every row of the
// game, thinner where the picture is bright; the three colours of the phosphors stand side by side;
// the bright parts bleed a little; the colours part towards the edges; the corners go dark.
//
// A browser lets a shader read the picture only when the page comes from a site: opened from the
// disk, the picture is closed to it ("tainted"), and `ok` turns false at the first try. The page
// then lays its lines over the picture itself (see index.html), without the bulge.

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_src;
varying vec2 v_uv;
// The bulge of the glass: the picture pushed out towards its corners.
vec2 bulge(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 off = abs(uv.yx) / vec2(6.5, 5.0);
  uv += uv * off * off;
  return uv * 0.5 + 0.5;
}
void main() {
  vec2 uv = bulge(v_uv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // The colours part a little, more towards the edges.
  vec2 part = (uv - 0.5) * 0.0016;
  vec3 col = vec3(texture2D(u_tex, uv + part).r, texture2D(u_tex, uv).g, texture2D(u_tex, uv - part).b);
  // What is bright bleeds onto what is next to it.
  vec2 px = 1.0 / u_src;
  vec3 glow = (texture2D(u_tex, uv + vec2(px.x, 0.0)).rgb + texture2D(u_tex, uv - vec2(px.x, 0.0)).rgb
             + texture2D(u_tex, uv + vec2(0.0, px.y)).rgb + texture2D(u_tex, uv - vec2(0.0, px.y)).rgb) * 0.25;
  col = mix(col, max(col, glow), 0.22);
  // A scan line along every row of the game: dark between two rows, less so where it is bright.
  float beam = 0.5 + 0.5 * cos(6.28318 * uv.y * u_src.y);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col *= 1.0 - (0.46 - 0.22 * lum) * (1.0 - beam);
  // The phosphors: red, green, blue, side by side.
  float m = mod(gl_FragCoord.x, 3.0);
  col *= vec3(m < 1.0 ? 1.0 : 0.8, (m >= 1.0 && m < 2.0) ? 1.0 : 0.8, m >= 2.0 ? 1.0 : 0.8);
  // The corners go dark.
  vec2 v = uv * (1.0 - uv);
  col *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.3);
  gl_FragColor = vec4(col * 1.55, 1.0);
}`;

export class Tube {
  /** False once the browser has refused it (no WebGL, or a picture it may not read). */
  ok = false;
  private readonly gl: WebGLRenderingContext | null = null;

  constructor(private readonly glass: HTMLCanvasElement, private readonly source: HTMLCanvasElement) {
    let gl: WebGLRenderingContext | null = null;
    try { gl = glass.getContext('webgl', { alpha: false, antialias: false }); } catch { gl = null; }
    if (!gl) return;
    const shader = (type: number, code: string): WebGLShader | null => {
      const s = gl!.createShader(type);
      if (!s) return null;
      gl!.shaderSource(s, code); gl!.compileShader(s);
      return gl!.getShaderParameter(s, gl!.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT), program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.uniform2f(gl.getUniformLocation(program, 'u_src'), source.width, source.height);
    this.gl = gl;
    this.ok = true;
  }

  /** The size of the glass on the screen, in its own pixels. */
  resize(width: number, height: number): void {
    if (this.glass.width !== width) this.glass.width = width;
    if (this.glass.height !== height) this.glass.height = height;
  }

  /** Draws the game's picture, as it is now, on the glass. */
  draw(): void {
    const gl = this.gl;
    if (!gl || !this.ok) return;
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source); }
    catch { this.ok = false; return; }                  // the picture is closed to the shader: the page's own lines instead
    gl.viewport(0, 0, this.glass.width, this.glass.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
