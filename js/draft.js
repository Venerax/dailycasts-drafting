angular.module('draftApp', ['socketio'])

.service('draftService', ['socket', function(socket) {
  var service = this; // so that we can access data in the socket handler's functions
  service.cards = [];

  service.clientId = '';

  // tell the server that we are joining the room as specified
  service.init = function(roomId) {
    socket.emit('lobby:joinroom', roomId);
  }

  service.select = function(card, index) {
    // relying on ng-repeat index for now. works, but TODO.
    socket.emit('draft:cardtaken', index);
    card.owner = service.clientId;
  }

  service.draw = function(numCards) {
    socket.emit('draft:draw', numCards);
  }

  service.reset = function() {
    service.cards = [];
    socket.emit('draft:reset');
  }

  socket.on('client:setid', function(id) {
    service.clientId = id;
  })

  socket.on('draft:cardsdrawn', function(cards) {
    service.cards = service.cards.concat(cards);
  })

  socket.on('draft:cardtaken', function(takenData) {
    // toggle the card's taken status
    service.cards[takenData.index].owner = takenData.owner;
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

  ctrl.owner = function() {
    return draftService.clientId;
  }

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
        class="cardimage" ng-class="{'taken': card.owner}" id="{{$index}}" alt="{{card.title}}">
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
    <li ng-repeat="card in $ctrl.getCards() | filter: {owner: $ctrl.owner()}"> {{card.title}} </li>
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
