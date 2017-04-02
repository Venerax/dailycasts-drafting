// TODO put this somewhere nicer
function socketFactory($rootScope, namespace) {
  var socket = io(namespace);

  return {
    on: function(eventName, callback) {
      socket.on(eventName, function() {
        var args = arguments;
        $rootScope.$apply(function() {
          callback.apply(socket, args);
        });
      });
    },
    emit: function(eventName, data, callback) {
      socket.emit(eventName, data, function() {
        var args = arguments;
        $rootScope.$apply(function () {
          if (callback) {
            callback.apply(socket, args);
          }
        });
      });
    }
  }
}

angular.module('draftApp', [])

.factory('socket', function ($rootScope) {
  // default namespace is '/', which talks to everyone.
  return new socketFactory($rootScope, '/');
})

.factory('draftCardListFactory', function() {
  var cards = [{id:"00005"}, {id:"00006"}, {id:"00007"}];

  return {
    getCards: getCards,
    addCard: addCard
  }

  function getCards() {
    return cards;
  }

  function addCard(card) {
    cards.push(card);
  }
})

.controller('DraftController', ['socket', '$attrs', function DraftListController(socket, $attrs) {
  var ctrl = this; // so that we can access data in the socket handler's functions
  ctrl.cards = [];

  // tell the server that we are joining the room as specified by this component
  socket.emit('lobby:joinroom', $attrs.room);

  ctrl.select = function(card, index) {
    // relying on ng-repeat index for now. works, but TODO.
    socket.emit('draft:cardtaken', index);
    card.taken = !card.taken;
  }

  ctrl.draw = function(numCards) {
    socket.emit('draft:draw', {number: numCards, room: $attrs.room});
  }

  ctrl.reset = function() {
    ctrl.cards = [];
    socket.emit('draft:reset', $attrs.room);
  }

  socket.on('draft:cardsdrawn', function(cards) {
    // TODO make a function of this?
    ctrl.cards = ctrl.cards.concat(cards);
    // for (var card in cards) {
    //   ctrl.cards.push({id: cards[card]});
    // }
  })

  socket.on('draft:cardtaken', function(index) {
    // toggle the card's taken status
    ctrl.cards[index].taken = !ctrl.cards[index].taken;
  });

  socket.on('draft:refresh', function(cards) {
    // reinitialise the cards data with the given state
    ctrl.cards = cards;
    // for (var card in cards) {
    //   ctrl.cards.push({id: cards[card]});
    // }
  });

}])

// TODO this should be in a separate module
.controller('LobbiesController', ['socket', '$window', function LobbiesController(socket, $window) {
    var ctrl = this;
    ctrl.rooms = [];

    // ask for an initial update of the current rooms available
    socket.emit('lobby:refresh');

    ctrl.createDraft = function() {
      socket.emit('lobby:createroom', {decklistID: stripDecklistID(ctrl.decklistUrl), cardsPerDeal: ctrl.cardsPerDeal});
      // it would be nice to redirect here, but we we need to wait on the server to furnish us with
      // a room name via the socket. this will therefore result in a redirect event instead.
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

// describes an interface allowing the user to interact with the ongoing draft
// as described in the controller
.component('draftPanel', {
  // TODO store this in a separate file
  template:`
  <table class="table table-condensed">
    <tr>
      <td class="text-center">
        <div class="btn-group">
          <button class="btn btn-default btn-sm" disabled="disabled">Draw:</button>
          <button class="btn btn-default btn-sm" ng-click="$ctrl.draw(1)">1</button>
          <button class="btn btn-default btn-sm" ng-click="$ctrl.draw(5)">5</button>
          <button class="btn btn-default btn-sm" ng-click="$ctrl.draw(9)">9</button>
          <button class="btn btn-default btn-sm" ng-click="$ctrl.reset()">Reset</button>
        </div>
      </td>
    </tr>
    <tr>
      <td>
        <img ng-data="card" ng-repeat="card in $ctrl.cards" ng-click="$ctrl.select(card, $index)" ng-src="/images/{{card.code}}.png"
        class="cardimage" ng-class="{'taken': card.taken==true}" id="{{$index}}" alt="{{card.title}}">
      </td>
    </tr>
  </table>
  `,
  controller: "DraftController",
  // TODO - let this component share data with a parent controller, so it can be
  // used by another component (the up-and-coming draft-card-list).
  bindings: {
    card: "="
  }
})

// describes an interface that shows the user which cards they have currently drafted
// (and potentially, what others have selected). room for lots of fancy stuff here;
// sort by type, exporting features, etc...
.component('draftCardList', {

})
