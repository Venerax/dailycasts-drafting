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
var draftStates = {}; // object mapping room IDs to the draft state object of that room
const nrdbApiPublic = 'http://www.netrunnerdb.com/api/2.0/public/';
const nrdbApiPrivate = 'http://www.netrunnerdb.com/api/2.0/private/'; // can't use this until i contact @alsciende for oauth2 credentials
var rooms = [];

// each card object has these properties:
var Card = function(code, index) {
  // code is the unique specifier for each netrunner card: e.g. 01012 = Parasite
  this.code = code;
  this.taken = false;
  // our server has a mapping of card IDs to the NRDB data, from which we copy
  // what we need. just the title for now
  this.title = cards[code].title;
}

// the state of each ongoing draft.
var DraftState = function(cardData) {
  this.remaining = [];
  this.drafted = [];

  for (let code in cardData) {
    // add the card this many times:
    for (let i = 0; i < cardData[code]; i++) {
      this.remaining.push(new Card(code, i));
    }
  }
  // finally, shuffle the draft list.
  this.remaining = _.shuffle(this.remaining);
}

// TODO some kind of custom utils module
// var download = function(uri, filename, callback){
//   request.head(uri, function(err, res, body){
//     if (!err && res.statusCode === 200) {
//       request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
//     }
//   });
// };

// set up view engine (using pug)
app.set('view engine', 'pug')

// define the static directory from which we serve images
app.use('/images', express.static(__dirname + '/images'));
app.use('/draft', express.static(__dirname + '/draft'));
app.use('/angular', express.static(__dirname + '/node_modules/angular'));

// set up favicon
// app.use(favicon(__dirname + 'images/favicon.ico'));

// routing
// home page is the lobby
app.get('/', function (req, res) {
    res.render('index')
});
// each draft is located under /room/{roomid}
app.get('/room/:room', function (req, res) {
  var room = req.params.room;
  // grab the state corresponding to this room and render the page accordingly
  if (room in draftStates) {
    res.render('draft', {id: room});
  }
  else {
    // this draft does not exist.
    res.status(404);
    res.render('draft_not_found');
  }
});

// set up the socket handlers:
// TODO clean up some of the names; client/server naming is not super consistent
io.on('connection', function(socket) {

  var id = socket.id;
  var roomId = '/'; // the room that the client is currently in

  console.log('USER CONNECTED: ' + id);

  socket.on('disconnect', function(socket) {
    console.log('USER DISCONNECTED: ' + id);
  });

  socket.on('lobby:refresh', function() {
    // send the full list of rooms to the client
    socket.emit('lobby:refresh', rooms);
  });

  socket.on('lobby:createroom', function(roomData) {

    // fetch the given decklist from the API:
    console.log('CREATING DRAFT FROM: ' + nrdbApiPublic + 'decklist/' + roomData.decklistID);
    // TODO - bundle all NRDB API communication into a clean interface - requests, returning and parsing decks, etc.
    request({url: nrdbApiPublic + 'decklist/' + roomData.decklistID, json: true}, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        // success: generate a random ID/URL for this room
        roomId = shortid.generate();

        // convert the JSON object of cards {id1: count1, id2: count2} into a more flexible object
        // take note the data object is a 1-length array...
        draftStates[roomId] = new DraftState(body['data'][0].cards);

        rooms.push(roomId); // so the lobby knows
        socket.join(roomId); // subscribe the client's socket to this room's messages
        io.emit('lobby:roomcreated', roomId);
        // TODO - show UI that shows the room has been created, but don't force a redirect just yet
        socket.emit('redirect', '/room/' + roomId);
      }
    });
  });

  socket.on('lobby:joinroom', function(room) {
    // save this client's room ID and subscribe them to its messages
    roomId = room;
    socket.join(roomId);
    console.log(id + ' is now in room ' + roomId);
    // make sure to send them an initial update of the current draft
    socket.emit('draft:refresh', draftStates[room].drafted);
  });

  // draft handlers
  socket.on('draft:draw', function(drawData) {
    var newCards = [];
    var draftState = draftStates[drawData.room];

    // can only draw as many cards as we have left...
    var numCards = Math.min(drawData.number, draftState.remaining.length);
    for (var i = 0; i < numCards; i++) {
      let card = draftState.remaining.pop();
      newCards.push(card);
      draftState.drafted.push(card);
    }
    // send the drawn cards to the draft room
    io.to(drawData.room).emit('draft:cardsdrawn', newCards);
  });

  socket.on('draft:reset', function(room) {
    // push the drafted cards in a draft state back into the remaining cards,
    // reset the taken states, and reshuffle.
    let draftState = draftStates[room];
    draftState.remaining = draftState.remaining.concat(draftState.drafted);
    for (var card in draftState.remaining) {
      draftState.remaining[card].taken = false;
    }
    draftState.remaining = _.shuffle(draftState.remaining);
    draftState.drafted = [];
    io.to(room).emit('draft:refresh', []); // we know that drafted is empty now...
  });

  socket.on('draft:cardtaken', function(index) {
    // tell all of the _other_ clients that this card has been taken.
    // TODO - this currently relies on each client having the same ng-repeat indices
    // as eachother. probably fine for now, but problematic if users delete elements,
    // draw more cards and then do this (ng-repeat will fill in the missing indices).
    // refactor to use a custom track by, which can be a unique specifier per
    // card in the draft state.
    socket.broadcast.to(roomId).emit('draft:cardtaken', index);
  });
});

// SERVER INIT
// send a request to fetch card data from the netrunnerdb API
// download the card images to local stores (this should really be a service, but these
// are prototype days...) - TODO currently not bothering with this
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
    // TODO - this is problematic because 1) this fires off a lot of threads and
    // so a lot of the requests fail for various reasons, and 2) a bunch of the
    // most recently spoiled cards have text but no image scans, so the url
    // doesn't point to anything. not high enough priority to do now, so sort the
    // images directory out yourself.

    // for (var cardCode in cards) {
    //   // check to see if we have this card's image saved; if not, download it.
    //   // we should really set an expiration for these, but the cards never change... hopefully
    //   let code = cardCode; // otherwise the loop variable changes and later calls refer to the same one
    //   // this process is asynchronous.
    //   fs.access('images/' + code + '.png', function (error) {
    //     if (error) {
    //       console.log('downloading file:' + code + '.png');
    //       download(imageUrlTemplate.replace(/{code}/, code), 'images/' + code + '.png', () => {}); // TODO icky
    //     }
    //   })
    // }

    // set the server up.
    server.listen(3000, function () {
        console.log('listening on port 3000');
    });
  }
  else {
    // TODO just for now; ideally we can still launch the server if NRDB is down.
    console.log('Unable to connect to the NRDB API.');
    process.exit(1);
  }
});
