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

.service('draftService', ['socket', function(socket) {
  var service = this; // so that we can access data in the socket handler's functions
  service.cards = [];

  // tell the server that we are joining the room as specified
  service.init = function(roomId) {
    socket.emit('lobby:joinroom', roomId);
  }

  service.select = function(card, index) {
    // relying on ng-repeat index for now. works, but TODO.
    socket.emit('draft:cardtaken', index);
    card.taken = !card.taken;
  }

  service.draw = function(numCards) {
    socket.emit('draft:draw', numCards);
  }

  service.reset = function() {
    service.cards = [];
    socket.emit('draft:reset');
  }

  socket.on('draft:cardsdrawn', function(cards) {
    service.cards = service.cards.concat(cards);
  })

  socket.on('draft:cardtaken', function(index) {
    // toggle the card's taken status
    service.cards[index].taken = !service.cards[index].taken;
  });

  socket.on('draft:refresh', function(cards) {
    // reinitialise the cards data with the given state
    service.cards = cards;
  });
}])

// interfaces with the draft service to allow interactivity with the cards
// in the draft state.
.controller('DraftController', ['draftService', function DraftController(draftService) {
  var ctrl = this;

  // TODO - can i cleanly bind this so i'm not returning the whole list every time?
  ctrl.getCards = function() {
    return draftService.cards;
  }

  ctrl.select = function(card, index) {
    draftService.select(card, index);
  }

  ctrl.draw = function(numCards) {
    draftService.draw(numCards); // TODO is this too trivial a use of service/controller?
  }

  ctrl.reset = function() {
    draftService.reset();
  }

  ctrl.test = function() {
    console.log('TESTING - CARDS: ' + ctrl.cards);
  }

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
        <img ng-data="card" ng-repeat="card in $ctrl.getCards()" ng-click="$ctrl.select(card, $index)" ng-src="/images/{{card.code}}.png"
        class="cardimage" ng-class="{'taken': card.taken==true}" id="{{$index}}" alt="{{card.title}}">
      </td>
    </tr>
  </table>
  `,
  controller: "DraftController",
  bindings: {
    card: "="
  }
})

// describes an interface that shows the user which cards they have currently drafted
// (and potentially, what others have selected). room for lots of fancy stuff here;
// sort by type, exporting features, etc...
.component('draftCardList', {
  template:`
  <ul>
    <li ng-repeat="card in $ctrl.getCards()"> {{card.title}} </li>
  </ul>
  `,
  controller: "DraftController",
  bindings: {
    card: "="
  }
})

// i don't _really_ like this, but it's my cleanest attempt so far at initialising
// the draftService with information from HTML (as passed in from the URL through
// the view engine, currently as an attribute).
.directive('draftRoom', function() {
  return {
    restrict: "A", // attributes only; this decorates an existing element
    scope: {
      draftRoom: "@"
    },
    controller: ['draftService', '$scope', function(draftService, $scope) {
      draftService.init($scope.draftRoom);
    }]
  }
})
