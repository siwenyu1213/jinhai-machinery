import test from 'node:test';
import assert from 'node:assert/strict';
import { ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace, Vector3, Raycaster } from 'three';
import { createMillMaterials } from '../../demos/mill-assembly/materials.js';
import { createMill } from '../../demos/mill-assembly/model.js';

test('mill texture factory is deterministic, bounded, mipmapped and usable without a DOM', () => {
  const first = createMillMaterials(), second = createMillMaterials();
  try {
    const textures = [...first.textures], other = [...second.textures];
    assert.ok(textures.length >= 4 && textures.length <= 8);
    assert.equal(textures.length, other.length);
    const used = new Set(Object.values(first.materials).flatMap(m => [m.map, m.bumpMap, m.roughnessMap].filter(Boolean)));
    for (let i=0;i<textures.length;i++) {
      const t=textures[i];
      assert.ok(used.has(t), `${t.name} must serve a surface`);
      assert.ok(t.isDataTexture);
      assert.ok(t.image.width <=256 && t.image.height <=256);
      assert.equal(t.image.data.length, t.image.width*t.image.height*4);
      assert.equal(t.generateMipmaps, true);
      assert.equal(t.minFilter, LinearMipmapLinearFilter);
      assert.equal(t.magFilter, LinearFilter);
      assert.deepEqual(t.image.data, other[i].image.data);
      assert.notEqual(t, other[i], 'separate model instances own separate resources');
      const channel=t.userData.materialRole.startsWith('oil-')?3:1;
      const channels=new Set(t.image.data.filter((_,index)=>index%4===channel));
      assert.ok(channels.size>6, 'texture must contain actual tonal detail');
    }
    for (const name of ['body','bodyLight']) {
      const m=first.materials[name];
      assert.ok(m.metalness<.1 && m.roughness>.6, 'paint remains dielectric and rough');
      assert.ok(m.bumpMap && m.roughnessMap);
      assert.equal(m.bumpMap.colorSpace, NoColorSpace);
      assert.equal(m.roughnessMap.colorSpace, NoColorSpace);
    }
    assert.ok(first.materials.steel.metalness>=.8);
    assert.ok(first.materials.machined.metalness>=.8);
    assert.equal(first.materials.rubber.metalness,0);
  } finally { first.dispose(); second.dispose(); }
});

test('oil films have soft transparent borders, wet highlights and no opaque shadow/depth shortcuts', () => {
  const assets=createMillMaterials();
  try {
    for (const m of Object.values(assets.materials).filter(m=>m.userData.materialRole.startsWith('oil-'))) {
      const t=m.map, {width,height,data}=t.image;
      assert.equal(t.colorSpace,SRGBColorSpace);
      assert.equal(t.wrapS,ClampToEdgeWrapping); assert.equal(t.wrapT,ClampToEdgeWrapping);
      assert.ok(m.transparent && m.depthTest && !m.depthWrite && m.polygonOffset);
      assert.ok(m.roughness<.3 && m.opacity<=.6);
      for(let x=0;x<width;x++) { assert.equal(data[x*4+3],0); assert.equal(data[((height-1)*width+x)*4+3],0); }
      for(let y=0;y<height;y++) { assert.equal(data[y*width*4+3],0); assert.equal(data[(y*width+width-1)*4+3],0); }
      assert.ok(data.some((value,index)=>index%4===3 && value>150),'a faint film still needs a visible center');
    }
  } finally { assets.dispose(); }
});

test('oil stays on four plausible components and its center follows a real surface', () => {
  const mill=createMill();
  try {
    let meshes=0, films=0; const owners=new Set();
    mill.root.updateMatrixWorld(true);
    for(const part of mill.parts) {
      const solids=[],oil=[];
      part.object.traverse(o=>{
        if(!o.isMesh) return; meshes++;
        if(o.userData.surfaceDetail==='oil-seep'||o.userData.surfaceDetail==='oil-drip') oil.push(o);
        else if(!o.material.transparent) solids.push(o);
      });
      for(const film of oil) {
        films++; owners.add(part.id);
        assert.equal(film.parent,part.object);
        assert.equal(film.castShadow,false);
        const normal=new Vector3(0,0,1).applyQuaternion(film.getWorldQuaternion(film.quaternion.clone())).normalize();
        const center=film.getWorldPosition(new Vector3());
        const ray=new Raycaster(center.clone().addScaledVector(normal,.1),normal.clone().negate(),0,.2);
        const hit=ray.intersectObjects(solids,false)[0];
        assert.ok(hit,`${part.id} oil must have a solid surface beneath it`);
        const gap=center.clone().sub(hit.point).dot(normal);
        assert.ok(gap>=-.0001&&gap<=.012,`${part.id} oil gap ${gap}: neither buried nor floating`);
      }
    }
    assert.deepEqual([...owners].sort(),['head-shell','knee','quill','table-right-bearing']);
    assert.ok(films>=4 && films<=6);
    assert.ok(meshes<=314,`detail mesh budget: ${meshes} vs 269 original`);
    assert.equal(mill.root.userData.surfaceDetail.totalMeshes,meshes);
  } finally { mill.dispose(); }
});

test('lead screws have connected trapezoidal helices with fewer meshes than disconnected ring stacks', () => {
  const mill=createMill();
  try {
    let total=0; mill.root.traverse(o=>{if(o.isMesh)total++;});
    assert.ok(total<269,'surface detail must not increase draw count over the original model');
    for(const id of ['lift-screw','x-leadscrew','y-leadscrew']) {
      const part=mill.parts.find(p=>p.id===id);
      const threads=part.object.children.filter(o=>o.userData.surfaceDetail==='continuous-lead-thread');
      assert.equal(threads.length,1);
      const geometry=threads[0].geometry, position=geometry.attributes.position;
      assert.equal(position.count,801*4);
      assert.ok(geometry.index.count>10000);
      // Adjacent helix stations advance along the screw axis; an isolated
      // circular ring would hold its axial coordinate constant.
      const component=id==='x-leadscrew'?0:id==='y-leadscrew'?2:1;
      const first=position.array[component], next=position.array[12+component];
      assert.ok(Math.abs(first-next)>.0001);
      assert.equal(geometry.attributes.uv.count,position.count);
    }
  } finally { mill.dispose(); }
});

test('factory disposes each shared texture and material exactly once across repeated cleanup', () => {
  const assets=createMillMaterials();
  const resources=[...assets.textures,...Object.values(assets.materials)];
  const counts=new Map(resources.map(r=>[r,0]));
  for(const r of resources) r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
  assets.dispose();assets.dispose();
  assert.ok(resources.length>8);
  for(const n of counts.values()) assert.equal(n,1);
});
