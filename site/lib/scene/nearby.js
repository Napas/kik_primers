// Per-frame changes that depend on where the visitor stands: spot labels and photo loading.

export const LABEL_RANGE = 12; // metres; nearer spots show their name label
export const PHOTO_RANGE = 30; // metres; nearer spots start loading their photo

/**
 * spotMeshes: Map<id, Object3D> from buildWorld; eye: the camera position; hovered: spot id or null.
 * A label shows within LABEL_RANGE (floor distance) or while hovered; a photo loader runs once within PHOTO_RANGE.
 */
export function updateNearby(spotMeshes, eye, hovered) {
  for (const [id, obj] of spotMeshes) {
    const d = Math.hypot(obj.position.x - eye.x, obj.position.z - eye.z);
    const { label, loadPhoto } = obj.userData;
    if (label) label.visible = d <= LABEL_RANGE || id === hovered;
    if (loadPhoto && d <= PHOTO_RANGE) {
      delete obj.userData.loadPhoto;
      loadPhoto();
    }
  }
}
