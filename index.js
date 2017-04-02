"use strict";
var express = require('express');
var http = require('http');
var socketio = require('socket.io');
var request = require('request');
var _ = require('underscore');
var favicon = require('serve-favicon');
var shortid = require('shortid');
var fs = require('fs');

var app = express();
var server = http.Server(app);
var io = socketio(server);

var cards = {}; // mapping of card IDs to the card data objects from NRDB API
var roomIdToDraftState = {}; // object mapping room IDs to the draft state object of that room
var roomsToUsers = {}; // mapping of room IDs to a list of users that they contain
const nrdbApiPublic = 'http://www.netrunnerdb.com/api/2.0/public/';
const nrdbApiPrivate = 'http://www.netrunnerdb.com/api/2.0/private/'; // can't use this until i contact @alsciende for oauth2 credentials
var rooms = [];

// each card object has these properties:
var Card = function(id) {
  this.id = id;
  this.taken = false;
  // our server has a mapping of card IDs to the NRDB data, from which we copy
  // what we need.
  this.title = cards[id].title;
}

// the state of each ongoing draft.
var DraftState = function(cardData) {
  this.remaining = [];
  this.drafted = [];

  for (let cardId in cardData) {
    // add the card this many times:
    for (let i = 0; i < cardData[cardId]; i++) {
      this.remaining.push(new Card(cardId));
    }
  }
  // finally, shuffle the draft list.
  this.remaining = _.shuffle(this.remaining);
}

// TODO some kind of custom utils module
var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    if (!err && res.statusCode === 200) {
      request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    }
  });
};

// set up view engine (using pug)
app.set('view engine', 'pug')
// app.set('views', __dirname)
// set up favicon
app.use(favicon(__dirname + '/images/favicon.ico'));
// define the static directory from which we serve images
app.use('/images', express.static(__dirname + '/images'));
app.use('/draft', express.static(__dirname + '/draft'));
app.use('/angular', express.static(__dirname + '/node_modules/angular'));

// routing
app.get('/', function (req, res) {
    res.render('index')
});
app.get('/room/:room', function (req, res) {
  var room = req.params.room;
  // grab the state corresponding to this room and render the page accordingly
  if (room in roomIdToDraftState) {
    res.render('draft', {id: room});
  }
  else {
    res.status(404);
    res.render('draft_not_found');
  }
});
// app.get('/draft/draft.js', function(req, yes) {
//   res.sendFile(__dirname + '/draft/draft.js')
// })

// set up the socket handlers:
io.on('connection', function(socket) {
  var id = socket.id;
  var roomId = '/';

  console.log('USER CONNECTED: ' + socket.id);

  socket.on('disconnect', function(socket) {
    console.log('USER DISCONNECTED:' + id);
  });

  socket.on('lobby:createroom', function(roomData) {
    // generate a random ID/URL for this room
    roomId = shortid.generate();

    // fetch the given decklist from the API:
    console.log('attempting to connect to ' + nrdbApiPublic + 'decklist/' + roomData.decklistID);
    // TODO - bundle all NRDB API communication into a clean interface - requests, returning and parsing decks, etc.
    request({url: nrdbApiPublic + 'decklist/' + roomData.decklistID, json: true}, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        // convert the JSON object of cards {id1: count1, id2: count2} into a more flexible object
        // the data object is a 1-length array...
        roomIdToDraftState[roomId] = new DraftState(body['data'][0].cards);

        rooms.push(roomId); // so the lobby knows
        socket.join(roomId); // subscribe the client's socket to this room's messages
        io.emit('lobby:roomcreated', roomId);
        // TODO - show UI that shows the room has been created, but don't force a redirect just yet
        socket.emit('redirect', '/room/' + roomId);
      }
    });
  });

  socket.on('lobby:joinroom', function(room) {
    roomId = room;
    socket.join(roomId);
    console.log(id + ' is now in room ' + roomId);
    socket.emit('draft:refresh', roomIdToDraftState[room].drafted);
  });

  socket.on('draft:draw', function(drawData) {
    var newCards = [];
    var draftState = roomIdToDraftState[drawData.room];

    var numCards = Math.min(drawData.number, draftState.remaining.length);
    for (var i = 0; i < numCards; i++) {
      let card = draftState.remaining.pop();
      newCards.push(card);
      draftState.drafted.push(card);
    }
    // send the drawn cards to the draft room
    io.to(drawData.room).emit('card drawn', newCards);
  });

  socket.on('draft:reset', function(room) {
    // push the drafted cards in a draft state back into the remaining cards,
    // and reshuffle.
    let draftState = roomIdToDraftState[room];
    draftState.remaining = draftState.remaining.concat(draftState.drafted);
    draftState.remaining = _.shuffle(draftState.remaining);
    draftState.drafted = [];
    io.to(room).emit('draft:refresh', []); // we know that drafted is empty now...
  });

  // draft handlers
  socket.on('card taken', function(card) {
    // tell all of the _other_ clients that this card has been taken.
    socket.broadcast.to(roomId).emit('card taken', card);
  });
});

// SERVER INIT
// send a request to fetch card data from the netrunnerdb API
// download the card images to local stores (this should really be a service, but prototype days...)
// set server to listen for requests
request({ url: nrdbApiPublic + 'cards', json: true }, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var imageUrlTemplate; // from NRDB: as of last check, this is https://netrunnerdb.com/card_image/{code}.png
    if (body) {
      for (var card of body['data']) {
        cards[card.code] = card;
      }
      imageUrlTemplate = body['imageUrlTemplate'];
    }
    for (var code in cards) {
      // check to see if we have this card's image saved; if not, download it.
      // we should really set an expiration for these, but the cards never change... hopefully
      // this process is asynchronous.
      fs.access('images/' + code + '.png', function (error) {
        if (error) {
          console.log('downloading file:' + code + '.png');
          download(imageUrlTemplate.replace(/{code}/, code), 'images/' + code + '.png', () => {}); // TODO icky
        }
      })
    }

    // set the server up.
    server.listen(3000, function () {
        console.log('listening on port 3000');
    });
  }
  else {
    // TODO for now; ideally we can still launch the server if NRDB is down.
    console.log('Unable to connect to the NRDB API.');
    process.exit(1);
  }
});
