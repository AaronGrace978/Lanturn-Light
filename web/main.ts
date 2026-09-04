import {
  DroneSwarmConstruct,
  LanternRing,
  LocalRingBrain,
  TextWill,
  type ConstructKind,
  type Vec3,
} from "../src/index.js";
import { createGl, createProgram, resize } from "./gl.ts";
import fragSrc from "./shaders/construct.frag.glsl?raw";
import vertSrc from "./shaders/quad.vert.glsl?raw";

const KIND_ID: Record<ConstructKind, number> = {
  shield: 0,
  beam: 1,
  platform: 2,
  grasp: 3,
  scout: 4,
  custom: 5,
};

const MAX_DRONES = 12;

function yUp(p: Vec3): Vec3 {
  return { x: p.x, y: p.z, z: p.y };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function flatten(points: Vec3[]): Float32Array {
  const out = new Float32Array(MAX_DRONES * 3);
  for (let i = 0; i < MAX_DRONES; i++) {
    const p = points[i] ?? points[points.length - 1] ?? { x: 0, y: 0, z: 0 };
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

function loc(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
  return gl.getUniformLocation(program, name);
}

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#view");
  const voiceEl = document.querySelector<HTMLParagraphElement>("#voice");
  const statusEl = document.querySelector<HTMLParagraphElement>("#status");
  const errorEl = document.querySelector<HTMLParagraphElement>("#gl-error");
  const commandForm = document.querySelector<HTMLFormElement>("#command-form");
  const input = document.querySelector<HTMLInputElement>("#utterance");
  const chips = document.querySelector<HTMLDivElement>("#chips");
  if (
    !canvas ||
    !voiceEl ||
    !statusEl ||
    !errorEl ||
    !commandForm ||
    !input ||
    !chips
  ) {
    return;
  }

  let gl: WebGL2RenderingContext;
  try {
    gl = createGl(canvas);
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    errorEl.classList.remove("hidden");
    return;
  }

  const program = createProgram(gl, vertSrc, fragSrc);
  gl.useProgram(program);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const swarm = new DroneSwarmConstruct(6);
  const ring = new LanternRing({
    will: new TextWill("form a shield around us", 0.92),
    brain: new LocalRingBrain(6),
    construct: swarm,
  });

  let from = swarm.snapshot().drones.map((d) => yUp(d.position));
  let to = from.map((p) => ({ ...p }));
  let kind: ConstructKind = "custom";
  let force = 0.2;
  let formAmt = 0;
  let anim = 1;
  let yaw = 0.6;
  let pitch = 0.18;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const setStatus = (text: string) => {
    statusEl.textContent = text;
  };

  const pulse = async (utterance: string) => {
    setStatus("Forming construct…");
    const result = await ring.command(utterance);
    voiceEl.textContent = result.brain.voice;
    kind = result.brain.plan.kind;
    force = result.brain.plan.force;
    from = to.map((p) => ({ ...p }));
    to = result.swarm.drones.map((d) => yUp(d.position));
    anim = 0;
    formAmt = Math.max(formAmt, 0.15);
    setStatus(
      `WebGL2 raymarch · ${kind} · ${result.swarm.drones.length} drones · ${result.swarm.ready ? "holding" : "in motion"}`,
    );
  };

  commandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void pulse(input.value.trim() || "form a shield");
  });

  chips.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest("button[data-cmd]");
    if (!btn) return;
    const cmd = btn.getAttribute("data-cmd");
    if (!cmd) return;
    input.value = cmd;
    void pulse(cmd);
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", () => {
    dragging = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * 0.005;
    pitch += (event.clientY - lastY) * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  const uRes = loc(gl, program, "uRes");
  const uTime = loc(gl, program, "uTime");
  const uYaw = loc(gl, program, "uYaw");
  const uPitch = loc(gl, program, "uPitch");
  const uForce = loc(gl, program, "uForce");
  const uForm = loc(gl, program, "uForm");
  const uKind = loc(gl, program, "uKind");
  const uCount = loc(gl, program, "uCount");
  const uDrones = loc(gl, program, "uDrones");

  const start = performance.now();
  const frame = (now: number) => {
    resize(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    anim = Math.min(1, anim + 0.018);
    const t = 1 - Math.pow(1 - anim, 3);
    formAmt = Math.min(1, formAmt + 0.02);
    const drones = from.map((p, i) => lerp(p, to[i] ?? p, t));

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform1f(uYaw, yaw);
    gl.uniform1f(uPitch, pitch);
    gl.uniform1f(uForce, force);
    gl.uniform1f(uForm, formAmt * (0.35 + 0.65 * t));
    gl.uniform1i(uKind, KIND_ID[kind]);
    gl.uniform1i(uCount, Math.min(MAX_DRONES, to.length || from.length));
    gl.uniform3fv(uDrones, flatten(drones));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  await pulse(input.value);
}

main().catch((err) => {
  const errorEl = document.querySelector<HTMLParagraphElement>("#gl-error");
  if (errorEl) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    errorEl.classList.remove("hidden");
  }
});
