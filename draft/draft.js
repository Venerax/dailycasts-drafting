// TODO put this in a separate file?
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
    return new socketFactory($rootScope, '/');
})
// in case we want more than one socket...
// .factory('draftSocket', function($rootScope) {
//     return new socketFactory($rootScope, '/draft');
// })
//
// .factory('lobbySocket', function($rootScope) {
//     return new socketFactory($rootScope, '/lobby');
// })

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

.controller('DraftListController', ['$scope', 'socket', '$attrs', function DraftListController($scope, socket, $attrs) {
  var ctrl = this; // so that we can access data in the socket handler's functions
  ctrl.cards = [];

  // tell the server that we are joining the room as specified by this component
  socket.emit('lobby:joinroom', $attrs.room);

  ctrl.select = function(card, index) {
    socket.emit('card taken', {card: card, id:index});
    card.taken = !card.taken;
  }

  ctrl.draw = function(numCards) {
    socket.emit('draft:draw', {number: numCards, room: $attrs.room});
  }

  ctrl.reset = function() {
    ctrl.cards = [];
    socket.emit('draft:reset', $attrs.room);
  }

  socket.on('card drawn', function(cards) {
    // TODO make a function of this?
    console.log(JSON.stringify(cards));
    ctrl.cards = ctrl.cards.concat(cards);
    // for (var card in cards) {
    //   ctrl.cards.push({id: cards[card]});
    // }
  })

  socket.on('card taken', function(card) {
    // toggle the card's taken status
    ctrl.cards[card.id].taken = !ctrl.cards[card.id].taken;
  });

  socket.on('draft:refresh', function(cards) {
    // reinitialise the cards data with the given state - TODO let taken be part of the state too
    ctrl.cards = cards;
    // for (var card in cards) {
    //   ctrl.cards.push({id: cards[card]});
    // }
  });

}])

// TODO separate module?
.controller('LobbiesController', ['$scope', 'socket', '$window', function LobbiesController($scope, socket, $window) {

    $scope.rooms = [];

    $scope.createDraft = function() {
      socket.emit('lobby:createroom', {decklistID: stripDecklistID($scope.decklistUrl), cardsPerDeal: $scope.cardsPerDeal});
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

    socket.on('lobby:roomcreated', function(roomId) {
      $scope.rooms.push(roomId);
    });

    socket.on('redirect', function(url) {
      $window.location.href = url;
    });
}])

.component('draftCardList', {
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
        <img ng-data="card" ng-repeat="card in $ctrl.cards" ng-click="$ctrl.select(card, $index)" ng-src="/images/{{card.id}}.png"
        class="cardimage" ng-class="{'taken': card.taken==true}" id="{{$index}}" alt="{{card.title}}">
      </td>
    </tr>
  </table>
  `,
  controller: "DraftListController",
  bindings: {
    card: "="
  }
})
