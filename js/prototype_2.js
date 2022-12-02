import * as THREE from 'https://threejs.org/build/three.module.js';
import Stats from '../build/stats.module.js';
import { GUI } from '../build/lil-gui.module.min.js';
import { GLTFLoader } from '../build/GLTFLoader.js';
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";
import { TWEEN } from '../build/tween.module.min.js';

// Variable initialization
let container, stats, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face, t0, camcontrols;

// Objects
let animals = [], sceneMeshes = [], animationActions = [];

// Model movement
const raycaster = new THREE.Raycaster();
const targetQuaternion = new THREE.Quaternion();
let modelReady = false;

init();
animate();

function init() {
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
    const wolfTexture = loadTexture('./textures/white1.jpg', false); // Texture    
    // const wolfTexture = loadTexture('./textures/cow_texture.jpg', false); // Texture    
    createModel(wolfTexture, 'models/animals/fully_rigged_ikfk_wolf.glb', 'Run', 0.010, 0.010, 0.010); // Wolf
    // createModel(wolfTexture, 'models/animals/chicken_-_rigged.glb', 'chicken-rig|walking', 0.010, 0.010, 0.010); // Chicken
    // createModel(undefined, 'models/RobotExpressive.glb', 'Walking', 1, 1, 1); // Robot
    

    // Events listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener("dblclick", onDoubleClick, false)

    // Stats initialization
    stats = new Stats();
    container.appendChild(stats.dom);
}

function camInit() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
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

function createModel(texture, modelPath, anim, scaleX, scaleY, scaleZ) {
    const loader = new GLTFLoader();
    loader.load(modelPath, function (gltf) {
        gltf.scene.scale.set(scaleX, scaleY, scaleZ);
        model = gltf.scene;

        if (texture != undefined) {
            model.traverse((o) => {
                if (o.isMesh) {
                    o.material.map = texture;
                    o.material.needsUpdate = true;
                }
            });
        }

        animals.push(model);
        scene.add(model);
        createGUI(model, gltf.animations, anim);

    }, undefined, function (e) {
        console.error(e);
    });
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

// function fadeToAction(name, duration) {
//     previousAction = activeAction;
//     activeAction = actions[name];

//     if (previousAction !== activeAction) {
//         previousAction.fadeOut(duration);
//     }

//     activeAction
//         .reset()
//         .setEffectiveTimeScale(1)
//         .setEffectiveWeight(1)
//         .fadeIn(duration)
//         .play();

// }

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
        const distance = model.position.distanceTo(p);
        const rotationMatrix = new THREE.Matrix4();

        rotationMatrix.lookAt(p, model.position, model.up);
        targetQuaternion.setFromRotationMatrix(rotationMatrix);

        TWEEN.removeAll();
        new TWEEN.Tween(model.position)
            .to(
                {
                    x: p.x,
                    y: p.y,
                    z: p.z,
                },
                (1000 / 5.2) * distance
            ) // Runs 5 meters a second * the distance
            .onUpdate(() => {
                camcontrols.target.set(
                    model.position.x,
                    model.position.y + 1,
                    model.position.z
                )
            })
            .start()
            .onComplete(() => {
                // setAction(animationActions[2])
                // activeAction.clampWhenFinished = true
                // activeAction.loop = THREE.LoopOnce
            });
    };
}

function animate() {
    requestAnimationFrame(animate);
    camcontrols.update();

    const dt = clock.getDelta();
    if (modelReady) {
        mixer.update(dt);

        if (!model.quaternion.equals(targetQuaternion))
            model.quaternion.rotateTowards(targetQuaternion, dt * 10);
    }

    TWEEN.update();

    render();
    stats.update();
}

function render() {
    renderer.render(scene, camera);
}
