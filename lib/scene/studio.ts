import * as THREE from "three";

/**
 * The reflections. Metals and glossy plastics are only as convincing as what
 * they reflect, and a flat dark room gives them nothing. This is a small
 * photographer's studio, rendered once into a PMREM texture: a large warm
 * softbox high on the left (the window you cannot see), a cool strip on the
 * right, a soft overhead panel, and a dim bounce from the floor. It costs one
 * render at load and nothing per frame.
 */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(14, 7, 14),
    new THREE.MeshBasicMaterial({ color: 0x15161b, side: THREE.BackSide })
  );
  room.position.y = 1.5;
  scene.add(room);

  const panel = (
    w: number,
    h: number,
    at: [number, number, number],
    rgb: [number, number, number],
    gain: number
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(rgb[0] * gain, rgb[1] * gain, rgb[2] * gain),
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    m.position.set(...at);
    m.lookAt(0, 0.2, 0);
    scene.add(m);
  };

  // key: big, warm, front-left and high
  panel(3.4, 2.2, [-2.6, 2.7, 3.0], [1.0, 0.92, 0.8], 7);
  // strip: tall and cool, from the right
  panel(0.7, 3.4, [4.2, 1.6, 0.8], [0.75, 0.86, 1.0], 9);
  // overhead: broad and neutral
  panel(3.4, 3.4, [0.2, 4.4, -0.6], [1, 1, 1], 2.6);
  // low front fill so the undersides of things are not black
  panel(4, 1, [0, 0.2, 4.2], [0.9, 0.92, 1.0], 1.2);
  // faint warm kick from the back-left
  panel(1.4, 2.4, [-3.6, 1.2, -3.2], [1.0, 0.85, 0.7], 3);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) (m.material as THREE.Material).dispose();
  });
  return tex;
}
