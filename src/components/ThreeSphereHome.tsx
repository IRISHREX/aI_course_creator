import { useEffect, useRef } from "react";
import * as THREE from "three";

const ThreeSphereHome = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(95, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const material = new THREE.MeshBasicMaterial({ transparent: true, color: 0xff00ff, opacity: 0.28, side: THREE.DoubleSide });

    const pitchSegments = 60;
    const elevationSegments = pitchSegments / 2;
    const particlesCount = pitchSegments * elevationSegments;
    const side = Math.pow(particlesCount, 1 / 3);
    const radius = 16;

    const parentContainer = new THREE.Object3D();
    scene.add(parentContainer);

    const mousePos = new THREE.Vector2(0.5, 0.5);
    let phase = 0;

    function posInBox(place: number) {
      return ((place / side) - 0.5) * radius * 1.2;
    }

    for (let p = 0; p < pitchSegments; p += 1) {
      const pitch = Math.PI * 2 * p / pitchSegments;
      for (let e = 0; e < elevationSegments; e += 1) {
        const elevation = Math.PI * ((e / elevationSegments) - 0.5);
        const particle = new THREE.Mesh(geometry, material);

        parentContainer.add(particle);

        const dest = new THREE.Vector3();
        dest.z = (Math.sin(pitch) * Math.cos(elevation)) * radius;
        dest.x = (Math.cos(pitch) * Math.cos(elevation)) * radius;
        dest.y = Math.sin(elevation) * radius;

        const index = parentContainer.children.length - 1;
        particle.position.set(
          posInBox(index % side),
          posInBox(Math.floor(index / side) % side),
          posInBox(Math.floor(index / Math.pow(side, 2)) % side)
        );

        particle.userData = {
          dests: [dest, particle.position.clone()],
          speed: new THREE.Vector3(),
        };
      }
    }

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const onMouseMove = (event: MouseEvent) => {
      mousePos.set(event.clientX / window.innerWidth, event.clientY / window.innerHeight);
    };

    const animate = () => {
      phase += 0.002;
      parentContainer.children.forEach((child) => {
        const particle = child as THREE.Mesh;
        const data = particle.userData as { dests: THREE.Vector3[]; speed: THREE.Vector3 };
        const dest = data.dests[Math.floor(phase) % data.dests.length].clone();
        const diff = dest.sub(particle.position);
        data.speed.divideScalar(1.02);
        data.speed.add(diff.divideScalar(400));
        particle.position.add(data.speed);
        particle.lookAt(dest);
      });

      parentContainer.rotation.y = phase * 3;
      parentContainer.rotation.x = (mousePos.y - 0.5) * Math.PI;
      parentContainer.rotation.z = (mousePos.x - 0.5) * Math.PI;

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    resize();
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      parentContainer.clear();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="three-home-canvas hidden lg:block" />;
};

export default ThreeSphereHome;
