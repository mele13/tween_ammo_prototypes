import * as THREE from 'https://threejs.org/build/three.module.js';
import Stats from '../build/stats.module.js';
import { GLTFLoader } from '../build/GLTFLoader.js';
import { DRACOLoader } from '../build/DRACOLoader.js';
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";
import { TWEEN } from '../build/tween.module.min.js';
import { AmmoPhysics } from '../build/physics.js';

// Variable initialization
let container, stats, clock, actions, activeAction, previousAction;
let camera, scene, renderer, model, camcontrols, animActions, animAction;
const mixers = [];

// Objects
let animals = [], sceneMeshes = [], buildings = [], forest = [], assets = [], vehicles = [], props = [], rocks = [], plants = [];
let shepperd;

// Model movement
const raycaster = new THREE.Raycaster();
const targetQuaternion = new THREE.Quaternion();
let modelReady = false;
let transformAux1;

// Physics
let physicsWorld, tmpTrans, ammoClone;
let rigidBodies = [];

play("forest_sounds", true); // Surround sound    

Ammo().then((AmmoLib) => {
    Ammo = AmmoLib;
    ammoClone = Ammo;

    init();
    animate();
});

function init() {
    // Ammo initialization
    tmpTrans = new Ammo.btTransform();
    setupPhysicsWorld();

    container = document.createElement('div');
    document.body.appendChild(container);

    camInit(); // Camera initialization
    sceneRendererInit(); // Scene & renderer  

    // Orbit controls
    camcontrols = new OrbitControls(camera, renderer.domElement);
    camcontrols.screenSpacePanning = true
    camcontrols.target.set(0, 1.1, 0)

    clock = new THREE.Clock(); // Clock initialization

    // Lights
    loadHemiLight();
    // loadDirLight();

    createGroundGrid(); // Ground grid

    // Models & textures
    addFloors(), addAnimals(), addBuildings(), addVehicles(), addAssets(), addProps();

    // Events listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener("dblclick", onDoubleClick, false);
    document.onkeydown = onKeyDown;

    // Stats initialization
    stats = new Stats();
    container.appendChild(stats.dom);
}

function camInit() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250); // 250 | 5000
    camera.position.set(5, 3, 30); // 10, 0, 20
    // camera.position.set(0, 150, 100);
    // camera.lookAt(0, 2, 0);
}

function createGroundGrid() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
    mesh.rotation.x = - Math.PI / 2;
    scene.add(mesh);
    sceneMeshes.push(mesh);

    const grid = new THREE.GridHelper(140, 40, 0x000000, 0x000000);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);
}

function loadTexture(txPath, realism) {
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(txPath);

    if (realism) texture.encoding = THREE.sRGBEncoding; // Uncomment to add realism to texture
    texture.flipY = false;

    return texture;
}

function createModel(texture, modelPath, anim = undefined, scale, type1, type2,
    pos = false, posX = 0, posY = 0, posZ = 0, rot = false, rotY, Ammo = ammoClone) {
    let quat = { x: 5, y: 0, z: 0, w: 1 };
    let mass = 1;

    const loader = new GLTFLoader();

    // Dracoloader
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('build/draco/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(modelPath, function (gltf) {
        const suz = gltf.scene.children[0];
        let isShepperd = false;
        scene.add(gltf.scene);

        if (pos) { gltf.scene.position.set(posX, posY, posZ); }
        if (rot) gltf.scene.rotation.y = rotY;
        gltf.scene.scale.set(scale, scale, scale);

        model = gltf.scene;
        if (type2 === "shepperd") {
            shepperd = gltf.scene;
            modelReady = true; // Enable model to be rotated via quaternions & Euler angles
            isShepperd = true;
        }

        if (texture != undefined) {
            model.traverse((o) => {
                if (o.isMesh) {
                    o.material.map = texture;
                    o.material.needsUpdate = true;
                }
            });
        }

        typeSwitchCase(type1, type2, gltf);

        scene.add(model);
        if (anim != undefined) animateModel(model, gltf.animations, anim, isShepperd);

        // Physics in ammojs
        createRigidBodies(quat, mass, posX, posY, posZ, suz);

    }, undefined, function (e) {
        console.error(e);
    });
}

function typeSwitchCase(type1) {
    switch (type1) {
        case "animal": animals.push(model); break;
        case "building": buildings.push(model); break;
        case "forest": forest.push(model); break;
        case "asset": assets.push(model); break;
        case "vehicle": vehicles.push(model); break;
        case "prop": props.push(model); break;
        case "rock": rocks.push(model); break;
        case "plant": plants.push(model); break;
    }
}

function createRigidBodies(quat, mass, posX, posY, posZ, suz) {
    let transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(posX, posY, posZ));
    transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));

    let motionState = new Ammo.btDefaultMotionState(transform);
    let localInertia = new Ammo.btVector3(0, 0, 0);

    // Custom-like'convex hull'
    let verticesPos = suz.position;
    let triangles = [];

    for (let i = 0; i < verticesPos.length; i += 3) {
        triangles.push({
            x: verticesPos[i],
            y: verticesPos[i + 1],
            Z: verticesPos[i + 2]
        });
    }

    let triangle, triangle_mesh = new Ammo.btTriangleMesh();
    let vecA = new Ammo.btVector3(0, 0, 0);
    let vecB = new Ammo.btVector3(0, 0, 0);
    let vecC = new Ammo.btVector3(0, 0, 0);

    for (let i = 0; i < triangles.length - 3; i += 3) {
        vecA.setX(triangles[i].x);
        vecA.setY(triangles[i].y);
        vecA.setZ(triangles[i].z);

        vecB.setX(triangles[i + 1].x);
        vecB.setY(triangles[i + 1].y);
        vecB.setZ(triangles[i + 1].z);

        vecC.setX(triangles[i + 2].x);
        vecC.setY(triangles[i + 2].y);
        vecC.setZ(triangles[i + 2].z);

        triangle_mesh.addTriangle(vecA, vecB, vecC, true);
    }

    Ammo.destroy(vecA);
    Ammo.destroy(vecB);
    Ammo.destroy(vecC);

    const shape = new Ammo.btConvexTriangleMeshShape(triangle_mesh);
    suz.verticesNeedUpdate = true;
    shape.getMargin(0.5);

    shape.calculateLocalInertia(mass, localInertia);

    let rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    let rBody = new Ammo.btRigidBody(rigidBodyInfo);

    physicsWorld.addRigidBody(rBody);
    suz.userData.physicsBody = rBody;
    rigidBodies.push(suz);
}

function sceneRendererInit() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe0e0e0);
    scene.fog = new THREE.Fog(0xe0e0e0, 20, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    // renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);
}

function loadHemiLight() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
}

function loadDirLight() {
    const dirLight = new THREE.DirectionalLight(0xffffff);
    dirLight.position.set(0, 20, 10);
    scene.add(dirLight);
}

function animateModel(model, animations, anim, isShepperd) {
    const mixer = new THREE.AnimationMixer(model);
    mixers.push(mixer);

    if (isShepperd) {
        actions = {};

        for (let i = 0; i < animations.length; i++) {
            const clip = animations[i];
            const action = mixer.clipAction(clip);
            actions[clip.name] = action;
        }

        // console.log(actions);
        activeAction = actions[anim];
        activeAction.play();
    } else {
        animActions = {};

        for (let i = 0; i < animations.length; i++) {
            const clip = animations[i];
            const action = mixer.clipAction(clip);
            animActions[clip.name] = action;
        }

        // console.log(animActions);
        animAction = animActions[anim];
        animAction.play();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function onDoubleClick(e) {
    const mouse = {
        x: (e.clientX / renderer.domElement.clientWidth) * 2 - 1,
        y: -(e.clientY / renderer.domElement.clientHeight) * 2 + 1,
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(sceneMeshes, false);

    if (intersects.length > 0) {
        const p = intersects[0].point;
        const distance = shepperd.position.distanceTo(p);
        const rotationMatrix = new THREE.Matrix4();

        rotationMatrix.lookAt(p, shepperd.position, shepperd.up);
        targetQuaternion.setFromRotationMatrix(rotationMatrix);

        setAction(actions['WalkCycle'], true)

        TWEEN.removeAll();
        new TWEEN.Tween(shepperd.position)
            .to(
                {
                    x: p.x,
                    y: p.y,
                    z: p.z,
                },
                (1000 / 3.2) * distance
            ) // Runs 3 meters a second * the distance - 5 running
            .onUpdate(() => {
                camcontrols.target.set(
                    shepperd.position.x,
                    shepperd.position.y + 1,
                    shepperd.position.z
                )
            })
            .start()
            .onComplete(() => {
                setAction(actions['SitDown']);
                activeAction.clampWhenFinished = true;
                activeAction.loop = THREE.LoopOnce;
            });
    };
}

function setAction(toAction, loop) {
    if (toAction != activeAction) {
        previousAction = activeAction;
        activeAction = toAction;
        previousAction.fadeOut(0.1);

        activeAction.reset();
        activeAction.fadeIn(0.1);
        activeAction.play();

        if (!loop) {
            activeAction.clampWhenFinished = true;
            activeAction.loop = THREE.LoopOnce;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    camcontrols.update();

    const dt = clock.getDelta();
    // updatePhysics(dt);

    if (modelReady) {
        mixers.forEach(function (mixer) {
            mixer.update(dt);
        });

        if (!shepperd.quaternion.equals(targetQuaternion))
            shepperd.quaternion.rotateTowards(targetQuaternion, dt * 10);
    }

    TWEEN.update();

    render();
    stats.update();
}

function render() {
    renderer.render(scene, camera);
}

function onKeyDown(key) {
    switch (key.keyCode) {
        case 32: // Spacebar activates jump
            // BUG: if spacebar is activated when reached point p - animation gets stuck in walkcycle instead of laying down (prev)
            activeActionCases('Jump'); break;
        case 71: // Key 'G' to play 'whistle' sound and activate ear twitch animation
            // BUG: if whistle animation has not ended and walking animation is activated
            // whistle can be activated while walking before the previous walking animation is finished
            activeActionCases('IdleEarTwitch', false, true, false, true); break;
        case 82: // Key 'R' to activate idle (standing) animation
            activeActionCases('Idle1', false, false, true); break;
        case 84: // Key 'T' to activate laying down animation
            activeActionCases('LayDown', false, false); break;
        case 89: // Key 'Y' to activate sit down animation
            activeActionCases('SitDown', false, false); break;
        case 66: // Key 'B' to activate scratching ear animation
            activeActionCases('SitScratchEar', false); break;
    }
}

function auxAction(aux, nxAux, loopPrev, loop, sound = false) {
    setAction(actions[aux], loop);
    if (loopPrev) setTimeout(() => { setAction(actions[nxAux], true); }, 1500);
    if (sound) play("whistle");
}

function activeActionCases(aux, walkAct = true, loopPrev = true, loop = false, sound) {
    if (activeAction == actions['Idle1']) auxAction(aux, 'Idle1', loopPrev, loop, sound);
    else if (activeAction == actions['LayDown']) auxAction(aux, 'LayDown', loopPrev, loop, sound);
    else if (activeAction == actions['SitDown']) auxAction(aux, 'SitDown', loopPrev, loop, sound);
    else if (activeAction == actions['WalkCycle']) if (walkAct) auxAction(aux, 'WalkCycle', loopPrev, loop, sound);
}

function play(element, loop = false) {
    var audio = document.getElementById(element);
    if (loop)
        document.getElementById(element).addEventListener('ended', function () {
            this.currentTime = 0;
            this.play();
        }, false);
    audio.play();
}

function createFloor(width, height, depth, col, posX, posY, posZ, texture = undefined) {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshBasicMaterial({ color: col });

    if (texture != undefined) mat.map = texture;
    const floor = new THREE.Mesh(geom, mat);

    floor.position.set(posX, posY, posZ);
    scene.add(floor);
}

function createPond(radius, height, radialS, heightS, theSt, theLen, col, posX, posY, posZ, texture = undefined) {
    const geom = new THREE.ConeGeometry(radius, height, radialS, heightS, theSt, theLen);
    const mat = new THREE.MeshBasicMaterial({ color: col });

    if (texture != undefined) mat.map = texture;
    const pond = new THREE.Mesh(geom, mat);

    pond.position.set(posX, posY, posZ);
    scene.add(pond);
}

function addFloors() {
    createStreet();
    createSoilFloor();
    addPond();
}

function addAnimals() {
    // const wolfTexture = loadTexture('../assets/textures/white1.jpg', false); // Texture
    // createModel(wolfTexture, '../assets/models/animals/fully_rigged_ikfk_wolf.glb', undefined, 0.010, "animal", "wolf"); // Wolf - 'Run'
    createModel(undefined, '../assets/models/animals/stylized_low_poly_german_shepherd.glb', "Idle1", 0.08, "animal", "shepperd", true, 10, 0, 20); // German shepperd puppy
    createModel(undefined, '../assets/models/animals/chicken_-_rigged.glb', 'chicken-rig|pecking', 0.004, "animal", "chicken", true, -44, 0, -36, true, 90); // Chicken
    createModel(undefined, '../assets/models/animals/chicken_-_rigged.glb', 'chicken-rig|sitting-idle', 0.004, "animal", "chicken2", true, -42, 0, -28, true, 3); // Chicken 2
    createModel(undefined, '../assets/models/animals/chicken_-_rigged.glb', 'chicken-rig|sitting-idle', 0.004, "animal", "chicken3", true, -40, 0, -29, true, 5); // Chicken 3
    createModel(undefined, '../assets/models/animals/chicken_-_rigged.glb', 'chicken-rig|sitting-idle', 0.004, "animal", "chicken3", true, -43, 0, -28.5, true, 1); // Chicken 4
    createModel(undefined, '../assets/models/animals/bear_o_rigged.glb', 'Armature.BearO|Armature.BearOAction', 0.03, "animal", "bear", true, -28, 0.1, 50, true, 2); // Bear
    createModel(undefined, '../assets/models/animals/low_poly_deer.glb', 'Armature|Eat', 1.8, "animal", "deer", true, 8, 0, 50, true, 2.2); // Deer
    createModel(undefined, '../assets/models/animals/stylized_animated_fox.glb', 'Armature|Cinematic.001', 0.0035, "animal", "fox", true, -15, -0.1, 25, true, 2); // Fox
    createModel(undefined, '../assets/models/animals/low_poly_rabbit.glb', 'Armature.001|Idle', 0.3, "animal", "rabbit", true, 0, 0.3, 0, true, 0); // Rabbit
    createModel(undefined, '../assets/models/animals/low_poly_rabbit.glb', 'Armature.001|Idle', 0.3, "animal", "rabbit2", true, -25, 0.06, -30, true, 1); // Rabbit 2
    createModel(undefined, '../assets/models/animals/low-poly_sheep.glb', 'Armature|ArmatureAction.002', 1.2, "animal", "sheep", true, -45, 1, -10, true, 5.5); // Sheep
    createModel(undefined, '../assets/models/animals/low-poly_sheep.glb', 'Armature|ArmatureAction.002', 1.2, "animal", "sheep2", true, -45, 1, -15, true, 10); // Sheep 2
    createModel(undefined, '../assets/models/animals/horse.glb', 'Horse_Idle', 0.015, "animal", "horse", true, 55, 1, 5, true, -2); // Horse
    createModel(undefined, '../assets/models/animals/wolf.glb', 'Main', 1.3, "animal", "wolf", true, 47, 0, 62, true, -2.2); // Wolf
    createModel(undefined, '../assets/models/animals/cat.glb', 'Take 001', 0.05, "animal", "cat", true, 48, 0, -45, true, 4); // Cat
    createModel(undefined, '../assets/models/animals/frog_low_poly_trianguted.glb', undefined, 1, "animal", "frog", true, 23, 0.15, 38, true, 4); // Frog
}

function addPond() {
    const pondTexture = loadTexture('../assets/textures/ocean_low_poly_texture.jfif', false); // Texture
    createPond(15, 0.1, 27, 1, 0, 1, 0xffffff, 20, 0.05, 45, pondTexture); // pondTexture
}

function createSoilFloor() {
    createFloor(95, 0.05, 140, 0x354f0c, -22.5, 0, 0, 0); // Left forest - 0000ffff
    createFloor(45, 0.05, 60, 0x354f0c, 47.5, 0, 40); // Middle
    createFloor(25, 0.05, 80, 0x5C411E, 57.5, 0, -30); // Top right soil
    createFloor(15, 0.05, 4.7, 0x1B1309, 52.9, 0.01, -34.9); // House path
}

function createStreet() {
    createFloor(20, 0.05, 80, 0x262625, 35, 0, -30, 0); // Street
    createFloor(1, 0.05, 16, 0xffff00, 35, 0.01, -55, 0); // Yellow strip top
    createFloor(1, 0.05, 16, 0xffff00, 35, 0.01, -30, 0); // Yellow strip middle
    createFloor(1, 0.05, 16, 0xffff00, 35, 0.01, -5, 0); // Yellow strip bottom
}

function addBuildings() {
    createModel(undefined, '../assets/farm_objects/buildings/low-poly_barn.glb', undefined, 1.1, "building", "barn", true, -45, 3.5, -55, true, 0); // Barn
    createModel(undefined, '../assets/farm_objects/buildings/stylized_house_demo.glb', undefined, 15, "building", "forest_house", true, 60, 0, -45, true, -1.55); // House
    createModel(undefined, '../assets/farm_objects/buildings/chicken_coop.glb', undefined, 0.01, "building", "coop", true, -50, 0, -30, true, 1.65); // Chicken coop
    createModel(undefined, '../assets/farm_objects/buildings/lowpoly_windmill_-_animated.glb', 'Animation', 4, "building", "coop", true, -60, 0.8, -10, true, 0); // Windmill
    createModel(undefined, '../assets/farm_objects/buildings/treehouse.glb', undefined, 0.0035, "building", "treehouse", true, 60, 0, 25, true, 0); // Treehouse
}

function addVehicles() {
    createModel(undefined, '../assets/farm_objects/cars/low-poly_truck_car_drifter.glb', 'Car engine', 0.015, "vehicle", "car", true, 40, 0.6, 2.5, true, 1.6); // Car
    // createModel(undefined, '../assets/farm_objects/planes/cartoon_plane.glb', 'Main', 8, "vehicle", "plane", true, -20, 35, -10, true, 0); // Plane
    createModel(undefined, '../assets/farm_objects/cars/combine_harvester.glb', undefined, 2, "vehicle", "harvester", true, -10, 0, -50, true, 2.2); // Harvester
}

function addProps() {
    createFences(), createTrees(), createPlants();
    createModel(undefined, '../assets/farm_objects/props/tree_block_set_2_change_colour.glb', undefined, 0.4, "prop", "tree_logs", true, 56, -1, -58); // Tree logs
    createModel(undefined, '../assets/farm_objects/props/candy_corn_from_poly_by_google.glb', undefined, 0.01, "prop", "corn", true, -45, 0, -35); // Corn
    createModel(undefined, '../assets/farm_objects/props/low_poly_picnic_table.glb', undefined, 0.02, "prop", "picnic_table", true, -6, 0, 55); // Picnic table
    createModel(undefined, '../assets/farm_objects/props/water_bowl.glb', undefined, 2, "prop", "water_tray", true, -50, 0.26, -21, true, 0); // Water tray
    createModel(undefined, '../assets/farm_objects/props/wood_barrel.glb', undefined, 3, "prop", "wood_barrel1", true, -55, 0, -48); // Wood barrel 1
    createModel(undefined, '../assets/farm_objects/props/wood_barrel.glb', undefined, 3, "prop", "wood_barrel2", true, -53, 0, -48); // Wood barrel 2
    createModel(undefined, '../assets/farm_objects/props/wood_barrel.glb', undefined, 3, "prop", "wood_barrel2", true, -54, 0, -46); // Wood barrel 2
    createModel(undefined, '../assets/farm_objects/props/low_poly_road_sign.glb', undefined, 0.06, "prop", "wood_sign", true, 25, 0, 10, true, 3); // Wood sign
    createModel(undefined, '../assets/farm_objects/props/low_poly_dock_bridge.glb', undefined, 0.006, "prop", "bridge", true, 18, -1, 52, true, 2.8); // Wood bridge
    createModel(undefined, '../assets/farm_objects/props/sign.glb', undefined, 0.5, "prop", "sign_small", true, 48, 0, 33, true, 1.55); // Wood small sign
    createModel(undefined, '../assets/farm_objects/props/desert-low_poly.glb', undefined, 0.01, "prop", "desert_texture", true, 60, -0.1, 25, true, 0); // Desert texture
}

function createPlants() {
    createModel(undefined, '../assets/farm_objects/plants/allotment_farm.glb', undefined, 0.004, "plant", "allotment1", true, -20, 4, -39, true, 0); // Allotment 1
    createModel(undefined, '../assets/farm_objects/plants/allotment_farm.glb', undefined, 0.004, "plant", "allotment2", true, -20, 4, -59, true, 0); // Allotment 2
    createModel(undefined, '../assets/farm_objects/plants/allotment_farm.glb', undefined, 0.004, "plant", "allotment3", true, 0, 4, -39, true, 0); // Allotment 3
    createModel(undefined, '../assets/farm_objects/plants/allotment_farm.glb', undefined, 0.004, "plant", "allotment4", true, 0, 4, -59, true, 0); // Allotment 4
    createModel(undefined, '../assets/farm_objects/plants/reeds_low_poly.glb', undefined, 0.8, "plant", "reeds1", true, 0, 0.05, 20, true, 0); // Reeds 1
    createModel(undefined, '../assets/farm_objects/plants/reeds_low_poly.glb', undefined, 0.8, "plant", "reeds1", true, -2, 0.05, 18, true, 0); // Reeds 2
    createModel(undefined, '../assets/farm_objects/plants/reeds_low_poly.glb', undefined, 0.8, "plant", "reeds1", true, -7, 0.05, 18, true, 0); // Reeds 3
    createModel(undefined, '../assets/farm_objects/plants/waterlily.glb', undefined, 1.2, "plant", "waterlily1", true, 25, 0.05, 40, true, 0); // Waterlily 1
    createModel(undefined, '../assets/farm_objects/plants/waterlily.glb', undefined, 1.4, "plant", "waterlily2", true, 23, 0.05, 38, true, 0); // Waterlily 2
    createModel(undefined, '../assets/farm_objects/plants/low_poly_plant_in_a_pot.glb', undefined, 0.4, "plant", "plant_pot", true, -40, 0.05, -1, true, 0); // Plant pot
}

function createTrees() {
    createModel(undefined, '../assets/farm_objects/trees/forest_trees/tree_main_forest.glb', undefined, 0.024, "forest", "forest_tree1", true, -18, 0, 68); // Forest tree 1
    createModel(undefined, '../assets/farm_objects/trees/farm_trees/tree_main_farm_1.glb', undefined, 0.25, "forest", "farm_tree1", true, 57, 0, -63); // Farm tree 1
    createModel(undefined, '../assets/farm_objects/trees/farm_trees/tree_main_farm_1.glb', undefined, 0.25, "forest", "farm_tree2", true, 63, 0, -58); // Farm tree 2
}

function createFences() {
    createModel(undefined, '../assets/farm_objects/props/low_poly_fence.glb', undefined, 0.01, "building", "fence1", true, 45.5, 0.5, 9.5); // Fence 1
    createModel(undefined, '../assets/farm_objects/props/low_poly_fence.glb', undefined, 0.01, "building", "fence2", true, 54, 0.5, 9.5); // Fence 2
    createModel(undefined, '../assets/farm_objects/props/low_poly_fence.glb', undefined, 0.01, "building", "fence3", true, 62.5, 0.5, 9.5); // Fence 3    
}

function addAssets() {
    createModel(undefined, '../assets/farm_objects/hutt_in_forest_lowpoly_diorama.glb', undefined, 0.015, "forest", "forest_with_hut", true, -35, 0.36, 35, true, 1); // Forest with hut
    createModel(undefined, '../assets/farm_objects/organic_farm.glb', undefined, 0.03, "asset", "organic_farm1", true, 60, 0.36, -5, true, 3.14); // Organic farm 1
    createModel(undefined, '../assets/farm_objects/organic_farm.glb', undefined, 0.03, "asset", "organic_farm2", true, 60, 0.36, -15, true, 0); // Organic farm 2
    createModel(undefined, '../assets/farm_objects/low_poly_landscape.glb', undefined, 2, "asset", "rock_landscape", true, 15, 1.5, 106.5, true, 2.5); // Rock landscape
}

function setupPhysicsWorld() { // https://medium.com/@bluemagnificent/intro-to-javascript-3d-physics-using-ammo-js-and-three-js-dd48df81f591
    let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    let dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    let overlappingPairCache = new Ammo.btDbvtBroadphase();
    let solver = new Ammo.btSequentialImpulseConstraintSolver();
    const softBodySolver = new Ammo.btDefaultSoftBodySolver(); // Comment for rigid bodies

    physicsWorld = new Ammo.btSoftRigidDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration, softBodySolver); // Comment for rigid bodies
    // physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration); // Uncomment for rigid bodies
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
    physicsWorld.getWorldInfo().set_m_gravity(new Ammo.btVector3(0, -9.8, 0)); // Comment for rigid bodies

    transformAux1 = new Ammo.btTransform(); // Comment for rigid bodies
}

function updatePhysics(dt) {
    // Step world
    physicsWorld.stepSimulation(dt, 10);

    // Update rigid bodies
    for (let i = 0; i < rigidBodies.length; i++) {
        let objThree = rigidBodies[i];
        let objAmmo = objThree.userData.physicsBody;
        let ms = objAmmo.getMotionState();

        if (ms) {
            ms.getWorldTransform(tmpTrans);
            let p = tmpTrans.getOrigin();
            let q = tmpTrans.getRotation();
            objThree.position.set(p.x(), p.y(), p.z());
            objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
        }
    }
}
