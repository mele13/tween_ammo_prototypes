import { GLTFLoader } from "../../build/GLTFLoader.js";

// Scene, renderer & cameras
let scene, renderer;
let camera;

// Camera controls
let camcontrols;
let t0;

// Models
let objects = [];
let model;
let activeAction, actions, mixer;
const animationActions = [];

init()
animationLoop()

function init() {

    // Cameras initialization
    camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 200);

    // Scene & renderer
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    const loader = new GLTFLoader();

    // loader.load("models/chicken_-_rigged.glb", function (gltf) {
    loader.load("models/chicken_-_rigged.glb", function (gltf) {
        model = gltf.scene;
        model.position.set(0, 0, 0);
        scene.add(model);

        setAnimation(model, gltf.animations);
    });

    // loadNewGltf("models/free__lamborghini_aventador_sv_tunnig_by_sdc.glb", "car");
    // loadNewGltf("models/highway_50_-_near_cold_springs.glb", "highway");

    scene.background = new THREE.Color(0x072561);
    var light = new THREE.HemisphereLight(0xffffff, 0x000000, 10);
    scene.add(light);

    // OrbitControls
    camcontrols = new THREE.OrbitControls(camera, renderer.domElement);
    t0 = new Date();
}

//Bucle de animación
function animationLoop() {
    requestAnimationFrame(animationLoop);

    let t1 = new Date();
    let secs = (t1 - t0) / 1000;
    camcontrols.update(1 * secs);

    // objects[1].rotation.y += 0.01;
    renderer.render(scene, camera);
}

function setAnimation(model, animations) {
    // const states = [ 'Idle', 'Eating', 'Static', 'Sit', 'Incubate', 'Stand', 'Walking' ];

    // mixer = new THREE.AnimationMixer(model);
    // activeAction = mixer.clipAction(animations[6]);
    // console.log(activeAction);

    // activeAction.play();

    // const animationAction = mixer.clipAction(animations[6]);
    // animationActions.push(animationAction);
    // activeAction = animationActions[0];
    // console.log("sin", animationAction, "plu", animationActions, "active", activeAction);

    // activeAction.play();
    // animationAction.play();


    mixer = new THREE.AnimationMixer(model);

    actions = {};

    for (let i = 0; i < animations.length; i++) {
        const clip = animations[i];
        const action = mixer.clipAction(clip);
        actions[clip.name] = action;

    }

    console.log(actions);
    activeAction = actions['chicken-rig|walking'];
    // activeAction.play();
}

function loadNewGltf(model, type) {
    const loader = new GLTFLoader();

    loader.load(model, function (gltf) {
        obj = gltf.scene;

        if (type = "highway") { obj.position.setY(0); }
        if (type = "car") { obj.position.setY(100); }

        objects.push(obj);
        scene.add(model);
    });
}
