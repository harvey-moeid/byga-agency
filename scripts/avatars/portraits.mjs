// Optional: render portraits from the bundled GLBs while the Vite dev server is running.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.goto("http://127.0.0.1:5173/");
  for (const name of ["aria", "nova", "kai", "leo", "iris"]) {
    const data = await page.evaluate(async (name) => {
      const THREE = await import("/node_modules/three/build/three.module.js");
      const { GLTFLoader } =
        await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(160, 160);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#e2e8da");
      scene.add(new THREE.HemisphereLight("#fff8ea", "#849283", 2));
      const key = new THREE.DirectionalLight("#fff1d9", 2.1);
      key.position.set(-2, 4, 3);
      scene.add(key);
      const fill = new THREE.DirectionalLight("#dfe9fc", 0.7);
      fill.position.set(2, 2, -1);
      scene.add(fill);
      const gltf = await new GLTFLoader().loadAsync(`/avatars/${name}.glb`);
      scene.add(gltf.scene);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      mixer.clipAction(gltf.animations.find((a) => a.name === "Idle")).play();
      mixer.update(0.5);
      gltf.scene.updateMatrixWorld(true);
      let head;
      gltf.scene.traverse((o) => {
        if (o.name === "Bip01_Head") head = o;
      });
      const center = head
        ? head.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(0, 1.55, 0);
      const camera = new THREE.OrthographicCamera(
        -0.29,
        0.29,
        0.29,
        -0.29,
        0.01,
        10,
      );
      camera.position.set(center.x, center.y + 0.015, center.z + 1.5);
      camera.lookAt(center.x, center.y - 0.03, center.z);
      renderer.render(scene, camera);
      const data = renderer.domElement.toDataURL("image/png").split(",")[1];
      mixer.stopAllAction();
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
      renderer.dispose();
      return data;
    }, name);
    await writeFile(`public/avatars/${name}.png`, Buffer.from(data, "base64"));
    process.stdout.write(`Rendered ${name}\n`);
  }
} finally {
  await browser.close();
}
