import * as THREE from 'https://threejs.org/build/three.module.js';
import Stats from '../build/stats.module.js';
import { GUI } from '../build/lil-gui.module.min.js';
import { GLTFLoader } from '../build/GLTFLoader.js';
import { DRACOLoader } from '../build/DRACOLoader.js';
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";
import { TWEEN } from '../build/tween.module.min.js';
import { SkeletonHelper } from '../build/three.module.js';
import { AmmoPhysics } from '../build/physics.js';

// Variable initialization
let container, stats, statsContainer, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face, t0, camcontrols, shepperd;

// Objects
let animals = [], sceneMeshes = [], buildings = [];

// Model movement
const raycaster = new THREE.Raycaster();
const targetQuaternion = new THREE.Quaternion();
let modelReady = false;

// Physics
let physicsWorld, tmpTrans, ammoClone;
let rigidBodies = [];

Ammo().then( (AmmoLib) => {
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
    // play("forest_sounds", true); // Surround sound    

    // Models & textures
    createAnimals();
    createModel(undefined, 'src/assets/farm_objects/props/fence.glb', undefined, 0.05, "building", "fence", true, -40); // Fence

    // Events listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener("dblclick", onDoubleClick, false);
    document.onkeydown = onKeyDown;

    // Stats initialization
    stats = new Stats();
    container.appendChild(stats.dom);
}

function camInit() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(-5, 3, 10);
    // camera.lookAt(0, 2, 0);
}

function createGroundGrid() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
    mesh.rotation.x = - Math.PI / 2;
    scene.add(mesh);
    sceneMeshes.push(mesh);

    const grid = new THREE.GridHelper(200, 40, 0x000000, 0x000000);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);
}

function loadTexture(txPath, realism) {
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(txPath);

    if (realism) texture.encoding = THREE.sRGBEncoding; // uncomment - realism
    texture.flipY = false;

    return texture;
}

function createModel(texture, modelPath, anim = undefined, scale, type1, type2,
    pos = false, posX = 0, posY = 0, posZ = 0, rot = false, rotY, Ammo = ammoClone) 
{
    let quat = { x: 5, y: 0, z: 0, w: 1 };
    let mass = 1;

    const loader = new GLTFLoader();

    // Dracoloader
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('build/draco/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(modelPath, function (gltf) {
        const suz = gltf.scene.children[0];
        scene.add(gltf.scene);

        if (pos) { gltf.scene.position.set(posX, posY, posZ); }
        if (rot) gltf.scene.rotation.y = rotY;
        gltf.scene.scale.set(scale, scale, scale);

        if (type2 == "shepperd") shepperd = gltf.scene;
        model = gltf.scene;

        if (texture != undefined) {
            model.traverse((o) => {
                if (o.isMesh) {
                    o.material.map = texture;
                    o.material.needsUpdate = true;
                }
            });
        }

        switch (type1) {
            case "animal": animals.push(model); break;
            case "building": buildings.push(model); break;
        }

        scene.add(model);
        if (anim != undefined) createGUI(model, gltf.animations, anim);

        // Physics in ammojs
        createRigidBodies(quat, mass, posX, posY, posZ, suz);        

    }, undefined, function (e) {
        console.error(e);
    });
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
    // scene.fog = new THREE.Fog(0xe0e0e0, 20, 100);

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

function createGUI(model, animations, anim) {
    mixer = new THREE.AnimationMixer(model);

    actions = {};

    for (let i = 0; i < animations.length; i++) {
        const clip = animations[i];
        const action = mixer.clipAction(clip);
        actions[clip.name] = action;
    }

    // console.log(actions);
    activeAction = actions[anim];
    activeAction.play();

    modelReady = true; // Model can be rotated
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
                (1000 / 2.2) * distance
            ) // Runs 2 meters a second * the distance - 5 running
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
        mixer.update(dt);

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

function createAnimals() {
    // const wolfTexture = loadTexture('src/assets/textures/white1.jpg', false); // Texture
    // createModel(wolfTexture, 'src/assets/models/animals/fully_rigged_ikfk_wolf.glb', undefined, 0.010, "animal", "wolf"); // Wolf - 'Run'
    createModel(undefined, 'src/assets/models/animals/chicken_-_rigged.glb', 'chicken-rig|walking', 0.004, "animal", "chicken", true, 10, 0, 0, true, 90); // Chicken
    createModel(undefined, 'src/assets/models/animals/bear_o_rigged.glb', undefined, 0.03, "animal", "bear", true, -10); // Bear
    createModel(undefined, 'src/assets/models/animals/low_poly_deer.glb', undefined, 1.8, "animal", "deer", true, -5); // Deer
    createModel(undefined, 'src/assets/models/animals/low_poly_fox_running_animation.glb', undefined, 0.1, "animal", "fox", true, 5, 0, 0, true, 89.7); // Fox
    createModel(undefined, 'src/assets/models/animals/low_poly_rabbit.glb', undefined, 0.3, "animal", "rabbit", true, 15); // Rabbit
    createModel(undefined, 'src/assets/models/animals/low-poly_racoon_run_animation.glb', undefined, 1.2, "animal", "racoon", true, -15); // Racoon
    createModel(undefined, 'src/assets/models/animals/low-poly_sheep.glb', undefined, 1.2, "animal", "sheep", true, -20, 1, 0, true, 3); // Sheep
    createModel(undefined, 'src/assets/models/animals/rigged_mid_poly_horse.glb', undefined, 1.6, "animal", "horse", true, 20, 0, 0, true, 1.5); // Horse
    createModel(undefined, 'src/assets/models/animals/wolf.glb', undefined, 1.3, "animal", "wolf", true, 0); // Wolf
    createModel(undefined, 'src/assets/models/animals/cat.glb', undefined, 0.05, "animal", "cat", true, 25, 0, 0, true, 4); // Cat
    createModel(undefined, 'src/assets/models/animals/stylized_low_poly_german_shepherd.glb', "Idle1", 0.08, "animal", "shepperd", true, 0, 0, 5); // German shepperd puppy
}

function setupPhysicsWorld() { // https://medium.com/@bluemagnificent/intro-to-javascript-3d-physics-using-ammo-js-and-three-js-dd48df81f591
    let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    let dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    let overlappingPairCache = new Ammo.btDbvtBroadphase();
    let solver = new Ammo.btSequentialImpulseConstraintSolver();

    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
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
