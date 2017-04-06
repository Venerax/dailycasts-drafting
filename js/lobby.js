angular.module('lobbyApp', ['socketio'])

.controller('LobbiesController', ['socket', '$window', function LobbiesController(socket, $window) {
    var ctrl = this;
    ctrl.rooms = [];

    // ask for an initial update of the current rooms available
    socket.emit('lobby:refresh');

    ctrl.createDraft = function() {
      socket.emit('lobby:createroom', {decklistID: stripDecklistID(ctrl.decklistUrl), cardsPerDeal: ctrl.cardsPerDeal});
      // it would be nice to redirect here, but we we need to wait on the server to furnish us with
      // a room name via the socket. this will therefore result in a redirect event instead.
      // TODO - ignore this comment, we will be providing a link once the room is generated.
    }

    // given a url of format "http://www.netrunnerdb.com/{lang}/decklist/{deck_id}/{description}",
    // extract the deck id so we can pass it to the server.
    // i haven't been able to find a RESTful way of requesting the API version from each page, nor do i want
    // to force a user to grab the API page themselves... so, regex it is.
    function stripDecklistID(url) {
      // this is yucky, but it works for now. grabs the group of digits after the decklist/ path.
      return url.match(/decklist\/([0-9]*)/)[1];
    }

    socket.on('lobby:refresh', function(rooms) {
      ctrl.rooms = rooms;
    });

    socket.on('lobby:roomcreated', function(roomId) {
      ctrl.rooms.push(roomId);
    });

    // TODO - get rid of this and the $window dependency and just create a link
    // to a newly created room instead
    socket.on('redirect', function(url) {
      $window.location.href = url;
    });
}])
