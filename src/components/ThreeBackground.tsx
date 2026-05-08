import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const ThreeBackground: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    circle: THREE.Object3D;
    skelet: THREE.Object3D;
    particle: THREE.Object3D;
    animationId: number;
  }>();

  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize Three.js scene
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0.0);
    mountRef.current.appendChild(renderer.domElement);

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

    // Create geometries
    const geometry = new THREE.TetrahedronGeometry(2, 0);
    const geom = new THREE.IcosahedronGeometry(7, 1);
    const geom2 = new THREE.IcosahedronGeometry(15, 1);

    // Create materials
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true
    });

    // Add particles
    for (let i = 0; i < 1000; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      mesh.position.multiplyScalar(90 + (Math.random() * 700));
      mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      particle.add(mesh);
    }

    // Create planet materials
    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true
    });

    const mat2 = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      wireframe: true,
      side: THREE.DoubleSide
    });

    // Add planets
    const planet = new THREE.Mesh(geom, mat);
    planet.scale.setScalar(16);
    circle.add(planet);

    const planet2 = new THREE.Mesh(geom2, mat2);
    planet2.scale.setScalar(10);
    skelet.add(planet2);

    // Add lighting
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

    // Animation function
    const animate = () => {
      const animationId = requestAnimationFrame(animate);

      particle.rotation.x += 0.0000;
      particle.rotation.y -= 0.0040;
      circle.rotation.x -= 0.0020;
      circle.rotation.y -= 0.0030;
      skelet.rotation.x -= 0.0010;
      skelet.rotation.y += 0.0020;

      renderer.clear();
      renderer.render(scene, camera);

      return animationId;
    };

    const animationId = animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Store references for cleanup
    sceneRef.current = {
      renderer,
      scene,
      camera,
      circle,
      skelet,
      particle,
      animationId
    };

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.renderer.dispose();
        if (mountRef.current && mountRef.current.contains(sceneRef.current.renderer.domElement)) {
          mountRef.current.removeChild(sceneRef.current.renderer.domElement);
        }
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        background: 'linear-gradient(to bottom, #11e8bb 0%, #8200c9 100%)',
        pointerEvents: 'none'
      }}
    />
  );
};

export default ThreeBackground;