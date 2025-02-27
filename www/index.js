import { JSInterface } from "random-chess";
import {
  ACTIVE_COLOR,
  BLACK_SQUARE_COLOR,
  CANVAS_SIZE,
  CHECK_WARNING_COLOR,
  HOVER_COLOR,
  PIECES,
  PIECE_ANIMATION_DURATION,
  SELECTED_COLOR,
  SQUARE_SIZE,
  WHITE_SQUARE_COLOR
} from "./constants.js";
import { drawHistory, getImage, urlForPiece } from './utils.js';

// Give the canvas room for all of our cells and a 1px border
// around each of them.
const canvas = document.getElementById("game-canvas");
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;
var ctx = canvas.getContext('2d');
const socket = io({autoConnect: false});

var wasmInterface = undefined;
var gameType = undefined; // "local", "networkH", "networkG", "ai", "aiai", "daily"
var awaitingMoveFrom = undefined; // "ui", "network", "ai"

// Daily game things
var dateString = undefined;
var rng = undefined;
var turns = [];
window.turns = turns;

var interactivity = {
  state: "idle",
  pieceSource: undefined,
  pieceDest: undefined,
  pointer_location: undefined,
  held_with: undefined,
}

var pieceAnimation = undefined;

var activeSquares = [];

function flip(rank) { return gameType != "networkG" ? 7 - rank : rank; }

async function draw() {

  checkInteractive();

  if (wasmInterface == undefined) return;

  drawBoard();
  drawCheckWarnings();
  drawSelected();
  drawActiveSquares();
  await drawPieces();
  drawMoves();
  drawHeldOverIndicator();
  await drawHeldPiece();
  updateStatus();

};

// Function to draw the chess board
function drawBoard() {
  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      if ((file + flip(rank)) % 2 == 0) {
        ctx.fillStyle = BLACK_SQUARE_COLOR;
      } else {
        ctx.fillStyle = WHITE_SQUARE_COLOR;
      }
      ctx.fillRect(file * SQUARE_SIZE, rank * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
    }
  }
}

function drawCheckWarnings() {
  let checked_squares = wasmInterface.js_checked_squares();
  for (let square of checked_squares) {
    ctx.fillStyle = CHECK_WARNING_COLOR;
    ctx.fillRect(square[0] * SQUARE_SIZE, flip(square[1]) * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
  }
}

function drawSelected() {
  let p = interactivity.pieceSource;
  if (p != undefined) {
    ctx.fillStyle = SELECTED_COLOR;
    ctx.fillRect(p.x * SQUARE_SIZE, p.y * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
  }
}

async function drawPieces() {

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      var piece = wasmInterface.js_piece(file, flip(rank));
      if (piece != undefined) {
        let img = await getImage(piece);
        if (interactivity.state == "selectedAndHeld") {
          if (file == interactivity.pieceSource.x && rank == interactivity.pieceSource.y) {
            ctx.globalAlpha = 0.3;
          }
        }
        if (pieceAnimation != undefined) {
          if (file == pieceAnimation.dest.x && flip(rank) == pieceAnimation.dest.y) {
            ctx.globalAlpha = 0;
          }
        }
        ctx.drawImage(img, file * SQUARE_SIZE, rank * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        ctx.globalAlpha = 1;
      }
    }
  }

  if (pieceAnimation != undefined) {
    
    let startX = pieceAnimation.source.x * SQUARE_SIZE;
    let startY = flip(pieceAnimation.source.y) * SQUARE_SIZE;
    let endX = pieceAnimation.dest.x * SQUARE_SIZE;
    let endY = flip(pieceAnimation.dest.y) * SQUARE_SIZE;

    let progress = (Date.now() - pieceAnimation.start) / PIECE_ANIMATION_DURATION;
    let interpolated = progress * progress * (3 - 2 * progress);
    let x = startX + (endX - startX) * interpolated;
    let y = startY + (endY - startY) * interpolated;

    let piece = wasmInterface.js_piece(pieceAnimation.dest.x, pieceAnimation.dest.y);
    let img = await getImage(piece);
    ctx.drawImage(img, x, y, SQUARE_SIZE, SQUARE_SIZE);

  }

}

function drawMoves() {
  let p = interactivity.pieceSource;
  if (p != undefined) {
    for (let move of wasmInterface.js_moves_from(p.x, flip(p.y))) {
      ctx.beginPath();
      ctx.fillStyle = move[5] ? CHECK_WARNING_COLOR : SELECTED_COLOR;
      ctx.arc(
        move[2] * SQUARE_SIZE + SQUARE_SIZE / 2,
        flip(move[3]) * SQUARE_SIZE + SQUARE_SIZE / 2,
        SQUARE_SIZE / 6, 0, 2 * Math.PI
      );
      ctx.fill();
    }
  }
}

function drawActiveSquares() {
  for (let square of activeSquares) {
    ctx.fillStyle = ACTIVE_COLOR;
    ctx.fillRect(square.x * SQUARE_SIZE, flip(square.y) * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
  }
}

function drawHeldOverIndicator() {

  if (interactivity.state == "selectedAndHeld") {
    let size = interactivity.held_with == "mouse" ? SQUARE_SIZE * 0.6: SQUARE_SIZE;
    ctx.beginPath();
    ctx.fillStyle = HOVER_COLOR;
    ctx.arc(
      interactivity.pieceDest.x * SQUARE_SIZE + SQUARE_SIZE / 2,
      interactivity.pieceDest.y * SQUARE_SIZE + SQUARE_SIZE / 2,
      size, 0, 2 * Math.PI
    );
    ctx.fill();
  }

}

async function drawHeldPiece() {

  if (interactivity.state == "selectedAndHeld") {
    let piece = wasmInterface.js_piece(interactivity.pieceSource.x, flip(interactivity.pieceSource.y));
    let img = await getImage(piece);
    let offset = interactivity.held_with == "mouse" ? 0.6 : 1.5;
    ctx.drawImage(img, interactivity.pointer_location.x - SQUARE_SIZE * 0.6, interactivity.pointer_location.y - SQUARE_SIZE * offset, SQUARE_SIZE * 1.2, SQUARE_SIZE * 1.2);
  }

}

function updateStatus() {

  let statusLabel = document.getElementById("status");
  statusLabel.innerHTML = "&nbsp;";

  switch (wasmInterface.js_status()) {
    case "in progress": {
      switch (wasmInterface.js_get_side_to_move()) {
        case "white": {
          switch (gameType) {
            case "local": case "aiai": statusLabel.innerHTML = "White's move"; break;
            case "networkH": statusLabel.innerHTML = "Your move"; break;
            case "networkG": statusLabel.innerHTML = "Waiting for opponent"; break;
            case "ai": case "daily": statusLabel.innerHTML = "Your move"; break;
          }
          break;
        }
        case "black": {
          switch (gameType) {
            case "local": case "aiai": statusLabel.innerHTML = "Black's move"; break;
            case "networkH": statusLabel.innerHTML = "Waiting for opponent"; break;
            case "networkG": statusLabel.innerHTML = "Your move"; break;
            case "ai": case "daily": statusLabel.innerHTML = "Waiting for computer"; break;
          }
          break;
        }
      }
      break;
    }
    case "white": {
      switch (gameType) {
        case "local": case "aiai": statusLabel.innerHTML = "White wins"; break;
        case "networkH": statusLabel.innerHTML = "You win!"; break;
        case "networkG": statusLabel.innerHTML = "Opponent wins :("; break;
        case "ai": case "daily": statusLabel.innerHTML = "You win!"; break;
      }
      break;
    }
    case "black": {
      switch (gameType) {
        case "local": case "aiai": statusLabel.innerHTML = "Black wins"; break;
        case "networkH": statusLabel.innerHTML = "Opponent wins :("; break;
        case "networkG": statusLabel.innerHTML = "You win!"; break;
        case "ai": case "daily": statusLabel.innerHTML = "Computer wins :("; break;
      }
      break;
    }
    case "draw": statusLabel.innerHTML = "draw"; break;
  }
  
};

function checkInteractive() {
  if (awaitingMoveFrom != "ui") {
    interactivity = {
      state: "idle",
      pieceSource: undefined,
      pieceDest: undefined,
    }
    return false;
  }
  return true;
}

function makeAlert(alertType, alertText, timeout) {
  const alert = document.getElementById("alert").cloneNode(true);
  alert.style.display = "block";
  alert.classList.add("alert-" + alertType);
  alert.innerHTML = alertText;
  document.getElementById("alerts").appendChild(alert);
  setTimeout(() => {
    new bootstrap.Alert(alert).close();
  }, timeout);
}

function getCoords(event) {
  let rect = canvas.getBoundingClientRect();
  let x = Math.floor(event.offsetX * canvas.width / rect.width / SQUARE_SIZE);
  let y = Math.floor(event.offsetY * canvas.height / rect.height / SQUARE_SIZE);
  return { x: x, y: y };
}

canvas.addEventListener('pointerdown', event => {
  
  if (!checkInteractive()) { return; }

  let coords = getCoords(event);

  if (interactivity.state == "idle") {
    if (wasmInterface.js_piece_color(coords.x, flip(coords.y)) == wasmInterface.js_get_side_to_move()) {
      interactivity.state = "selectReady";
      interactivity.pieceSource = coords;
    }
  } else if (interactivity.state == "selectedNotHeld") {
    if (wasmInterface.js_piece_color(coords.x, flip(coords.y)) == wasmInterface.js_get_side_to_move()) {
      interactivity.state = "selectReady";
      interactivity.pieceSource = coords;
    } else if (wasmInterface.js_check_move(interactivity.pieceSource.x, flip(interactivity.pieceSource.y), coords.x, flip(coords.y)) != undefined) {
      interactivity.state = "moveReady";
      interactivity.pieceDest = coords;
    } else {
      interactivity.state = "idle";
      interactivity.pieceSource = undefined;
      interactivity.pieceDest = undefined;
    }
  }

  draw();

});

canvas.addEventListener('pointermove', event => {

  if (!checkInteractive()) { return; }

  let coords = getCoords(event);

  if (interactivity.state == "selectReady" || interactivity.state == "selectedAndHeld") {
    interactivity.state = "selectedAndHeld";
    interactivity.pieceDest = coords;
    let rect = canvas.getBoundingClientRect();
    interactivity.pointer_location = {
      x: event.offsetX * canvas.width / rect.width,
      y: event.offsetY * canvas.height / rect.height
    };
    interactivity.held_with = event.pointerType;
  }

  draw();
  
});

canvas.addEventListener('pointerout', event => {

  if (!checkInteractive()) { return; }

  if (interactivity.state == "selectedAndHeld" || interactivity.state == "moveReady") {
    interactivity.state = "selectedNotHeld";
    interactivity.pieceDest = undefined;
  }
  
  draw();
});

canvas.addEventListener('pointerup', event => {

  if (!checkInteractive()) { return; }

  let coords = getCoords(event);

  if (interactivity.state == "selectReady") {
    interactivity.state = "selectedNotHeld";
  } else if (interactivity.state == "selectedAndHeld") {
    let success = enactMove(interactivity.pieceSource, coords, false);
    if (success) {
      interactivity.state = "idle";
      interactivity.pieceSource = undefined;
      interactivity.pieceDest = undefined;
    } else {
      interactivity.state = "selectedNotHeld";
      interactivity.pieceDest = undefined;
    }
  } else if (interactivity.state == "moveReady") {
    if (coords.x == interactivity.pieceDest.x && coords.y == interactivity.pieceDest.y) {
      let success = enactMove(interactivity.pieceSource, coords, true);
      console.assert(success);
      interactivity.state = "idle";
      interactivity.pieceSource = undefined;
      interactivity.pieceDest = undefined;
    } else {
      interactivity.state = "selectedNotHeld";
      interactivity.pieceDest = undefined;
    }
  }

  draw();

});

function enactMove(source, dest, anim) {

  const correctMove = wasmInterface.js_check_move(source.x, flip(source.y), dest.x, flip(dest.y))
  if (correctMove == undefined) return false
  if (correctMove) {
    const myModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('promotionSelect'));
    for (let piece of [1, 2, 3, 4]) {
      document.getElementById("promoOption" + piece).firstChild.src =
        urlForPiece(
          wasmInterface.js_get_side_to_move() == "white" ?
          PIECES[piece] : PIECES[piece + 6]
        );
      document.getElementById("promoOption" + piece).onclick = () => {
        registerMove(source.x, flip(source.y), dest.x, flip(dest.y), piece, true);
        draw();
      };
    }
    myModal.show();
  } else {
      registerMove(source.x, flip(source.y), dest.x, flip(dest.y), undefined, anim);
  }
  return true;
}

function switchToGameUI() {
  document.getElementById("startOptions").style.display = "none";
  document.getElementById("game").style.display = "block";
}

function initLocalGame() {
  switchToGameUI();

  let whiteStarts = Math.random() < 0.5;
  if (whiteStarts) { makeAlert("info", "White gets to move first", 5000); }
  else { makeAlert("info", "Black gets to move first", 5000); }

  wasmInterface = JSInterface.js_initial_interface();
  window.wasmInterface = wasmInterface;
  gameType = "local";
  awaitingMoveFrom = "ui";
  draw();
}
window.initLocalGame = initLocalGame;

function initiateHosting() {
  socket.connect();
  socket.emit("host");
  document.getElementById("hostCode").innerHTML = "loading";
  document.getElementById("hostModal").addEventListener("hidden.bs.modal", () => {
    if (gameType == undefined) socket.disconnect();
  });
}
window.initiateHosting = initiateHosting;

socket.on("hosted", (id) => {
  document.getElementById("hostCode").innerHTML = id;
});

socket.on("hostFailed", (id) => {
  document.getElementById("hostCode").innerHTML = "Cannot host game. There are too many users online.";
});

socket.on("opponentJoined", (iStart) => {
  switchToGameUI();
  wasmInterface = JSInterface.js_initial_interface();
  window.wasmInterface = wasmInterface;
  gameType = "networkH";
  if (iStart) {
    makeAlert("success", "You get to move first", 5000);
    awaitingMoveFrom = "ui";
  } else {
    makeAlert("danger", "Opponent gets to move first", 5000);
    awaitingMoveFrom = "network";
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById("hostModal")).hide();
  draw();
});

function joinGame(code) {
  socket.connect();
  socket.emit("join", code);
  document.getElementById("joinModal").addEventListener("hidden.bs.modal", () => {
    if (gameType == undefined) socket.disconnect();
  });
}
window.joinGame = joinGame;

socket.on("joined", (iStart) => {
  switchToGameUI();
  wasmInterface = JSInterface.js_initial_interface();
  window.wasmInterface = wasmInterface;
  gameType = "networkG";
  if (iStart) {
    makeAlert("success", "You get to move first", 5000);
    awaitingMoveFrom = "ui";
  } else {
    makeAlert("danger", "Opponent gets to move first", 5000);
    awaitingMoveFrom = "network";
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById("joinModal")).hide();
  draw();
});

socket.on("joinFailed", () => {
  bootstrap.Modal.getOrCreateInstance(document.getElementById("joinModal")).hide();
  bootstrap.Modal.getOrCreateInstance(document.getElementById("joinFailedModal")).show();
});

socket.on("opponentDisconnected", () => {
  bootstrap.Modal.getOrCreateInstance(document.getElementById("opponentDisconnectedModal")).show();
  awaitingMoveFrom = undefined;
  socket.disconnect();
  draw();
});

socket.on("opponentMove", (fromX, fromY, toX, toY, p) => {
  registerMove(fromX, fromY, toX, toY, p, true);
});

function initAIGame() {
  switchToGameUI();

  let whiteStarts = Math.random() < 0.5;
  if (whiteStarts) { makeAlert("info", "You get to move first", 5000); }
  else { makeAlert("info", "The computer gets to move first", 5000); }

  wasmInterface = JSInterface.js_initial_interface();
  window.wasmInterface = wasmInterface;
  gameType = "ai";
  awaitingMoveFrom = whiteStarts ? "ui" : "ai";
  draw();

  if (awaitingMoveFrom == "ai") { dispatchAIMove(); }
}
window.initAIGame = initAIGame;

function initAIvsAIGame() {
  switchToGameUI();

  let whiteStarts = Math.random() < 0.5;
  if (whiteStarts) { makeAlert("info", "White gets to move first", 5000); }
  else { makeAlert("info", "Black gets to move first", 5000); }

  wasmInterface = JSInterface.js_initial_interface();
  window.wasmInterface = wasmInterface;
  gameType = "aiai";
  awaitingMoveFrom = "ai"
  draw();

  dispatchAIMove();
}
window.initAIvsAIGame = initAIvsAIGame;

function initDailyGame() {

  let date = new Date();
  dateString = date.getFullYear() + "_" + date.getMonth() + "_" + date.getDate();
  rng = new Math.seedrandom(dateString);

  if (localStorage.getItem("mostRecentDailyGame") == dateString) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById("dailyStats")).show();
    document.getElementById("dailyModalTitle").innerHTML = "Today's Game";
    loadStats();
    return;
  }

  switchToGameUI();
  document.getElementById("quitButton").style.display = "none";

  let whiteStarts = rng() < 0.5;
  if (whiteStarts) {
    turns.push("w");;
    makeAlert("info", "You get to move first", 5000);
  } else {
    turns.push("b");
    makeAlert("info", "The computer gets to move first", 5000);
  }

  wasmInterface = JSInterface.js_initial_interface();
  window.wasmInterface = wasmInterface;
  gameType = "daily";
  awaitingMoveFrom = whiteStarts ? "ui" : "ai";
  draw();

  if (awaitingMoveFrom == "ai") { dispatchAIMove(); }
}
window.initDailyGame = initDailyGame;

function dispatchAIMove() {
  // TODO: Run this in the background with a web worker
  //   This requires some changes to how webpack, etc. is used
  setTimeout(() => {
    let move = wasmInterface.js_get_engine_move();
    registerMove(move[0], move[1], move[2], move[3], move[4], true);
  }, 1000);
}

function registerMove(xf, yf, xt, yt, p, anim) {
  if (awaitingMoveFrom == "ui" && gameType.startsWith("network")) {
    socket.emit("move", xf, yf, xt, yt, p);
  }
  wasmInterface.js_apply_move(xf, yf, xt, yt, p);
  activeSquares = [];
  activeSquares.push({ x: xf, y: yf });
  activeSquares.push({ x: xt, y: yt });

  if (anim) {
    pieceAnimation = {
      animation: setInterval(() => { draw(); }, 5),
      start: Date.now(),
      source: { x: xf, y: yf },
      dest: { x: xt, y: yt },
    }

    setTimeout(() => {
      clearInterval(pieceAnimation.animation);
      pieceAnimation = undefined;
    }, PIECE_ANIMATION_DURATION);

  }

  draw();

  if (wasmInterface.js_status() == "in progress") {
    switch (gameType) {
      case "local": awaitingMoveFrom = "ui"; break;
      case "networkH": awaitingMoveFrom = wasmInterface.js_get_side_to_move() == "white" ? "ui" : "network"; break;
      case "networkG": awaitingMoveFrom = wasmInterface.js_get_side_to_move() == "white" ? "network" : "ui"; break;
      case "ai": case "daily": awaitingMoveFrom = wasmInterface.js_get_side_to_move() == "white" ? "ui" : "ai"; break;
      case "aiai": awaitingMoveFrom = "ai"; break;
    }
  } else {

    var alertType = "";
    switch (gameType) {
      case "local": case "aiai": alertType = "info"; break;
      case "networkG": {
        if (wasmInterface.js_status() == "white") alertType = "danger";
        else if (wasmInterface.js_status() == "black") alertType = "success";
        else alertType = "info";
        break;
      }
      case "networkH":
      case "ai": case "daily": {
        if (wasmInterface.js_status() == "white") alertType = "success";
        else if (wasmInterface.js_status() == "black") alertType = "danger";
        else alertType = "info";
      }
    }

    var alertText = "";
    switch (gameType) {
      case "local": case "aiai": {
        if (wasmInterface.js_status() == "white") alertText = "White won";
        else if (wasmInterface.js_status() == "black") alertText = "Black won";
        else alertText = "Draw";
        break;
      }
      case "networkG": {
        if (wasmInterface.js_status() == "white") alertText = "You lost";
        else if (wasmInterface.js_status() == "black") alertText = "You won";
        else alertText = "Draw";
        break;
      }
      case "networkH":
      case "ai": case "daily": {
        if (wasmInterface.js_status() == "white") alertText = "You won";
        else if (wasmInterface.js_status() == "black") alertText = "You lost";
        else alertText = "Draw";
        break;
      }
    }

    makeAlert(alertType, alertText, 2000);

    socket.disconnect();

    if (gameType == "daily") {

      document.getElementById("quitButton").style.display = "block";

      let winner = wasmInterface.js_status() == "white" ? "You" : "The computer";
      let numMoves = turns.length;
      let text = wasmInterface.js_status() == "draw" ? "The game was a draw after " + numMoves + " moves" : winner + " won in " + numMoves + " moves";

      let fullGame = {
        history: wasmInterface.js_history(),
        turns: turns,
        resultString: text
      };

      var request = new XMLHttpRequest();
      request.open("POST", "/api/result", false);
      request.setRequestHeader("Content-Type", "application/json");
      request.send(JSON.stringify({
        "id": getUserCreds()[0],
        "password": getUserCreds()[1],
        "date": dateString,
        "numMoves": turns.length,
        "winner": wasmInterface.js_status(),
        "fullGame": fullGame
      }));

      if (request.status != 200) {
        console.log("Error submitting daily game result");
        return;
      }

      bootstrap.Modal.getOrCreateInstance(document.getElementById("dailyStats")).show();
      document.getElementById("dailyModalTitle").innerHTML = "Game Over";

      localStorage.setItem("mostRecentDailyGame", dateString);
      localStorage.setItem("mostRecentWinner", winner);
      localStorage.setItem("mostRecentNumMoves", numMoves);
      localStorage.setItem("mostRecentFullGame", JSON.stringify(fullGame));

      loadStats();

    }

  }

  draw();

  if (awaitingMoveFrom == "ai") { dispatchAIMove(); }
}

// For debugging
socket.onAny((event, ...args) => {
  console.log(event, args);
});

function getUserCreds() {
  var userID = localStorage.getItem("userID");
  var password = localStorage.getItem("password");
  if (userID == null || password == null) {
    var request = new XMLHttpRequest();
    request.open("GET", "/api/newUser", false);
    request.send();
    let id = JSON.parse(request.responseText).id;
    let password = JSON.parse(request.responseText).password;
    localStorage.setItem("userID", id);
    localStorage.setItem("password", password);
    userID = id + "";
    password = password + "";
  }
  return [userID, password];
}

var charts = [];
window.charts = charts;
function loadStats() {

  let fullGame = JSON.parse(localStorage.getItem("mostRecentFullGame"));
  let history = fullGame.history;
  let turns = fullGame.turns;
  let resultString = fullGame.resultString;

  document.getElementById("dailyResultText").innerHTML = resultString;
  let updateCounter = setInterval(function() {
    let nextMidnight = new Date();
    nextMidnight.setHours(24,0,0,0);
    let now = new Date();
    let remainingTimeInSeconds = (nextMidnight.getTime() - now.getTime())/1000;
    let hours = Math.floor(remainingTimeInSeconds / 3600);
    var rest = remainingTimeInSeconds - hours * 3600;
    let minutes = Math.floor(rest / 60);
    var rest = rest - minutes * 60;
    let seconds = Math.floor(rest);
    if (remainingTimeInSeconds > 86370) {
      window.location.reload();
    }
    if (document.getElementById("countdown") == undefined) {
      clearInterval(interval);
      return;
    }
    document.getElementById("countdown").innerHTML = "Tomorrow's game will be available in <b>" + String(hours).padStart(2, '0') + ":" + String(minutes).padStart(2, '0') + ":" + String(seconds).padStart(2, '0') + "</b>";
  }, 100);

  document.getElementById("moveHistory").innerHTML = "";
  for (let i = 0; i < turns.length; i++) {
    document.getElementById("moveHistory").innerHTML += "<span data-bs-toggle='tooltip' data-bs-title='<canvas class=\"tooltip-canvas\" id=\"tooltipCanvas"+i+"\"></canvas>' class='" + (turns[i] == "w" ? "white" : "black") + "-box'></span>";
  }
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl, {
    html: true,
    sanitize: false,
  }));
  for (let i = 0; i < turns.length; i++) {
    let onInsert = function () {
      let tooltipCanvas = document.getElementById("tooltipCanvas"+i);
      tooltipCanvas.width = CANVAS_SIZE;
      tooltipCanvas.height = CANVAS_SIZE;
      var context = tooltipCanvas.getContext('2d');
      drawHistory(context, i, history);
    }
    tooltipTriggerList[i].addEventListener("inserted.bs.tooltip", onInsert);
  }

  for (let chart of charts) {
    chart.destroy();
  }
  charts = [];

  var request = new XMLHttpRequest();
  request.open("GET", "/api/stats/" + getUserCreds()[0] + "/" + dateString, false);
  request.send();
  let stats = JSON.parse(request.responseText);
  
  charts.push(new Chart(document.getElementById('othersPercentageWin'), {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Draws', 'Losses'],
      datasets: [{
        data: [stats.dNumWins, stats.dNumDraws, stats.dNumLosses],
        backgroundColor: [
          '#6fc276',
          'grey',
          '#e45154'
        ],
        hoverOffset: 10,
      }]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      }
    }  
  }));

  charts.push(new Chart(document.getElementById('userPercentageWin'), {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Draws', 'Losses'],
      datasets: [{
        data: [stats.uNumWins, stats.uNumDraws, stats.uNumLosses],
        backgroundColor: [
          '#6fc276',
          'grey',
          '#e45154'
        ],
        hoverOffset: 10,
      }]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      }
    }  
  }));

  let greys = [];
  for (var i = 0; i <= 10; i++) {
    greys.push('rgb(201, 203, 207)');
  }
  let ones = [];
  for (var i = 0; i <= 10; i++) {
    ones.push(1);
  }

  charts.push(new Chart(document.getElementById('dateMovesWin'), {
    type: 'bar',
    data: {
      labels: ["1-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99", "100+"],
      datasets: [{
        data: stats.dWinMoves,
        backgroundColor: '#6fc276',
        borderColor: [...greys],
        borderWidth: [...ones],
        barPercentage: 1,
        categoryPercentage: 1,
      }],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Number of wins"
          }
        },
        x: {
          title: {
            display: true,
            text: "Number of moves"
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    },
  }));

  if (localStorage.getItem("mostRecentWinner") == "You") {
    let index = Math.min(Math.floor(localStorage.getItem("mostRecentNumMoves") / 10), 10)
    charts[charts.length - 1].data.datasets[0].borderColor[index] = 'rgb(20, 20, 20)';
    charts[charts.length - 1].data.datasets[0].borderWidth[index] = 2;
  }

  charts.push(new Chart(document.getElementById('dateMovesLoss'), {
    type: 'bar',
    data: {
      labels: ["1-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99", "100+"],
      datasets: [{
        data: stats.dLossMoves,
        backgroundColor: '#e45154',
        borderColor: [...greys],
        borderWidth: [...ones],
        barPercentage: 1,
        categoryPercentage: 1,
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Number of losses"
          }
        },
        x: {
          title: {
            display: true,
            text: "Number of moves"
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    },
  }));

  if (localStorage.getItem("mostRecentWinner") == "The computer") {
    let index = Math.min(Math.floor(localStorage.getItem("mostRecentNumMoves") / 10), 10)
    charts[charts.length - 1].data.datasets[0].borderColor[index] = 'rgb(20, 20, 20)';
    charts[charts.length - 1].data.datasets[0].borderWidth[index] = 2;
  }

  charts.push(new Chart(document.getElementById('userMovesWin'), {
    type: 'bar',
    data: {
      labels: ["1-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99", "100+"],
      datasets: [{
        data: stats.uWinMoves,
        backgroundColor: '#6fc276',
        borderColor: [...greys],
        borderWidth: [...ones],
        barPercentage: 1,
        categoryPercentage: 1,
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Number of wins"
          }
        },
        x: {
          title: {
            display: true,
            text: "Number of moves"
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    },
  }));

  if (localStorage.getItem("mostRecentWinner") == "You") {
    let index = Math.min(Math.floor(localStorage.getItem("mostRecentNumMoves") / 10), 10)
    charts[charts.length - 1].data.datasets[0].borderColor[index] = 'rgb(20, 20, 20)';
    charts[charts.length - 1].data.datasets[0].borderWidth[index] = 2;
  }

  charts.push(new Chart(document.getElementById('userMovesLoss'), {
    type: 'bar',
    data: {
      labels: ["1-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99", "100+"],
      datasets: [{
        data: stats.uLossMoves,
        backgroundColor: '#e45154',
        borderColor: [...greys],
        borderWidth: [...ones],
        barPercentage: 1,
        categoryPercentage: 1,
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Number of losses"
          }
        },
        x: {
          title: {
            display: true,
            text: "Number of moves"
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    },
  }));

  if (localStorage.getItem("mostRecentWinner") == "The computer") {
    let index = Math.min(Math.floor(localStorage.getItem("mostRecentNumMoves") / 10), 10)
    charts[charts.length - 1].data.datasets[0].borderColor[index] = 'rgb(20, 20, 20)';
    charts[charts.length - 1].data.datasets[0].borderWidth[index] = 2;
  }
}

document.getElementById("mainLoadingIndicator").style.display = "none";
document.getElementById("startOptions").style.display = "block";

if (new URLSearchParams(window.location.search).get("dailygame") == "true") {
  window.history.replaceState("daily game", "Daily Game", "/");
  initDailyGame();
}

function shareGame() {
  let button = document.getElementById("shareButton");
  navigator.clipboard.writeText(window.location.protocol + "//" + window.location.hostname + "/share/?game=" + btoa(localStorage.getItem("userID") + ":" + localStorage.getItem("mostRecentDailyGame"))).then(() => {
    var tooltip = new bootstrap.Tooltip(button, {title: "Link copied to clipboard"});
    tooltip.show();
    setTimeout(() => {
      tooltip.hide();
    }, 2000);
  },
  () => {
    var tooltip = new bootstrap.Tooltip(button, {title: "Link copied to clipboard"});
    tooltip.show();
    setTimeout(() => {
      tooltip.hide();
    }, 2000);
  });
}
window.shareGame = shareGame;
