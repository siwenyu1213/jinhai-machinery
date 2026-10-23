import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Vite copies these CC0 assets into the standalone build. Runtime requests stay
// on the preview origin; no third-party hotlinks, credentials or CDN dependency.
export const SURFACE_ASSETS = {
  metalColor: new URL('./assets/Metal012_1K-JPG_Color.jpg', import.meta.url).href,
  metalNormal: new URL('./assets/Metal012_1K-JPG_NormalGL.jpg', import.meta.url).href,
  metalRoughness: new URL('./assets/Metal012_1K-JPG_Roughness.jpg', import.meta.url).href,
  quillScale: new URL('./assets/quill-scale.svg', import.meta.url).href,
  environment: new URL('./assets/studio_small_09_1k.hdr', import.meta.url).href,
};

export async function loadMillSurfaceAssets() {
  const loader = new TextureLoader();
  const keys = Object.keys(SURFACE_ASSETS);
  const results = await Promise.allSettled(keys.map(key => key === 'environment'
    ? new HDRLoader().loadAsync(SURFACE_ASSETS[key])
    : loader.loadAsync(SURFACE_ASSETS[key])));
  const surfaceMaps = {};
  let environment;
  const missing = [];
  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status !== 'fulfilled') { missing.push(key); return; }
    const texture = result.value;
    texture.name = key === 'environment' ? 'studio-small-09-hdr' : key === 'quillScale' ? 'illustrated-quill-scale' : `ambientcg-${key}`;
    if (key === 'environment') { environment = texture; return; }
    if (key === 'metalColor' || key === 'quillScale') texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    if (key !== 'quillScale') texture.repeat.set(3, 3);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.userData = { surfaceDetail: key === 'quillScale' ? 'engraved-scale' : 'cc0-metal012', source: key === 'quillScale' ? 'local illustration' : 'ambientCG Metal012' };
    surfaceMaps[key] = texture;
  });
  return { surfaceMaps, environment, missing };
}
