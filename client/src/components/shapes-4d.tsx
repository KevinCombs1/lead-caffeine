import { useRef, useMemo, useState, useCallback, Component, type ErrorInfo, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("WebGL not available:", error.message);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

type Vec4 = [number, number, number, number];

const rotateXW = (p: Vec4, a: number): Vec4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[3] * s, p[2], p[1] * s + p[3] * c];
};

const rotateYW = (p: Vec4, a: number): Vec4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[3] * s, p[1], p[2], p[0] * s + p[3] * c];
};

const rotateZW = (p: Vec4, a: number): Vec4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1], p[2] * c - p[3] * s, p[2] * s + p[3] * c];
};

const project4Dto3D = (v: Vec4, dist: number = 2.5): [number, number, number] => {
  const w = 1 / (dist - v[3]);
  return [v[0] * w, v[1] * w, v[2] * w];
};

const ORTHOPLEX_VERTICES: Vec4[] = [
  [1, 0, 0, 0], [-1, 0, 0, 0],
  [0, 1, 0, 0], [0, -1, 0, 0],
  [0, 0, 1, 0], [0, 0, -1, 0],
  [0, 0, 0, 1], [0, 0, 0, -1],
];

const ORTHOPLEX_EDGES: [number, number][] = [
  [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 4], [2, 5], [3, 4], [3, 5],
  [0, 6], [0, 7], [1, 6], [1, 7], [2, 6], [2, 7], [3, 6], [3, 7],
  [4, 6], [4, 7], [5, 6], [5, 7],
];

const TESSERACT_VERTICES: Vec4[] = [];
for (let i = 0; i < 16; i++) {
  TESSERACT_VERTICES.push([
    (i & 1) ? 1 : -1,
    (i & 2) ? 1 : -1,
    (i & 4) ? 1 : -1,
    (i & 8) ? 1 : -1,
  ]);
}

const TESSERACT_EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) {
  for (let j = i + 1; j < 16; j++) {
    let diff = 0;
    for (let k = 0; k < 4; k++) {
      if (TESSERACT_VERTICES[i][k] !== TESSERACT_VERTICES[j][k]) diff++;
    }
    if (diff === 1) TESSERACT_EDGES.push([i, j]);
  }
}

function generateDuoprismVertices(n1: number, n2: number, r1: number, r2: number): Vec4[] {
  const verts: Vec4[] = [];
  for (let i = 0; i < n1; i++) {
    const a1 = (2 * Math.PI * i) / n1;
    for (let j = 0; j < n2; j++) {
      const a2 = (2 * Math.PI * j) / n2;
      verts.push([
        r1 * Math.cos(a1),
        r1 * Math.sin(a1),
        r2 * Math.cos(a2),
        r2 * Math.sin(a2),
      ]);
    }
  }
  return verts;
}

function generateDuoprismEdges(n1: number, n2: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      const idx = i * n2 + j;
      const nextI = ((i + 1) % n1) * n2 + j;
      const nextJ = i * n2 + ((j + 1) % n2);
      edges.push([idx, nextI]);
      edges.push([idx, nextJ]);
    }
  }
  return edges;
}

function generateHyperconeVertices(segments: number, rings: number): Vec4[] {
  const verts: Vec4[] = [];
  verts.push([0, 0, 0, 1]);
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const radius = t;
    const wVal = 1 - t * 2;
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      verts.push([
        radius * Math.cos(a),
        radius * Math.sin(a),
        0,
        wVal,
      ]);
    }
  }
  return verts;
}

function generateHyperconeEdges(segments: number, rings: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    edges.push([0, 1 + i]);
  }
  for (let r = 0; r < rings; r++) {
    const offset = 1 + r * segments;
    for (let i = 0; i < segments; i++) {
      edges.push([offset + i, offset + ((i + 1) % segments)]);
      if (r < rings - 1) {
        edges.push([offset + i, offset + segments + i]);
      }
    }
  }
  return edges;
}

interface Shape4DData {
  vertices: Vec4[];
  edges: [number, number][];
  color: number;
  name: string;
  description: string;
}

const SHAPES: Record<string, Shape4DData> = {
  orthoplex: {
    vertices: ORTHOPLEX_VERTICES,
    edges: ORTHOPLEX_EDGES,
    color: 0xf59e0b,
    name: "4D Orthoplex (16-Cell)",
    description: "8 vertices, 24 edges, 32 triangular faces, 8 tetrahedral cells",
  },
  tesseract: {
    vertices: TESSERACT_VERTICES,
    edges: TESSERACT_EDGES,
    color: 0xf59e0b,
    name: "4D Hypercube (Tesseract)",
    description: "16 vertices, 32 edges, 24 square faces, 8 cubic cells",
  },
  duoprism: {
    vertices: generateDuoprismVertices(8, 8, 1, 1),
    edges: generateDuoprismEdges(8, 8),
    color: 0x10b981,
    name: "4D Duoprism",
    description: "Cartesian product of two octagons — interlocking ring topology",
  },
  hypercone: {
    vertices: generateHyperconeVertices(16, 4),
    edges: generateHyperconeEdges(16, 4),
    color: 0x8b5cf6,
    name: "4D Hypercone",
    description: "Spherical base tapering to an apex in the 4th dimension",
  },
};

function Shape4DMesh({
  shape,
  autoRotate = true,
  wAngle = 0,
  scale = 1,
  opacity = 1,
}: {
  shape: Shape4DData;
  autoRotate?: boolean;
  wAngle?: number;
  scale?: number;
  opacity?: number;
}) {
  const angleRef = useRef(wAngle);

  const edgePositions = useMemo(
    () => new Float32Array(shape.edges.length * 6),
    [shape.edges.length]
  );
  const edgeGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    return geo;
  }, [edgePositions]);

  const vertexPositions = useMemo(
    () => new Float32Array(shape.vertices.length * 3),
    [shape.vertices.length]
  );
  const vertexGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(vertexPositions, 3));
    return geo;
  }, [vertexPositions]);

  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: shape.color, transparent: true, opacity }),
    [shape.color, opacity]
  );

  const pointsMaterial = useMemo(
    () => new THREE.PointsMaterial({ color: shape.color, transparent: true, opacity, size: 0.06 * scale, sizeAttenuation: true }),
    [shape.color, opacity, scale]
  );

  useFrame((_, delta) => {
    if (autoRotate) {
      angleRef.current += delta * 0.4;
    } else {
      angleRef.current = wAngle;
    }

    const angle = angleRef.current;
    const projected: [number, number, number][] = shape.vertices.map((v) => {
      let r = rotateXW(v, angle);
      r = rotateYW(r, angle * 0.7);
      return project4Dto3D(r, 3);
    });

    for (let i = 0; i < shape.vertices.length; i++) {
      vertexPositions[i * 3] = projected[i][0] * scale;
      vertexPositions[i * 3 + 1] = projected[i][1] * scale;
      vertexPositions[i * 3 + 2] = projected[i][2] * scale;
    }
    vertexGeo.attributes.position.needsUpdate = true;

    for (let e = 0; e < shape.edges.length; e++) {
      const [i, j] = shape.edges[e];
      edgePositions[e * 6] = projected[i][0] * scale;
      edgePositions[e * 6 + 1] = projected[i][1] * scale;
      edgePositions[e * 6 + 2] = projected[i][2] * scale;
      edgePositions[e * 6 + 3] = projected[j][0] * scale;
      edgePositions[e * 6 + 4] = projected[j][1] * scale;
      edgePositions[e * 6 + 5] = projected[j][2] * scale;
    }
    edgeGeo.attributes.position.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={edgeGeo} material={lineMaterial} />
      <points geometry={vertexGeo} material={pointsMaterial} />
    </group>
  );
}

export function Shape4DCanvas({
  shapeKey = "orthoplex",
  autoRotate = true,
  className = "",
  showControls = true,
  scale = 1,
  opacity = 1,
  background = "transparent",
}: {
  shapeKey?: keyof typeof SHAPES;
  autoRotate?: boolean;
  className?: string;
  showControls?: boolean;
  scale?: number;
  opacity?: number;
  background?: string;
}) {
  const shape = SHAPES[shapeKey] || SHAPES.orthoplex;

  return (
    <div className={className} style={{ background }}>
      <WebGLErrorBoundary>
        <Canvas camera={{ position: [0, 0, 4], fov: 50 }} style={{ background: "transparent" }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <Shape4DMesh shape={shape} autoRotate={autoRotate} scale={scale} opacity={opacity} />
          {showControls && <OrbitControls enableZoom={true} enablePan={false} />}
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}

export function ShapeShowcase() {
  const [activeShape, setActiveShape] = useState<keyof typeof SHAPES>("orthoplex");
  const shapeKeys = Object.keys(SHAPES) as (keyof typeof SHAPES)[];
  const currentShape = SHAPES[activeShape];

  return (
    <div className="w-full h-full flex flex-col" data-testid="section-4d-showcase">
      <div className="flex-1 relative min-h-0" style={{ background: "#0a0a0f" }}>
        <WebGLErrorBoundary fallback={
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground/40 font-mono">4D RENDERING REQUIRES WEBGL</p>
          </div>
        }>
          <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
            <color attach="background" args={["#0a0a0f"]} />
            <ambientLight intensity={0.3} />
            <pointLight position={[5, 5, 5]} intensity={0.8} color="#f59e0b" />
            <pointLight position={[-5, -5, 5]} intensity={0.4} color="#8b5cf6" />
            <Shape4DMesh shape={currentShape} autoRotate={true} scale={1.5} />
            <OrbitControls enableZoom={true} enablePan={false} />
          </Canvas>
        </WebGLErrorBoundary>

        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
          <div>
            <h2 className="text-lg font-semibold text-amber-300/90 pointer-events-auto" data-testid="text-shape-name">
              {currentShape.name}
            </h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5" data-testid="text-shape-desc">
              {currentShape.description}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono text-amber-400/30 tracking-widest">D.A.T.A. CLOUDWARE</span>
            <p className="text-[10px] font-mono text-muted-foreground/40">4D RENDERING ENGINE</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-amber-500/10 bg-card/50 backdrop-blur-sm">
        <div className="flex gap-2 flex-wrap justify-center">
          {shapeKeys.map((key) => (
            <button
              key={key}
              data-testid={`button-shape-${key}`}
              onClick={() => setActiveShape(key)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeShape === key
                  ? "bg-amber-500/20 text-amber-300 border border-amber-400/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "bg-card/40 text-muted-foreground/70 border border-amber-500/5 hover:border-amber-400/20 hover:text-amber-300/80"
              }`}
              style={{
                transform: activeShape === key ? "perspective(800px) rotateX(1deg)" : "none",
              }}
            >
              {SHAPES[key].name.replace("4D ", "")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { SHAPES, type Shape4DData };
export default Shape4DCanvas;
