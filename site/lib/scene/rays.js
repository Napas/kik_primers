// Ray tests on plain {x, y, z} objects: the floor plane, spheres and axis-aligned boxes.

/** Where the ray meets the plane y = floorY in front of the origin, or null. */
export function floorHit(o, d, floorY) {
  if (d.y >= 0) return null;
  const t = (floorY - o.y) / d.y;
  if (t <= 0) return null;
  return { x: o.x + d.x * t, y: floorY, z: o.z + d.z * t };
}

/** Distance along unit ray d to the sphere's surface, or null if the ray passes it or it lies behind. */
export function raySphere(o, d, c, r) {
  const oc = { x: c.x - o.x, y: c.y - o.y, z: c.z - o.z };
  const along = oc.x * d.x + oc.y * d.y + oc.z * d.z;
  if (along < 0) return null;
  const off2 = oc.x ** 2 + oc.y ** 2 + oc.z ** 2 - along ** 2;
  if (off2 > r * r) return null;
  return along - Math.sqrt(r * r - off2);
}

/** Distance along ray d to the first face of the axis-aligned box {min, max}; 0 from inside; null on a miss. */
export function rayBox(o, d, { min, max }) {
  let near = 0, far = Infinity;
  for (const a of ["x", "y", "z"]) {
    if (d[a] === 0) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    const t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  return near;
}
