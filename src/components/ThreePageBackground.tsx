import { useEffect, useRef } from "react";
import * as THREE from "three";

const ThreePageBackground = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0.0);
    container.appendChild(renderer.domElement);

    const circle = new THREE.Object3D();
    const skelet = new THREE.Object3D();
    const particle = new THREE.Object3D();
    scene.add(circle, skelet, particle);

    const geometry = new THREE.TetrahedronGeometry(2, 0);
    const geom = new THREE.IcosahedronGeometry(7, 1);
    const geom2 = new THREE.IcosahedronGeometry(15, 1);

    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });
    const materialWire = new THREE.MeshPhongMaterial({ color: 0xffffff, wireframe: true, side: THREE.DoubleSide });

    for (let i = 0; i < 1000; i += 1) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      mesh.position.multiplyScalar(90 + Math.random() * 700);
      mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      particle.add(mesh);
    }

    const planet = new THREE.Mesh(geom, material);
    planet.scale.setScalar(16);
    circle.add(planet);

    const planet2 = new THREE.Mesh(geom2, materialWire);
    planet2.scale.setScalar(10);
    skelet.add(planet2);

    const ambientLight = new THREE.AmbientLight(0x999999);
    scene.add(ambientLight);

    const lights = [
      new THREE.DirectionalLight(0xffffff, 1),
      new THREE.DirectionalLight(0x11e8bb, 1),
      new THREE.DirectionalLight(0x8200c9, 1),
    ];

    lights[0].position.set(1, 0, 0);
    lights[1].position.set(0.75, 1, 0.5);
    lights[2].position.set(-0.75, -1, 0.5);
    scene.add(...lights);

    const smokeLoader = new THREE.TextureLoader();
    const smokeTexture = smokeLoader.load("https://s3-us-west-2.amazonaws.com/s.cdpn.io/95637/Smoke-Element.png");
    const smokeMaterial = new THREE.MeshLambertMaterial({ color: 0x00dddd, map: smokeTexture, transparent: true });
    const smokeGeo = new THREE.PlaneGeometry(300, 300);
    const smokeParticles: THREE.Mesh[] = [];

    for (let p = 0; p < 150; p += 1) {
      const particleMesh = new THREE.Mesh(smokeGeo, smokeMaterial);
      particleMesh.position.set(Math.random() * 500 - 250, Math.random() * 500 - 250, Math.random() * 1000 - 100);
      particleMesh.rotation.z = Math.random() * Math.PI * 2;
      scene.add(particleMesh);
      smokeParticles.push(particleMesh);
    }

    let clock = new THREE.Clock();

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", onWindowResize);

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      particle.rotation.x += 0;
      particle.rotation.y -= 0.004;
      circle.rotation.x -= 0.002;
      circle.rotation.y -= 0.003;
      skelet.rotation.x -= 0.001;
      skelet.rotation.y += 0.002;
      smokeParticles.forEach((sp) => {
        sp.rotation.z += delta * 0.2;
      });
      renderer.clear();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div id="canvas" ref={containerRef} className="three-page-background" />;
};

export default ThreePageBackground;
