import * as THREE from 'https://threejs.org/build/three.module.js';
import Stats from '../build/stats.module.js';
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";

// /*global dat*/
// /*global THREE*/
// /*global Ammo*/

// Variable initialization
let container, camera, camcontrols, scene, renderer, textureLoader, stats;
const clock = new THREE.Clock();

const mouseCoords = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const ballMaterial = new THREE.MeshPhongMaterial({ color: 0x202020 });

// Objects
const rigidBodies = [];

// Physics
let physicsWorld, collisionConfiguration, dispatcher, broadphase, solver, ammoClone;
const margin = 0.05; // Collision margin
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();

//Variebles temporales para actualizar transformación en el bucle
let transformAux1, tempBtVec3_1, intervalLeft, intervalRight;

Ammo().then((AmmoLib) => {
  Ammo = AmmoLib;
  ammoClone = Ammo;

  init();
  animate();
});

function init() {
  // Ammo initialization
  setupPhysicsWorld();

  container = document.createElement('div');
  document.body.appendChild(container);

  // Scene & camera initialization
  camInit();
  sceneRendererInit();

  // Orbit controls
  camcontrols = new OrbitControls(camera, renderer.domElement);
  camcontrols.target.set(0, 2, 0);
  camcontrols.update();

  textureLoader = new THREE.TextureLoader();
  loadLights();

  createGroundGrid(); // Ground grid
  setInterval(createCascade, 1500); // Generate falling objects

  // Events listeners
  window.addEventListener("resize", onWindowResize);
  initInput();

  // Stats initialization
  stats = new Stats();
  container.appendChild(stats.dom);
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function randomIntFromInterval(min, max) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function createCascade() {
  let cPos = {
    x: randomIntFromInterval(-10, 10),
    y: 20,
    z: randomIntFromInterval(-10, 10),
  };

  let randomInt = getRandomInt(2);
  if (randomInt == 0) createSphere(cPos.x, cPos.y, cPos.Z);
  else createBox(cPos.x, cPos.y, cPos.Z);
}

function createBox(px, py, pz) {
  pos.set(px, py, pz);
  quat.set(0, 0, 0, 1);
  createFloorBox(0.9, 0.9, 0.9, 5., pos, quat, new THREE.MeshPhongMaterial({ color: generateRandomColor() }));
}


function createSphere(px, py, pz) {
  pos.set(px, py, pz);
  quat.set(0, 0, 0, 1);
  const ballMass = 35;
  const ballRadius = 0.4;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 14, 10),
    new THREE.MeshPhongMaterial({ color: generateRandomColor() })
  );
  ball.castShadow = true;
  ball.receiveShadow = true;
  //Ammo
  //Estructura geométrica de colisión esférica
  const ballShape = new Ammo.btSphereShape(ballRadius);
  ballShape.setMargin(margin);
  const ballBody = createRigidBody(ball, ballShape, ballMass, pos, quat);
}

function loadLights() {
  const ambientLight = new THREE.AmbientLight(0x707070);
  scene.add(ambientLight);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(-10, 18, 5);
  light.castShadow = true;
  scene.add(light);
}

function sceneRendererInit() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xE4F5FF);
  // scene.fog = new THREE.Fog(0xe0e0e0, 20, 100);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
}

function camInit() {
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 2000); // 250 | 5000
  camera.position.set(0, 5, 20);
}

function setupPhysicsWorld() {
  let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  let dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  let overlappingPairCache = new Ammo.btDbvtBroadphase();
  let solver = new Ammo.btSequentialImpulseConstraintSolver();

  physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration);
  physicsWorld.setGravity(new Ammo.btVector3(0, -6, 0));

  transformAux1 = new Ammo.btTransform();
  tempBtVec3_1 = new Ammo.btVector3(0, 0, 0);
}

function createObject(mass, halfExtents, pos, quat, material) {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(
      halfExtents.x * 2,
      halfExtents.y * 2,
      halfExtents.z * 2
    ),
    material
  );
  object.position.copy(pos);
  object.quaternion.copy(quat);
}

function createGroundGrid() {
  pos.set(0, -0.5, 0);
  quat.set(0, 0, 0, 1);
  const floor = createFloorBox(100, 1, 100, 0, pos, quat, new THREE.MeshPhongMaterial({ color: 0x05050550 }));
  floor.receiveShadow = true;
  textureLoader = new THREE.TextureLoader();
  textureLoader.load("../assets/textures/floor_texture.png",

    function (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(40, 40);
      floor.material.map = texture;
      floor.material.needsUpdate = true;
    }
  );
}

function generateRandomColor() {
  let color = new THREE.Color();
  color.set(THREE.MathUtils.randInt(0, 16777216));
  return color
}

function createFloorBox(sx, sy, sz, mass, pos, quat, material) {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1),
    material
  );
  //Estructura geométrica de colisión
  //Crea caja orientada en el espacio, especificando dimensiones
  const shape = new Ammo.btBoxShape(
    new Ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5)
  );
  //Margen para colisione
  shape.setMargin(margin);

  createRigidBody(object, shape, mass, pos, quat);

  return object;
}

function createRigidBody(object, physicsShape, mass, pos, quat, vel, angVel) {
  if (pos) object.position.copy(pos);
  else pos = object.position;

  if (quat) object.quaternion.copy(quat);
  else quat = object.quaternion;

  const transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
  const motionState = new Ammo.btDefaultMotionState(transform);

  const localInertia = new Ammo.btVector3(0, 0, 0);
  physicsShape.calculateLocalInertia(mass, localInertia);

  const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, physicsShape, localInertia);
  const body = new Ammo.btRigidBody(rbInfo);

  body.setFriction(0.5);

  if (vel) body.setLinearVelocity(new Ammo.btVector3(vel.x, vel.y, vel.z));
  if (angVel) body.setAngularVelocity(new Ammo.btVector3(angVel.x, angVel.y, angVel.z));

  object.userData.physicsBody = body;
  object.userData.collided = false;
  scene.add(object);

  if (mass > 0) {
    rigidBodies.push(object);
    body.setActivationState(4);
  }

  physicsWorld.addRigidBody(body);
  return body;
}

function createRandomColor() {
  return Math.floor(Math.random() * (1 << 24));
}

function createMaterial(color) {
  color = color || createRandomColor();
  return new THREE.MeshPhongMaterial({ color: color });
}

//Evento de ratón
function initInput() {
  window.addEventListener("pointerdown", function (event) {
    //Coordenadas del puntero
    mouseCoords.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouseCoords, camera);

    // Crea bola como cuerpo rígido y la lanza según coordenadas de ratón
    const ballMass = 35;
    const ballRadius = 0.4;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(ballRadius, 14, 10),
      ballMaterial
    );
    ball.castShadow = true;
    ball.receiveShadow = true;
    //Ammo
    //Estructura geométrica de colisión esférica
    const ballShape = new Ammo.btSphereShape(ballRadius);
    ballShape.setMargin(margin);
    pos.copy(raycaster.ray.direction);
    pos.add(raycaster.ray.origin);
    quat.set(0, 0, 0, 1);
    const ballBody = createRigidBody(ball, ballShape, ballMass, pos, quat);

    pos.copy(raycaster.ray.direction);
    pos.multiplyScalar(24);
    ballBody.setLinearVelocity(new Ammo.btVector3(pos.x, pos.y, pos.z));
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  updatePhysics(deltaTime);

  stats.update();

  renderer.render(scene, camera);
}

function updatePhysics(deltaTime) {
  physicsWorld.stepSimulation(deltaTime, 10);

  for (let i = 0, il = rigidBodies.length; i < il; i++) {
    const objThree = rigidBodies[i];
    const objPhys = objThree.userData.physicsBody;
    const ms = objPhys.getMotionState();

    if (ms) {
      ms.getWorldTransform(transformAux1);
      const p = transformAux1.getOrigin();
      const q = transformAux1.getRotation();
      objThree.position.set(p.x(), p.y(), p.z());
      objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());

      objThree.userData.collided = false;
    }
  }
}
