"use strict";

// ---------- Page elements ----------

const game = document.querySelector("#walk-game");
const walkWorld = document.querySelector("#walk-world");
const ground = document.querySelector("#ground");
const puddle = document.querySelector("#puddle");
const leftFoot = document.querySelector("#left-foot");
const rightFoot = document.querySelector("#right-foot");
const statusText = document.querySelector("#walk-status");
const backLink = document.querySelector("#back-link");

const radioPickup = document.querySelector("#radio-pickup");
const cameraPickup = document.querySelector("#camera-pickup");
const radioControl = document.querySelector("#radio-control");
const collectedCamera = document.querySelector("#collected-camera");

// Respect reduced-motion preferences while preserving click controls.
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

// ---------- Interaction settings ----------

const stepDuration = 320;
const grassPauseDelay = 400;
const noticeDuration = 6500;

const defaultInstruction =
  "Alternate left and right clicks to walk.";

let lastSide = null;
let isMoving = false;
let groundOffset = 0;
let walkedDistance = 0;

let puddleY = 0;
let puddleReady = false;
let radioIntroduced = false;
let pageActive = !document.hidden;

// ---------- Camera inventory button ----------

/*
  The original HTML contains an inventory image for the camera.
  Wrap it in a button to provide a clickable control while keeping
  the existing image and pickup code compatible.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
*/
let cameraControl = document.querySelector("#camera-control");

if (!cameraControl) {
  cameraControl = document.createElement("button");
  cameraControl.id = "camera-control";
  cameraControl.type = "button";
  cameraControl.hidden = collectedCamera.hidden;
  cameraControl.setAttribute("aria-label", "Take a photo");

  collectedCamera.replaceWith(cameraControl);
  cameraControl.append(collectedCamera);
}

// ---------- Collectible objects ----------

const collectibles = [
  {
    element: radioPickup,
    name: "radio",
    y: 0,
    active: false,
    announced: false
  },
  {
    element: cameraPickup,
    name: "camera",
    y: 0,
    active: false,
    announced: false
  }
];

// ---------- Readable status messages ----------

let noticeUntil = 0;
let noticeTimer;

/*
  Important messages remain visible for 6.5 seconds.
  Walking, splashing and stumbling cannot immediately replace them.
  A direct action, such as collecting an item, can show newer feedback.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
*/
function showNotice(
  message,
  duration = noticeDuration,
  directAction = true
) {
  if (!directAction && Date.now() < noticeUntil) {
    return false;
  }

  window.clearTimeout(noticeTimer);

  noticeUntil = Date.now() + duration;
  statusText.textContent = message;

  noticeTimer = window.setTimeout(() => {
    noticeUntil = 0;
    showWalkingStatus(defaultInstruction);
  }, duration);

  return true;
}

function getVisibleCollectible() {
  const scene = game.getBoundingClientRect();

  return collectibles.find((item) => {
    if (!item.active) return false;

    const box = item.element.getBoundingClientRect();

    // Wait until at least half the object has entered the scene.
    return (
      box.top + box.height * 0.5 >= scene.top &&
      box.top < scene.bottom
    );
  });
}

function showWalkingStatus(message) {
  if (Date.now() < noticeUntil) return;

  const item = getVisibleCollectible();

  statusText.textContent = item
    ? `You found a ${item.name}! Click it to pick it up.`
    : message;
}

function announceVisibleCollectible() {
  const item = getVisibleCollectible();

  if (!item || item.announced) return;

  const displayed = showNotice(
    `You found a ${item.name}! Click it to pick it up.`,
    noticeDuration,
    false
  );

  if (displayed) {
    item.announced = true;
  }
}

// ---------- Audio and source references ----------

/*
  Grass sound:
  "person walking on grass with birds chirping in the background"
  by garandM1 (2025), Freesound.
  https://freesound.org/people/garandM1/sounds/799247/
  Licence: CC0 1.0.
  Accessed 25 October 2026.

  Resume the long recording instead of restarting it with every click.
  Its background birds pause together with the recorded footsteps.
*/
const grassSound = new Audio("./audio/脚步声.wav");
grassSound.preload = "auto";
grassSound.loop = true;
grassSound.volume = 0.45;

let grassPauseTimer;
let grassShouldPlay = false;

/*
  Water sound:
  "water step.wav" by nathanaelj83 (2012), Freesound.
  https://freesound.org/people/nathanaelj83/sounds/145242/
  Licence: CC0 1.0.
  https://creativecommons.org/publicdomain/zero/1.0/
  Accessed 25 October 2026.

  Three players allow one short splash to finish while another begins.
*/
const waterSounds = Array.from({ length: 3 }, () => {
  const sound = new Audio("./audio/水声.wav");
  sound.preload = "auto";
  sound.loop = false;
  sound.volume = 0.6;
  return sound;
});

let nextWaterSound = 0;

/*
  Radio music:
  "Retro/classic game music.wav" by ZHRØ (2023), Freesound.
  https://freesound.org/people/ZHR%C3%98/sounds/668879/
  Licence: Creative Commons Attribution 4.0.
  https://creativecommons.org/licenses/by/4.0/
  Accessed 25 October 2026.

  Playback loops at a reduced volume. Credit the creator and licence
  in the page's visible credits as well as these code comments.
*/
const radioMusic = new Audio("./audio/音乐.wav");
radioMusic.preload = "auto";
radioMusic.loop = true;
radioMusic.volume = 0.35;

let musicRequested = false;

/*
  Camera sound:
  "Camera Shutter Click" by Kodack (2015), Freesound.
  https://freesound.org/people/Kodack/sounds/271010/
  Licence: CC0 1.0.
  https://creativecommons.org/publicdomain/zero/1.0/
  Accessed 25 October 2026.

  A short shutter sound confirms the camera click.
*/
const cameraSound = new Audio("./audio/拍照.wav");
cameraSound.preload = "auto";
cameraSound.loop = false;
cameraSound.volume = 0.3;

// ---------- Audio controls ----------

function reportAudioError(label, error) {
  // Pausing during a pending play request can cause an expected AbortError.
  if (error.name !== "AbortError") {
    console.warn(`${label} could not play:`, error);
  }
}

function pauseGrassSound() {
  grassShouldPlay = false;
  window.clearTimeout(grassPauseTimer);
  grassSound.pause();
}

/*
  Each successful grass step renews a short playback timer.
  Stopping clicks pauses the recording without resetting its position.

  References:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/pause
*/
function playGrassSound() {
  if (!pageActive) return;

  grassShouldPlay = true;
  window.clearTimeout(grassPauseTimer);

  if (grassSound.paused) {
    grassSound.play()
      .then(() => {
        // Loading may finish after the user has already stopped.
        if (!grassShouldPlay || !pageActive) {
          grassSound.pause();
        }
      })
      .catch((error) => {
        reportAudioError("Grass sound", error);
      });
  }

  grassPauseTimer = window.setTimeout(
    pauseGrassSound,
    grassPauseDelay
  );
}

function playWaterSound() {
  if (!pageActive) return;

  const sound = waterSounds[nextWaterSound];

  nextWaterSound =
    (nextWaterSound + 1) % waterSounds.length;

  sound.currentTime = 0;

  sound.play().catch((error) => {
    reportAudioError("Water sound", error);
  });
}

function updateRadioAppearance() {
  const playing = musicRequested && !radioMusic.paused;

  radioControl.classList.toggle("is-playing", playing);
  radioControl.setAttribute("aria-pressed", String(playing));
  radioControl.setAttribute(
    "aria-label",
    playing ? "Stop radio music" : "Play radio music"
  );
}

function stopRadioMusic() {
  musicRequested = false;
  radioMusic.pause();
  updateRadioAppearance();
}

// ---------- Water placement ----------

/*
  Place the whole water image above the scene with a dry gap.
  Successful steps move it into view once; it is never recycled.
  Account for any walking completed while the image was loading.
*/
function positionInitialPuddle() {
  if (puddleReady || game.clientHeight === 0) return;

  const dryGap = 0.8;

  puddleY =
    -(puddle.offsetHeight / game.clientHeight) -
    dryGap +
    walkedDistance;

  puddle.style.top = `${puddleY * 100}%`;
  puddle.style.visibility = "visible";
  puddleReady = true;
}

if (puddle.complete && puddle.naturalWidth > 0) {
  positionInitialPuddle();
} else {
  puddle.addEventListener("load", positionInitialPuddle, {
    once: true
  });
}

// ---------- Collectible placement and movement ----------

/*
  Position the whole object outside the view before revealing it.
  This makes discoveries enter with the scenery instead of appearing
  suddenly in the middle of the path.
*/
function showCollectible(item) {
  item.announced = false;
  item.element.style.visibility = "hidden";
  item.element.hidden = false;

  const image = item.element.querySelector("img");

  function positionItem() {
    const gap = 0.15;

    item.y =
      -(item.element.offsetHeight / game.clientHeight) - gap;

    item.element.style.top = `${item.y * 100}%`;
    item.active = true;
    item.element.style.visibility = "visible";
  }

  if (image.complete && image.naturalWidth > 0) {
    positionItem();
  } else {
    image.addEventListener("load", positionItem, {
      once: true
    });
  }
}

function moveCollectibles(movement) {
  const animations = [];

  collectibles.forEach((item) => {
    if (!item.active) return;

    const previousY = item.y;
    item.y += movement;

    item.element.style.top = `${item.y * 100}%`;

    if (!reducedMotion.matches) {
      const animation = item.element.animate(
        [
          { top: `${previousY * 100}%` },
          { top: `${item.y * 100}%` }
        ],
        {
          duration: stepDuration,
          easing: "ease-in-out"
        }
      );

      animations.push(animation.finished);
    }
  });

  return animations;
}

/*
  Missed objects return from above so users can recover.
  Collected objects are inactive and never reappear.
*/
function resetMissedCollectibles() {
  collectibles.forEach((item) => {
    if (!item.active || item.y <= 1.05) return;

    item.y =
      -(item.element.offsetHeight / game.clientHeight) - 0.3;

    item.element.style.top = `${item.y * 100}%`;
    item.announced = false;
  });
}

// ---------- Pickup and inventory interactions ----------

/*
  Clicking an object should not also move a foot.
  Stop the press from reaching the scene's walking listener.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Event/stopPropagation
*/
[
  radioPickup,
  cameraPickup,
  radioControl,
  cameraControl
].forEach((button) => {
  button.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
});

radioPickup.addEventListener("click", (event) => {
  event.stopPropagation();

  collectibles[0].active = false;
  radioPickup.hidden = true;
  radioControl.hidden = false;

  showNotice(
    "Radio collected! Click it in the corner to play or pause music."
  );

  // Introduce the camera only after the radio has been collected.
  showCollectible(collectibles[1]);
});

cameraPickup.addEventListener("click", (event) => {
  event.stopPropagation();

  collectibles[1].active = false;
  cameraPickup.hidden = true;
  collectedCamera.hidden = false;
  cameraControl.hidden = false;

  showNotice(
    "Camera collected! Click it in the corner to take a photo."
  );
});

/*
  The glow follows actual playback rather than just the click.
  A failed playback request therefore cannot leave a false active state.
*/
radioControl.addEventListener("click", async (event) => {
  event.stopPropagation();

  if (musicRequested) {
    stopRadioMusic();
    return;
  }

  musicRequested = true;

  try {
    await radioMusic.play();

    if (!musicRequested || !pageActive) {
      radioMusic.pause();
    }

    updateRadioAppearance();
  } catch (error) {
    if (error.name !== "AbortError") {
      musicRequested = false;

      showNotice(
        "Music could not play. Please try the radio again."
      );

      reportAudioError("Radio music", error);
    }

    updateRadioAppearance();
  }
});

cameraControl.addEventListener("click", (event) => {
  event.stopPropagation();

  cameraSound.currentTime = 0;

  cameraSound.play().catch((error) => {
    if (error.name !== "AbortError") {
      reportAudioError("Camera sound", error);

      showNotice(
        "Camera sound could not play. Please check the audio file."
      );
    }
  });

  showNotice("Click! You used the camera.");
});

// ---------- Foot movement and surface detection ----------

/*
  These coordinates identify the shoe inside each cropped leg image.
  Adjust x horizontally and y vertically if the image margins change.
*/
const shoeContact = {
  left: { x: 0.5, y: 0.18 },
  right: { x: 0.5, y: 0.18 }
};

/*
  Moving an existing illustration avoids drawing extra poses.
  Opposite small rotations give the feet slightly different movements.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
*/
function animateFoot(foot, side) {
  const lift = game.clientHeight * 0.055;
  const angle = side === "left" ? -3 : 3;

  return foot.animate(
    [
      {
        transform: "translateY(0) rotate(0deg) scale(1)"
      },
      {
        transform:
          `translateY(-${lift}px) rotate(${angle}deg) scale(1.04)`,
        offset: 0.45
      },
      {
        transform: "translateY(0) rotate(0deg) scale(1)"
      }
    ],
    {
      duration: stepDuration,
      easing: "ease-in-out"
    }
  );
}

/*
  An ellipse approximates the painted water area.
  This simple method does not detect transparent holes in the image.
  A destination value predicts the landing surface before movement.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
*/
function checkWater(foot, side, destinationY = null) {
  if (!puddleReady) return false;

  const footRect = foot.getBoundingClientRect();
  const waterRect = puddle.getBoundingClientRect();
  const sceneRect = walkWorld.getBoundingClientRect();

  if (!waterRect.width || !waterRect.height) return false;

  const contact = shoeContact[side];

  const x = footRect.left + footRect.width * contact.x;
  const y = footRect.top + footRect.height * contact.y;

  const waterTop = destinationY === null
    ? waterRect.top
    : sceneRect.top + sceneRect.height * destinationY;

  const centreX = waterRect.left + waterRect.width / 2;
  const centreY = waterTop + waterRect.height / 2;

  const distanceX =
    (x - centreX) / (waterRect.width * 0.45);

  const distanceY =
    (y - centreY) / (waterRect.height * 0.45);

  return distanceX ** 2 + distanceY ** 2 <= 1;
}

async function animateStumble() {
  if (reducedMotion.matches) return;

  /*
    Shake the shared world to suggest losing balance.
    The title and inventory remain still outside this layer.
    A slight zoom helps cover the edges during the movement.
  */
  const animation = walkWorld.animate(
    [
      {
        transform: "translate(0, 0) rotate(0deg) scale(1)"
      },
      {
        transform:
          "translate(-8px, 5px) rotate(-0.7deg) scale(1.035)",
        offset: 0.25
      },
      {
        transform:
          "translate(6px, -3px) rotate(0.5deg) scale(1.035)",
        offset: 0.55
      },
      {
        transform:
          "translate(-3px, 2px) rotate(-0.2deg) scale(1.02)",
        offset: 0.8
      },
      {
        transform: "translate(0, 0) rotate(0deg) scale(1)"
      }
    ],
    {
      duration: 400,
      easing: "ease-in-out"
    }
  );

  await animation.finished;
}

// ---------- Walking interaction ----------

async function takeStep(side) {
  // Do not queue steps that would continue after clicking stops.
  if (isMoving || !pageActive) return;

  isMoving = true;

  const foot = side === "left" ? leftFoot : rightFoot;

  try {
    if (side === lastSide) {
      pauseGrassSound();

      showWalkingStatus(
        "A little stumble! Try the other foot."
      );

      await animateStumble();
      return;
    }

    // A stumble does not update this value; a valid step does.
    lastSide = side;

    showWalkingStatus(
      side === "left"
        ? "Left step — now try the right."
        : "Right step — now try the left."
    );

    const movement = reducedMotion.matches ? 0.02 : 0.065;
    const startOffset = groundOffset;
    const startPuddleY = puddleY;
    const destinationY = puddleY + movement;

    if (checkWater(foot, side, destinationY)) {
      pauseGrassSound();
    } else {
      playGrassSound();
    }

    groundOffset += game.clientHeight * movement;
    walkedDistance += movement;
    puddleY = destinationY;

    /*
      Save the destination styles before starting the animations.
      They preserve the new positions after temporary playback ends.

      Reference:
      https://developer.mozilla.org/en-US/docs/Web/CSS/background-position
    */
    ground.style.backgroundPosition =
      `center ${groundOffset}px`;

    if (puddleReady) {
      puddle.style.top = `${puddleY * 100}%`;
    }

    const itemAnimations = moveCollectibles(movement);

    if (!reducedMotion.matches) {
      const options = {
        duration: stepDuration,
        easing: "ease-in-out"
      };

      const footAnimation = animateFoot(foot, side);

      const groundAnimation = ground.animate(
        [
          {
            backgroundPosition: `center ${startOffset}px`
          },
          {
            backgroundPosition: `center ${groundOffset}px`
          }
        ],
        options
      );

      const animations = [
        footAnimation.finished,
        groundAnimation.finished,
        ...itemAnimations
      ];

      if (puddleReady) {
        const puddleAnimation = puddle.animate(
          [
            { top: `${startPuddleY * 100}%` },
            { top: `${puddleY * 100}%` }
          ],
          options
        );

        animations.push(puddleAnimation.finished);
      }

      await Promise.all(animations);
    }

    // Trigger the splash at landing, not while the foot is lifting.
    if (checkWater(foot, side)) {
      pauseGrassSound();
      playWaterSound();

      showWalkingStatus("Splash! You stepped in water.");
    }

    // Water appears only once; the radio follows after it exits.
    if (puddleReady && !radioIntroduced && puddleY > 1.05) {
      radioIntroduced = true;
      showCollectible(collectibles[0]);
    }

    resetMissedCollectibles();
    announceVisibleCollectible();
  } finally {
    isMoving = false;
  }
}

// ---------- Mouse controls ----------

/*
  Pressing the primary button controls the left foot; the secondary
  button controls the right foot. Ignore other mouse buttons.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
*/
game.addEventListener("mousedown", (event) => {
  if (event.button !== 0 && event.button !== 2) return;

  event.preventDefault();

  takeStep(event.button === 0 ? "left" : "right");
});

/*
  Right-click is a walking control, so prevent its browser menu
  inside the scene. Other parts of the page retain normal behaviour.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event
*/
game.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

backLink.addEventListener("mousedown", (event) => {
  event.stopPropagation();
});

// ---------- Stop audio when leaving ----------

function stopAllSounds() {
  pauseGrassSound();
  stopRadioMusic();
  cameraSound.pause();

  waterSounds.forEach((sound) => {
    sound.pause();
  });
}

window.addEventListener("blur", () => {
  pageActive = false;
  stopAllSounds();
});

window.addEventListener("focus", () => {
  pageActive = !document.hidden;
});

window.addEventListener("pagehide", () => {
  pageActive = false;
  stopAllSounds();
});

window.addEventListener("pageshow", () => {
  pageActive = !document.hidden;
});

document.addEventListener("visibilitychange", () => {
  pageActive = !document.hidden;

  if (!pageActive) {
    stopAllSounds();
  }
});