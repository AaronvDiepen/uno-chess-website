import express from 'express';
const app = express();

import http from 'http';

const server = http.createServer(app);

server.listen(80, () => {
  console.log('server started');
});

import { Server } from "socket.io";
const io = new Server(server);

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import 'log-timestamp';

app.set('trust proxy', true);
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json());

// Stuff for the online games
var games = {};

io.on('connection', (socket) => {
  console.log("CONNECTION " + socket.id);
  
  socket.on('host', () => {
    console.log("HOST " + socket.id);
    var tries = 0;
    while (true) {
      var code = Math.floor(Math.random() * 900 + 100);
      if (games[code] == undefined) {
        games[code] = { host: socket.id, guest: undefined };
        console.log("HOSTED " + socket.id + " " + code);
        socket.emit('hosted', code);
        break;
      }
      tries++;
      if (tries > 10) {
        console.log("HOST FAILED " + socket.id);
        socket.emit('hostFailed');
        break;
      }
    }
  });

  socket.on('join', (code) => {
    var hostStarts = true; //Math.random() < 0.5;
    console.log("JOIN " + socket.id + " " + code);
    if (games[code] == undefined || games[code].guest != undefined) {
      socket.emit('joinFailed');
    } else {
      games[code].guest = socket.id;
      socket.emit('joined', !hostStarts);
      io.to(games[code].host).emit('opponentJoined', hostStarts);
    }
  });

  socket.on('move', (fromX, fromY, toX, toY, p) => {
    console.log("MOVE " + socket.id + " " + fromX + " " + fromY + " " + toX + " " + toY + " " + p);
    for (var code in games) {
      if (games[code].host == socket.id) {
        io.to(games[code].guest).emit('opponentMove', fromX, fromY, toX, toY, p);
      }
      if (games[code].guest == socket.id) {
        io.to(games[code].host).emit('opponentMove', fromX, fromY, toX, toY, p);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log("DISCONNECT " + socket.id);
    for (var code in games) {
      if (games[code].host == socket.id || games[code].guest == socket.id) {
        if (games[code].host != undefined) {
          io.to(games[code].host).emit('opponentDisconnected');
        }
        if (games[code].guest != undefined) {
          io.to(games[code].guest).emit('opponentDisconnected');
        }
        delete games[code];
      }
    }
  });

});
