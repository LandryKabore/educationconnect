import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, Box, Sphere, Torus, Cone, Cylinder } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

interface FloatingElementProps {
  position: [number, number, number];
  shape: 'box' | 'sphere' | 'torus' | 'cone' | 'cylinder';
  mousePosition: { x: number; y: number };
  intensity: number;
}

const FloatingElement = ({ position, shape, mousePosition, intensity }: FloatingElementProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();
  
  useFrame((state) => {
    if (meshRef.current) {
      // Smooth mouse following
      const targetX = (mousePosition.x * viewport.width) / 2 * intensity;
      const targetY = (mousePosition.y * viewport.height) / 2 * intensity;
      
      meshRef.current.position.x = THREE.MathUtils.lerp(
        meshRef.current.position.x,
        position[0] + targetX * 0.1,
        0.1
      );
      meshRef.current.position.y = THREE.MathUtils.lerp(
        meshRef.current.position.y,
        position[1] + targetY * 0.1,
        0.1
      );
      
      // Gentle rotation
      meshRef.current.rotation.x += 0.005;
      meshRef.current.rotation.y += 0.003;
    }
  });

  const shapeProps = {
    ref: meshRef,
    position,
    castShadow: true,
    receiveShadow: true,
  };

  const material = (
    <meshStandardMaterial
      color={new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.7, 0.6)}
      transparent
      opacity={0.3}
      emissive={new THREE.Color().setHSL(0.05, 0.5, 0.1)}
    />
  );

  switch (shape) {
    case 'box':
      return (
        <Box {...shapeProps} args={[0.8, 0.8, 0.8]}>
          {material}
        </Box>
      );
    case 'sphere':
      return (
        <Sphere {...shapeProps} args={[0.5, 16, 16]}>
          {material}
        </Sphere>
      );
    case 'torus':
      return (
        <Torus {...shapeProps} args={[0.6, 0.2, 8, 16]}>
          {material}
        </Torus>
      );
    case 'cone':
      return (
        <Cone {...shapeProps} args={[0.4, 1, 8]}>
          {material}
        </Cone>
      );
    case 'cylinder':
      return (
        <Cylinder {...shapeProps} args={[0.3, 0.3, 1, 8]}>
          {material}
        </Cylinder>
      );
    default:
      return null;
  }
};

interface FloatingElements3DProps {
  mousePosition: { x: number; y: number };
}

const FloatingElements3D = ({ mousePosition }: FloatingElements3DProps) => {
  const elements = [
    { position: [-8, 4, -2] as [number, number, number], shape: 'box' as const, intensity: 1 },
    { position: [8, 3, -4] as [number, number, number], shape: 'sphere' as const, intensity: 0.8 },
    { position: [-6, -3, -1] as [number, number, number], shape: 'torus' as const, intensity: 1.2 },
    { position: [6, -2, -5] as [number, number, number], shape: 'cone' as const, intensity: 0.9 },
    { position: [-4, 1, -3] as [number, number, number], shape: 'cylinder' as const, intensity: 1.1 },
    { position: [4, -4, -2] as [number, number, number], shape: 'box' as const, intensity: 0.7 },
    { position: [-2, 4, -6] as [number, number, number], shape: 'sphere' as const, intensity: 1.3 },
    { position: [2, 2, -1] as [number, number, number], shape: 'torus' as const, intensity: 0.6 },
    { position: [-9, -1, -4] as [number, number, number], shape: 'cone' as const, intensity: 1.0 },
    { position: [9, 1, -3] as [number, number, number], shape: 'cylinder' as const, intensity: 0.8 },
  ];

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      camera={{ position: [0, 0, 10], fov: 60 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#ff6b35" />
      <pointLight position={[-10, -10, 5]} intensity={0.3} color="#f7931e" />
      
      {elements.map((element, index) => (
        <FloatingElement
          key={index}
          position={element.position}
          shape={element.shape}
          mousePosition={mousePosition}
          intensity={element.intensity}
        />
      ))}
      
      {/* Background particles */}
      <group>
        {Array.from({ length: 50 }, (_, i) => (
          <Sphere
            key={i}
            position={[
              (Math.random() - 0.5) * 30,
              (Math.random() - 0.5) * 20,
              (Math.random() - 0.5) * 20 - 10
            ]}
            args={[0.02, 4, 4]}
          >
            <meshBasicMaterial
              color="#ff6b35"
              transparent
              opacity={0.1}
            />
          </Sphere>
        ))}
      </group>
    </Canvas>
  );
};

export default FloatingElements3D;