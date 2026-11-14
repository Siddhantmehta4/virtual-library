// The paper plane as real 3D geometry: a few folded triangles faced with the photographed paper,
// lit like the room, casting a shadow on the floor. It rests where the old cut-out lay and, once
// per visit, takes a lazy loop in front of the case before landing again.
import * as THREE from "./vendor/three.module.min.js";

const FOV = 30;
const FLOOR_TILT = 0.36; // radians: how steeply the room camera looks down at the floor

export function initPlane3D({ anchor, isHidden, isDark, tie, note, onReady }) {
  const canvas = document.createElement("canvas");
  canvas.className = "plane3d";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = "0";
  document.body.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);

  // ---------- lights: warm key from the lamp side, warm rim from the shelf strips behind ----------
  const hemi = new THREE.HemisphereLight(0xfaf6f0, 0x3a2a20, 1.0);
  const key = new THREE.DirectionalLight(0xfff6ea, 1.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xffb070, 0.45);
  scene.add(hemi, key, key.target, rim);

  // ---------- the plane ----------
  const loader = new THREE.TextureLoader();
  const paper = loader.load("assets/tex/paper-grain.jpg"); // neutral white fibre, not cream
  paper.colorSpace = THREE.SRGBColorSpace;
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: paper, color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });

  // local frame: nose along +x, span along z, up is +y; total length 1
  const N = [1, 0, 0], T = [0, 0, 0];
  const WL = [0.02, 0.05, -0.36], WR = [0.02, 0.05, 0.36]; // wing tips, slight dihedral
  const FL = [0.05, 0.015, -0.12], FR = [0.05, 0.015, 0.12]; // inner fold lines
  const K = [0.06, -0.15, 0]; // keel bottom
  const tris = [
    N, FL, WL, N, T, FL, // left wing (outer + inner panel)
    N, WR, FR, N, FR, T, // right wing
    N, K, T, // keel
  ];
  const pos = new Float32Array(tris.flat());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] * 1.4; uv[i * 2 + 1] = pos[i * 3 + 2] * 1.4 + pos[i * 3 + 1]; }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  // a crumpled nose: pinch the tip a little
  mesh.scale.set(1, 1, 1);
  const plane = new THREE.Group();
  plane.add(mesh);
  scene.add(plane);

  // ---------- the string from the note in the bay to the plane's tail ----------
  const twineMat = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: 1 });
  const twine = new THREE.Mesh(new THREE.BufferGeometry(), twineMat);
  twine.castShadow = true;
  scene.add(twine);
  let twineAlpha = 1;
  twineMat.transparent = true;
  const tailLocal = new THREE.Vector3(0.02, 0.02, 0);
  function updateTwine(size) {
    const t = tie && tie();
    if (!t) { twine.visible = false; return; }
    const a = toWorld(t.x, t.y);
    const b = plane.localToWorld(tailLocal.clone());
    const mid = a.clone().lerp(b, 0.5);
    const sag = Math.max(size * 0.12, a.distanceTo(b) * 0.08);
    mid.y -= sag; mid.z += size * 0.15;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    twine.geometry.dispose();
    twine.geometry = new THREE.TubeGeometry(curve, 28, Math.max(0.6, size * 0.007), 5, false);
    twine.visible = twineAlpha > 0.02;
    twineMat.opacity = twineAlpha;
  }

  // ---------- floor: invisible except for the shadow ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.5 }));
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- mapping screen pixels to the 3D world ----------
  let vw = 0, vh = 0, dist = 0;
  function resize() {
    vw = innerWidth; vh = innerHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    dist = (vh / 2) / Math.tan((FOV / 2) * Math.PI / 180);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);
  const toWorld = (sx, sy) => new THREE.Vector3(sx - vw / 2, -(sy - vh / 2), 0);

  const floorQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), FLOOR_TILT);
  // resting heading: nose toward the case, turned a little toward the viewer, rolled onto one wing
  const restQ = floorQ.clone()
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + 0.55, 0)))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, 0)));

  // ---------- state ----------
  let lift = 0, liftTarget = 0;
  let flight = null;
  anchor.addEventListener("pointerenter", () => { liftTarget = 1; });
  anchor.addEventListener("pointerleave", () => { liftTarget = 0; });

  function restFrame() {
    const r = anchor.getBoundingClientRect();
    const size = r.width; // plane length in screen px
    const base = toWorld(r.left + r.width / 2, r.bottom - r.height * 0.18);
    return { size, base };
  }

  // The plane hasn't arrived yet when the page opens: it drifts in through the window on the
  // right, wanders across, circles the note once and settles onto its spot on the floor.
  let arrived = false;
  function flyIn() {
    if (flight) return;
    const { size, base } = restFrame();
    const n = note && note();
    const nc = n ? toWorld(n.x, n.y) : base.clone().add(new THREE.Vector3(size, size * 3, 0));
    const R = Math.max(size * 1.1, n ? n.r * 0.95 : size);
    const W = (x, y) => toWorld(x, y);
    // one smooth glide: in through the right-hand edge at mid-height, a long gentle descent with
    // a single soft curve, settling onto its spot. It starts a little further away (smaller) and
    // comes nearer as it lands, so it reaches its resting size only on touchdown.
    const bx = base.x + vw / 2, by = vh / 2 - base.y; // landing spot in screen pixels
    // one even descent, slightly bowed: enters at mid-height, glides down and left, touches down
    const pts = [
      W(vw + size * 1.5, vh * 0.5),
      W(bx + (vw - bx) * 0.55, vh * 0.5 + (by - vh * 0.5) * 0.3),
      W(bx + size * 0.9, by - size * 0.18),
      base.clone(),
    ];
    flight = { curve: new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5), start: performance.now(), dur: 3600, abs: true };
  }
  function flyOnce() { flyIn(); }
  function arriveNow() { arrived = true; }

  const tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) * 0.35 + (1 - Math.pow(1 - t, 2)) * 0.65; // eases in, glides, settles

  function frame(now) {
    requestAnimationFrame(frame);
    const hidden = isHidden() || (!arrived && !flight);
    canvas.style.opacity = hidden ? "0" : "1";
    if (hidden && !flight) return;
    const { size, base } = restFrame();
    if (!size) return;

    // lights follow the plane, scaled to its size
    const dark = isDark();
    key.intensity = dark ? 0.3 : 1.7;
    rim.intensity = dark ? 0.1 : 0.45;
    hemi.intensity = dark ? 0.25 : 1.0;
    key.position.copy(base).add(new THREE.Vector3(-size * 3, size * 6, size * 4));
    key.target.position.copy(base);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -size * 4; sc.right = sc.top = size * 4; sc.near = 1; sc.far = size * 20;
    sc.updateProjectionMatrix();
    rim.position.copy(base).add(new THREE.Vector3(size * 2, size * 3, -size * 6));

    floor.position.copy(base);
    floor.quaternion.copy(floorQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    floor.scale.set(size * 12, size * 12, 1);

    lift += (liftTarget - lift) * 0.12;
    plane.scale.setScalar(size);

    if (flight) {
      const t = Math.min(1, (now - flight.start) / flight.dur);
      const e = ease(t);
      const p = flight.curve.getPointAt(e);
      const tan = flight.curve.getTangentAt(Math.min(0.999, Math.max(0.001, e)));
      // flight pose: nose pointing left along the descent, wings level, top turned a little toward
      // the room; it settles into the landed pose over the last stretch. It never banks or turns.
      const pitch = flight.abs ? Math.atan2(-tan.y, Math.abs(tan.x) + 1e-6) : 0;
      const flyQ = floorQ.clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + 0.4, 0)))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -pitch * 0.8));
      tmpQ.copy(flyQ).slerp(restQ, THREE.MathUtils.smoothstep(t, 0.78, 1));
      plane.quaternion.copy(tmpQ);
      plane.position.copy(flight.abs ? p : base.clone().add(p));
      if (flight.abs) plane.scale.setScalar(size * (0.45 + 0.55 * THREE.MathUtils.smoothstep(t, 0.55, 1)));
      if (t >= 1) { flight = null; arrived = true; }
    } else {
      plane.quaternion.copy(restQ);
      const bob = lift * size * 0.12;
      plane.position.copy(base).add(new THREE.Vector3(0, bob, bob * 0.4));
      plane.rotateX(lift * -0.12);
    }
    // the string slips off while the plane is in the air and settles back once it lands
    twineAlpha += ((flight ? 0 : 1) - twineAlpha) * (flight ? 0.25 : 0.05);
    plane.updateMatrixWorld(true);
    updateTwine(size);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__plane3d = { plane, camera, THREE, get flying() { return !!flight; } };
  onReady && onReady({ flyOnce, arriveNow });
}
