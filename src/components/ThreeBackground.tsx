import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppSettings } from '@/lib/appSettings';

const ThreeBackground: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [settings] = useAppSettings();
  const threeD = settings.threeD;
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    circle: THREE.Object3D;
    skelet: THREE.Object3D;
    particle: THREE.Object3D;
    animationId: number;
  }>();
  const speedRef = useRef(threeD.speed);

  useEffect(() => {
    speedRef.current = threeD.speed;
  }, [threeD.speed]);

  useEffect(() => {
    if (!threeD.enabled) return;
    if (!mountRef.current) return;

    const mount = mountRef.current;
    let frameId = 0;
    let visible = true;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0.0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 400;
    scene.add(camera);

    const circle = new THREE.Object3D();
    const skelet = new THREE.Object3D();
    const particle = new THREE.Object3D();

    scene.add(circle);
    scene.add(skelet);
    scene.add(particle);

    const geometry = new THREE.TetrahedronGeometry(2, 0);
    const geom = new THREE.IcosahedronGeometry(7, 1);
    const geom2 = new THREE.IcosahedronGeometry(15, 1);

    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true,
    });

    for (let i = 0; i < 500; i += 1) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      mesh.position.multiplyScalar(90 + (Math.random() * 700));
      mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      particle.add(mesh);
    }

    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true,
    });

    const mat2 = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      wireframe: true,
      side: THREE.DoubleSide,
    });

    const planet = new THREE.Mesh(geom, mat);
    planet.scale.setScalar(16);
    circle.add(planet);

    const planet2 = new THREE.Mesh(geom2, mat2);
    planet2.scale.setScalar(10);
    skelet.add(planet2);

    const ambientLight = new THREE.AmbientLight(0x999999);
    scene.add(ambientLight);

    const lights = [];
    lights[0] = new THREE.DirectionalLight(0xffffff, 1);
    lights[0].position.set(1, 0, 0);
    lights[1] = new THREE.DirectionalLight(0x11E8BB, 1);
    lights[1].position.set(0.75, 1, 0.5);
    lights[2] = new THREE.DirectionalLight(0x8200C9, 1);
    lights[2].position.set(-0.75, -1, 0.5);

    lights.forEach(light => scene.add(light));

    const animate = () => {
      if (!visible || document.hidden) {
        frameId = 0;
        return;
      }

      particle.rotation.x += 0.0000;
      particle.rotation.y -= 0.0040 * speedRef.current;
      circle.rotation.x -= 0.0020 * speedRef.current;
      circle.rotation.y -= 0.0030 * speedRef.current;
      skelet.rotation.x -= 0.0010 * speedRef.current;
      skelet.rotation.y += 0.0020 * speedRef.current;

      renderer.clear();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden && !frameId) {
        frameId = requestAnimationFrame(animate);
      } else if (!visible) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    });
    observer.observe(mount);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (visible && !frameId) {
        frameId = requestAnimationFrame(animate);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    frameId = requestAnimationFrame(animate);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      circle,
      skelet,
      particle,
      animationId: frameId,
    };

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [threeD.enabled]);

  if (!threeD.enabled) return null;

  const positionStyle = threeD.position === "left" ? { left: "-18%", top: 0 }
    : threeD.position === "right" ? { left: "18%", top: 0 }
    : threeD.position === "top" ? { left: 0, top: "-18%" }
    : threeD.position === "bottom" ? { left: 0, top: "18%" }
    : { left: `${threeD.vector.x}%`, top: `${threeD.vector.y}%` };

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: positionStyle.top,
        left: positionStyle.left,
        width: '100%',
        height: '100%',
        zIndex: 0,
        background: 'linear-gradient(to bottom, #11e8bb 0%, #8200c9 100%)',
        opacity: threeD.opacity,
        pointerEvents: 'none',
        transform: `translateZ(${threeD.vector.z}px)`,
      }}
    />
  );
};

export default ThreeBackground;
