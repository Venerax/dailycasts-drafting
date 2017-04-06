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

angular.module('socketio', [])

.factory('socket', function ($rootScope) {
  // default namespace is '/', which talks to everyone.
  return new socketFactory($rootScope, '/');
})
