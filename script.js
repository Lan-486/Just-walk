"use strict";

const game = document.querySelector("#game");
const character = document.querySelector("#character");
const mouse = document.querySelector("#mouse");
const startButton = document.querySelector("#start-button");

const triedFeet = {
  left: false,
  right: false
};

const instruction = document.querySelector("#instruction");

const states = {
  idle: {
    character: "./images/角色站.png",
    mouse: "./images/鼠标.png",
    description: "Character standing with both feet on the ground"
  },

  left: {
    character: "./images/角色左.png",
    mouse: "./images/鼠标左.png",
    description: "Character lifting the left foot"
  },

  right: {
    character: "./images/角色右.png",
    mouse: "./images/鼠标右.png",
    description: "Character lifting the right foot"
  }
};

// Preloading reduces delays when switching hand-drawn poses.
const preloadedImages = [];

Object.values(states).forEach((state) => {
  [state.character, state.mouse].forEach((source) => {
    const image = new Image();
    image.src = source;
    preloadedImages.push(image);
  });
});

let lastSide = null;
let resetTimer;

const poseDuration = 280;

function showState(name) {
  const state = states[name];

  character.src = state.character;
  character.alt = state.description;
  mouse.src = state.mouse;
}

function resetPose() {
  showState("idle");
  character.classList.remove("stumble");
}

function takeStep(side) {
  // Cancel older resets so rapid clicks retain their own feedback.
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
  window.clearTimeout(resetTimer);

  character.classList.remove("stumble");
  showState(side);

  if (side === lastSide) {
    instruction.textContent =
      "A little stumble! Try the other foot.";

    // Restart the animation when the same mistake happens again.
    void character.offsetWidth;
    character.classList.add("stumble");
  } else {
    instruction.textContent =
      side === "left"
        ? "Left step — now try the right."
        : "Right step — now try the left.";
  }

// Unlock exploration after both controls have been practised.
triedFeet[side] = true;

if (triedFeet.left && triedFeet.right) {
  startButton.hidden = false;

  if (side !== lastSide) {
    instruction.textContent =
      "You have tried both feet! Click Start walking.";
  }
}

  lastSide = side;

  resetTimer = window.setTimeout(resetPose, poseDuration);
}

// Respond on press for immediate feedback; ignore other buttons.
// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
game.addEventListener("mousedown", (event) => {
  if (event.button !== 0 && event.button !== 2) {
    return;
  }

  event.preventDefault();

  const side = event.button === 0 ? "left" : "right";
  takeStep(side);
});

/*
  Right-click normally opens the browser's context menu.
  In this project, right-click represents the character's right
  foot, so opening that menu would interrupt the walking interaction.

  Listen for the contextmenu event and use preventDefault()
  to stop the browser's default menu from appearing.
  This does not trigger a step; mousedown handles the foot movement.

  The listener is attached only to the game area, so right-click
  still works normally elsewhere on the page.

  Reference:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event
*/
game.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("blur", () => {
  window.clearTimeout(resetTimer);
  resetPose();
});

// Keep interface clicks separate from walking input.
startButton.addEventListener("mousedown", (event) => {
  event.stopPropagation();
});

startButton.addEventListener("click", () => {
  window.location.href = "./walk.html";
});