#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uYaw;
uniform float uPitch;
uniform float uForce;
uniform float uForm;
uniform int uKind;
uniform int uCount;
uniform vec3 uDrones[12];

const float MAX_DIST = 48.0;
const int MAX_STEPS = 96;
const vec3 ENERGY = vec3(0.18, 1.0, 0.48);
const vec3 CORE = vec3(0.78, 1.0, 0.88);
const vec3 METAL = vec3(0.07, 0.08, 0.09);

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdCappedCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 droneAt(int i) {
  if (i == 0) return uDrones[0];
  if (i == 1) return uDrones[1];
  if (i == 2) return uDrones[2];
  if (i == 3) return uDrones[3];
  if (i == 4) return uDrones[4];
  if (i == 5) return uDrones[5];
  if (i == 6) return uDrones[6];
  if (i == 7) return uDrones[7];
  if (i == 8) return uDrones[8];
  if (i == 9) return uDrones[9];
  if (i == 10) return uDrones[10];
  return uDrones[11];
}

float ringSDF(vec3 p) {
  vec3 q = p;
  q.yz = mat2(0.96, -0.28, 0.28, 0.96) * q.yz;
  float body = sdTorus(q, vec2(0.92, 0.20));
  float hole = sdTorus(q, vec2(0.92, 0.11));
  float band = abs(q.y) - 0.018;
  float groove = max(sdTorus(q, vec2(0.92, 0.22)), band);
  return min(max(body, -hole - 0.02), groove);
}

float constructVolume(vec3 p) {
  float d = 1e9;
  int n = uCount;
  if (n < 1) return d;

  if (uKind == 0) {
    vec3 c = vec3(0.0, 1.45, 0.0);
    d = min(d, abs(sdTorus(p - c, vec2(2.45, 0.02))) - 0.05);
    d = min(d, abs(length((p - c) * vec3(1.0, 1.7, 1.0)) - 2.35) - 0.04);
  } else if (uKind == 1) {
    d = min(d, sdCapsule(p, vec3(-3.2, 1.8, 0.0), vec3(3.2, 1.8, 0.0), 0.16));
    d = min(d, sdCapsule(p, vec3(-3.2, 1.8, 0.0), vec3(3.2, 1.8, 0.0), 0.05) - 0.08);
  } else if (uKind == 2) {
    vec3 q = p - vec3(0.0, 0.82, 0.0);
    d = min(d, sdCappedCylinder(q, 0.05, 1.75));
    d = min(d, abs(sdTorus(q, vec2(1.55, 0.03))) - 0.02);
  } else if (uKind == 3) {
    vec3 c = vec3(0.0, 1.05, 0.0);
    d = min(d, abs(length(p - c) - 1.15) - 0.05);
    d = min(d, sdSphere(p - c, 0.22));
  } else if (uKind == 4) {
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 0.22 - 0.55;
      vec3 dir = normalize(vec3(sin(a), 0.18, cos(a)));
      d = min(d, sdCapsule(p, vec3(0.0, 2.0, 0.0), vec3(0.0, 2.0, 0.0) + dir * 4.4, 0.045));
    }
  } else {
    d = min(d, sdTorus(p - vec3(0.0, 1.05, 0.0), vec2(1.05, 0.04)));
  }

  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    vec3 a = droneAt(i);
    int j = i + 1;
    if (j >= n) {
      if (uKind == 0 || uKind == 2 || uKind == 3) j = 0;
      else break;
    }
    vec3 b = droneAt(j);
    float ribbon = 0.045 + 0.02 * uForce;
    d = smin(d, sdCapsule(p, a, b, ribbon), 0.12);
  }
  return d;
}

float dronesSDF(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < 12; i++) {
    if (i >= uCount) break;
    vec3 pos = droneAt(i);
    float pulse = 0.07 + 0.012 * sin(uTime * 6.0 + float(i) * 1.7);
    d = min(d, sdSphere(p - pos, pulse));
  }
  return d;
}

struct Hit {
  float d;
  float id;
};

Hit mapScene(vec3 p) {
  float ring = ringSDF(p);
  float drones = dronesSDF(p);
  float hard = constructVolume(p);
  hard = mix(1e9, hard, clamp(uForm, 0.0, 1.0));

  Hit h;
  h.d = ring;
  h.id = 1.0;
  if (drones < h.d) {
    h.d = drones;
    h.id = 3.0;
  }
  if (hard < h.d) {
    h.d = hard;
    h.id = 2.0;
  }
  float floorD = p.y + 0.35;
  if (floorD < h.d) {
    h.d = floorD;
    h.id = 4.0;
  }
  return h;
}

float map(vec3 p) {
  return mapScene(p).d;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

float glowField(vec3 p) {
  float hard = constructVolume(p);
  float drones = dronesSDF(p);
  float g = 0.0;
  g += 0.55 * exp(-8.0 * abs(hard));
  g += 0.85 * exp(-14.0 * abs(drones));
  float ringBand = abs(ringSDF(p));
  g += 0.18 * exp(-20.0 * ringBand);
  return g * uForm;
}

vec3 sky(vec3 rd) {
  vec3 col = vec3(0.004, 0.006, 0.01);
  col += ENERGY * pow(max(rd.y, 0.0), 8.0) * 0.08;
  float stars = step(0.995, hash(rd * 80.0));
  col += stars * vec3(0.7, 1.0, 0.85) * (0.4 + 0.6 * hash(rd * 17.0));
  return col;
}

vec3 shade(vec3 p, vec3 rd, vec3 n, float id) {
  vec3 light = normalize(vec3(0.4, 0.85, 0.35));
  float diff = max(dot(n, light), 0.0);
  float spec = pow(max(dot(reflect(rd, n), light), 0.0), 48.0);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3 col = METAL;

  if (id < 1.5) {
    vec3 q = p;
    q.yz = mat2(0.96, -0.28, 0.28, 0.96) * q.yz;
    float circ = abs(sin(atan(q.z, q.x) * 28.0) * sin(q.y * 55.0 + uTime * 0.4));
    float strip = smoothstep(0.03, 0.0, abs(q.y));
    col = mix(METAL, METAL * 1.4, circ);
    col += ENERGY * strip * (1.2 + 0.4 * sin(uTime * 4.0));
    col += spec * 0.35;
    col += fres * ENERGY * 0.15;
    col *= 0.25 + 0.75 * diff;
  } else if (id < 2.5) {
    col = mix(ENERGY, CORE, 0.35 + 0.35 * uForce);
    col += spec * CORE;
    col += fres * ENERGY * 1.4;
    col *= 0.55 + 0.8 * diff;
    col += ENERGY * 0.8;
  } else if (id < 3.5) {
    col = mix(ENERGY, CORE, 0.7);
    col += spec * 1.2;
    col += ENERGY * 1.6;
  } else {
    float grid = abs(sin(p.x * 2.0) * sin(p.z * 2.0));
    col = vec3(0.01, 0.02, 0.015) + ENERGY * 0.04 * (1.0 - grid);
    col *= 0.15 + 0.2 * diff;
    float pool = exp(-length(p.xz) * 0.35);
    col += ENERGY * pool * 0.12 * uForm;
  }
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float yaw = uYaw + uTime * 0.12;
  float pitch = clamp(uPitch, -0.7, 0.9);
  vec3 ta = vec3(0.0, 1.15, 0.0);
  float dist = 7.2;
  vec3 ro = ta + vec3(
    sin(yaw) * cos(pitch),
    sin(pitch) + 0.35,
    cos(yaw) * cos(pitch)
  ) * dist;

  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
  vec3 vv = cross(ww, uu);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.7 * ww);

  vec3 col = sky(rd);
  float t = 0.0;
  float glow = 0.0;
  float hitId = -1.0;
  vec3 hitP = vec3(0.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    Hit h = mapScene(p);
    glow += 0.035 * glowField(p) / (1.0 + t * 0.08);
    if (h.d < 0.0012) {
      hitId = h.id;
      hitP = p;
      break;
    }
    t += clamp(h.d, 0.008, 0.9);
    if (t > MAX_DIST) break;
  }

  if (hitId >= 0.0) {
    vec3 n = calcNormal(hitP);
    col = shade(hitP, rd, n, hitId);
    float fog = 1.0 - exp(-0.012 * t * t);
    col = mix(col, sky(rd), fog * 0.35);
  }

  col += ENERGY * glow * (0.9 + 0.5 * uForce);
  col += CORE * glow * glow * 0.25;

  float vign = smoothstep(1.6, 0.2, length(uv));
  col *= 0.55 + 0.45 * vign;
  col = pow(max(col, 0.0), vec3(0.92));
  fragColor = vec4(col, 1.0);
}
